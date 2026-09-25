import assert from "node:assert/strict";

import {
  ARM_IDS,
  ARCANA_WEAPON_MODE,
  B5_WALL_ARM_IDS,
  B5_WALL_MODE,
  B5_WALL_MEASUREMENT_ID,
  B5_GUARDIAN_RETRY_MODE,
  B5_GUARDIAN_RETRY_ARM_IDS,
  B5_GUARDIAN_RETRY_MEASUREMENT_ID,
  CANONICAL_ADAPTIVE_POLICY_ID,
  KIT_IDS,
  MEASUREMENT_ID,
  normalizeB5,
  normalizeBossTrace,
  buildSummary,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

const { getScenarioById, resetSimulationRandom, simulateRun } =
  await import("../../../scratch/simulations/sim_depth_material_ev.js");
const { getMilestoneBossRule } = await import("../../../src/rules/boss_rules.js");

assert.deepEqual(
  getMilestoneBossRule(5, "デーモンガード", { isBoss: true }),
  {
    id: "B5_DEMON_GUARD_BREAK",
    floor: 5,
    bossName: "デーモンガード",
    breakHpRate: 0.80,
    exposureTurns: 4,
    exposureDamageMultiplier: 1.50
  }
);

const result = await runMeasurement({ runs: 1, seed: 1277 });
assert.equal(result.configuration.measurementId, MEASUREMENT_ID);
assert.deepEqual(result.configuration.startingKits, ["vanguard", "scout", "devotion", "arcana"]);
assert.deepEqual(result.configuration.arms, ["P0B1", "P0B0", "P1B1", "P1B0"]);
assert.equal(result.configuration.workshop, "workshop-complete");
assert.equal(result.configuration.adaptivePolicy, CANONICAL_ADAPTIVE_POLICY_ID);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);
let enemyActionRegressionObserved = false;
const expectedP1Weapons = Object.fromEntries(KIT_IDS.map(kitId => [kitId, "RAPIER"]));

for (const armId of ARM_IDS) {
  const arm = result.arms[armId];
  assert.equal(arm.smoke.totalRuns, KIT_IDS.length);
  assert.equal(arm.byKit.vanguard.preparation.departureCraft.purchaseSource, "actual-meta-bank");
  assert.equal(arm.byKit.vanguard.preparation.startingBagUsed,
    arm.preparation.id === "P0" ? 7 : 15);
  for (const kitId of KIT_IDS) {
    const row = arm.byKit[kitId];
    if (arm.preparation.id === "P0") {
      assert.equal(row.preparation.startingWeapon, {
        vanguard: "SHORT_SWORD",
        scout: "DAGGER",
        devotion: "MACE",
        arcana: "WAND"
      }[kitId]);
    } else {
      assert.equal(row.preparation.expectedStartingWeapon, expectedP1Weapons[kitId]);
      assert.equal(row.preparation.startingWeapon, expectedP1Weapons[kitId]);
    }
    assert.equal(row.preparation.startingWeapon, row.preparation.expectedStartingWeapon);
    for (const field of ["weaponAtk", "weaponHands", "equipmentLoad", "medium", "runeSlots", "activeRunes", "startingMp", "maxMp"]) {
      assert.ok(field in row.preparation, `${armId}/${kitId}: missing preparation provenance ${field}`);
    }
    if (row.aggregate.combat[1].rounds.total > 0 && row.aggregate.combat[1].combatHpDamage.total > 0) {
      assert.ok(row.aggregate.combat[1].enemyActions.total > 0);
      enemyActionRegressionObserved = true;
    }
    assert.ok(row.aggregate.buildCheckpoints[2]);
    assert.ok(row.aggregate.buildCheckpoints[5]);
    assert.equal(row.preparation.supplies.TOWN_PORTAL, 1);
    assert.equal(row.preparation.supplies.ANTIDOTE, 1);
    assert.equal(row.preparation.supplies.GUARD_POTION, 1);
    assert.equal(row.preparation.departureCraft.purchaseSource, "actual-meta-bank");
    assert.ok(arm.samples.runs.retainedCount <= 8);
    assert.ok(arm.samples.candidates.retainedCount <= 128);
    assert.ok(arm.overview.buildIdentitySample.length <= 32);
    if (arm.build.id === "B0") {
      assert.equal(row.aggregate.buildCheckpoints[5].equipmentSwapCount.total, 0);
    }
    if (arm.build.id === "B1") {
      assert.ok(arm.build.effectivePolicyIds.includes(CANONICAL_ADAPTIVE_POLICY_ID));
    }
  }
}
assert.equal(enemyActionRegressionObserved, true);
const b5SmokeArm = ARM_IDS.find(armId => result.arms[armId].overview.b5.entrantN > 0);
assert.ok(b5SmokeArm);
assert.ok(result.arms[b5SmokeArm].overview.b5.flameTrap.eligibleSteps.total > 0);
assert.equal(result.arms[b5SmokeArm].overviewReconciliation.runs, true);
const routeProbeArm = ARM_IDS.find(armId => {
  const boss = result.arms[armId].overview.b5.boss;
  return boss.routeBossDetected.total > boss.actualBossEventArrival.total;
});
assert.ok(routeProbeArm, "route detection must not imply actual boss arrival for every route");

