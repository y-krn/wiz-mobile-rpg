import assert from "node:assert/strict";

import {
  B5_GUARDIAN_FLEE_EV_MODE,
  buildGuardianStrFightCohorts,
  buildGuardianDecisionTransitions,
  runMeasurement,
  summarizeGuardianOpeningTransitions
} from "../../../scratch/measurements/first_band_build_formation.js";
import { evaluateCombatRecoveryAction } from "../../../scratch/simulations/sim_recovery_policy.js";

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
  assert.ok(diagnostic.transitionsObserved >= 0);
  assert.ok(diagnostic.strFightCohort);
  assert.ok(diagnostic.strFightCohort.cohortN >= 0);
  assert.ok(diagnostic.strFightCohort.paired);
  assert.ok(diagnostic.strFightCohort.paired.samples.length <= 2);
  assert.ok(Object.hasOwn(diagnostic.strFightCohort.outcomes, "victory") || diagnostic.strFightCohort.cohortN === 0);
  for (const aggregate of [diagnostic.strFightCohort.all, ...Object.values(diagnostic.strFightCohort.byOutcome)]) {
    for (const field of ["fleePartingAttackCount", "partingAttackDamageHp", "fleeDiedFromPartingAttack"]) {
      assert.ok(Object.hasOwn(aggregate, field), `cohort aggregate missing ${field}`);
    }
  }
  for (const sample of Object.values(diagnostic.strFightCohort.samples).flat()) {
    for (const field of ["fleePartingAttackCount", "partingAttackDamageHp", "fleeDiedFromPartingAttack"]) {
      assert.ok(Object.hasOwn(sample, field), `cohort sample missing ${field}`);
    }
  }
  assert.ok(Object.values(diagnostic.strFightCohort.samples)
    .reduce((total, samples) => total + samples.length, 0) <= 6);
  assert.deepEqual(
    Object.keys(diagnostic.openingTransitionsByItem),
    ["GUARD_POTION", "STR_POTION", "HASTE_POTION"]
  );
}

const cohortTrace = (attempt, decision, executed, itemKey, playerDecisionIndex, round) => ({
  attempt,
  playerDecisionIndex,
  round,
  decision,
  reason: decision === "flee" ? "flee-survival-deficit" : "fight-current-survival",
  terms: { expectedTurnsToWin: 6, survivalTurns: attempt === 1 ? 6 : 5 },
  executed,
  actualAction: itemKey
    ? { type: "item", itemKey, spellName: null }
    : { type: decision === "flee" ? "run" : "fight", itemKey: null, spellName: null },
  executedAction: executed
    ? itemKey
      ? { type: "item", itemKey, spellName: null }
      : { type: decision === "flee" ? "run" : "fight", itemKey: null, spellName: null }
    : null,
  hp: { current: 40 - round, max: 50, rate: (40 - round) / 50 },
  mp: { current: 8 - round, max: 10, rate: (8 - round) / 10 },
  guardian: { currentHp: 100 - round * 10, maxHp: 100 }
});

