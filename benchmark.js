const path = require("path");
const engine = require("./engine");

const DEFAULT_GAMES = Number(process.env.GAMES || 8);
const DEFAULT_MAX_PLIES = Number(process.env.MAX_PLIES || 260);
const DEFAULT_SEED = Number(process.env.SEED || 12345);
const DEFAULT_MODEL_PATH = "./ai-model.js";

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
  const config = {
    games: DEFAULT_GAMES,
    maxPlies: DEFAULT_MAX_PLIES,
    seed: DEFAULT_SEED,
    mode: "difficulty",
    sharedModel: DEFAULT_MODEL_PATH,
    firstDifficulty: "expert",
    secondDifficulty: "expert",
    firstModel: "./ai-model.candidate.js",
    secondModel: DEFAULT_MODEL_PATH,
    name: "Candidate-vs-Live",
  };

  argv.forEach((arg) => {
    if (!arg.startsWith("--")) {
      return;
    }
    const [rawKey, rawValue] = arg.slice(2).split("=");
    if (!rawKey || rawValue === undefined) {
      return;
    }
    if (rawKey === "games") {
      config.games = Number(rawValue) || config.games;
    } else if (rawKey === "max-plies") {
      config.maxPlies = Number(rawValue) || config.maxPlies;
    } else if (rawKey === "seed") {
      config.seed = Number(rawValue) || config.seed;
    } else if (rawKey === "mode") {
      config.mode = rawValue;
    } else if (rawKey === "model") {
      config.sharedModel = rawValue;
    } else if (rawKey === "first-model") {
      config.firstModel = rawValue;
    } else if (rawKey === "second-model") {
      config.secondModel = rawValue;
    } else if (rawKey === "first-difficulty") {
      config.firstDifficulty = rawValue;
    } else if (rawKey === "second-difficulty") {
      config.secondDifficulty = rawValue;
    } else if (rawKey === "name") {
      config.name = rawValue;
    }
  });

  return config;
}