const focusedScenario = {
  ...getScenarioById("workshop-complete"),
  startingKit: "vanguard",
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: false,
  fleePolicy: "never",
  hpBaseBonus: 1000,
  merchantPolicy: "supply-missing",
  milestonePortalPolicy: "continue"
};
resetSimulationRandom(123);
const focusedBoss = simulateRun({
  className: "Thief",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "issue1332-focused-b5-boss",
  scenario: focusedScenario,
  workshop: focusedScenario.workshop,
  collectDiagnostics: true,
  collectBuildSnapshots: true,
  collectEquipmentTelemetry: true
});
const focusedTrace = focusedBoss.milestoneEventTrace.filter(event => event.floor === 5 && event.type === "boss");
const focusedBattle = focusedBoss.specialBattles.find(battle => battle.floor === 5 && battle.type === "boss");
assert.equal(focusedBoss.specialRouteFloors.find(route => route.floor === 5).detectedBosses, 1);
assert.ok(focusedTrace.some(event => event.encounterAllowed === true), "focused probe did not execute boss event");
assert.ok(focusedBattle);
assert.ok(focusedBattle.attempts.length > 0, "focused probe did not start boss combat");
assert.equal(focusedBattle.finalResult, "victory");
assert.ok(focusedTrace.some(event => event.result === "victory"));

const portalScenario = { ...focusedScenario, milestonePortalPolicy: "retreat" };
resetSimulationRandom(123);
const portalBoss = simulateRun({
  className: "Thief",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "issue1332-focused-b5-portal-return",
  scenario: portalScenario,
  workshop: portalScenario.workshop,
  collectDiagnostics: true,
  collectBuildSnapshots: true,
  collectEquipmentTelemetry: true
});
const portalTrace = portalBoss.milestoneEventTrace.filter(event => event.floor === 5);
const portalDiagnostic = normalizeB5(portalBoss, {
  outcome: { voluntaryReturn: false },
  terminalReason: portalBoss.terminationReason
});
assert.equal(portalBoss.outcome, "retreat");
assert.equal(portalBoss.terminationReason, "milestone_portal");
assert.equal(portalBoss.reachedFloor, 5);
assert.ok(portalTrace.some(event => event.type === "boss" && event.result === "victory"));
assert.ok(portalTrace.some(event => event.type === "return_portal" && event.gateOpen === true));
assert.equal(portalDiagnostic.milestonePortalReturnAfterGuardian, true);
assert.equal(portalDiagnostic.b6Transition, false);