const cohortResult = {
  b5GuardianFleeEvDiagnostic: {
    strFightPairs: [],
    decisionTrace: [
      cohortTrace(1, "flee", true, "STR_POTION", 1, 1),
      cohortTrace(1, "fight", true, null, 2, 2),
      cohortTrace(1, "recover", true, "HEAL_POTION", 3, 3),
      cohortTrace(2, "flee", true, "STR_POTION", 1, 1),
      cohortTrace(2, "fight", true, null, 2, 2),
      cohortTrace(3, "fight", true, "STR_POTION", 1, 1),
      cohortTrace(3, "fight", true, null, 2, 2),
      cohortTrace(4, "flee", false, "STR_POTION", 1, 1),
      cohortTrace(4, "fight", true, null, 2, 2),
      cohortTrace(5, "flee", true, "STR_POTION", 1, 1),
      cohortTrace(5, "fight", true, null, 2, 2)
    ]
  },
  specialBattles: [{
    type: "boss",
    floor: 5,
    attempts: [
      { attempt: 1, result: "victory" },
      { attempt: 2, result: "flee" },
      { attempt: 3, result: "death" },
      { attempt: 4, result: "victory" },
      { attempt: 5, result: "death" }
    ]
  }],
  diagnostics: {
    encounters: [1, 2, 3, 4, 5].map((attempt, index) => ({
      floor: 5,
      type: "boss",
      endHp: 30 - index * 5,
      endMp: 4 - index,
      endEnemyHp: [{ name: "デーモンガード", hp: 20 - index * 5, maxHp: 100 }],
      rounds: [
        { round: 1, action: "item", itemKey: "STR_POTION", playerActionExecuted: true, mpBefore: 8, mpAfter: 8 },
        {
          round: 2,
          action: "spell",
          spellName: "HALITO",
          playerActionExecuted: true,
          mpBefore: 8,
          mpAfter: 7,
          fleeSelected: index >= 2,
          fleeExecuted: index >= 2,
          fleePartingAttack: index >= 2,
          log: index >= 2 ? ["追撃！ 6のダメージ"] : []
        },
        {
          round: 3,
          action: "item",
          itemKey: "HEAL_POTION",
          playerActionExecuted: true,
          mpBefore: 7,
          mpAfter: 7,
          fleeSelected: index === 1,
          fleeExecuted: index === 1,
          fleePartingAttack: index === 1,
          log: index === 1 ? ["追撃！ 4のダメージ"] : []
        }
      ]
    }))
  }
};
let cohorts = buildGuardianStrFightCohorts(cohortResult, "vanguard", 9);
assert.equal(cohorts.length, 3);
assert.deepEqual(cohorts.map(item => item.terminalOutcome), ["victory", "laterFlee", "death"]);
assert.equal(cohorts[0].runIndex, 9);
assert.equal(cohorts[0].additionalDecisions, 2);
assert.equal(cohorts[0].additionalRounds, 2);
assert.equal(cohorts[0].decisionCounts.recovery, 1);
assert.equal(cohorts[0].decisionCounts.fight, 1);
assert.equal(cohorts[0].guardianDamage, 60);
assert.equal(cohorts[0].resources.itemCounts.HEAL_POTION, 1);
assert.equal(cohorts[0].resources.mpSpent, 1);
assert.equal(cohorts[0].executedFleeActions, 0);
assert.equal(cohorts[1].fleePartingAttackCount, 1);
assert.equal(cohorts[1].partingAttackDamageHp, 4);
assert.equal(cohorts[1].fleeDiedFromPartingAttack, 0);
assert.equal(cohorts[2].fleePartingAttackCount, 1);
assert.equal(cohorts[2].partingAttackDamageHp, 6);
assert.equal(cohorts[2].fleeDiedFromPartingAttack, 1);
assert.equal(
  cohorts.reduce((sum, cohort) => sum + cohort.partingAttackDamageHp, 0),
  10
);

