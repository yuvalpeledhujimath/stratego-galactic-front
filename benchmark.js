const path = require("path");

function loadEngine(engineRef) {
  const resolvedPath = engineRef
    ? path.isAbsolute(engineRef)
      ? engineRef
      : path.resolve(__dirname, engineRef)
    : path.resolve(__dirname, "./engine");
  const cacheKey = require.resolve(resolvedPath);
  delete require.cache[cacheKey];
  return require(resolvedPath);
}

let engine = loadEngine(null);

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
    seeds: [DEFAULT_SEED],
    deployDiversifyTop: Number(process.env.DEPLOY_DIVERSIFY_TOP || 5),
    deployRollouts: process.env.DEPLOY_ROLLOUTS === "1",
    firstEngine: "./engine.js",
    secondEngine: "./engine.js",
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
      config.seeds = [config.seed];
    } else if (rawKey === "seed-list") {
      const seeds = rawValue
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
      if (seeds.length > 0) {
        config.seeds = seeds;
        config.seed = seeds[0];
      }
    } else if (rawKey === "deploy-diversify-top") {
      config.deployDiversifyTop = Number(rawValue) || config.deployDiversifyTop;
    } else if (rawKey === "deploy-rollouts") {
      config.deployRollouts = rawValue === "1" || rawValue === "true";
    } else if (rawKey === "first-engine") {
      config.firstEngine = rawValue;
    } else if (rawKey === "second-engine") {
      config.secondEngine = rawValue;
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

function applyObservedKnowledge(runtime, knowledgeBySide, attacker, defender, move, outcome) {
  const observer = runtime.oppositeSide(attacker.side);
  runtime.observeEnemyMovement(knowledgeBySide[observer], observer, attacker, move, {
    isAttack: !!defender,
  });

  if (outcome.kind === "battle") {
    runtime.observeBattle(knowledgeBySide.light, "light", attacker, defender, outcome);
    runtime.observeBattle(knowledgeBySide.dark, "dark", attacker, defender, outcome);
  }
}

function buildStartingBoard(runtime, lightProfile, darkProfile, rng, config) {
  const createPiece = runtime.createPieceFactory();
  const lightSetup = runtime.optimizeDeploymentForSide(
    runtime.createBoardWithLakes(),
    "light",
    runtime.makeFullReserve(),
    {
      profileName: lightProfile,
      trials: runtime.DEPLOYMENT_SEARCH_TRIALS[lightProfile] || 12,
      diversifyTop: config.deployDiversifyTop,
      createPiece,
      rng,
      enableRollouts: config.deployRollouts,
    }
  );

  const darkSetup = runtime.optimizeDeploymentForSide(lightSetup.board, "dark", runtime.makeFullReserve(), {
    profileName: darkProfile,
    trials: runtime.DEPLOYMENT_SEARCH_TRIALS[darkProfile] || 12,
    diversifyTop: config.deployDiversifyTop,
    createPiece,
    rng,
    enableRollouts: config.deployRollouts,
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
  const lightEngine = config.lightEngine || engine;
  const darkEngine = config.darkEngine || lightEngine;
  const runtime = lightEngine;
  const rng = createRng(config.seed);
  const board = buildStartingBoard(
    runtime,
    resolveDeploymentProfile(config.lightDifficulty),
    resolveDeploymentProfile(config.darkDifficulty),
    rng,
    config
  );

  const knowledge = {
    light: lightEngine.makeKnowledgeState(),
    dark: darkEngine.makeKnowledgeState(),
  };

  let currentTurn = "light";
  let plies = 0;

  while (plies < config.maxPlies) {
    const winner = runtime.winnerFromBoard(board);
    if (winner) {
      return {
        winner,
        plies,
        reason: "flag",
        finalScore: runtime.evaluateBoard(board, "light"),
      };
    }

    if (!(currentTurn === "light" ? lightEngine : darkEngine).hasAnyLegalMove(board, currentTurn)) {
      return {
        winner: runtime.oppositeSide(currentTurn),
        plies,
        reason: "no_moves",
        finalScore: runtime.evaluateBoard(board, "light"),
      };
    }

    const sideEngine = currentTurn === "light" ? lightEngine : darkEngine;
    const move = sideEngine.chooseAiMove(board, {
      side: currentTurn,
      enemySide: runtime.oppositeSide(currentTurn),
      difficulty: currentTurn === "light" ? config.lightDifficulty : config.darkDifficulty,
      useFog: true,
      knowledge: knowledge[currentTurn],
      model: currentTurn === "light" ? config.lightModel : config.darkModel,
      rng,
    });

    if (!move) {
      return {
        winner: runtime.oppositeSide(currentTurn),
        plies,
        reason: "no_move_returned",
        finalScore: runtime.evaluateBoard(board, "light"),
      };
    }

    const attacker = runtime.copyPiece(board[move.fromR][move.fromC]);
    const defender = runtime.copyPiece(board[move.toR][move.toC]);
    const outcome = runtime.applyMove(board, move);
    applyObservedKnowledge(sideEngine, knowledge, attacker, defender, move, outcome);

    if (outcome.winner) {
      return {
        winner: outcome.winner,
        plies: plies + 1,
        reason: "flag",
        finalScore: runtime.evaluateBoard(board, "light"),
      };
    }

    currentTurn = runtime.oppositeSide(currentTurn);
    plies += 1;
  }

  const finalScore = runtime.evaluateBoard(board, "light");
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
      lightEngine: swapSides ? suite.secondEngine : suite.firstEngine,
      darkEngine: swapSides ? suite.firstEngine : suite.secondEngine,
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

function mergeSuiteReports(suite, reports) {
  const results = reports.flatMap((report) => report.results);
  const summary = {
    firstWins: 0,
    secondWins: 0,
    avgPlies: 0,
    cutoffGames: 0,
  };

  reports.forEach((report) => {
    summary.firstWins += report.summary.firstWins;
    summary.secondWins += report.summary.secondWins;
    summary.cutoffGames += report.summary.cutoffGames;
  });

  results.forEach((result) => {
    summary.avgPlies += result.plies;
  });

  summary.avgPlies = Number((summary.avgPlies / Math.max(1, results.length)).toFixed(1));
  return { suite, summary, results };
}

function printSummary(report, config) {
  const totalGames = config.games * Math.max(1, config.seeds.length);
  console.log("Stratego AI Benchmark");
  console.log("====================");
  console.log(`Mode: ${config.mode}`);
  console.log(`Games per suite: ${config.games}`);
  console.log(`Max plies: ${config.maxPlies}`);
  console.log(`Deployment diversify top: ${config.deployDiversifyTop}`);
  console.log(`Deployment rollouts: ${config.deployRollouts ? "on" : "off"}`);
  if (config.seeds.length > 1) {
    console.log(`Seeds: ${config.seeds.join(", ")}`);
    console.log(`Total games per suite: ${totalGames}`);
  } else {
    console.log(`Seed: ${config.seed}`);
  }
  console.log("");

  report.forEach(({ suite, summary }) => {
    const firstRate = ((summary.firstWins / totalGames) * 100).toFixed(1);
    const secondRate = ((summary.secondWins / totalGames) * 100).toFixed(1);
    console.log(`${suite.name}`);
    console.log(`  ${suite.firstDisplay}: ${summary.firstWins}/${totalGames} wins (${firstRate}%)`);
    console.log(`  ${suite.secondDisplay}: ${summary.secondWins}/${totalGames} wins (${secondRate}%)`);
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
  const firstEngine = loadEngine(config.firstEngine);
  const secondEngine = loadEngine(config.secondEngine);
  return createSuite({
    name: config.name.replace(/-/g, " "),
    firstDifficulty: config.firstDifficulty,
    secondDifficulty: config.secondDifficulty,
    firstModel: firstModelSpec.model,
    secondModel: secondModelSpec.model,
    firstEngine,
    secondEngine,
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

  const report = suites.map((suite) =>
    mergeSuiteReports(
      suite,
      config.seeds.map((seed) => runSuite(suite, { ...config, seed }))
    )
  );
  printSummary(report, config);
}

main();