const fleeScenario = {
  ...focusedScenario,
  hpBaseBonus: 0,
  fleePolicy: "threshold",
  fleeHpThreshold: 0.8,
  milestonePortalPolicy: "continue"
};
resetSimulationRandom(0);
const fleeBoss = simulateRun({
  className: "Thief",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "probe-threshold-0.8-0",
  scenario: fleeScenario,
  workshop: fleeScenario.workshop,
  collectDiagnostics: true,
  collectBuildSnapshots: true,
  collectEquipmentTelemetry: true
});
const fleeTrace = fleeBoss.milestoneEventTrace.filter(event => event.floor === 5 && event.type === "boss");
const fleeDiagnostic = normalizeBossTrace(fleeTrace);
assert.ok(fleeDiagnostic.actualBossEventArrival);
assert.ok(fleeDiagnostic.fleeEventCount > 0);
assert.ok(fleeDiagnostic.bossCombatResultEventCount >= 2);
assert.equal(fleeDiagnostic.retryRevisit, true);

const runB5InterventionProbe = (scenario, seed, seriesId) => {
  resetSimulationRandom(seed);
  return simulateRun({
    className: "Thief",
    startFloor: 1,
    targetDepth: 6,
    runIndex: 0,
    seriesId,
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true,
    collectBuildSnapshots: true,
    collectEquipmentTelemetry: true
  });
};

const flameProbeBase = { ...focusedScenario };
const flameCurrent = runB5InterventionProbe(flameProbeBase, 1, "probe-b5-flame-current");
const flameDisabled = runB5InterventionProbe(
  { ...flameProbeBase, b5FlameTrapDisabled: true },
  1,
  "probe-b5-flame-disabled"
);
const flameDisabledBoth = runB5InterventionProbe(
  { ...flameProbeBase, b5FlameTrapDisabled: true, b5GuardianFleeDisabled: true },
  1,
  "probe-b5-flame-disabled-both"
);
assert.equal(flameCurrent.b5Entrant, true);
assert.ok(flameCurrent.flameTrapActivations > 0, "current B5 probe did not trigger flame trap");
for (const [label, probe] of [["F", flameDisabled], ["FG", flameDisabledBoth]]) {
  assert.equal(probe.b5Entrant, true, `${label} B5 probe did not enter B5`);
  assert.equal(probe.flameTrapActivations, 0, `${label} B5 flame intervention failed`);
}

const guardianCurrent = runB5InterventionProbe(fleeScenario, 0, "probe-b5-guardian-current");
const guardianDisabled = runB5InterventionProbe(
  { ...fleeScenario, b5GuardianFleeDisabled: true },
  0,
  "probe-b5-guardian-disabled"
);
const guardianDisabledBoth = runB5InterventionProbe(
  { ...fleeScenario, b5FlameTrapDisabled: true, b5GuardianFleeDisabled: true },
  0,
  "probe-b5-guardian-disabled-both"
);
const b5BossTrace = result => result.milestoneEventTrace.filter(event => event.floor === 5 && event.type === "boss");
const guardianFleeCount = result => normalizeBossTrace(b5BossTrace(result)).fleeEventCount;
assert.ok(guardianFleeCount(guardianCurrent) > 0, "current B5 probe did not flee from Guardian");
for (const [label, probe] of [["G", guardianDisabled], ["FG", guardianDisabledBoth]]) {
  const diagnostic = normalizeBossTrace(b5BossTrace(probe));
  assert.equal(diagnostic.actualBossEventArrival, true, `${label} Guardian probe did not arrive`);
  assert.equal(diagnostic.combatStart, true, `${label} Guardian probe did not start combat`);
  assert.equal(diagnostic.fleeEventCount, 0, `${label} Guardian flee intervention failed`);
}

