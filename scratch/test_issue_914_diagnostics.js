import assert from "node:assert/strict";

import { renderDiagnosticsMarkdown } from "./balance_measurement.js";

import {
  addRunDiagnosticsAggregate,
  classifyDeathCause,
  classifyRetreatReason,
  createRunDiagnosticsAggregate,
  DEATH_CAUSE_IDS,
  finalizeRunDiagnosticsAggregate,
  RETREAT_REASON_IDS
} from "./sim_depth_material_ev.js";

const portalRetreat = classifyRetreatReason({
  outcome: "retreat",
  terminationReason: "town-portal",
  portalUseEvent: { hpRate: 0.30 },
  endingHpRate: 0.30,
  recoveryPotionsRemaining: 0,
  statusAtEnd: "ok",
  cureItemsRemaining: 0
});
assert.equal(portalRetreat.primary, RETREAT_REASON_IDS.PORTAL_HP_THRESHOLD);
assert.deepEqual(portalRetreat.signals, [
  RETREAT_REASON_IDS.PORTAL_HP_THRESHOLD,
  RETREAT_REASON_IDS.HEAL_RESOURCE_DEPLETED
]);

assert.equal(
  classifyRetreatReason({
    outcome: "retreat",
    terminationReason: "milestone_portal",
    endingHpRate: 0.8,
    recoveryPotionsRemaining: 2,
    statusAtEnd: "ok",
    cureItemsRemaining: 1
  }).primary,
  RETREAT_REASON_IDS.EXPLICIT_RETREAT
);

assert.equal(
  classifyDeathCause({ outcome: "death", deathEncounterType: "normal", deathLog: { type: "combat" } }),
  DEATH_CAUSE_IDS.NORMAL_ENEMY
);
assert.equal(
  classifyDeathCause({ outcome: "death", deathEncounterType: "boss", deathLog: { type: "combat" } }),
  DEATH_CAUSE_IDS.BOSS
);
assert.equal(
  classifyDeathCause({ outcome: "death", deathEncounterType: "poison", deathLog: { type: "status" } }),
  DEATH_CAUSE_IDS.POISON_STATUS_TICK
);
assert.equal(
  classifyDeathCause({ outcome: "death", deathEncounterType: "floor-trap", deathLog: { type: "trap" } }),
  DEATH_CAUSE_IDS.TRAP_HAZARD
);

const aggregate = createRunDiagnosticsAggregate();
addRunDiagnosticsAggregate(aggregate, {
  outcome: "retreat",
  endFloor: 4,
  retreatReason: RETREAT_REASON_IDS.PORTAL_HP_THRESHOLD,
  retreatReasonSignals: [
    RETREAT_REASON_IDS.PORTAL_HP_THRESHOLD,
    RETREAT_REASON_IDS.HEAL_RESOURCE_DEPLETED
  ],
  deathCauseCategory: null,
  endingHpRate: 0.3,
  endingMpRate: 0.2,
  healPotionsRemaining: 0,
  greaterHealPotionsRemaining: 0,
  recoveryPotionsRemaining: 0,
  cureItemsRemaining: 0,
  fleeAttempts: 2,
  statusAtEnd: "ok",
  lastEnemyId: null,
  lastEnemyCategory: null
});
addRunDiagnosticsAggregate(aggregate, {
  outcome: "death",
  endFloor: 4,
  retreatReason: null,
  retreatReasonSignals: [],
  deathCauseCategory: DEATH_CAUSE_IDS.NORMAL_ENEMY,
  endingHpRate: 0,
  endingMpRate: 0,
  healPotionsRemaining: 1,
  greaterHealPotionsRemaining: 0,
  recoveryPotionsRemaining: 1,
  cureItemsRemaining: 2,
  fleeAttempts: 0,
  statusAtEnd: "dead",
  lastEnemyId: "敵A",
  lastEnemyCategory: "normal"
});
const diagnostics = finalizeRunDiagnosticsAggregate(aggregate);
assert.equal(diagnostics.runs, 2);
assert.deepEqual(diagnostics.endFloorDistribution, { "4": 2 });
assert.equal(diagnostics.retreatReasonDistribution.portal_hp_threshold, 1);
assert.equal(diagnostics.retreatReasonSignalDistribution.no_heal_potion, 1);
assert.equal(diagnostics.deathCauseDistribution.normal_enemy, 1);
assert.equal(diagnostics.byEndFloor["4"].endingHpRate.mean, 0.15);
assert.equal(diagnostics.byRetreatReason.portal_hp_threshold.fleeAttempts.mean, 2);
assert.equal(diagnostics.byDeathCause.normal_enemy.lastEnemyId["敵A"], 1);

const markdown = renderDiagnosticsMarkdown([{
  scenarioId: "workshop-empty",
  depths: [{
    depth: 5,
    diagnostics: {
      byEndFloor: {
        "4": diagnostics.byEndFloor["4"]
      }
    }
  }]
}]).join("\n");
assert.match(markdown, /Run-level diagnostics/);
assert.match(markdown, /portal_hp_threshold=1/);
assert.match(markdown, /normal_enemy=1/);

console.log("[PASS] Issue #914 run-level diagnostic classification and aggregation");
