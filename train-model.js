const fs = require("fs");
const path = require("path");
const engine = require("./engine");

const DEFAULTS = {
  games: Number(process.env.GAMES || 24),
  maxPlies: Number(process.env.MAX_PLIES || 260),
  seed: Number(process.env.SEED || 20260311),
  lrValue: Number(process.env.LR_VALUE || 0.012),
  lrPrior: Number(process.env.LR_PRIOR || 0.008),
  discount: Number(process.env.DISCOUNT || 0.992),
  cutoffScale: Number(process.env.CUTOFF_SCALE || 1800),
  heartbeatEvery: Number(process.env.HEARTBEAT_EVERY || 100),
  suddenDeathStart: Number(process.env.SUDDEN_DEATH_START || 260),
  suddenDeathDifficulty: process.env.SUDDEN_DEATH_DIFFICULTY || "medium",
  input: process.env.INPUT || path.resolve(__dirname, "ai-model.js"),
  output: process.env.OUTPUT || path.resolve(__dirname, "ai-model.candidate.js"),
  lightDifficulty: process.env.LIGHT || "hard",
  darkDifficulty: process.env.DARK || "hard",
  reportEvery: Number(process.env.REPORT_EVERY || 4),
};

function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  argv.forEach((arg) => {
    if (!arg.startsWith("--")) {
      return;
    }
    const [key, rawValue] = arg.slice(2).split("=");
    if (!key || rawValue === undefined) {
      return;
    }

    if (key === "games") {
      config.games = Number(rawValue) || config.games;
    } else if (key === "max-plies") {
      config.maxPlies = Number(rawValue) || config.maxPlies;
    } else if (key === "seed") {
      config.seed = Number(rawValue) || config.seed;
    } else if (key === "lr-value") {
      config.lrValue = Number(rawValue) || config.lrValue;
    } else if (key === "lr-prior") {
      config.lrPrior = Number(rawValue) || config.lrPrior;
    } else if (key === "discount") {
      config.discount = Number(rawValue) || config.discount;
    } else if (key === "cutoff-scale") {
      config.cutoffScale = Number(rawValue) || config.cutoffScale;
    } else if (key === "heartbeat-every") {
      config.heartbeatEvery = Number(rawValue) || config.heartbeatEvery;
    } else if (key === "sudden-death-start") {
      config.suddenDeathStart = Number(rawValue) || config.suddenDeathStart;
    } else if (key === "sudden-death-difficulty") {
      config.suddenDeathDifficulty = rawValue;
    } else if (key === "input") {
      config.input = path.resolve(__dirname, rawValue);
    } else if (key === "output") {
      config.output = path.resolve(__dirname, rawValue);
    } else if (key === "light") {
      config.lightDifficulty = rawValue;
    } else if (key === "dark") {
      config.darkDifficulty = rawValue;
    } else if (key === "report-every") {
      config.reportEvery = Number(rawValue) || config.reportEvery;
    }
  });
  return config;
}

function cloneModel(model) {
  return JSON.parse(JSON.stringify(model));
}

function loadRawModel(modelPath) {
  const resolvedPath = path.resolve(modelPath);
  const cacheKey = require.resolve(resolvedPath);
  delete require.cache[cacheKey];
  return require(resolvedPath);
}

function addFeatureMap(target, features, scale) {
  Object.entries(features).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + value * scale;
  });
}

