import assert from "node:assert/strict";

import {
  BOSS_FIXTURES,
  REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
  SCHEMA_VERSION,
  RUNNER_VERSION,
  resolveBossInventory,
  runMilestoneBossDiagnostic
} from "../../../scratch/measurements/milestone_boss_diagnostic.js";
import { getAppliedBossPressureMetadata } from "../../../scratch/simulations/sim_depth_material_ev.js";
import { PLAYER_FIXTURE } from "../../../scratch/measurements/composition_trait_diagnostic.js";
import {
  MEASUREMENT_IDS,
  resolveRunnerInvocation
} from "../../../scratch/measurements/run_balance_measurement.js";

const first = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, allowSmallRunCount: true });
const second = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, allowSmallRunCount: true });

assert.deepEqual(first, second, "milestone boss smoke must be deterministic");
assert.equal(RUNNER_VERSION, "issue1613-milestone-boss-decision-pressure-v2");
assert.equal(SCHEMA_VERSION, 2);
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
assert.equal(b15.isPoisonous, true);
assert.equal(b15.statusPattern.id, "poison_payoff");
assert.equal(b15.statusPattern.active, false);
assert.match(b15.statusPattern.runtimeEligibility, /excluded/);
assert.equal(b15.legacyPoison.active, true);
assert.match(b15.legacyPoison.runtimeEligibility, /active/);
assert.equal(b15.legacyPoison.metric, "existing enemyActionEvents.statusSources");

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
  assert.equal(cell.trialBands.length, 1);
  assert.deepEqual(Object.keys(cell.trialBands[0]).sort(), ["bandIndex", "count", "mainId", "subId"]);
  assert.equal(cell.guardianPressures.length, 2);
  for (const pressure of cell.guardianPressures) {
    assert.ok(["main", "sub"].includes(pressure.role));
    assert.ok(pressure.themeId);
    assert.ok(pressure.sourceName);
    assert.ok(Array.isArray(pressure.additionalTraits));
    assert.equal(typeof pressure.additionalBehavior, "object");
    assert.equal(pressure.count, 1);
  }
}

assert.deepEqual(first.cells[0].trialBands[0], {
  bandIndex: 0,
  mainId: "status",
  subId: "endurance",
  count: 1
});
assert.deepEqual(first.cells[0].guardianPressures, [
  {
    role: "main",
    themeId: "status",
    sourceName: "泥の呪い子",
    additionalTraits: ["debuffPhysicalDef"],
    additionalBehavior: { traitChance: 0.2, debuffValue: 2 },
    count: 1
  },
  {
    role: "sub",
    themeId: "endurance",
    sourceName: "石像兵",
    additionalTraits: ["guardAdjacent"],
    additionalBehavior: { guard: { chance: 0.5 } },
    count: 1
  }
]);

const overlapMetadata = getAppliedBossPressureMetadata(
  {
    traits: ["templateTrait"],
    sharedBehavior: "template",
    templateOnlyBehavior: true
  },
  [
    {
      role: "main",
      themeId: "main-theme",
      sourceName: "main-source",
      traits: ["templateTrait", "sharedTrait", "mainTrait"],
      behavior: { sharedBehavior: "main", mainBehavior: 1 }
    },
    {
      role: "sub",
      themeId: "sub-theme",
      sourceName: "sub-source",
      traits: ["sharedTrait", "subTrait"],
      behavior: { sharedBehavior: "sub", mainBehavior: 2, subBehavior: 3 }
    }
  ]
);
assert.deepEqual(overlapMetadata.map(pressure => ({
  additionalTraits: pressure.additionalTraits,
  additionalBehavior: pressure.additionalBehavior
})), [
  {
    additionalTraits: ["sharedTrait", "mainTrait"],
    additionalBehavior: { mainBehavior: 1 }
  },
  {
    additionalTraits: ["subTrait"],
    additionalBehavior: { subBehavior: 3 }
  }
]);

assert.ok(MEASUREMENT_IDS.includes("milestone-boss-diagnostic"));
const invocation = resolveRunnerInvocation({
  measurement: "milestone-boss-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1613-test"
});
assert.equal(invocation.runner, "scratch/measurements/milestone_boss_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

console.log("[PASS] Issue #1613 milestone boss inventory, production path, and bounded diagnostic wiring");
