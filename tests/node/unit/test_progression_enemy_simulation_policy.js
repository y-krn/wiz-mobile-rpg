import assert from "node:assert/strict";
import { PROGRESSION_ENEMY_SIMULATION_POLICY as policy } from "../../../src/data/progression_enemy_simulation_policy.js";
import { PROGRESSION_ENEMY_CONTRACT as contract } from "../../../src/data/progression_enemy_contract.js";

assert.equal(policy.status, "design-only");
assert.equal(policy.productionConnected, false);
assert.equal(policy.contractSource, "PROGRESSION_ENEMY_CONTRACT");
assert.match(policy.candidateValues, /Phase 4c v1 fixed/);
assert.match(policy.priorDiagnosticEvidence, /#35945138644/);
assert.match(policy.priorDiagnosticEvidence, /paired-seed mismatches 0/);
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
  "physical", "spell", "defensive"
]);
assert.match(policy.layers.fixedGenericCombat.fixtures[0].axis, /Fighter \/ vanguard/);
assert.match(policy.layers.fixedGenericCombat.fixtures[1].axis, /Mage \/ arcana/);
assert.match(policy.layers.fixedGenericCombat.fixtures[2].axis, /Priest \/ devotion attack-only/);
assert.match(policy.layers.fixedGenericCombat.fixtures[2].axis, /Guard excluded from generic viability/);
assert.match(policy.layers.fixedGenericCombat.metrics.join(" "), /selected \/ executed attack and defend actions.*defend must be 0/);
assert.equal(policy.layers.runLocalLevelDelta.compare, "Level 1 and production-earned run-local Level at the same baseline");
assert.match(policy.layers.runLocalLevelDelta.levelSource, /production EXP \/ Level contract/);
assert.equal(policy.pairedSeeds.required, true);
assert.deepEqual(policy.pairedSeeds.key, ["root seed", "milestone context", "fixture", "runIndex"]);
assert.deepEqual(policy.pairedSeeds.cellIdentity, ["policy", "comparison arm", "milestone context", "fixture", "Level", "runIndex"]);
assert.match(policy.pairedSeeds.rule, /current production and Phase 4c v1 candidate share the seed/);
assert.match(policy.pairedSeeds.rule, /arm, and Level.*never in seed derivation/);
assert.match(policy.pairedSeeds.rule, /policy, arm, and Level are recorded in cell identity \/ provenance, never in seed derivation/);
assert.equal(policy.samplePolicy.below30, "correctness / runner validation only; no balance conclusion");
assert.match(policy.samplePolicy.postMerge, /GitHub Actions artifact at N=200/);
assert.equal(policy.samplePolicy.expandN200AcrossEveryMilestone, false);
assert.equal(policy.layers.fixedGenericCombat.metrics.includes("survival / death"), true);
assert.equal(policy.layers.fixedGenericCombat.metrics.includes("selected / executed attack and defend actions for defensive fixture; defend must be 0"), true);
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
