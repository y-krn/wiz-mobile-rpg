import assert from "node:assert/strict";
import {
  CORE_AFFIXES,
  SUPPORT_AFFIXES
} from "../src/data/affixes.js";
import {
  ISSUE679_AFFIX_FUNNEL_FIELDS,
  ISSUE679_CLASSIFICATION_AGGREGATE,
  ISSUE679_PROVENANCE_FIELDS,
  createAffixReachability,
  finalizeAffixReachability
} from "./sim_depth_material_ev.js";

const expectedFunnelFields = [
  "recordedReward",
  "candidate",
  "equipped",
  "conditionEligible",
  "application"
];
const expectedIds = [
  ...CORE_AFFIXES.filter(affix => affix.enabled),
  ...SUPPORT_AFFIXES.filter(affix => affix.enabled)
].map(affix => affix.id);

assert.equal(expectedIds.length, 65, "Issue #679 enabled affix count");
assert.equal(new Set(expectedIds).size, expectedIds.length, "Issue #679 IDs are unique");
assert.deepEqual([...ISSUE679_AFFIX_FUNNEL_FIELDS], expectedFunnelFields);

const reachability = createAffixReachability();
const output = finalizeAffixReachability({ affixReachability: reachability });
assert.deepEqual(Object.keys(output).sort(), [...expectedIds].sort());
for (const id of expectedIds) {
  assert.deepEqual(
    Object.keys(output[id]).sort(),
    [...expectedFunnelFields].sort(),
    `${id} funnel schema`
  );
}

assert.deepEqual(ISSUE679_CLASSIFICATION_AGGREGATE, {
  core: { A: 11, B: 0, C: 3, D: 4 },
  support: { A: 0, B: 0, C: 47, D: 0 },
  combined: { A: 11, B: 0, C: 50, D: 4 }
});
assert.deepEqual([...ISSUE679_PROVENANCE_FIELDS], [
  "gameplaySourceCommit",
  "measurementRunnerCommit",
  "measurementRunnerPaths",
  "measurementRunnerDiffSha256",
  "originMainAncestor",
  "staleTreeAllowed",
  "workingTreeClean",
  "workingTreeDirty",
  "dirtyTreeAllowed"
]);

console.log("PASS Issue #679 affix inventory funnel/output schema");
