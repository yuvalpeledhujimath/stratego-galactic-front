(function (root, factory) {
  const model = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = model;
  }
  root.StrategoAiModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
  "version": 1,
  "name": "selfplay-policy-value-v1",
  "enabled": true,
  "valueScale": {
    "medium": 18,
    "hard": 52,
    "expert": 96
  },
  "priorScale": {
    "medium": 10,
    "hard": 28,
    "expert": 52
  },
  "valueWeights": {
    "bias": -0.07193370352613651,
    "materialDiff": 0.026580360663697955,
    "mobilityDiff": 0.08290987610817624,
    "flagSafetyDiff": 0.2379356875696697,
    "centerControlDiff": 0.24133669795919183,
    "advancementDiff": -0.3733158155689407,
    "minerBombPressureDiff": 0.09112502219913059,
    "highRankDiff": 0.5661217069630191,
    "scoutDiff": -0.05607588611034085,
    "spyPressureDiff": 0.28548476432273523,
    "movableCountDiff": -0.03430622141776309,
    "frontlinePresenceDiff": -0.08363584935623443
  },
  "priorWeights": {
    "bias": 0,
    "tacticalScore": 12,
    "evalShift": 1.0296933307127827,
    "advance": 0.16464571166618597,
    "risk": -0.6020707523234382,
    "mobilityGain": 0.1649564953853843,
    "isAttack": 0.2832906422325141,
    "isUnknownAttack": 0.15398819456969054,
    "isFlagCapture": 8.031956590885263,
    "captureValue": 0.8367526498840899,
    "scoutLong": 0.123601737151509,
    "centerDelta": 0.12107328605924556,
    "frontlineGain": 0.10137703364715635
  },
  "training": {
    "gamesSeen": 26,
    "updatedAt": "2026-03-11",
    "baseModel": "ai-model.candidate.js",
    "seed": 20260311
  }
};
});
