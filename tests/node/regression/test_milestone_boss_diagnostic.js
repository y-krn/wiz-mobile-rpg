import assert from "node:assert/strict";

import {
  BOSS_FIXTURES,
  REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
  RUNNER_VERSION,
  resolveBossInventory,
  runMilestoneBossDiagnostic
} from "../../../scratch/measurements/milestone_boss_diagnostic.js";
import { PLAYER_FIXTURE } from "../../../scratch/measurements/composition_trait_diagnostic.js";
import {
  MEASUREMENT_IDS,
  resolveRunnerInvocation
} from "../../../scratch/measurements/run_balance_measurement.js";

const first = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, allowSmallRunCount: true });
const second = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, allowSmallRunCount: true });

assert.deepEqual(first, second, "milestone boss smoke must be deterministic");
assert.equal(first.runnerVersion, RUNNER_VERSION);
assert.equal(first.measurementId, "milestone-boss-diagnostic");
assert.deepEqual(first.configuration.depths, [5, 10, 15, 20, 25, 30]);
assert.deepEqual(first.configuration.playerFixture, {
  ...PLAYER_FIXTURE,
  weaponProfile: PLAYER_FIXTURE.weapon,
  armorProfile: PLAYER_FIXTURE.armor,
  shieldProfile: PLAYER_FIXTURE.shield
});
assert.equal(first.configuration.reflectPhysicalDiagnosticFreeze, REFLECT_PHYSICAL_DIAGNOSTIC_RATE);
assert.equal(first.configuration.scaling, "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0");
assert.equal(first.cells.length, BOSS_FIXTURES.length);

assert.deepEqual(BOSS_FIXTURES.map(fixture => fixture.bossName), [
  "デーモンガード",
  "ストーンガード",
  "ポイズンジャイアント",
  "マスターデーモン",
  "レッドドラゴン",
  "いにしえの竜"
]);

const b5 = resolveBossInventory(BOSS_FIXTURES[0]);
assert.deepEqual(b5.rawStats, { hp: 180, atk: 18, def: 8 });
assert.equal(b5.spell, "LAHALITO");
assert.equal(b5.productionBossRule.breakHpRate, 0.80);
assert.equal(b5.productionBossRule.exposureTurns, 4);

const b10 = resolveBossInventory(BOSS_FIXTURES[1]);
assert.deepEqual(b10.traits, ["guardAdjacent"]);
assert.match(b10.guardInteraction.fixedSingleBossAdjacentGuard, /not exercised/);

const b15 = resolveBossInventory(BOSS_FIXTURES[2]);
assert.equal(b15.statusPattern.id, "poison_payoff");
assert.match(b15.statusPattern.runtimeEligibility, /excluded/);

const b30 = resolveBossInventory(BOSS_FIXTURES.at(-1));
assert.deepEqual(b30.customBossAction.actions, ["炎の息", "MADALTO", "TILTOWAIT"]);
assert.match(b30.guardInteraction.bossSpecific, /TILTOWAIT/);

for (const cell of first.cells) {
  assert.equal(cell.runs, 1);
  assert.deepEqual(cell.encounterTypes, ["boss"]);
  assert.ok(Number.isFinite(cell.rounds.average));
  assert.ok(Number.isFinite(cell.damageTaken.average));
  assert.ok(Number.isFinite(cell.bossActionCount.average));
  assert.ok(Number.isFinite(cell.warningCount.average));
  assert.ok(Number.isFinite(cell.spellActionCount.average));
  assert.ok(Number.isFinite(cell.statusActionCount.average));
  assert.ok(Number.isFinite(cell.guard.guardRounds.average));
  assert.equal(cell.confidence, "runner-correctness-only");
}

assert.ok(MEASUREMENT_IDS.includes("milestone-boss-diagnostic"));
const invocation = resolveRunnerInvocation({
  measurement: "milestone-boss-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1613-test"
});
assert.equal(invocation.runner, "scratch/measurements/milestone_boss_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

console.log("[PASS] Issue #1613 milestone boss inventory, production path, and bounded diagnostic wiring");
