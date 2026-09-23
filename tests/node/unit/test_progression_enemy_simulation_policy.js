import assert from "node:assert/strict";
import { PROGRESSION_ENEMY_SIMULATION_POLICY as policy } from "../../../src/data/progression_enemy_simulation_policy.js";
import { PROGRESSION_ENEMY_CONTRACT as contract } from "../../../src/data/progression_enemy_contract.js";

assert.equal(policy.status, "design-only");
assert.equal(policy.productionConnected, false);
assert.equal(policy.contractSource, "PROGRESSION_ENEMY_CONTRACT");
assert.match(policy.candidateValues, /undecided/);
assert.match(policy.priorDiagnosticEvidence, /not candidate defaults, production values, or automatic adoption inputs/);
assert.equal(contract.status, "design-only");
assert.deepEqual(policy.contexts.map(context => context.id), [
  "pre-milestone", "selected-deep-start", "post-milestone"
]);
assert.match(policy.contexts[0].baselineSource, /maximum of entitlement for the actually selected startFloor and the highest milestone defeated earlier in this run/);
assert.match(policy.contexts[0].baselineRule, /floor entry alone does not advance baseline/);
assert.match(policy.contexts[1].baselineSource, /actually selected startFloor only/);
assert.match(policy.contexts[1].baselineRule, /ignore other globally unlocked milestones/);
assert.equal(policy.contexts[1].level, 1);
assert.deepEqual(policy.coverage.milestoneFloors, [5, 10, 20]);
assert.deepEqual(policy.coverage.referenceFloors.map(({ floor }) => floor), [1, 30]);
assert.match(policy.coverage.referenceFloors[1].role, /exclude B30 Boss authored rule/);
assert.deepEqual(policy.coverage.focusedRegressionOnly, [
  { milestoneFloor: 15, preBaseline: 2, selectedStartBaseline: 3, postFloor: 16, postBaseline: 3 },
  { milestoneFloor: 25, preBaseline: 4, selectedStartBaseline: 5, postFloor: 26, postBaseline: 5 }
]);
assert.deepEqual(policy.coverage.focusedBoundaryRegression, [
  { point: "B1 start before B5 defeat", selectedStartFloor: 1, highestEarlierDefeatedMilestone: null, baseline: 0 },
  { point: "B6 after B5 defeat", selectedStartFloor: 1, highestEarlierDefeatedMilestone: 5, baseline: 1 },
  { point: "B10 Boss before defeat; floor entry does not advance", selectedStartFloor: 1, highestEarlierDefeatedMilestone: 5, baseline: 1 }
]);
assert.match(contract.verticalPowerOwners.milestoneBaseline.timing, /maximum of that entitlement and the highest defeated milestone in this run/);
assert.deepEqual(policy.layers.fixedGenericCombat.fixtures.map(({ id }) => id), [
  "physical", "spell", "defensive-guard"
]);
assert.equal(policy.layers.runLocalLevelDelta.compare, "Level 1 and production-earned run-local Level at the same baseline");
assert.match(policy.layers.runLocalLevelDelta.levelSource, /production EXP \/ Level contract/);
assert.equal(policy.pairedSeeds.required, true);
assert.deepEqual(policy.pairedSeeds.key, ["milestone context", "fixture", "runIndex"]);
assert.deepEqual(policy.pairedSeeds.cellIdentity, ["policy", "comparison arm", "milestone context", "fixture", "runIndex"]);
assert.match(policy.pairedSeeds.rule, /current production and vNext candidate share the seed/);
assert.match(policy.pairedSeeds.rule, /policy is recorded in cell identity \/ provenance, never in seed derivation/);
assert.equal(policy.samplePolicy.below30, "correctness / runner validation only; no balance conclusion");
assert.match(policy.samplePolicy.postMerge, /GitHub Actions artifact at N=200/);
assert.equal(policy.samplePolicy.expandN200AcrossEveryMilestone, false);
assert.equal(policy.layers.fixedGenericCombat.metrics.includes("survival / death"), true);
assert.equal(policy.layers.fixedGenericCombat.metrics.includes("Guard opportunity / guarded actions when applicable"), true);
assert.equal(policy.layers.fixedGenericCombat.metrics.includes("spell / MP spent when applicable"), true);
assert.equal(policy.layers.runLocalLevelDelta.metrics.includes("baseline source"), true);
assert.equal(policy.interpretationGates.length, 8);
assert.ok(policy.exclusions.some(item => item.includes("Phase 1/2a")));
assert.ok(policy.exclusions.some(item => item.includes("all-coefficient scans")));
assert.ok(policy.exclusions.some(item => item.includes("Heavy simulation")));
assert.ok(policy.exclusions.some(item => item.includes("SAVE_VERSION")));
assert.equal(policy.artifact.sampleSize, 200);
assert.ok(policy.artifact.provenance.includes("source SHA"));
assert.ok(policy.artifact.provenance.includes("gameplay SHA"));
assert.ok(policy.artifact.provenance.includes("runner SHA and runner version"));
assert.equal(Object.isFrozen(policy), true);
assert.equal(Object.isFrozen(policy.contexts), true);
