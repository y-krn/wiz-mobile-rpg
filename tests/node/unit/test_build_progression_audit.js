import assert from "node:assert/strict";

import {
  classifySidegrade,
  diffBuildObservations
} from "../../../scratch/measurements/build_progression_audit.js";

const observation = ({
  atk = 10,
  def = 10,
  maxHp = 100,
  maxMp = 20,
  explorationSupportValues = {},
  mainCoreIds = [],
  auxiliaryCoreIds = [],
  supportValues = {},
  activeRuneSpellIds = [],
  spellIds = []
} = {}) => ({
  identity: "fixture",
  atk,
  def,
  maxHp,
  maxMp,
  explorationSupportValues,
  mainCoreIds,
  auxiliaryCoreIds,
  supportValues,
  activeRuneSpellIds,
  spellIds
});

const delta = (before, after) => diffBuildObservations(
  observation(before),
  observation(after)
);

assert.deepEqual(
  classifySidegrade(delta({ atk: 10, def: 10 }, { atk: 12, def: 8 })),
  ["combatTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta(
    { atk: 10, explorationSupportValues: { trapBonus: 0 } },
    { atk: 8, explorationSupportValues: { trapBonus: 2 } }
  )),
  ["safetyTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta(
    { atk: 10 },
    { atk: 8, mainCoreIds: ["CORE_TRAP_EATER"] }
  )),
  ["buildTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta({ atk: 10, def: 10 }, { atk: 12, def: 10 })),
  ["strictUpgrade"]
);
assert.deepEqual(
  classifySidegrade(delta({ atk: 10, def: 10 }, { atk: 10, def: 10 })),
  ["noMeaningfulGain"]
);

console.log("build progression audit classification passed");
