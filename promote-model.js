const fs = require("fs");
const path = require("path");
const engine = require("./engine");

const DEFAULT_SOURCE = path.resolve(__dirname, "ai-model.candidate.js");
const DEFAULT_TARGET = path.resolve(__dirname, "ai-model.js");

function parseArgs(argv) {
  const config = {
    source: process.env.SOURCE || DEFAULT_SOURCE,
    target: process.env.TARGET || DEFAULT_TARGET,
  };

  argv.forEach((arg) => {
    if (!arg.startsWith("--")) {
      return;
    }
    const [key, rawValue] = arg.slice(2).split("=");
    if (!key || rawValue === undefined) {
      return;
    }

    if (key === "source") {
      config.source = path.resolve(__dirname, rawValue);
    } else if (key === "target") {
      config.target = path.resolve(__dirname, rawValue);
    }
  });

  return config;
}

function loadModel(modelPath) {
  const cacheKey = require.resolve(modelPath);
  delete require.cache[cacheKey];
  return require(modelPath);
}

function main() {
  const config = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(config.source)) {
    throw new Error(`Source model not found: ${config.source}`);
  }

  const candidate = loadModel(config.source);
  if (!engine.normalizeModel(candidate)) {
    throw new Error(`Source model is disabled or invalid: ${config.source}`);
  }

  fs.copyFileSync(config.source, config.target);

  console.log("Stratego AI Promote");
  console.log("===================");
  console.log(`Source: ${config.source}`);
  console.log(`Target: ${config.target}`);
  console.log(`Model: ${candidate.name || path.basename(config.source)}`);
}

main();
