const path = require("path");
const http = require("http");
const https = require("https");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const PORT = Number(process.env.PORT || 3000);
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const rooms = new Map();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname)));

app.post("/api/chatgpt/decision", async (req, res) => {
  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
  const decisionType = typeof req.body?.decisionType === "string" ? req.body.decisionType.trim() : "";
  const payload = req.body?.payload;
  const model = sanitizeModelName(req.body?.model) || "gpt-5.4";

  if (!apiKey) {
    res.status(400).json({ error: "OpenAI API key is required." });
    return;
  }

  if (!isSupportedDecisionType(decisionType) || !payload || typeof payload !== "object") {
    res.status(400).json({ error: "Invalid ChatGPT decision payload." });
    return;
  }

  try {
    const upstream = await postJson(OPENAI_RESPONSES_URL, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }, buildOpenAiRequest(model, decisionType, payload));

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      const errorMessage = extractOpenAiError(upstream.body);
      const statusCode =
        upstream.statusCode === 401 || upstream.statusCode === 403
          ? 401
          : upstream.statusCode === 429
          ? 429
          : 502;
      res.status(statusCode).json({ error: errorMessage });
      return;
    }

    const decision = extractDecision(upstream.body, decisionType);
    res.json({ decision });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "OpenAI request failed.",
    });
  }
});

io.on("connection", (socket) => {
  socket.on("room:create", () => {
    leaveCurrentRoom(socket);

    const pin = createUniquePin();
    rooms.set(pin, {
      pin,
      hostId: socket.id,
      guestId: null,
      latestSnapshot: null,
    });

    socket.join(pin);
    socket.data.pin = pin;
    socket.data.role = "host";
    socket.emit("room:created", {
      pin,
      side: "light",
    });
  });

  socket.on("room:join", (payload) => {
    const pin = normalizePin(payload?.pin);
    if (!pin) {
      socket.emit("room:error", { message: "Invalid PIN." });
      return;
    }

    const room = rooms.get(pin);
    if (!room) {
      socket.emit("room:error", { message: "Room not found." });
      return;
    }

    if (room.guestId && room.guestId !== socket.id) {
      socket.emit("room:error", { message: "Room is full." });
      return;
    }

    if (room.hostId === socket.id) {
      socket.emit("room:error", { message: "You are already the host of this room." });
      return;
    }

    leaveCurrentRoom(socket);

    room.guestId = socket.id;
    socket.join(pin);
    socket.data.pin = pin;
    socket.data.role = "guest";
    socket.emit("room:joined", {
      pin,
      side: "dark",
    });

    io.to(room.hostId).emit("room:ready", { pin });
    socket.emit("room:ready", { pin });

    if (room.latestSnapshot) {
      socket.emit("state:update", { snapshot: room.latestSnapshot });
    }
  });

  socket.on("state:update", (payload) => {
    const pin = normalizePin(payload?.pin);
    const snapshot = payload?.snapshot;
    if (!pin || !snapshot) {
      return;
    }

    const room = rooms.get(pin);
    if (!room) {
      return;
    }

    if (socket.id !== room.hostId && socket.id !== room.guestId) {
      return;
    }

    room.latestSnapshot = snapshot;
    socket.to(pin).emit("state:update", { snapshot });
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket, true);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Stratego server running on http://localhost:${PORT}`);
});

function leaveCurrentRoom(socket, fromDisconnect = false) {
  const pin = normalizePin(socket.data.pin);
  if (!pin) {
    return;
  }

  const room = rooms.get(pin);
  if (!room) {
    socket.data.pin = "";
    socket.data.role = "";
    return;
  }

  const wasHost = room.hostId === socket.id;
  const wasGuest = room.guestId === socket.id;
  if (!wasHost && !wasGuest) {
    socket.data.pin = "";
    socket.data.role = "";
    return;
  }

  if (!fromDisconnect) {
    socket.leave(pin);
  }

  if (wasHost) {
    if (room.guestId) {
      io.to(room.guestId).emit("room:opponent_left");
      const guestSocket = io.sockets.sockets.get(room.guestId);
      if (guestSocket) {
        guestSocket.leave(pin);
        guestSocket.data.pin = "";
        guestSocket.data.role = "";
      }
    }
    rooms.delete(pin);
  } else if (wasGuest) {
    room.guestId = null;
    room.latestSnapshot = null;
    io.to(room.hostId).emit("room:opponent_left");
  }

  socket.data.pin = "";
  socket.data.role = "";
}

function createUniquePin() {
  let pin = "";
  do {
    pin = String(Math.floor(10000 + Math.random() * 90000));
  } while (rooms.has(pin));
  return pin;
}

function normalizePin(pin) {
  if (!pin) {
    return "";
  }
  return String(pin).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isSupportedDecisionType(decisionType) {
  return decisionType === "deployment" || decisionType === "move";
}

function sanitizeModelName(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : "";
}

function buildOpenAiRequest(model, decisionType, payload) {
  return {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildSystemPrompt(decisionType),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: decisionType === "deployment" ? "stratego_deployment_decision" : "stratego_move_decision",
        strict: true,
        schema: buildDecisionSchema(decisionType),
      },
    },
  };
}

