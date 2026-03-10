const path = require("path");
const http = require("http");
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
const rooms = new Map();

app.use(express.static(path.resolve(__dirname)));

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
