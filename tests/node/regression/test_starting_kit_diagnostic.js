/* global process */

import assert from "node:assert/strict";

const {
  STARTING_KIT_IDS,
  POLICY_IDS,
  RECOVERY_POLICY_IDS,
  RECOVERY_RESOURCE_IDS,
  isEventBeforeTargetEncounter,
  isEventBetweenEncounters,
  carriedUnusedInventoryCount,
  normalizeEquipmentSnapshot,
  collectB1AccessoryAffixIdsCarriedToB2,
  createDiagnosticScenario,
  getDiagnosticWorldSeed,
  runMatchedRecoveryPolicies,
  runDiagnostic
} = await import("../../../scratch/measurements/starting_kit_diagnostic.js");

assert.deepEqual(STARTING_KIT_IDS, ["vanguard", "scout", "devotion", "arcana"]);
assert.deepEqual(POLICY_IDS, ["fight", "flee-threshold", "visible-multi-enemy-flee"]);
assert.deepEqual(RECOVERY_POLICY_IDS, ["production", "early-use"]);
assert.deepEqual(RECOVERY_RESOURCE_IDS, [
  "HEAL_POTION", "GREATER_HEAL", "HOLY_WATER", "MANA_POTION", "ETHER"
]);
assert.equal(getDiagnosticWorldSeed(1139, 2), "issue-1176:1139:2");
assert.equal(carriedUnusedInventoryCount(1), 1);
assert.equal(carriedUnusedInventoryCount(0), 0);

const suspectedOnly = normalizeEquipmentSnapshot({
  equipment: {
    instanceId: "suspected-only",
    baseId: "test-accessory",
    slot: "accessory",
    curseEffectId: null,
    curseSuspected: true,
    affixes: []
  }
});
assert.equal(suspectedOnly.cursed, false);
assert.equal(suspectedOnly.curseSuspected, true);

assert.deepEqual(
  [...collectB1AccessoryAffixIdsCarriedToB2(
    [{ instanceId: "b1-accessory", affixIds: ["sameNameAffix"] }],
    [{ instanceId: "different-accessory", slot: "accessory", affixes: [{ id: "sameNameAffix" }] }]
  )],
  [],
  "same-name affix on a different instance is not B1 accessory-derived"
);
assert.deepEqual(
  [...collectB1AccessoryAffixIdsCarriedToB2(
    [{ instanceId: "b1-accessory", affixIds: ["sameNameAffix"] }],
    [{ instanceId: "b1-accessory", slot: "accessory", affixes: [{ id: "sameNameAffix" }] }]
  )],
  ["sameNameAffix"],
  "the carried B1 accessory instance is attributed"
);
assert.equal(
  collectB1AccessoryAffixIdsCarriedToB2(
    [{ instanceId: "b1-accessory", affixIds: ["duplicateAffix"] }],
    [{
      instanceId: "b1-accessory",
      slot: "accessory",
      affixes: [{ id: "duplicateAffix" }, { id: "duplicateAffix" }]
    }]
  ).size,
  1,
  "duplicate affixes in one run count once"
);

const fight = createDiagnosticScenario({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2
});
assert.equal(fight.startingKit, "vanguard");
assert.equal(fight.fleePolicy, "never");
assert.equal(fight.fleeHpThreshold, null);
assert.equal(fight.startingHealPotions, 0);
assert.deepEqual(fight.departureCraft, []);

const threshold = createDiagnosticScenario({
  startingKit: "scout",
  policy: "flee-threshold",
  fleeHpThreshold: 0.25
});
assert.equal(threshold.fleePolicy, "threshold");
assert.equal(threshold.fleeHpThreshold, 0.25);

const visibleMulti = createDiagnosticScenario({
  startingKit: "vanguard",
  policy: "visible-multi-enemy-flee",
  fleeHpThreshold: 0.25
});
assert.equal(visibleMulti.fleePolicy, "visible-multi-enemy-flee");
assert.equal(visibleMulti.fleeHpThreshold, null);

