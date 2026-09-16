import assert from "node:assert/strict";

import {
  classifySidegrade,
  diffBuildObservations,
  summarizeExplorationCandidateActivity,
  summarizeRejectedCandidateCrossTab
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
  classifySidegrade(delta(
    { atk: 10, mainCoreIds: ["CORE_OLD"] },
    { atk: 12, mainCoreIds: [] }
  )),
  ["buildTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta(
    { atk: 10, activeRuneSpellIds: ["RUNE_OLD"] },
    { atk: 12, activeRuneSpellIds: [] }
  )),
  ["buildTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta(
    { atk: 10, supportValues: { SUPPORT_OLD: 1 } },
    { atk: 12, supportValues: { SUPPORT_OLD: 0 } }
  )),
  ["buildTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta(
    { atk: 10, spellIds: ["SPELL_OLD"] },
    { atk: 12, spellIds: [] }
  )),
  ["buildTradeoff"]
);
assert.deepEqual(
  classifySidegrade(delta({ atk: 10, def: 10 }, { atk: 10, def: 10 })),
  ["noMeaningfulGain"]
);

const candidateAudits = [
  {
    floor: 2,
    evaluableCandidate: true,
    qualifies: true,
    selected: false,
    rejectionReason: "out-ranked-by-later-candidate",
    sidegradeClassifications: ["strictUpgrade"],
    explorationAbilityDelta: { trapBonus: 2, arcaneSense: 1 }
  },
  {
    floor: 2,
    evaluableCandidate: true,
    qualifies: true,
    selected: true,
    rejectionReason: null,
    sidegradeClassifications: ["strictUpgrade"],
    explorationAbilityDelta: { trapBonus: 1 }
  },
  {
    floor: 2,
    evaluableCandidate: true,
    qualifies: false,
    selected: false,
    rejectionReason: "not-best-selection-score",
    sidegradeClassifications: ["strictUpgrade"],
    explorationAbilityDelta: { arcaneSense: 1 }
  }
];
const candidateActivity = summarizeExplorationCandidateActivity(candidateAudits, [1, 2]);
assert.equal(candidateActivity.byFloor["1"].categories.trapBonus.candidateCount, 0);
assert.equal(candidateActivity.byFloor["2"].categories.positiveExplorationDelta.candidateCount, 3);
assert.equal(candidateActivity.byFloor["2"].categories.trapBonus.qualifies, 2);
assert.equal(candidateActivity.byFloor["2"].categories.trapBonus.selected, 1);
assert.equal(candidateActivity.byFloor["2"].categories.arcaneSense.candidateCount, 2);

const rejectionCrossTab = summarizeRejectedCandidateCrossTab(candidateAudits, [1, 2]);
assert.equal(
  rejectionCrossTab.byFloor["2"].byRejectionReason["out-ranked-by-later-candidate"].strictUpgrade,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byRejectionReason["not-best-selection-score"].strictUpgrade,
  1
);

console.log("build progression audit classification passed");