function loadModelSpec(modelRef) {
  if (!modelRef || modelRef === "none") {
    return { model: null, label: "no-model", source: "none" };
  }

  const resolvedPath = path.isAbsolute(modelRef) ? modelRef : path.resolve(__dirname, modelRef);
  const cacheKey = require.resolve(resolvedPath);
  delete require.cache[cacheKey];
  const loadedModel = require(resolvedPath);
  const normalizedModel = engine.normalizeModel(loadedModel);
  const rawLabel =
    (loadedModel && loadedModel.name) || path.basename(resolvedPath).replace(/\.js$/i, "");

  return {
    model: normalizedModel,
    label: normalizedModel ? rawLabel : `${rawLabel} (disabled)`,
    source: resolvedPath,
  };
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

function playMatch(config) {
  const rng = createRng(config.seed);
  const board = buildStartingBoard(
    resolveDeploymentProfile(config.lightDifficulty),
    resolveDeploymentProfile(config.darkDifficulty),
    rng
  );

  const knowledge = {
    light: engine.makeKnowledgeState(),
    dark: engine.makeKnowledgeState(),
  };

  let currentTurn = "light";
  let plies = 0;

  while (plies < config.maxPlies) {
    const winner = engine.winnerFromBoard(board);
    if (winner) {
      return {
        winner,
        plies,
        reason: "flag",
        finalScore: engine.evaluateBoard(board, "light"),
      };
    }

    if (!engine.hasAnyLegalMove(board, currentTurn)) {
      return {
        winner: engine.oppositeSide(currentTurn),
        plies,
        reason: "no_moves",
        finalScore: engine.evaluateBoard(board, "light"),
      };
    }

    const move = engine.chooseAiMove(board, {
      side: currentTurn,
      enemySide: engine.oppositeSide(currentTurn),
      difficulty: currentTurn === "light" ? config.lightDifficulty : config.darkDifficulty,
      useFog: true,
      knowledge: knowledge[currentTurn],
      model: currentTurn === "light" ? config.lightModel : config.darkModel,
      rng,
    });

    if (!move) {
      return {
        winner: engine.oppositeSide(currentTurn),
        plies,
        reason: "no_move_returned",
        finalScore: engine.evaluateBoard(board, "light"),
      };
    }

    const attacker = engine.copyPiece(board[move.fromR][move.fromC]);
    const defender = engine.copyPiece(board[move.toR][move.toC]);
    const outcome = engine.applyMove(board, move);
    applyObservedKnowledge(knowledge, attacker, defender, move, outcome);

    if (outcome.winner) {
      return {
        winner: outcome.winner,
        plies: plies + 1,
        reason: "flag",
        finalScore: engine.evaluateBoard(board, "light"),
      };
    }

    currentTurn = engine.oppositeSide(currentTurn);
    plies += 1;
  }

  const finalScore = engine.evaluateBoard(board, "light");
  return {
    winner: finalScore >= 0 ? "light" : "dark",
    plies: config.maxPlies,
    reason: "eval_cutoff",
    finalScore,
  };
}

function createSuite(options) {
  return options;
}

function runSuite(suite, config) {
  const results = [];
  for (let i = 0; i < config.games; i += 1) {
    const swapSides = i % 2 === 1;
    const result = playMatch({
      lightDifficulty: swapSides ? suite.secondDifficulty : suite.firstDifficulty,
      darkDifficulty: swapSides ? suite.firstDifficulty : suite.secondDifficulty,
      lightModel: swapSides ? suite.secondModel : suite.firstModel,
      darkModel: swapSides ? suite.firstModel : suite.secondModel,
      maxPlies: config.maxPlies,
      seed: config.seed + i * 97 + suite.name.length * 17,
    });

    results.push({
      ...result,
      firstSide: swapSides ? "dark" : "light",
    });
  }

  const summary = {
    firstWins: 0,
    secondWins: 0,
    avgPlies: 0,
    cutoffGames: 0,
  };

  results.forEach((result) => {
    const firstWon =
      (result.firstSide === "light" && result.winner === "light") ||
      (result.firstSide === "dark" && result.winner === "dark");

    if (firstWon) {
      summary.firstWins += 1;
    } else {
      summary.secondWins += 1;
    }

    summary.avgPlies += result.plies;
    if (result.reason === "eval_cutoff") {
      summary.cutoffGames += 1;
    }
  });

  summary.avgPlies = Number((summary.avgPlies / Math.max(1, results.length)).toFixed(1));
  return { suite, summary, results };
}

function printSummary(report, config) {
  console.log("Stratego AI Benchmark");
  console.log("====================");
  console.log(`Mode: ${config.mode}`);
  console.log(`Games per suite: ${config.games}`);
  console.log(`Max plies: ${config.maxPlies}`);
  console.log(`Seed: ${config.seed}`);
  console.log("");

  report.forEach(({ suite, summary }) => {
    const firstRate = ((summary.firstWins / config.games) * 100).toFixed(1);
    const secondRate = ((summary.secondWins / config.games) * 100).toFixed(1);
    console.log(`${suite.name}`);
    console.log(`  ${suite.firstDisplay}: ${summary.firstWins}/${config.games} wins (${firstRate}%)`);
    console.log(`  ${suite.secondDisplay}: ${summary.secondWins}/${config.games} wins (${secondRate}%)`);
    console.log(`  Avg plies: ${summary.avgPlies}`);
    console.log(`  Eval cutoffs: ${summary.cutoffGames}`);
    console.log("");
  });
}

function makeDifficultySuites(sharedModelSpec) {
  return [
    createSuite({
      name: "Expert vs Hard",
      firstDifficulty: "expert",
      secondDifficulty: "hard",
      firstModel: sharedModelSpec.model,
      secondModel: sharedModelSpec.model,
      firstDisplay: "Expert",
      secondDisplay: "Hard",
    }),
    createSuite({
      name: "Expert vs Medium",
      firstDifficulty: "expert",
      secondDifficulty: "medium",
      firstModel: sharedModelSpec.model,
      secondModel: sharedModelSpec.model,
      firstDisplay: "Expert",
      secondDisplay: "Medium",
    }),
    createSuite({
      name: "Hard vs Medium",
      firstDifficulty: "hard",
      secondDifficulty: "medium",
      firstModel: sharedModelSpec.model,
      secondModel: sharedModelSpec.model,
      firstDisplay: "Hard",
      secondDisplay: "Medium",
    }),
  ];
}

function makeModelSuite(config, firstModelSpec, secondModelSpec) {
  return createSuite({
    name: config.name.replace(/-/g, " "),
    firstDifficulty: config.firstDifficulty,
    secondDifficulty: config.secondDifficulty,
    firstModel: firstModelSpec.model,
    secondModel: secondModelSpec.model,
    firstDisplay: `${config.firstDifficulty} [${firstModelSpec.label}]`,
    secondDisplay: `${config.secondDifficulty} [${secondModelSpec.label}]`,
  });
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const suites =
    config.mode === "models"
      ? [makeModelSuite(config, loadModelSpec(config.firstModel), loadModelSpec(config.secondModel))]
      : makeDifficultySuites(loadModelSpec(config.sharedModel));

  const report = suites.map((suite) => runSuite(suite, config));
  printSummary(report, config);
}

main();
