import assert from "node:assert/strict";

import { renderDiagnosticsMarkdown } from "../../measurements/balance_measurement.js";

import {
  addRunDiagnosticsAggregate,
  classifyDeathCause,
  classifyRetreatReason,
  createRunDiagnosticsAggregate,
  DEATH_CAUSE_IDS,
  finalizeRunDiagnosticsAggregate,
  RETREAT_REASON_IDS
} from "../../simulations/sim_depth_material_ev.js";

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
  outcome: "retreat",
  endFloor: 3,
  retreatReason: RETREAT_REASON_IDS.PORTAL_HP_THRESHOLD,
  retreatReasonSignals: [
    RETREAT_REASON_IDS.PORTAL_HP_THRESHOLD,
    RETREAT_REASON_IDS.STATUS_RESOURCE
  ],
  deathCauseCategory: null,
  endingHpRate: 0.25,
  endingMpRate: 0.1,
  healPotionsRemaining: 0,
  greaterHealPotionsRemaining: 0,
  recoveryPotionsRemaining: 0,
  cureItemsRemaining: 0,
  fleeAttempts: 1,
  statusAtEnd: "poison",
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
assert.equal(diagnostics.runs, 3);
assert.deepEqual(diagnostics.endFloorDistribution, { "3": 1, "4": 2 });
assert.equal(diagnostics.retreatReasonDistribution.portal_hp_threshold, 2);
assert.equal(diagnostics.retreatReasonSignalDistribution.no_heal_potion, 1);
assert.equal(diagnostics.retreatReasonSignalDistribution.status_resource, 1);
assert.equal(diagnostics.deathCauseDistribution.normal_enemy, 1);
assert.equal(diagnostics.byEndFloor["4"].endingHpRate.mean, 0.15);
assert.equal(diagnostics.byRetreatReason.portal_hp_threshold.fleeAttempts.mean, 1.5);
assert.deepEqual(diagnostics.byRetreatReason.portal_hp_threshold.endFloors, { "3": 1, "4": 1 });
assert.equal(diagnostics.byRetreatReason.portal_hp_threshold.retreatReasonSignals.status_resource, 1);
assert.equal(diagnostics.byDeathCause.normal_enemy.lastEnemyId["敵A"], 1);

const markdown = renderDiagnosticsMarkdown([{
  scenarioId: "workshop-empty",
  depths: [{
    depth: 5,
    diagnostics: {
      byRetreatReason: diagnostics.byRetreatReason,
      byDeathCause: diagnostics.byDeathCause
    }
  }]
}]).join("\n");
assert.match(markdown, /Run-level diagnostics/);
assert.match(markdown, /Primary retreat reason/);
assert.match(markdown, /\| workshop-empty \| B5 \| portal_hp_threshold \| 2 \| B3=1, B4=1 \| portal_hp_threshold=2, no_heal_potion=1, status_resource=1 \|/);
assert.match(markdown, /status_resource=1/);
assert.match(markdown, /Death cause/);
assert.match(markdown, /\| workshop-empty \| B5 \| normal_enemy \| 1 \| B4=1 \|/);
assert.doesNotMatch(markdown, /\| workshop-empty \| B5 \| B4 \|/);

console.log("[PASS] Issue #914 run-level diagnostic classification and aggregation");