const flee = await runDiagnostic({
  startingKit: "vanguard",
  policy: "flee-threshold",
  fleeHpThreshold: 1,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
const fleeOutcome = flee.runOutcome;
assert.ok(fleeOutcome.fleeSelected > 0);
assert.equal(
  fleeOutcome.fleeSelected,
  fleeOutcome.fleeExecuted + fleeOutcome.fleeSelectedButNotExecuted
);
assert.equal(fleeOutcome.fleeExecuted, fleeOutcome.fleePartingAttackCount);
assert.equal(
  fleeOutcome.fleeExecuted,
  fleeOutcome.fleeSurvived + fleeOutcome.fleeDiedFromPartingAttack
);
assert.ok(flee.encounterExposure.encounterRows.length > 0);
const entry = flee.encounterExposure.encounterRows[0];
for (const field of [
  "runIndex", "encounterOrdinal", "initialCompositionKey", "hpBeforeEncounter",
  "maxHpBeforeEncounter", "hpRateBeforeEncounter", "mpBeforeEncounter",
  "maxMpBeforeEncounter", "mpRateBeforeEncounter", "hpAfterEncounter",
  "mpAfterEncounter", "combatRounds", "enemyActionCount", "normalDamage", "outcome",
  "startStep", "endStep", "startRecoveryInventory", "endRecoveryInventory"
]) {
  assert.ok(Object.hasOwn(entry, field), `encounter row missing ${field}`);
}
assert.ok(Object.hasOwn(entry, "startRecoveryEligibility"));
assert.ok(Object.hasOwn(entry, "endRecoveryEligibility"));
assert.ok(Object.hasOwn(entry, "startRecoveryBenefit"));
assert.ok(Object.hasOwn(entry, "endRecoveryBenefit"));
assert.equal(typeof entry.initialVisibleEnemyCount, "number");
assert.ok(entry.initialVisibleEnemyCount >= 1);
assert.equal(typeof entry.rawInitialVisibleEnemyCount, "number");
assert.ok(entry.rawInitialVisibleEnemyCount >= entry.initialVisibleEnemyCount);
assert.ok(["player-before-any-enemy", "after-enemy-action", "not-executed-before-end", "unobserved"]
  .includes(entry.firstPlayerActionExecutionTiming));
assert.equal(typeof entry.firstPlayerActionExecuted, "boolean");
assert.equal(typeof entry.enemyActionsBeforeFirstPlayerAction, "number");
assert.equal(typeof entry.damageBeforeFirstPlayerAction, "number");
assert.equal(entry.earlyCompositionPolicy, "baseline");
for (const field of [
  "hpBeforeEncounter", "maxHpBeforeEncounter", "hpRateBeforeEncounter",
  "mpBeforeEncounter", "maxMpBeforeEncounter", "mpRateBeforeEncounter"
]) {
  assert.equal(typeof entry[field], "number", `encounter row ${field} is numeric`);
  assert.ok(Number.isFinite(entry[field]), `encounter row ${field} is finite`);
}
for (const field of ["hpAfterEncounter", "mpAfterEncounter", "combatRounds", "enemyActionCount", "normalDamage"]) {
  assert.equal(typeof entry[field], "number", `encounter row ${field} is numeric`);
  assert.ok(Number.isFinite(entry[field]), `encounter row ${field} is finite`);
}

assert.throws(
  () => createDiagnosticScenario({ startingKit: "Fighter", policy: "fight", fleeHpThreshold: 0.2 }),
  /startingKit must be/
);
assert.throws(
  () => createDiagnosticScenario({ startingKit: "vanguard", policy: "fight", fleeHpThreshold: 2 }),
  /fleeHpThreshold must be/
);

const report = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});