function subtractFeatureMaps(left, right) {
  const result = {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  keys.forEach((key) => {
    result[key] = (left[key] || 0) - (right[key] || 0);
  });
  return result;
}

function averageFeatureMaps(featureMaps) {
  if (featureMaps.length === 0) {
    return {};
  }

  const total = {};
  featureMaps.forEach((features) => addFeatureMap(total, features, 1));
  Object.keys(total).forEach((key) => {
    total[key] /= featureMaps.length;
  });
  return total;
}

function clipWeights(weights, limit = 12) {
  Object.keys(weights).forEach((key) => {
    weights[key] = Math.max(-limit, Math.min(limit, weights[key]));
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dotWeights(weights, features) {
  let total = 0;
  Object.entries(features).forEach(([key, value]) => {
    total += (weights[key] || 0) * value;
  });
  return total;
}

function applyObservedKnowledge(knowledgeBySide, attacker, defender, move, outcome) {
  const observer = engine.oppositeSide(attacker.side);
  engine.observeEnemyMovement(knowledgeBySide[observer], observer, attacker, move, {
    isAttack: !!defender,
  });

  if (outcome.kind === "battle") {
    engine.observeBattle(knowledgeBySide.light, "light", attacker, defender);
    engine.observeBattle(knowledgeBySide.dark, "dark", attacker, defender);
  }
}

function resolveDeploymentProfile(difficulty) {
  if (difficulty === "expert") {
    return "expert";
  }
  if (difficulty === "hard") {
    return "hard";
  }
  if (difficulty === "medium") {
    return "player";
  }
  return "easy";
}

function buildStartingBoard(lightProfile, darkProfile, rng) {
  const createPiece = engine.createPieceFactory();
  const lightSetup = engine.optimizeDeploymentForSide(
    engine.createBoardWithLakes(),
    "light",
    engine.makeFullReserve(),
    {
      profileName: lightProfile,
      trials: engine.DEPLOYMENT_SEARCH_TRIALS[lightProfile] || 12,
      diversifyTop: 1,
      createPiece,
      rng,
      enableRollouts: false,
    }
  );

  const darkSetup = engine.optimizeDeploymentForSide(lightSetup.board, "dark", engine.makeFullReserve(), {
    profileName: darkProfile,
    trials: engine.DEPLOYMENT_SEARCH_TRIALS[darkProfile] || 12,
    diversifyTop: 1,
    createPiece,
    rng,
    enableRollouts: false,
  });

  return engine.mergeBoards(lightSetup.board, darkSetup.board);
}

function playTrainingGame(config, model, seed, hooks = {}) {
  const rng = createRng(seed);
  const board = buildStartingBoard(
    resolveDeploymentProfile(config.lightDifficulty),
    resolveDeploymentProfile(config.darkDifficulty),
    rng
  );

  const knowledge = {
    light: engine.makeKnowledgeState(),
    dark: engine.makeKnowledgeState(),
  };

  const samples = [];
  let currentTurn = "light";
  let plies = 0;

  while (plies < config.maxPlies) {
    const winner = engine.winnerFromBoard(board);
    if (winner) {
      return {
        winner,
        plies,
        samples,
        reason: "flag",
        lightTarget: winner === "light" ? 1 : -1,
        finalScore: winner === "light" ? 1_000_000 : -1_000_000,
      };
    }

    const inSuddenDeath =
      config.suddenDeathStart > 0 && plies >= Math.min(config.suddenDeathStart, config.maxPlies);
    const difficulty = inSuddenDeath
      ? config.suddenDeathDifficulty
      : currentTurn === "light"
      ? config.lightDifficulty
      : config.darkDifficulty;
    const legalMoves = engine.getAllLegalMoves(board, currentTurn);
    if (legalMoves.length === 0) {
      return {
        winner: engine.oppositeSide(currentTurn),
        plies,
        samples,
        reason: "no_moves",
        lightTarget: currentTurn === "light" ? -1 : 1,
        finalScore: currentTurn === "light" ? -8_000_000 : 8_000_000,
      };
    }

    const context = {
      aiSide: currentTurn,
      enemySide: engine.oppositeSide(currentTurn),
      useFog: !inSuddenDeath,
      knowledge: knowledge[currentTurn],
      model,
      difficulty,
    };

    const boardFeatures = engine.extractBoardFeatures(board, currentTurn);
    const legalFeatures = legalMoves.map((move) =>
      engine.extractMoveFeatures(board, move, currentTurn, context)
    );
    const move = engine.chooseAiMove(board, {
      side: currentTurn,
      enemySide: engine.oppositeSide(currentTurn),
      difficulty,
      useFog: !inSuddenDeath,
      knowledge: knowledge[currentTurn],
      model,
      rng,
    });

    if (!move) {
      return {
        winner: engine.oppositeSide(currentTurn),
        plies,
        samples,
        reason: "no_move_returned",
        lightTarget: currentTurn === "light" ? -1 : 1,
        finalScore: currentTurn === "light" ? -8_000_000 : 8_000_000,
      };
    }

    const chosenFeatures = engine.extractMoveFeatures(board, move, currentTurn, context);
    const policyFeatures = subtractFeatureMaps(chosenFeatures, averageFeatureMaps(legalFeatures));
    samples.push({
      side: currentTurn,
      boardFeatures,
      policyFeatures,
      ply: plies,
    });

    const attacker = engine.copyPiece(board[move.fromR][move.fromC]);
    const defender = engine.copyPiece(board[move.toR][move.toC]);
    const outcome = engine.applyMove(board, move);
    applyObservedKnowledge(knowledge, attacker, defender, move, outcome);

    if (outcome.winner) {
      return {
        winner: outcome.winner,
        plies: plies + 1,
        samples,
        reason: "flag",
        lightTarget: outcome.winner === "light" ? 1 : -1,
        finalScore: outcome.winner === "light" ? 1_000_000 : -1_000_000,
      };
    }

    currentTurn = engine.oppositeSide(currentTurn);
    plies += 1;

    if (
      hooks.onHeartbeat &&
      config.heartbeatEvery > 0 &&
      plies > 0 &&
      plies % config.heartbeatEvery === 0
    ) {
      hooks.onHeartbeat(plies);
    }
  }

  const finalScore = engine.evaluateBoard(board, "light");
  const lightTarget = clamp(Math.tanh(finalScore / config.cutoffScale), -0.98, 0.98);
  return {
    winner: finalScore >= 0 ? "light" : "dark",
    plies: config.maxPlies,
    samples,
    reason: "eval_cutoff",
    lightTarget,
    finalScore,
  };
}

function trainModel(config, initialModel) {
  const model = cloneModel(initialModel);
  model.enabled = true;
  model.name = "selfplay-policy-value-v1";
  model.valueScale = model.valueScale || {};
  model.priorScale = model.priorScale || {};
  model.valueWeights = model.valueWeights || {};
  model.priorWeights = model.priorWeights || {};
  const report = {
    lightWins: 0,
    darkWins: 0,
    avgPlies: 0,
    flags: 0,
    noMoves: 0,
    evalCutoffs: 0,
  };
  const startedAt = Date.now();

  for (let gameIndex = 0; gameIndex < config.games; gameIndex += 1) {
    const result = playTrainingGame(config, model, config.seed + gameIndex * 7919, {
      onHeartbeat(plies) {
        const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
          `[train] game ${gameIndex + 1}/${config.games}, ply=${plies}/${config.maxPlies}, elapsed=${elapsedSeconds}s`
        );
      },
    });
    report.avgPlies += result.plies;

    if (result.winner === "light") {
      report.lightWins += 1;
    } else {
      report.darkWins += 1;
    }

    if (result.reason === "flag") {
      report.flags += 1;
    } else if (result.reason === "no_moves") {
      report.noMoves += 1;
    } else if (result.reason === "eval_cutoff") {
      report.evalCutoffs += 1;
    }

    result.samples.forEach((sample, sampleIndex) => {
      const outcome = sample.side === "light" ? result.lightTarget : -result.lightTarget;
      const distanceToEnd = result.samples.length - sampleIndex - 1;
      const target = outcome * Math.pow(config.discount, Math.max(0, distanceToEnd));
      const valuePrediction = dotWeights(model.valueWeights, sample.boardFeatures);
      const valueError = target - valuePrediction;

      addFeatureMap(model.valueWeights, sample.boardFeatures, config.lrValue * valueError);
      addFeatureMap(model.priorWeights, sample.policyFeatures, config.lrPrior * target);
    });

    if (
      config.reportEvery > 0 &&
      (gameIndex + 1 === config.games || (gameIndex + 1) % config.reportEvery === 0)
    ) {
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `[train] ${gameIndex + 1}/${config.games} games, light=${report.lightWins}, dark=${report.darkWins}, elapsed=${elapsedSeconds}s`
      );
    }
  }

  clipWeights(model.valueWeights);
  clipWeights(model.priorWeights);
  model.training = {
    gamesSeen: Number((model.training && model.training.gamesSeen) || 0) + config.games,
    updatedAt: new Date().toISOString().slice(0, 10),
    baseModel: path.basename(config.input),
    seed: config.seed,
  };

  report.avgPlies = Number((report.avgPlies / Math.max(1, config.games)).toFixed(1));
  return { model, report };
}

function serializeModel(model) {
  return `(function (root, factory) {
  const model = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = model;
  }
  root.StrategoAiModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return ${JSON.stringify(model, null, 2)};
});
`;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const baseModel = loadRawModel(config.input);
  const { model, report } = trainModel(config, baseModel);
  fs.writeFileSync(config.output, serializeModel(model), "utf8");

  console.log("Stratego AI Training");
  console.log("====================");
  console.log(`Games: ${config.games}`);
  console.log(`Max plies: ${config.maxPlies}`);
  console.log(`Seed: ${config.seed}`);
  console.log(`Cutoff scale: ${config.cutoffScale}`);
  console.log(`Sudden death start: ${config.suddenDeathStart}`);
  console.log(`Sudden death difficulty: ${config.suddenDeathDifficulty}`);
  console.log(`Input model: ${config.input}`);
  console.log(`Light wins: ${report.lightWins}`);
  console.log(`Dark wins: ${report.darkWins}`);
  console.log(`Avg plies: ${report.avgPlies}`);
  console.log(`Flag endings: ${report.flags}`);
  console.log(`No-move endings: ${report.noMoves}`);
  console.log(`Eval cutoffs: ${report.evalCutoffs}`);
  console.log(`Wrote model: ${config.output}`);
}

main();
