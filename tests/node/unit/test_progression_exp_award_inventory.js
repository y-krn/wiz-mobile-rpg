import assert from "node:assert/strict";

import {
  BOSS_FLOORS,
  FLOORS,
  RUNNER_PATH,
  runProgressionExpAwardInventory
} from "../../../scratch/measurements/progression_exp_award_inventory.js";
import { EXP_LEVELS } from "../../../src/data/progression.js";
import { getDepthScaling, scaleEnemyForDepth } from "../../../src/rules/depth_scaling.js";
import { generateEncounter } from "../../../src/combat_ui/encounter.js";
import { MONSTERS } from "../../../src/data/monsters.js";
import { createRng } from "../../../src/seed_rng.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";
import {
  assertValidSimulationManifest,
  classifySimulationRunner,
  SIMULATION_RUNNER_INVENTORY
} from "../../../scratch/simulations/simulation_manifest.js";

assert.ok(MEASUREMENT_IDS.includes("progression-exp-award-inventory"));
assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(SIMULATION_RUNNER_INVENTORY.some(entry => entry.path === RUNNER_PATH));
assert.equal(classifySimulationRunner(RUNNER_PATH)?.lifecycle, "reusable");
assert.equal(classifySimulationRunner(RUNNER_PATH)?.scope, "run");
assert.equal(resolveRunnerInvocation({
  measurement: "progression-exp-award-inventory",
  purpose: "bounded smoke",
  output_dir: "/tmp/progression-exp-award-inventory-test"
}).runner, RUNNER_PATH);

const first = await runProgressionExpAwardInventory({ runs: 1, seed: 1703, allowSmallRunCount: true });
const repeated = await runProgressionExpAwardInventory({ runs: 1, seed: 1703, allowSmallRunCount: true });
assert.deepEqual(first, repeated);
assert.deepEqual(first.configuration.floors, FLOORS);
assert.deepEqual(first.configuration.bossFloors, BOSS_FLOORS);
assert.equal(first.observations.length, FLOORS.length);
assert.deepEqual(first.bossReferences.map(row => row.floor), BOSS_FLOORS);
assert.equal(first.configuration.combatExecuted, false);

for (const row of first.observations) {
  const production = generateEncounter(
    { floor: row.floor, currentRun: { runSeed: row.worldSeed } },
    false,
    false,
    false,
    null,
    createRng(row.encounterSeed)
  );
  assert.equal(row.monsters.length, row.encounterSize);
  assert.deepEqual(row.monsterIdentities, production.monsters.map(monster => monster.name));
  assert.deepEqual(row.monsters.map(monster => monster.scaledExp), production.monsters.map(monster => monster.exp));
  assert.equal(row.templateExpSum, row.monsters.reduce((sum, monster) => sum + monster.templateExp, 0));
  assert.equal(row.scaledExpSum, row.monsters.reduce((sum, monster) => sum + monster.scaledExp, 0));
  assert.equal(row.finalSoloCombatExpAward, Math.round(row.scaledExpSum / 1));
  assert.equal(row.levelFunding.initialLevel, 1);
  assert.equal(row.levelFunding.initialExp, 0);
  assert.equal(row.levelFunding.prefundedLevels,
    row.levelFunding.fundedThroughLevel - row.levelFunding.levelAfterOneProductionCheck);
  assert.equal(row.templateFunding.templatePrefundedLevels,
    row.templateFunding.templateFundedThroughLevel - row.templateFunding.levelAfterOneProductionCheck);
  assert.ok(row.levelFunding.nextUnsatisfiedThreshold === null ||
    row.levelFunding.expRemainingToNextThreshold === row.levelFunding.nextUnsatisfiedThreshold - row.finalSoloCombatExpAward);
  assert.equal(row.levelFunding.fundedThroughLevel,
    EXP_LEVELS.reduce((funded, threshold, level) => row.finalSoloCombatExpAward >= threshold ? level : funded, 0));
  assert.equal(production.monsters.length, row.encounterSize);
}

for (const row of first.bossReferences) {
  const template = MONSTERS.find(monster => monster.name === row.monsterIdentities[0]);
  assert.ok(template);
  assert.equal(row.templateExpSum, template.exp);
  assert.equal(row.productionRewardMultiplier, getDepthScaling(row.floor).reward * 1.2);
  assert.equal(row.finalSoloCombatExpAward, scaleEnemyForDepth(template, row.floor, { boss: true }).exp);
  assert.equal(row.levelFunding.prefundedLevels,
    row.levelFunding.fundedThroughLevel - row.levelFunding.levelAfterOneProductionCheck);
}

const sortedAwards = first.observations.map(row => row.finalSoloCombatExpAward).sort((a, b) => a - b);
const expectedQuantile = p => {
  const position = (sortedAwards.length - 1) * p;
  const lower = Math.floor(position);
  return sortedAwards[lower] + (sortedAwards[Math.ceil(position)] - sortedAwards[lower]) * (position - lower);
};
assert.deepEqual(first.overall.expAward, {
  count: FLOORS.length,
  p10: expectedQuantile(0.10),
  p50: expectedQuantile(0.50),
  p90: expectedQuantile(0.90),
  min: sortedAwards[0],
  max: sortedAwards.at(-1)
});

console.log("[PASS] Production EXP award inventory deterministic smoke and funding projections");