assert.equal(report.runs, 2);
assert.equal(report.configuration.startingKit, "vanguard");
assert.equal(report.configuration.consumablesAtDeparture, "none");
assert.equal(report.configuration.enemyPool, "production");
assert.equal(report.configuration.combatActionPolicy, "production-auto");
assert.equal(report.configuration.targetPolicy, "production-auto");
assert.equal(report.configuration.seed, 1139);
assert.equal(report.configuration.worldSeedTemplate, "issue-1176:{seed}:{runIndex}");
assert.equal(typeof report.runOutcome.b1DeathRate, "number");
assert.equal(typeof report.earlyProgression.survival[1].survivedRate, "number");
assert.equal(typeof report.earlyProgression.survival[2].conditionalSurvivalRate, "number");
assert.ok(report.earlyProgression.deathEncounterOrdinal);
for (const type of ["meaningfulReward", "objectLoot", "buildChangeOpportunity", "buildChange"]) {
  assert.equal(typeof report.rewardOpportunity.byType[type].opportunityRate, "number");
  assert.ok(
    report.rewardOpportunity.byType[type].deathBeforeOpportunityRate === null
      || typeof report.rewardOpportunity.byType[type].deathBeforeOpportunityRate === "number"
  );
}
assert.equal(typeof report.encounterExposure.enemyEncounterCount, "number");
assert.ok(report.encounterExposure.byInitialVisibleEnemyCount);
assert.ok(report.enemyActionCost.byEncounterOrdinal["1"].all);
assert.ok(report.enemyActionCost.byEncounterOrdinal["2"].all);
assert.ok(report.enemyActionCost.reconciliation.encounters >= 0);
assert.equal(typeof report.combatCost.splitOnDeath.triggers, "number");
assert.equal(typeof report.combatCost.guardAdjacent.guardedCount, "number");
assert.equal(typeof report.combatCost.nonCombat.trapDamageHp, "number");
assert.equal(typeof report.combatCost.nonCombat.poisonApplications, "number");
assert.ok(report.encounterExposure.byComposition);
assert.ok(report.deathContribution.byComposition);
const firstComposition = Object.values(report.encounterExposure.byComposition)[0];
assert.ok(firstComposition.entryHpRate);
assert.ok(firstComposition.entryMpRate);
assert.ok(firstComposition.encounterOrdinal);
const totalCauseCounts = Object.values(report.deathContribution.causeDistribution)
  .reduce((sum, cause) => sum + cause.count, 0);