function buildSystemPrompt(decisionType) {
  const scope =
    decisionType === "deployment"
      ? "Choose exactly one provided deployment option."
      : "Choose exactly one provided legal move.";

  return [
    "You are commanding a Stratego side and must play to maximize win probability.",
    "The expert engine provides a recommended option. Approve it if it is best; otherwise override it with another legal option.",
    "The engine will execute the exact legal option you select.",
    "You only know the public information included in the payload. Hidden enemy pieces are unknown unless explicitly marked as revealed.",
    scope,
    "Do not ask for more information. Do not explain the rules. Return only the JSON required by the schema.",
  ].join(" ");
}

function buildDecisionSchema(decisionType) {
  const choiceKey = decisionType === "deployment" ? "selectedOptionId" : "selectedMoveId";
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: {
        type: "string",
        enum: ["approve_expert", "override_expert"],
      },
      [choiceKey]: {
        type: "string",
      },
      explanation: {
        type: "string",
      },
    },
    required: ["decision", choiceKey, "explanation"],
  };
}

function extractDecision(body, decisionType) {
  const parsed = parseJsonFromResponse(body);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI returned an invalid decision payload.");
  }

  const choiceKey = decisionType === "deployment" ? "selectedOptionId" : "selectedMoveId";
  const decision = parsed.decision;
  const choiceValue = parsed[choiceKey];
  const explanation = parsed.explanation;

  if (
    (decision !== "approve_expert" && decision !== "override_expert") ||
    typeof choiceValue !== "string" ||
    !choiceValue.trim() ||
    typeof explanation !== "string"
  ) {
    throw new Error("OpenAI returned an incomplete decision.");
  }

  return {
    decision,
    [choiceKey]: choiceValue.trim(),
    explanation: explanation.trim(),
  };
}

function parseJsonFromResponse(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return safeParseJson(body.output_text);
  }

  if (!Array.isArray(body.output)) {
    return null;
  }

  for (const item of body.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (typeof content?.text === "string" && content.text.trim()) {
        const parsed = safeParseJson(content.text);
        if (parsed) {
          return parsed;
        }
      }
    }
  }

  return null;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function extractOpenAiError(body) {
  if (body && typeof body === "object" && body.error && typeof body.error.message === "string") {
    return body.error.message;
  }
  return "OpenAI request failed.";
}

function postJson(url, headers, payload) {
  const target = new URL(url);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            reject(new Error("OpenAI returned malformed JSON."));
            return;
          }
          resolve({
            statusCode: Number(response.statusCode || 500),
            body: parsed,
          });
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.setTimeout(20000, () => {
      request.destroy(new Error("OpenAI request timed out."));
    });

    request.write(body);
    request.end();
  });
}