const pairedFixture = (productionOutcome, productionDecision) => ({
  attempt: productionOutcome === "victory" ? 1 : 2,
  productionDecisionIndex: 2,
  productionDecisionRound: 2,
  productionDecision,
  immediateFlee: {
    outcome: "flee",
    survived: true,
    terminalHp: productionOutcome === "victory" ? 35 : 12,
    hpLoss: productionOutcome === "victory" ? 5 : 28,
    rounds: 1,
    actions: 1,
    guardianDamage: 0,
    resourcesConsumed: { itemCounts: {}, itemCount: 0, mp: 1 },
    partingAttackCount: 1,
    partingDamage: 1,
    partingDeath: false
  },
  production: {
    outcome: productionOutcome,
    survived: true,
    terminalHp: productionOutcome === "victory" ? 25 : 8,
    hpLoss: productionOutcome === "victory" ? 15 : 32,
    rounds: productionOutcome === "victory" ? 4 : 5,
    actions: productionOutcome === "victory" ? 4 : 5,
    guardianDamage: productionOutcome === "victory" ? 75 : 100,
    resourcesConsumed: {
      itemCounts: { HEAL_POTION: productionOutcome === "victory" ? 1 : 2 },
      itemCount: productionOutcome === "victory" ? 1 : 2,
      mp: productionOutcome === "victory" ? 2 : 3
    },
    partingAttackCount: 1,
    partingDamage: 2,
    partingDeath: false
  },
  pairedDelta: {
    terminalHpImmediateFleeMinusProduction: productionOutcome === "victory" ? 10 : 4,
    hpLossProductionMinusImmediateFlee: productionOutcome === "victory" ? 10 : 4,
    roundsProductionMinusImmediateFlee: productionOutcome === "victory" ? 3 : 4,
    actionsProductionMinusImmediateFlee: productionOutcome === "victory" ? 3 : 4,
    guardianDamageProductionMinusImmediateFlee: productionOutcome === "victory" ? 75 : 100,
    itemCountProductionMinusImmediateFlee: productionOutcome === "victory" ? 1 : 2,
    mpProductionMinusImmediateFlee: productionOutcome === "victory" ? 1 : 2,
    productionVictoryGained: productionOutcome === "victory",
    avoidableLaterFlee: productionOutcome === "laterFlee",
    avoidableDeath: false
  }
});
const fixturePairs = [
  pairedFixture("victory", {
    decision: "fight",
    reason: "fight-current-survival",
    terms: { expectedTurnsToWin: 6, survivalTurns: 6 }
  }),
  pairedFixture("laterFlee", {
    decision: "fight",
    reason: "fight-current-survival",
    terms: { expectedTurnsToWin: 6, survivalTurns: 5 }
  })
];
fixturePairs.forEach(pair => {
  cohortResult.b5GuardianFleeEvDiagnostic.strFightPairs.push(pair);
});
cohorts = buildGuardianStrFightCohorts(cohortResult, "vanguard", 9);
const pairedVictory = cohorts[0].pairedComparison;
const pairedLaterFlee = cohorts[1].pairedComparison;
assert.equal(pairedVictory.production.outcome, "victory");
assert.equal(pairedVictory.immediateFlee.outcome, "flee");
assert.equal(pairedVictory.pairedDelta.productionVictoryGained, true);
assert.equal(pairedLaterFlee.production.outcome, "laterFlee");
assert.equal(pairedLaterFlee.immediateFlee.outcome, "flee");
assert.equal(pairedLaterFlee.pairedDelta.avoidableLaterFlee, true);
for (const pair of [pairedVictory, pairedLaterFlee]) {
  const trace = cohortResult.b5GuardianFleeEvDiagnostic.decisionTrace.find(item =>
    item.attempt === pair.attempt &&
    Number(item.playerDecisionIndex) === Number(pair.productionDecisionIndex)
  );
  assert.ok(trace);
  assert.deepEqual(pair.productionDecision, {
    decision: trace.decision,
    reason: trace.reason,
    terms: trace.terms
  });
  assert.equal(pair.productionDecisionIndex, trace.playerDecisionIndex);
  assert.equal(
    pair.pairedDelta.terminalHpImmediateFleeMinusProduction,
    pair.immediateFlee.terminalHp - pair.production.terminalHp
  );
  assert.equal(
    pair.pairedDelta.hpLossProductionMinusImmediateFlee,
    pair.production.hpLoss - pair.immediateFlee.hpLoss
  );
  assert.equal(
    pair.pairedDelta.roundsProductionMinusImmediateFlee,
    pair.production.rounds - pair.immediateFlee.rounds
  );
  assert.equal(
    pair.pairedDelta.actionsProductionMinusImmediateFlee,
    pair.production.actions - pair.immediateFlee.actions
  );
  assert.equal(
    pair.pairedDelta.itemCountProductionMinusImmediateFlee,
    pair.production.resourcesConsumed.itemCount - pair.immediateFlee.resourcesConsumed.itemCount
  );
  assert.equal(
    pair.pairedDelta.mpProductionMinusImmediateFlee,
    pair.production.resourcesConsumed.mp - pair.immediateFlee.resourcesConsumed.mp
  );
}
assert.ok(cohorts.flatMap(item => item.pairedComparison ? [item.pairedComparison] : []).length <= 2);

