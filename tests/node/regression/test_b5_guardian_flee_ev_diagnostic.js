import assert from "node:assert/strict";

import {
  B5_GUARDIAN_FLEE_EV_MODE,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

const result = await runMeasurement({
  runs: 1,
  seed: 1277,
  mode: B5_GUARDIAN_FLEE_EV_MODE
});

assert.deepEqual(result.configuration.arms, ["C"]);
assert.equal(result.configuration.runs, 1);
assert.equal(result.configuration.seed, 1277);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);

for (const kitId of result.configuration.startingKits) {
  const row = result.arms.C.byKit[kitId];
  const diagnostic = row.aggregate.b5.guardianFleeEv;
  assert.ok(diagnostic.firstDecisionN >= 0);
  if (diagnostic.firstDecisionN > 0) {
    assert.ok(Object.keys(diagnostic.reasons).length > 0);
    assert.ok(Object.keys(diagnostic.crossTabs.fleeReasonByAttempt).length >= 0);
  }
}

const {
  getScenarioById,
  recordB5GuardianFleeEvObservation,
  resetSimulationRandom,
  selectCombatAction,
  simulateRun
} = await import("../../../scratch/simulations/sim_depth_material_ev.js");
const focusedScenario = {
  ...getScenarioById("workshop-complete"),
  startingKit: "vanguard",
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: false,
  fleePolicy: "ev",
  hpBaseBonus: 1000,
  merchantPolicy: "supply-missing",
  milestonePortalPolicy: "continue",
  b5GuardianFleeEvObservation: true,
  simDiagnosticLevel: "full"
};
resetSimulationRandom(123);
const focused = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "issue1378-focused-b5-guardian-flee-ev",
  scenario: focusedScenario,
  workshop: focusedScenario.workshop,
  collectDiagnostics: true,
  collectBuildSnapshots: true,
  collectEquipmentTelemetry: true
});
assert.equal(focused.b5GuardianFleeEvDiagnostic.enabled, true);
assert.ok(focused.b5GuardianFleeEvDiagnostic.observations.length > 0);
assert.ok(focused.b5GuardianFleeEvDiagnostic.decisionTrace.length >= 1);
assert.deepEqual(
  focused.b5GuardianFleeEvDiagnostic.observations[0],
  focused.b5GuardianFleeEvDiagnostic.decisionTrace[0]
);
assert.deepEqual(focused.b5GuardianFleeEvDiagnostic.observations[0].productionBossRule, {
  breakHpRate: 0.80,
  exposureTurns: 4,
  exposureDamageMultiplier: 1.50
});
assert.ok(focused.b5GuardianFleeEvDiagnostic.observations[0].terms);

const traceDecision = ({ roundNumber, itemKey = null }) => {
  const state = {
    party: [{
      name: "trace-test",
      hp: 6,
      maxHp: 20,
      mp: 0,
      maxMp: 0,
      status: "ok",
      equipment: { weapon: "DAGGER" },
      spells: []
    }],
    inventory: itemKey ? [itemKey] : [],
    floor: 5,
    simPolicy: {
      fleePolicy: "ev",
      fleeHpThreshold: 0.20,
      healPotionThreshold: 0.35,
      healPriorityPolicy: "potion-first",
      statusCurePolicy: "smart",
      statusCureHpThreshold: 0.35,
      bloodWandHpPaymentMinRate: 0.20,
      bloodWandHealPolicy: "allow-recovery-potion",
      b5GuardianFleeDisabled: false,
      b5GuardianFleeEvObservation: true
    },
    combatState: {
      roundNumber,
      isBoss: true,
      isMidboss: false,
      initialLivingMonsterCount: 1,
      monsters: [{
        name: "デーモンガード",
        hp: 230,
        maxHp: 230,
        atk: 21,
        def: 0,
        status: "ok",
        isBoss: true,
        isMidboss: false
      }],
      b5GuardianFirstEvObserved: false,
      b5GuardianPlayerDecisionIndex: 0,
      b5GuardianPendingDecision: null,
      guardianAttempt: 1
    }
  };
  const metrics = { b5GuardianFleeEvDiagnostic: { enabled: true, observations: [], decisionTrace: [] } };
  const actualAction = selectCombatAction(state, metrics);
  recordB5GuardianFleeEvObservation(
    state,
    metrics,
    state.combatState.b5GuardianPendingDecision,
    actualAction
  );
  return metrics.b5GuardianFleeEvDiagnostic.decisionTrace[0];
};

for (const [roundNumber, itemKey] of [
  [1, "GUARD_POTION"],
  [2, "STR_POTION"],
  [3, "HASTE_POTION"]
]) {
  const trace = traceDecision({ roundNumber, itemKey });
  assert.equal(trace.decision, "flee");
  assert.equal(trace.reason, "flee-survival-deficit");
  assert.equal(trace.eligibleOpeningItemKey, itemKey);
  assert.equal(trace.fleeDeferredByOpening, true);
  assert.deepEqual(trace.actualAction, {
    type: "item",
    itemKey,
    spellName: null
  });
}

const noOpeningTrace = traceDecision({ roundNumber: 4 });
assert.equal(noOpeningTrace.decision, "flee");
assert.equal(noOpeningTrace.eligibleOpeningItemKey, null);
assert.equal(noOpeningTrace.fleeDeferredByOpening, false);
assert.deepEqual(noOpeningTrace.actualAction, {
  type: "run",
  itemKey: null,
  spellName: null
});

console.log("[PASS] B5 Guardian first-decision EV observation, invariance, and N=1");
