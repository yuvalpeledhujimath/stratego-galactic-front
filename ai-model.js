(function (root, factory) {
  const model = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = model;
  }
  root.StrategoAiModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
    version: 1,
    name: "seed-policy-value-v1",
    enabled: false,
    valueScale: {
      medium: 18,
      hard: 52,
      expert: 96,
    },
    priorScale: {
      medium: 10,
      hard: 28,
      expert: 52,
    },
    valueWeights: {
      bias: 0,
      materialDiff: 1.1,
      mobilityDiff: 0.42,
      flagSafetyDiff: 0.78,
      centerControlDiff: 0.21,
      advancementDiff: 0.24,
      minerBombPressureDiff: 0.34,
      highRankDiff: 0.66,
      scoutDiff: 0.16,
      spyPressureDiff: 0.18,
      movableCountDiff: 0.31,
      frontlinePresenceDiff: 0.14,
    },
    priorWeights: {
      bias: 0,
      tacticalScore: 0.94,
      evalShift: 0.48,
      advance: 0.18,
      risk: -0.62,
      mobilityGain: 0.16,
      isAttack: 0.06,
      isUnknownAttack: 0.14,
      isFlagCapture: 8,
      captureValue: 0.34,
      scoutLong: 0.12,
      centerDelta: 0.08,
      frontlineGain: 0.09,
    },
    training: {
      gamesSeen: 0,
      updatedAt: "2026-03-11",
    },
  };
});
