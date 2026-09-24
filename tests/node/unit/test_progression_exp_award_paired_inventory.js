import assert from "node:assert/strict";

import {
  BOSS_FLOORS,
  FLOORS,
  RUNNER_PATH as SOURCE_RUNNER_PATH,
  runProgressionExpAwardInventory
} from "../../../scratch/measurements/progression_exp_award_inventory.js";
import {
  calculateCandidateAward,
  classifyAwardKind,
  RUNNER_PATH,
  runProgressionExpAwardPairedInventory
} from "../../../scratch/measurements/progression_exp_award_paired_inventory.js";
import { EXP_LEVELS } from "../../../src/data/progression.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";
import {
  assertValidSimulationManifest,
  classifySimulationRunner,
  SIMULATION_RUNNER_INVENTORY
} from "../../../scratch/simulations/simulation_manifest.js";

assert.ok(MEASUREMENT_IDS.includes("progression-exp-award-paired-inventory"));
assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(SIMULATION_RUNNER_INVENTORY.some(entry => entry.path === RUNNER_PATH));
assert.equal(classifySimulationRunner(RUNNER_PATH)?.lifecycle, "reusable");
assert.equal(classifySimulationRunner(RUNNER_PATH)?.scope, "run");
assert.equal(resolveRunnerInvocation({
  measurement: "progression-exp-award-paired-inventory",
  purpose: "bounded smoke",
  output_dir: "/tmp/progression-exp-award-paired-inventory-test"
}).runner, RUNNER_PATH);
assert.equal(SOURCE_RUNNER_PATH, "scratch/measurements/progression_exp_award_inventory.js");

assert.equal(classifyAwardKind({ boss: true, elite: true, midboss: true, rare: true }), "boss");
assert.equal(classifyAwardKind({ elite: true, midboss: true, rare: true }), "elite");
assert.equal(classifyAwardKind({ midboss: true, rare: true }), "midboss");
assert.equal(classifyAwardKind({ rare: true }), "rare");
assert.equal(classifyAwardKind(), "ordinary");
assert.throws(() => calculateCandidateAward({ floor: 31, kind: "boss" }), /outside current biome range/);
assert.throws(() => calculateCandidateAward({
  floor: 1, kind: "ordinary", monsters: [{ templateExp: -1 }], encounterSize: 1
}), /invalid template EXP/);
const maxOrdinary = calculateCandidateAward({
  floor: 30,
  kind: "ordinary",
  monsters: [{ templateExp: 1e6 }, { templateExp: 1e6 }, { templateExp: 1e6 }],
  encounterSize: 3
});
assert.equal(maxOrdinary.templateThreat, 1.25);
assert.equal(maxOrdinary.sizePressure, 1.35);
assert.equal(maxOrdinary.ordinaryWeight, 1.5);
assert.equal(maxOrdinary.totalAward, 72);

for (let band = 0; band <= 5; band++) {
  const floor = band * 5 + 1;
  const bandReward = 1 + 0.04 * band;
  const rare = calculateCandidateAward({ floor, kind: "rare" });
  const elite = calculateCandidateAward({ floor, kind: "elite" });
  const midboss = calculateCandidateAward({ floor, kind: "midboss" });
  const boss = calculateCandidateAward({ floor, kind: "boss" });
  assert.equal(rare.totalAward, Math.round(40 * 1.75 * bandReward));
  assert.equal(elite.totalAward, Math.round(40 * 2 * bandReward));
  assert.equal(midboss.totalAward, elite.totalAward);
  assert.equal(boss.totalAward, Math.round(40 * 3 * bandReward));
  for (const result of [rare, elite, midboss]) {
    assert.ok(result.totalAward < EXP_LEVELS[2]);
    assert.equal(result.levelFunding.levelAfterOneProductionCheck, 1);
    assert.equal(result.levelFunding.prefundedLevels, 0);
  }
  assert.ok(boss.totalAward < EXP_LEVELS[3]);
  assert.ok(boss.levelFunding.levelAfterOneProductionCheck <= 2);
  assert.equal(boss.levelFunding.prefundedLevels, 0);
}

const first = await runProgressionExpAwardPairedInventory({ runs: 1, seed: 1703, allowSmallRunCount: true });
const repeated = await runProgressionExpAwardPairedInventory({ runs: 1, seed: 1703, allowSmallRunCount: true });
const production = await runProgressionExpAwardInventory({ runs: 1, seed: 1703, allowSmallRunCount: true });
assert.deepEqual(first, repeated);
assert.deepEqual(first.configuration.floors, FLOORS);
assert.deepEqual(first.configuration.bossFloors, BOSS_FLOORS);
assert.equal(first.observations.length, FLOORS.length);
assert.deepEqual(first.bossReferences.map(row => row.floor), BOSS_FLOORS);
assert.equal(first.configuration.combatExecuted, false);
assert.equal(first.configuration.candidateProductionIntegrated, false);

for (let index = 0; index < first.observations.length; index++) {
  const row = first.observations[index];
  const phase4jARow = production.observations[index];
  assert.equal(row.worldSeed, phase4jARow.worldSeed);
  assert.equal(row.encounterSeed, phase4jARow.encounterSeed);
  assert.deepEqual(row.monsterIdentities, phase4jARow.monsterIdentities);
  assert.deepEqual(row.monsters, phase4jARow.monsters);
  assert.equal(row.production.totalAward, row.finalSoloCombatExpAward);
  assert.equal(row.candidate.soloShare, row.candidate.totalAward);
  assert.equal(row.pairedDelta, row.candidate.soloShare - row.production.soloShare);
  assert.equal(row.candidate.levelFunding.prefundedLevels, 0);
  if (row.candidate.kind === "ordinary") {
    assert.ok(Number.isFinite(row.candidate.biomeMedianExp) && row.candidate.biomeMedianExp > 0);
    assert.ok(row.candidate.ordinaryWeight >= 0.75 && row.candidate.ordinaryWeight <= 1.5);
    assert.equal(row.candidate.totalAward,
      Math.round(40 * row.candidate.ordinaryWeight * row.candidate.bandReward));
    assert.ok(row.candidate.totalAward <= 72);
  } else {
    assert.equal(row.candidate.kind, "rare");
    assert.equal(row.encounterKind, "rare");
  }
}

for (const row of first.bossReferences) {
  assert.equal(row.encounterKind, "boss-reference");
  assert.equal(row.candidate.kind, "boss");
  assert.equal(row.production.totalAward, row.finalSoloCombatExpAward);
  assert.equal(row.candidate.totalAward, Math.round(40 * 3 * row.candidate.bandReward));
  assert.equal(row.candidate.levelFunding.prefundedLevels, 0);
}

console.log("[PASS] Paired production / Phase 4j-B candidate N=1 deterministic smoke and bound checks");