assert.equal(totalCauseCounts, report.runOutcome.outcomes.death || 0);
assert.ok(firstComposition);
assert.equal(typeof firstComposition.conditionalDeathRate, "number");
assert.equal(typeof firstComposition.encounterLethalityRate, "number");
assert.equal(typeof report.runOutcome.averageCombatRounds, "number");
assert.equal(typeof report.runOutcome.trapDamageHp, "number");
assert.equal(typeof report.runOutcome.poisonApplications, "number");
assert.ok(report.rewardOpportunity.rewardEventCount >= 0);
assert.equal(report.rewardOpportunity.rows.length, report.runs);
assert.ok(report.continuationResource["2"]);
for (const itemId of RECOVERY_RESOURCE_IDS) {
  assert.ok(report.continuationResource["2"].byItem[itemId]);
}
assert.ok(report.linkedTrajectory.byTransition);
assert.ok(report.linkedTrajectory.cohortByTransition);
assert.ok(report.lootBreadth);
assert.equal(report.lootBreadth.bagOccupancy.count, report.runs);
assert.ok(report.lootBreadth.objectLootSettlement);
assert.deepEqual(
  Object.keys(report.lootBreadth.mainRewardComposition).sort(),
  ["fromDrop", "ordinary"]
);
assert.equal(report.configuration.b1MainRewardCandidatePool.ordinary.length, 19);
assert.equal(report.configuration.b1MainRewardUnitWeights.ordinary.HEAL_POTION, 1);
assert.equal(report.configuration.b1MainRewardUnitWeights.fromDrop.HEAL_POTION, 1);
assert.equal(
  report.configuration.matchedCohortKey,
  "vanguard:fight:production:1139:2"
);
assert.equal(report.configuration.candidateId, "b1-heal-potion-none-baseline");
assert.ok(report.naturalEntryHpBands);
assert.ok(report.naturalEntryHpBandResource);
const b1EquipmentFlow = report.lootBreadth.b1EquipmentFlow;
assert.ok(b1EquipmentFlow);
assert.deepEqual(
  Object.keys(b1EquipmentFlow.b1Equipment.accessory.focusAffixIds).sort(),
  ["escapeChance", "mp", "physicalAccuracy", "poisonWard", "spellGuard", "treasureSense"]
);
assert.ok(b1EquipmentFlow.b1Equipment.bySource.ordinary);
assert.ok(b1EquipmentFlow.b1Equipment.bySource.fromDrop);
assert.ok(b1EquipmentFlow.b1Equipment.byRole.main);
assert.ok(b1EquipmentFlow.b1Equipment.byRole.accessory);
assert.ok(b1EquipmentFlow.b1Equipment.byRoleAffixId);
assert.ok(b1EquipmentFlow.b1Equipment.byStartingKit.vanguard);
assert.ok(b1EquipmentFlow.b2EntryBuild.byStartingKit.vanguard);
assert.ok(b1EquipmentFlow.b2EntryBuild.rarity.magic);
assert.ok(b1EquipmentFlow.progressionAssociation.noAccessory);
assert.ok(b1EquipmentFlow.progressionAssociation.accessory);
assert.equal(
  b1EquipmentFlow.progressionAssociation.noAccessory.cohortRuns +
    b1EquipmentFlow.progressionAssociation.accessory.cohortRuns,
  report.runs
);
for (const cohort of Object.values(b1EquipmentFlow.progressionAssociation)) {
  assert.equal(cohort.b2EntryHp.count, cohort.b2ReachCount);
  assert.equal(cohort.b2EntryMp.count, cohort.b2ReachCount);
  assert.equal(cohort.b2EntryBuildAffixCount.count, cohort.b2ReachCount);
}
assert.ok(
  b1EquipmentFlow.b1Equipment.all.carriedToB2Items <=
    b1EquipmentFlow.b1Equipment.all.equippedInB1Items,
  "generated but unequipped items must not count as B2 carry"
);

const { resetSimulationRandom, simulateRun } = await import(
  "../../../scratch/simulations/sim_depth_material_ev.js"
);
const observationScenario = createDiagnosticScenario({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2
});
function runObservationVariant(collectDiagnostics, collectEquipmentTelemetry) {
  resetSimulationRandom(1139);
  return simulateRun({
    className: "Fighter",
    startFloor: 1,
    targetDepth: 2,
    runIndex: 0,
    seriesId: "issue-1485-observation-invariance",
    scenario: observationScenario,
    workshop: { ranks: {} },
    worldSeed: getDiagnosticWorldSeed(1139, 0),
    collectDiagnostics,
    collectEquipmentTelemetry
  });
}
const observationOn = runObservationVariant(true, true);
const observationOff = runObservationVariant(false, false);
for (const field of [
  "reachedFloor", "endFloor", "outcome", "finalLevel", "expGained", "deathCause",
  "materialAcquired", "materialConsumed", "carriedMaterials", "bankedMaterials", "timeCost",
  "battles", "trapEncounterCount", "trapDamageHp", "fleeCount", "townPortalsUsed", "mpDepleted"
]) {
  assert.deepEqual(observationOn[field], observationOff[field], `observation changed gameplay field: ${field}`);
}