const terms = ({ expectedTurnsToWin = 5, survivalTurns = 2 } = {}) => ({
  expectedTurnsToWin,
  survivalTurns,
  turnDeficit: expectedTurnsToWin - survivalTurns,
  currentHp: 10,
  hpRate: 0.5,
  totalEnemyHp: 50,
  playerDefense: 5,
  incomingDamagePerRound: 4,
  playerDamagePerRound: 10,
  maxRecovery: 15,
  recoverySurvivalTurns: 5
});
const action = itemKey => ({ type: "item", itemKey, spellName: null });
const trace = [
  { attempt: 1, playerDecisionIndex: 1, decision: "flee", reason: "flee-survival-deficit", terms: terms(), actualAction: action("GUARD_POTION"), executed: true, executedAction: action("GUARD_POTION"), eligibleOpeningItemKey: "GUARD_POTION", fleeDeferredByOpening: true },
  { attempt: 1, playerDecisionIndex: 2, decision: "fight", reason: "fight-current-survival", terms: terms({ survivalTurns: 6 }), actualAction: { type: "fight", itemKey: null, spellName: null }, executed: true, executedAction: { type: "fight", itemKey: null, spellName: null }, eligibleOpeningItemKey: null, fleeDeferredByOpening: false },
  { attempt: 1, playerDecisionIndex: 3, decision: "flee", reason: "flee-survival-deficit", terms: terms(), actualAction: action("STR_POTION"), executed: true, executedAction: action("STR_POTION"), eligibleOpeningItemKey: "STR_POTION", fleeDeferredByOpening: true },
  { attempt: 1, playerDecisionIndex: 4, decision: "recover", reason: "recover-then-survive", terms: terms({ survivalTurns: 4 }), actualAction: { type: "item", itemKey: "HEAL_POTION", spellName: null }, executed: true, executedAction: { type: "item", itemKey: "HEAL_POTION", spellName: null }, eligibleOpeningItemKey: null, fleeDeferredByOpening: false },
  { attempt: 1, playerDecisionIndex: 5, decision: "flee", reason: "flee-survival-deficit", terms: terms(), actualAction: action("HASTE_POTION"), executed: true, executedAction: action("HASTE_POTION"), eligibleOpeningItemKey: "HASTE_POTION", fleeDeferredByOpening: true },
  { attempt: 1, playerDecisionIndex: 6, decision: "flee", reason: "flee-low-hp-recovery-insufficient", terms: terms({ survivalTurns: 1 }), actualAction: { type: "run", itemKey: null, spellName: null }, executed: true, executedAction: { type: "run", itemKey: null, spellName: null }, eligibleOpeningItemKey: null, fleeDeferredByOpening: false },
  { attempt: 1, playerDecisionIndex: 7, decision: "flee", reason: "flee-survival-deficit", terms: terms(), actualAction: action("HASTE_POTION"), executed: false, executedAction: null, eligibleOpeningItemKey: "HASTE_POTION", fleeDeferredByOpening: true },
  { attempt: 1, playerDecisionIndex: 8, decision: "fight", reason: "fight-current-survival", terms: terms({ survivalTurns: 6 }), actualAction: { type: "fight", itemKey: null, spellName: null }, executed: true, executedAction: { type: "fight", itemKey: null, spellName: null }, eligibleOpeningItemKey: null, fleeDeferredByOpening: false },
  { attempt: 2, playerDecisionIndex: 1, decision: "flee", reason: "flee-survival-deficit", terms: terms(), actualAction: action("GUARD_POTION"), executed: true, executedAction: action("GUARD_POTION"), eligibleOpeningItemKey: "GUARD_POTION", fleeDeferredByOpening: true }
];
const transitions = buildGuardianDecisionTransitions(trace, "vanguard");
const opening = summarizeGuardianOpeningTransitions(transitions);
assert.equal(transitions.length, 7);
assert.equal(opening.GUARD_POTION.nextDecision.fight.count, 1);
assert.equal(opening.GUARD_POTION.boundaryCrossing.count, 1);
assert.equal(opening.GUARD_POTION.boundaryCrossing.rate, 1);
assert.equal(opening.STR_POTION.nextDecision.recover.count, 1);
assert.equal(opening.HASTE_POTION.nextDecision.flee.count, 1);
assert.equal(opening.HASTE_POTION.nextDecision.fight, undefined);
for (const transition of transitions) {
  assert.equal(
    transition.delta.turnDeficit,
    transition.delta.expectedTurnsToWin - transition.delta.survivalTurns
  );
}

