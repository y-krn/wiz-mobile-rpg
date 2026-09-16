import assert from "node:assert/strict";

import {
  classifySidegrade,
  diffBuildObservations,
  isParetoSafeDelta,
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

assert.equal(
  isParetoSafeDelta(delta({ atk: 10 }, { atk: 12 })),
  true,
  "ATK-only improvement is Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta(
    { explorationSupportValues: { trapBonus: 0 } },
    { explorationSupportValues: { trapBonus: 10 } }
  )),
  true,
  "trapBonus-only improvement is Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta(
    { explorationSupportValues: { trapGuard: 0 } },
    { explorationSupportValues: { trapGuard: 10 } }
  )),
  true,
  "trapGuard-only improvement is Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta(
    {},
    {
      mainCoreIds: ["CORE_NEW"],
      auxiliaryCoreIds: ["CORE_AUX"],
      supportValues: { followUp: 1 },
      activeRuneSpellIds: ["RUNE_NEW"],
      spellIds: ["SPELL_NEW"]
    }
  )),
  true,
  "tracked feature additions are Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta({ atk: 10 }, { atk: 9, def: 11 })),
  false,
  "any combat loss is not Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta(
    { explorationSupportValues: { trapBonus: 10, trapGuard: 10 } },
    { explorationSupportValues: { trapBonus: 9, trapGuard: 11 } }
  )),
  false,
  "any Exploration Support loss is not Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta(
    { supportValues: { followUp: 1 }, activeRuneSpellIds: ["RUNE_OLD"] },
    { supportValues: { followUp: 2 }, activeRuneSpellIds: [] }
  )),
  false,
  "tracked feature loss is not Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta({}, {})),
  false,
  "no improvement is not Pareto-safe"
);
assert.equal(
  isParetoSafeDelta(delta({ atk: 10 }, { atk: 9, mainCoreIds: ["CORE_NEW"] })),
  false,
  "mixed improvement and loss is a tradeoff"
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
  },
  {
    floor: 2,
    evaluableCandidate: true,
    qualifies: false,
    selected: false,
    rejectionReason: "future-reason",
    sidegradeClassifications: ["strictUpgrade"],
    explorationAbilityDelta: { trapGuard: 1 }
  }
];
const candidateActivity = summarizeExplorationCandidateActivity(candidateAudits, [1, 2]);
assert.equal(candidateActivity.byFloor["1"].categories.trapBonus.candidateCount, 0);
assert.equal(candidateActivity.byFloor["2"].categories.positiveExplorationDelta.candidateCount, 4);
assert.equal(candidateActivity.byFloor["2"].categories.trapBonus.qualifies, 2);
assert.equal(candidateActivity.byFloor["2"].categories.trapBonus.selected, 1);
assert.equal(candidateActivity.byFloor["2"].categories.arcaneSense.candidateCount, 2);
assert.equal(candidateActivity.byFloor["2"].categories.trapGuard.candidateCount, 1);

const rejectionCrossTab = summarizeRejectedCandidateCrossTab(candidateAudits, [1, 2]);
assert.equal(
  rejectionCrossTab.byFloor["2"].byRejectionReason["out-ranked-by-later-candidate"].strictUpgrade,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byRejectionReason["not-best-selection-score"].strictUpgrade,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byRejectionReason.other.strictUpgrade,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byCategory.trapBonus["out-ranked-by-later-candidate"]
    .rejectedCandidateCount,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byCategory.trapBonus["out-ranked-by-later-candidate"]
    .sidegradeClassificationCounts.strictUpgrade,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byCategory.arcaneSense["not-best-selection-score"]
    .rejectedCandidateCount,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byCategory.arcaneSense["future-reason"],
  undefined
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byCategory.trapGuard.other.rejectedCandidateCount,
  1
);
assert.equal(
  rejectionCrossTab.byFloor["2"].byCategory.trapGuard.other.sidegradeClassificationCounts
    .strictUpgrade,
  1
);

console.log("build progression audit classification passed");