const boundaryFrom = { encounterOrdinal: 1, endStep: 10 };
const boundaryTo = { encounterOrdinal: 2, startStep: 10 };
assert.equal(
  isEventBeforeTargetEncounter({ encounterOrdinal: 1, step: 10 }, 2, 1),
  true
);
assert.equal(
  isEventBeforeTargetEncounter({ encounterOrdinal: 2, step: 10 }, 2, 1),
  false,
  "same-step target-encounter events must be excluded"
);
assert.equal(
  isEventBetweenEncounters({ encounterOrdinal: 1, step: 10 }, boundaryFrom, boundaryTo),
  true
);
assert.equal(
  isEventBetweenEncounters({ encounterOrdinal: 2, step: 10 }, boundaryFrom, boundaryTo),
  false,
  "same-step target-encounter events must not enter the prior transition"
);
for (const itemId of RECOVERY_RESOURCE_IDS) {
  const funnel = report.continuationResource["2"].byItem[itemId];
  assert.ok(funnel.runsWithAcquisition >= funnel.runsUsable);
  assert.ok(funnel.runsUsable >= funnel.runsBeneficial);
  assert.ok(funnel.runsUsable >= funnel.runsUsed);
}
for (const ordinal of ["2", "3"]) {
  const continuation = report.continuationResource[ordinal];
  assert.equal(continuation.rows.length, continuation.cohortRuns);
  assert.equal(
    continuation.resourceOpportunityRate,
    continuation.cohortRuns > 0
      ? continuation.resourceOpportunityRuns / continuation.cohortRuns
      : null
  );
  for (const itemId of RECOVERY_RESOURCE_IDS) {
    const expectedCarriedRuns = continuation.rows.reduce((count, row) => {
      const item = row.byItem[itemId];
      assert.equal(
        item.carriedUnused,
        item.inventoryCount,
        `${ordinal}/${itemId} carried-unused must equal target inventory snapshot`
      );
      return count + Number(item.inventoryCount > 0);
    }, 0);
    assert.equal(
      continuation.byItem[itemId].runsCarriedUnused,
      expectedCarriedRuns,
      `${ordinal}/${itemId} carried aggregate must count inventory snapshots`
    );
  }
}

const matchedVanguard = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  runs: 2,
  seed: 1176,
  allowSmallRunCount: true
});
const matchedScout = await runDiagnostic({
  startingKit: "scout",
  policy: "fight",
  runs: 2,
  seed: 1176,
  allowSmallRunCount: true
});
assert.equal(
  matchedVanguard.encounterExposure.encounterRows[0].initialCompositionKey,
  matchedScout.encounterExposure.encounterRows[0].initialCompositionKey,
  "matched kits must start from the same first production encounter"
);

const repeat = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
assert.deepEqual(repeat, report);

const matchedRecovery = await runMatchedRecoveryPolicies({
  startingKit: "vanguard",
  policy: "fight",
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
assert.equal(matchedRecovery.production.configuration.recoveryPolicy, "production");
assert.equal(matchedRecovery.earlyUse.configuration.recoveryPolicy, "early-use");
assert.equal(
  matchedRecovery.production.encounterExposure.encounterRows[0].initialCompositionKey,
  matchedRecovery.earlyUse.encounterExposure.encounterRows[0].initialCompositionKey,
  "recovery policy comparison must use the matched production encounter"
);

const visibleReport = await runDiagnostic({
  startingKit: "vanguard",
  policy: "visible-multi-enemy-flee",
  runs: 20,
  seed: 1139,
  allowSmallRunCount: true
});
const visibleRows = visibleReport.encounterExposure.encounterRows;
assert.ok(
  visibleRows.some(row => row.initialVisibleEnemyCount >= 2 && row.fleeSelected > 0),
  "visible-multi-enemy-flee smoke needs a multi-enemy encounter with a player action"
);
for (const row of visibleReport.encounterExposure.encounterRows) {
  if (row.initialVisibleEnemyCount < 2) {
    assert.equal(row.fleeSelected, 0, "single-enemy encounter delegates to production-auto");
  }
  if (row.fleeSelected > 0) {
    assert.ok(row.initialVisibleEnemyCount >= 2, "only multi-enemy encounters select run");
    assert.equal(row.fleeSelected, 1, "multi-enemy diagnostic selects run once");
  }
}

console.log("[PASS] starting-kit diagnostic wiring and smoke");