const {
  finalizeB5GuardianDecisionTrace,
  calculateDurationAwareExpectedTurnsToWin,
  calculateProductionPhysicalIncomingHitShadow,
  calculateProductionPhysicalIncomingShadow,
  classifyB5GuardianUnsupportedThreat,
  getFiniteAtkBuffObservation,
  getSimulationRandomState,
  getScenarioById,
  recordB5GuardianFleeEvObservation,
  resetSimulationRandom,
  runB5GuardianCombinedCandidateContinuation,
  runB5GuardianImmediateFleeCounterfactual,
  selectCombatAction,
  shouldBranchB5GuardianCombinedCandidate,
  simulateRun
} = await import("../../../scratch/simulations/sim_depth_material_ev.js");

const finiteAtkBuff = getFiniteAtkBuffObservation({
  buffs: [
    { type: "atk", value: 15, turns: 5 },
    { type: "atk", value: -3, turns: 3 },
    { type: "physGuard", value: 40, turns: 99 },
    { type: "firstStrike", value: 5, turns: 5 }
  ]
});
assert.deepEqual(finiteAtkBuff, { active: true, value: 15, remainingTurns: 5 });
assert.deepEqual(getFiniteAtkBuffObservation({
  buffs: [
    { type: "physGuard", value: 40, turns: 99 },
    { type: "firstStrike", value: 5, turns: 5 }
  ]
}), { active: false, value: 0, remainingTurns: 0 });
assert.equal(calculateDurationAwareExpectedTurnsToWin({
  totalEnemyHp: 100,
  currentDamage: 40,
  baseDamage: 10,
  remainingBuffTurns: 3
}), 3, "buff内kill uses static current-damage ETW");
assert.equal(calculateDurationAwareExpectedTurnsToWin({
  totalEnemyHp: 230,
  currentDamage: 25,
  baseDamage: 10,
  remainingBuffTurns: 4
}), 17, "buff expiry kill uses remaining buff turns plus base damage");
assert.equal(calculateDurationAwareExpectedTurnsToWin({
  totalEnemyHp: 230,
  currentDamage: 25,
  baseDamage: 10,
  remainingBuffTurns: 0
}), 10, "no finite ATK buff preserves static ETW");
const incomingState = { floor: 5 };
const incomingTarget = {
  hp: 100,
  maxHp: 100,
  equipment: {},
  buffs: [{ type: "def", value: 5 }, { type: "physGuard", value: 40 }]
};
const incomingMonster = { atk: 21, hp: 100, maxHp: 100, buffs: [] };
const incomingShadow = calculateProductionPhysicalIncomingHitShadow({
  state: incomingState,
  monster: incomingMonster,
  target: incomingTarget
});
assert.deepEqual(incomingShadow.attack.rolls, [0, 1, 2, 3]);
assert.equal(incomingShadow.defense.finalDef, 5);
assert.equal(incomingShadow.defense.defResistance, 5 / 9);
assert.deepEqual(incomingShadow.incoming, { min: 5, mean: 5.5, max: 6 });
assert.deepEqual(incomingShadow.noPhysGuard.incoming, { min: 9, mean: 9.5, max: 10 });
assert.deepEqual(incomingShadow.physGuard.reduction, { min: 4, mean: 4, max: 4 });
assert.deepEqual(
  calculateProductionPhysicalIncomingShadow({
    state: { ...incomingState, combatState: { monsters: [incomingMonster] } },
    target: incomingTarget
  }).incoming,
  incomingShadow.incoming
);
const overrideEvaluation = evaluateCombatRecoveryAction({
  currentHp: 40,
  maxHp: 56,
  enemyHp: [230],
  enemyAttack: [21],
  playerDamagePerRound: 25,
  expectedTurnsToWinOverride: 7,
  incomingDamagePerRoundOverride: 5.5,
  fleeThreshold: 0.20,
  healThreshold: 0.55
});
assert.equal(overrideEvaluation.terms.survivalTurns, 7);
assert.equal(overrideEvaluation.decision, "fight");
const staticFight = evaluateCombatRecoveryAction({
  currentHp: 13,
  maxHp: 100,
  enemyHp: [230],
  enemyAttack: [1],
  playerDamagePerRound: 25,
  fleeThreshold: 0.20,
  healThreshold: 0.55
});
const shadowFlee = evaluateCombatRecoveryAction({
  currentHp: 13,
  maxHp: 100,
  enemyHp: [230],
  enemyAttack: [1],
  playerDamagePerRound: 25,
  expectedTurnsToWinOverride: 17,
  fleeThreshold: 0.20,
  healThreshold: 0.55
});
assert.equal(staticFight.decision, "fight", "static ETW remains fight");
assert.equal(shadowFlee.decision, "flee", "duration-aware ETW crosses to flee");