const summary = buildSummary(result);
for (const token of ["B2", "B3", "B4", "B5", "P0B1 - P0B0", "P1B1 - P1B0", "P1B1 - P0B1", "P1B0 - P0B0", "actual arrival", "boss arrival/start/victory", "result events", "town-portal before boss", "milestone Portal return after guardian"]) {
  assert.match(summary, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
const arcanaP0 = result.arms.P0B1.byKit.arcana.preparation;
const arcanaP1 = result.arms.P1B1.byKit.arcana.preparation;
assert.deepEqual(
  { weapon: arcanaP0.startingWeapon, atk: arcanaP0.weaponAtk, medium: arcanaP0.medium, runeSlots: arcanaP0.runeSlots, activeRunes: arcanaP0.activeRunes, maxMp: arcanaP0.maxMp },
  { weapon: "WAND", atk: 1.5, medium: "WAND", runeSlots: 1, activeRunes: ["HALITO"], maxMp: 3 }
);
assert.deepEqual(
  { weapon: arcanaP1.startingWeapon, atk: arcanaP1.weaponAtk, medium: arcanaP1.medium, runeSlots: arcanaP1.runeSlots, activeRunes: arcanaP1.activeRunes, maxMp: arcanaP1.maxMp },
  { weapon: "RAPIER", atk: 12, medium: null, runeSlots: 0, activeRunes: [], maxMp: 1 }
);

assert.equal(result.primaryComparisons.length, 4);
assert.match(result.primaryComparisons[0].label, /P0B1 - P0B0/);
assert.match(result.primaryComparisons[1].label, /P1B1 - P1B0/);
assert.match(result.primaryComparisons[2].label, /P1B1 - P0B1/);
assert.match(result.primaryComparisons[3].label, /P1B0 - P0B0/);
assert.ok(!JSON.stringify(result).includes("encounterIdentityLog"));

const arcana = await runMeasurement({ runs: 1, seed: 1277, mode: ARCANA_WEAPON_MODE });
assert.deepEqual(arcana.configuration.arms, ["C", "W", "R"]);
assert.deepEqual(arcana.configuration.startingKits, ["arcana"]);
assert.match(arcana.configuration.comparisonSemantics, /^Cross-arm C\/W\/R treatment comparisons/);
assert.equal(arcana.determinism.pass, true);
assert.equal(arcana.observationInvariance.pass, true);
assert.deepEqual(
  { weapon: arcana.arms.W.byKit.arcana.preparation.startingWeapon, medium: arcana.arms.W.byKit.arcana.preparation.medium, rune: arcana.arms.W.byKit.arcana.preparation.activeRunes, maxMp: arcana.arms.W.byKit.arcana.preparation.maxMp },
  { weapon: "WAND", medium: "WAND", rune: ["HALITO"], maxMp: 3 }
);
assert.deepEqual(
  { weapon: arcana.arms.R.byKit.arcana.preparation.startingWeapon, medium: arcana.arms.R.byKit.arcana.preparation.medium, rune: arcana.arms.R.byKit.arcana.preparation.activeRunes, maxMp: arcana.arms.R.byKit.arcana.preparation.maxMp },
  { weapon: "RAPIER", medium: null, rune: [], maxMp: 1 }
);
assert.equal(arcana.arms.W.overview.buildCheckpoints[2].weaponSwapCount.total, 0);
assert.equal(arcana.arms.R.overview.buildCheckpoints[2].weaponSwapCount.total, 0);
assert.ok(arcana.arms.W.overview.buildCheckpoints[2].nonWeaponSwapCount.total > 0);
assert.ok(arcana.arms.R.overview.buildCheckpoints[2].nonWeaponSwapCount.total > 0);
assert.equal(arcana.scoringAudit.wand.weaponAtk, 1.5);
assert.equal(arcana.scoringAudit.rapier.weaponAtk, 12);
assert.match(arcana.scoringAudit.source, /^canonical simulator /);
assert.deepEqual(arcana.scoringAudit.structuralDelta, {
  atk: 10.5,
  maxMP: -2,
  mediumLoss: true,
  runeSlots: -1,
  activeRunesRemoved: ["HALITO"]
});
assert.equal(arcana.combatSanity.wand.selectedAction.spellName, "HALITO");
assert.equal(arcana.combatSanity.rapier.selectedAction.type, "fight");
assert.equal(arcana.combatSanity.determinism, true);
assert.equal(arcana.arms.C.overview.mediumAbandonment.departureCount, 1);
assert.equal(arcana.arms.C.overview.mediumAbandonment.mediumLossCount, 1);
assert.ok(arcana.arms.W.overview.combat[1].spellTelemetry.spellOpportunityRounds.total > 0);
assert.ok(arcana.arms.W.overview.combat[1].spellTelemetry.eligibleSpellSelected.total > 0);

const b5Wall = await runMeasurement({ runs: 1, seed: 1277, mode: B5_WALL_MODE });
assert.equal(b5Wall.configuration.measurementId, B5_WALL_MEASUREMENT_ID);
assert.deepEqual(b5Wall.configuration.arms, B5_WALL_ARM_IDS);
assert.equal(b5Wall.configuration.preparation.recovery, "current production recovery");
assert.equal(b5Wall.preB5Parity.pass, true);
assert.equal(b5Wall.determinism.pass, true);
assert.equal(b5Wall.observationInvariance.pass, true);
assert.deepEqual(b5Wall.arms.C.samples.runs.runs[0].b5.intervention, {
  flameTrapDisabled: false,
  guardianFleeDisabled: false,
  guardianRetryCheckpoint: false
});
assert.deepEqual(b5Wall.arms.F.samples.runs.runs[0].b5.intervention, {
  flameTrapDisabled: true,
  guardianFleeDisabled: false,
  guardianRetryCheckpoint: false
});
assert.deepEqual(b5Wall.arms.G.samples.runs.runs[0].b5.intervention, {
  flameTrapDisabled: false,
  guardianFleeDisabled: true,
  guardianRetryCheckpoint: false
});
assert.deepEqual(b5Wall.arms.FG.samples.runs.runs[0].b5.intervention, {
  flameTrapDisabled: true,
  guardianFleeDisabled: true,
  guardianRetryCheckpoint: false
});
for (const armId of B5_WALL_ARM_IDS) {
  const flame = b5Wall.arms[armId].overview.b5.flameTrap;
  assert.ok(flame.triggerRate >= 0 && flame.triggerRate <= 1, `${armId} flame trigger rate must be entrant-bounded`);
}
assert.deepEqual(Object.keys(b5Wall.b5Comparisons), ["F-C", "G-C", "FG-C", "interaction"]);
assert.ok(b5Wall.b5Comparisons["F-C"].baseline.flameTriggerRate <= 1);
assert.match(buildSummary(b5Wall), /pre-B5 parity: PASS/);

const guardianRetry = await runMeasurement({ runs: 1, seed: 1277, mode: B5_GUARDIAN_RETRY_MODE });
assert.equal(guardianRetry.configuration.measurementId, B5_GUARDIAN_RETRY_MEASUREMENT_ID);
assert.deepEqual(guardianRetry.configuration.arms, B5_GUARDIAN_RETRY_ARM_IDS);
assert.equal(guardianRetry.preB5Parity.pass, true);
assert.equal(guardianRetry.guardianRetryPairing.pass, true);
assert.equal(guardianRetry.determinism.pass, true);
assert.equal(guardianRetry.observationInvariance.pass, true);
assert.match(buildSummary(guardianRetry), /checkpoint/);

const runGuardianRetryProbe = (scenario, seed, seriesId) => {
  resetSimulationRandom(seed);
  return simulateRun({
    className: "Thief",
    startFloor: 1,
    targetDepth: 6,
    runIndex: 0,
    seriesId,
    scenario,
    workshop: scenario.workshop,
    worldSeed: `issue1374:${seed}:0`,
    collectDiagnostics: true,
    collectBuildSnapshots: true,
    collectEquipmentTelemetry: true
  });
};
const qualifyingGuardianScenario = {
  ...getScenarioById("workshop-complete"),
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: false,
  fleePolicy: "threshold",
  fleeHpThreshold: 0.8,
  milestonePortalPolicy: "continue",
  hpBaseBonus: 1000,
  merchantPolicy: "supply-missing",
  b5GuardianRetryCheckpoint: true,
  b5GuardianRetryObservation: true
};
const qualifyingGuardian = runGuardianRetryProbe(
  qualifyingGuardianScenario,
  1,
  "issue1374-qualifying-flee"
);
const qualifyingRepeat = runGuardianRetryProbe(
  qualifyingGuardianScenario,
  1,
  "issue1374-qualifying-flee"
);
assert.deepEqual(qualifyingGuardian.b5GuardianRetry, qualifyingRepeat.b5GuardianRetry);
const qualifyingAttempts = qualifyingGuardian.b5GuardianRetry.attempts;
assert.equal(qualifyingGuardian.b5GuardianRetry.checkpointEarnedCount, 1);
assert.ok(qualifyingAttempts.some(attempt => attempt.qualifyingFlee));
const appliedAttempts = qualifyingAttempts.filter(attempt => attempt.checkpointApplied);
assert.ok(appliedAttempts.length > 0);
assert.ok(appliedAttempts.every(attempt =>
  attempt.bossStartHpRate === 0.8 &&
  attempt.bossStartGuardBroken === false &&
  attempt.bossStartExposureTurns === 0
));
assert.equal(
  qualifyingGuardian.b5GuardianRetry.checkpointAppliedCount,
  appliedAttempts.length
);
assert.equal(
  new Set(appliedAttempts.map(attempt => attempt.bossStartHpRate)).size,
  1
);

const nonQualifyingGuardianScenario = {
  ...getScenarioById("workshop-complete"),
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: true,
  fleePolicy: "threshold",
  fleeHpThreshold: 1.0,
  milestonePortalPolicy: "continue",
  hpBaseBonus: 1000,
  merchantPolicy: "supply-missing",
  b5GuardianRetryCheckpoint: true,
  b5GuardianRetryObservation: true,
  startingKit: "vanguard"
};
const nonQualifyingGuardian = runGuardianRetryProbe(
  nonQualifyingGuardianScenario,
  0,
  "issue1374-non-qualifying-flee"
);
const nonQualifyingRepeat = runGuardianRetryProbe(
  nonQualifyingGuardianScenario,
  0,
  "issue1374-non-qualifying-flee"
);
assert.deepEqual(nonQualifyingGuardian.b5GuardianRetry, nonQualifyingRepeat.b5GuardianRetry);
assert.equal(nonQualifyingGuardian.b5GuardianRetry.checkpointEarnedCount, 0);
assert.equal(nonQualifyingGuardian.b5GuardianRetry.checkpointAppliedCount, 0);
assert.ok(nonQualifyingGuardian.b5GuardianRetry.attempts.some(attempt =>
  attempt.result === "flee" && attempt.bossHpAtFleeRate > 0.8
));

const pairingScenario = { ...qualifyingGuardianScenario, useTownPortal: true };
const currentGuardian = runGuardianRetryProbe(
  { ...pairingScenario, b5GuardianRetryCheckpoint: false },
  0,
  "issue1374-current-pair"
);
const candidateGuardian = runGuardianRetryProbe(
  { ...pairingScenario, b5GuardianRetryCheckpoint: true },
  0,
  "issue1374-candidate-pair"
);
assert.deepEqual(
  {
    actionTypes: currentGuardian.b5GuardianRetry.attempts[0].actionTypes,
    result: currentGuardian.b5GuardianRetry.attempts[0].result,
    rounds: currentGuardian.b5GuardianRetry.attempts[0].rounds,
    bossHpAtFlee: currentGuardian.b5GuardianRetry.attempts[0].bossHpAtFlee,
    playerHpAtFlee: currentGuardian.b5GuardianRetry.attempts[0].playerHpAtFlee
  },
  {
    actionTypes: candidateGuardian.b5GuardianRetry.attempts[0].actionTypes,
    result: candidateGuardian.b5GuardianRetry.attempts[0].result,
    rounds: candidateGuardian.b5GuardianRetry.attempts[0].rounds,
    bossHpAtFlee: candidateGuardian.b5GuardianRetry.attempts[0].bossHpAtFlee,
    playerHpAtFlee: candidateGuardian.b5GuardianRetry.attempts[0].playerHpAtFlee
  }
);

console.log("first-band-build-formation diagnostic smoke: PASS");
