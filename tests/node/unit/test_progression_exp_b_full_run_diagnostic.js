import assert from "node:assert/strict";
import {
  ARMS,
  CONTEXTS,
  DEFAULT_SEED,
  RUNNER_PATH,
  RUNNER_VERSION,
  runProgressionExpBFullRunDiagnostic
} from "../../../scratch/measurements/progression_exp_b_full_run_diagnostic.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";
import {
  assertValidSimulationManifest,
  classifySimulationRunner,
  SIMULATION_RUNNER_INVENTORY
} from "../../../scratch/simulations/simulation_manifest.js";
import { resetSimulationRandom, simulateRun, getScenarioById } from "../../../scratch/simulations/sim_depth_material_ev.js";
import { MONSTERS } from "../../../src/data/monsters.js";

assert.equal(RUNNER_VERSION, "progression-exp-b-full-run-diagnostic-v1");
assert.equal(DEFAULT_SEED, 1735);
await assert.rejects(runProgressionExpBFullRunDiagnostic({ runs: 31, seed: DEFAULT_SEED }), /exactly 1 .*30 .*200/);
await assert.rejects(runProgressionExpBFullRunDiagnostic({ runs: 1, seed: DEFAULT_SEED + 1 }), /seed is frozen/);
assert.deepEqual(CONTEXTS.map(({ id, startFloor, targetDepth }) => [id, startFloor, targetDepth]), [
  ["continuous-B1", 1, 21],
  ["selected-B10", 10, 11],
  ["selected-B20", 20, 21]
]);
assert.deepEqual(ARMS, ["production", "phase4j-b"]);
assert.ok(MEASUREMENT_IDS.includes("progression-exp-b-full-run-diagnostic"));
assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(SIMULATION_RUNNER_INVENTORY.some(entry => entry.path === RUNNER_PATH));
assert.deepEqual(classifySimulationRunner(RUNNER_PATH), {
  pattern: RUNNER_PATH,
  lifecycle: "reusable",
  scope: "run"
});
assert.equal(resolveRunnerInvocation({
  measurement: "progression-exp-b-full-run-diagnostic",
  purpose: "N=1 deterministic smoke",
  output_dir: "/tmp/progression-exp-b-full-run-diagnostic-test"
}).runner, RUNNER_PATH);

const report = await runProgressionExpBFullRunDiagnostic({ runs: 1, seed: DEFAULT_SEED });
const repeated = await runProgressionExpBFullRunDiagnostic({ runs: 1, seed: DEFAULT_SEED });
assert.deepEqual(report, repeated);
assert.equal(report.rows.length, CONTEXTS.length * ARMS.length);
assert.equal(report.validity.valid, true);
assert.deepEqual(report.validity.candidatePrefundedLevelViolations, []);
assert.deepEqual(report.validity.invalidCandidateSettlements, []);
assert.deepEqual(report.validity.sourceAccountingMismatches, []);
assert.equal(report.validity.firstCombatPreRewardStateAndOutcomeMatch, true);
for (const row of report.rows) {
  assert.equal(row.combatExpCandidateId, row.arm);
  assert.ok(row.settlements.length > 0, `${row.context}/${row.arm} has an eligible generated combat`);
  for (const settlement of row.settlements) {
    assert.equal(settlement.settlement.sourceAccounted, true);
    if (row.arm === "phase4j-b" && settlement.settlement.valid) {
      assert.equal(settlement.prefundedLevels, 0);
    }
  }
  const expectedBaseline = row.context === "selected-B10" ? 2 : row.context === "selected-B20" ? 4 : 0;
  assert.equal(row.settlements[0].baseline, expectedBaseline);
  assert.equal(row.firstCombat.preRewardState.baseline, expectedBaseline);
  assert.equal(row.firstCombat.preRewardState.rawMaxHp, 20 + 2 * expectedBaseline);
  for (const enemy of row.firstCombat.preRewardState.enemies.filter(entry => !entry.isBoss)) {
    const template = MONSTERS.find(entry =>
      entry.name === enemy.name.replace(/\s[A-Z]$/, "")
    );
    assert.ok(template, `generated enemy template exists for ${enemy.name}`);
    const band = row.firstCombat.preRewardState.enemyBand;
    assert.equal(enemy.maxHp, Math.max(1, Math.round(template.hp * (1 + 0.20 * band))));
    assert.equal(enemy.atk, Math.max(1, Math.round(template.atk * (1 + 0.10 * band))));
    assert.equal(enemy.def, Math.max(0, Math.round(template.def)));
  }
}

const noOptIn = { ...getScenarioById("legacy-no-portal") };
const explicitNoOp = { ...noOptIn, phase4cV1GeneratedRun: false };
const runDefaultPath = scenario => {
  resetSimulationRandom("phase4c-production-default-noop");
  return simulateRun({
    className: "Mage",
    startFloor: 10,
    targetDepth: 11,
    runIndex: 0,
    seriesId: "phase4c-production-default-noop",
    worldSeed: "phase4c-production-default-noop",
    scoringProfile: null,
    scenario
  });
};
assert.deepEqual(runDefaultPath(noOptIn), runDefaultPath(explicitNoOp));

console.log("[PASS] Phase 4c v1 / Phase 4j-B full-run N=1 deterministic smoke, first-combat equivalence, and validity gates");