const counterfactualState = {
  party: [{
    name: "Counterfactual Tester",
    level: 5,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    status: "ok",
    buffs: [],
    spells: [],
    equipment: { weapon: "SHORT_SWORD", shield: null, armor: "PLATE_MAIL", accessory: null }
  }],
  combatState: {
    monsters: [{
      name: "デーモンガード",
      hp: 100,
      maxHp: 100,
      atk: 10,
      def: 0,
      status: "ok",
      row: "front"
    }],
    isBoss: true,
    isMidboss: false,
    isRoamingFlack: false,
    allParalyzedTurns: 0,
    roundNumber: 1,
    retreatPosition: { x: 4, y: 5 },
    phase: "choose_actions"
  },
  inventory: [],
  firstKills: [],
  codex: null,
  currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
  roamingMonsters: [],
  floorChestsTotal: [],
  gold: 0,
  floor: 5,
  x: 5,
  y: 5,
  simPolicy: {}
};
resetSimulationRandom(0x1_0000_0001);
assert.equal(getSimulationRandomState(), 1);
resetSimulationRandom(-1);
assert.equal(getSimulationRandomState(), 0xFFFF_FFFF);
resetSimulationRandom(123);
for (let index = 0; index < 3; index++) Math.random();
const productionStateBeforeCounterfactual = JSON.stringify(counterfactualState);
const branchRngState = getSimulationRandomState();
assert.ok(branchRngState > 0xFFFF_FFFF);
const immediateFlee = runB5GuardianImmediateFleeCounterfactual({
  state: counterfactualState,
  rngState: branchRngState
});
assert.equal(immediateFlee.resolver, "production-runCombatRoundCalculation");
assert.equal(immediateFlee.action.type, "run");
assert.equal(immediateFlee.initialRngState, branchRngState);
assert.equal(immediateFlee.initialStateMatchesBranchPoint, true);
assert.equal(immediateFlee.productionRngRestored, true);
assert.equal(getSimulationRandomState(), branchRngState);
assert.equal(immediateFlee.fleeExecuted, true);
assert.equal(immediateFlee.partingAttackCount, 1);
assert.equal(immediateFlee.survived, true);
assert.equal(JSON.stringify(counterfactualState), productionStateBeforeCounterfactual);
const partingDeathState = structuredClone(counterfactualState);
partingDeathState.party[0].hp = 1;
partingDeathState.party[0].buffs = [{ type: "firstStrike", value: 100 }];
resetSimulationRandom(123);
const partingDeath = runB5GuardianImmediateFleeCounterfactual({
  state: partingDeathState,
  rngState: getSimulationRandomState()
});
assert.equal(partingDeath.outcome, "death");
assert.equal(partingDeath.survived, false);
assert.equal(partingDeath.partingDeath, true);
assert.equal(partingDeath.partingAttackCount, 1);

assert.deepEqual(classifyB5GuardianUnsupportedThreat({
  actionNames: ["通常攻撃"],
  damageEvents: [{ source: "normal", damage: 5 }],
  statusSources: []
}), []);
assert.deepEqual(classifyB5GuardianUnsupportedThreat({
  actionNames: ["LAHALITO"],
  damageEvents: [{ source: "spell", damage: 5 }],
  statusSources: []
}), ["non-normal-damage", "damaging-special"]);
const productionFightDurationFlee = {
  productionDecision: "fight",
  durationAwareShadowDecision: "flee",
  candidateDecision: "flee"
};
assert.equal(
  shouldBranchB5GuardianCombinedCandidate({
    decisionTrace: productionFightDurationFlee
  }),
  true,
  "production=fight / duration-only=flee / candidate=flee branches"
);
assert.equal(
  shouldBranchB5GuardianCombinedCandidate({
    decisionTrace: { ...productionFightDurationFlee, candidateDecision: "fight" }
  }),
  false,
  "production=fight / duration-only=flee / candidate=fight does not branch"
);
assert.equal(
  shouldBranchB5GuardianCombinedCandidate({
    decisionTrace: productionFightDurationFlee,
    guardianCandidateBranched: true
  }),
  false,
  "a Guardian encounter branches only once"
);

