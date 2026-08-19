import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function runWithMetrics(flag) {
  const result = spawnSync(
    process.execPath,
    ["scratch/sim_commit_depth_624.js"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ISSUE624_SMOKE: "1",
        SIM_RUNS: "1",
        SIM_CALIBRATION_RUNS: "1",
        SIM_SKIP_PROVENANCE: "1",
        ISSUE624_CONDITION_ID: "issue732-metrics-test",
        ISSUE732_DAMAGE_METRICS: flag
      },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024
    }
  );
  assert.equal(result.status, 0, `ISSUE732_DAMAGE_METRICS=${flag}: ${result.stderr}`);
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines.at(-1)).rows;
}

const offRows = runWithMetrics("0");
const onRows = runWithMetrics("1");
assert.equal(offRows.length, 4, "smoke produces one row per class with metrics off");
assert.equal(onRows.length, 4, "smoke produces one row per class with metrics on");

const gameplayFields = [
  "conditionId",
  "className",
  "runIndex",
  "scenarioId",
  "randomSequenceId",
  "reachedFloor",
  "endFloor",
  "deathFloor",
  "survived",
  "died",
  "outcome",
  "finalLevel",
  "expGained",
  "deathCause",
  "deathEncounterType",
  "finalCoreIds",
  "finalRecoveryPotions",
  "finalStatusCureInventory",
  "materialAcquired",
  "materialConsumed",
  "carriedMaterials",
  "bankedMaterials",
  "timeCost",
  "battles",
  "trapEncounterCount",
  "trapDamageHp",
  "fleeCount",
  "townPortalsUsed",
  "statusCuresUsed",
  "mpDepleted"
];

for (const [offRow, onRow] of offRows.map((row, index) => [row, onRows[index]])) {
  assert.equal(offRow.damageMetricsEnabled, false, "metrics default/off state is explicit");
  assert.equal(onRow.damageMetricsEnabled, true, "metrics on state is explicit");
  assert.equal("physicalPlayerHits" in offRow, false, "off result omits telemetry payload");
  assert.equal("physicalPlayerHits" in onRow, true, "on result includes telemetry payload");
  for (const field of gameplayFields) {
    assert.deepEqual(
      onRow[field],
      offRow[field],
      `${field} must not change when ISSUE732_DAMAGE_METRICS is toggled`
    );
  }
}

console.log("[PASS] ISSUE732_DAMAGE_METRICS off/on changes observability without changing results.");