const candidateStateBefore = JSON.stringify(counterfactualState);
resetSimulationRandom(123);
const candidateBranchRngState = getSimulationRandomState();
const candidateContinuation = runB5GuardianCombinedCandidateContinuation({
  state: counterfactualState,
  rngState: candidateBranchRngState
});
assert.equal(candidateContinuation.resolver, "production-runCombatRoundCalculation");
assert.equal(candidateContinuation.policy, "duration-aware-outgoing+production-parity-incoming");
assert.equal(candidateContinuation.initialStateMatchesBranchPoint, true);
assert.equal(candidateContinuation.productionRngRestored, true);
assert.equal(getSimulationRandomState(), candidateBranchRngState);
assert.equal(JSON.stringify(counterfactualState), candidateStateBefore);
assert.ok(candidateContinuation.decisionTrace.length >= 1);
assert.ok(candidateContinuation.roundsTrace.length >= 1);
assert.ok(Object.hasOwn(candidateContinuation, "unsupportedThreats"));

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
const focusedDecisionTrace = focused.b5GuardianFleeEvDiagnostic.decisionTrace;
assert.ok(focusedDecisionTrace.every(trace =>
  trace.productionDecision === trace.decision &&
  trace.productionReason === trace.reason &&
  trace.atkBuff &&
  Number.isFinite(trace.currentDamageEstimate) &&
  Number.isFinite(trace.baseDamageEstimate) &&
  Number.isFinite(trace.staticExpectedTurnsToWin) &&
  Number.isFinite(trace.durationAwareExpectedTurnsToWin) &&
  trace.shadowTerms
));
const focusedNoFiniteAtkTrace = focusedDecisionTrace.find(trace => !trace.atkBuff.active);
assert.ok(focusedNoFiniteAtkTrace);
assert.equal(
  focusedNoFiniteAtkTrace.currentDamageEstimate,
  focusedNoFiniteAtkTrace.baseDamageEstimate,
  "no finite ATK buff keeps current/base damage parity"
);
assert.equal(
  focusedNoFiniteAtkTrace.staticExpectedTurnsToWin,
  focusedNoFiniteAtkTrace.durationAwareExpectedTurnsToWin,
  "no finite ATK buff keeps static/duration-aware ETW parity"
);
assert.equal(focusedNoFiniteAtkTrace.staticToShadowDecisionCrossing.crossed, false);
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

const selectedOpeningExecuted = finalizeB5GuardianDecisionTrace(
  traceDecision({ roundNumber: 1, itemKey: "GUARD_POTION" }),
  { actionObservation: { executed: true }, itemInventoryDelta: 1 }
);
assert.equal(selectedOpeningExecuted.fleeDeferredByOpening, true);
assert.equal(selectedOpeningExecuted.executed, true);
assert.deepEqual(selectedOpeningExecuted.executedAction, selectedOpeningExecuted.actualAction);

const selectedOpeningPreempted = finalizeB5GuardianDecisionTrace(
  traceDecision({ roundNumber: 1, itemKey: "GUARD_POTION" }),
  { actionObservation: { executed: false }, itemInventoryDelta: 0 }
);
assert.equal(selectedOpeningPreempted.fleeDeferredByOpening, true);
assert.equal(selectedOpeningPreempted.executed, false);
assert.equal(selectedOpeningPreempted.executedAction, null);

const selectedSpellExecuted = finalizeB5GuardianDecisionTrace({
  actualAction: { type: "spell", itemKey: null, spellName: "HALITO" }
}, { actionObservation: { executed: true } });
assert.equal(selectedSpellExecuted.executed, true);
assert.deepEqual(selectedSpellExecuted.executedAction, selectedSpellExecuted.actualAction);

const selectedSpellPreempted = finalizeB5GuardianDecisionTrace({
  actualAction: { type: "spell", itemKey: null, spellName: "HALITO" }
}, { actionObservation: { executed: false } });
assert.equal(selectedSpellPreempted.executed, false);
assert.equal(selectedSpellPreempted.executedAction, null);

console.log("[PASS] B5 Guardian first-decision EV observation, invariance, and N=1");
