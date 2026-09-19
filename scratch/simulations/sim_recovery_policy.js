// sim-scope: infra

import { recordRuntimeCall } from "../../src/runtime_diagnostics.js";

// Simulation-only combat policy helper. The game action loop does not call this.
function evaluateCombatRecoveryActionInternal({
  currentHp,
  maxHp,
  enemyHp = [],
  enemyAttack = [],
  playerDefense = 0,
  playerDamagePerRound = 1,
  potionHeal = 0,
  diosHeal = 0,
  potionAvailable = false,
  diosAvailable = false,
  fleeThreshold = 0.20,
  healThreshold = 0.55,
}, includeTerms) {
  const normalizedMaxHp = Math.max(1, Number(maxHp) || 0);
  const normalizedHp = Math.max(0, Number(currentHp) || 0);
  const normalizedDefense = Math.max(0, Number(playerDefense) || 0);
  const normalizedEnemyAttack = enemyAttack.map(attack => Number(attack) || 0);
  const incomingDamagePerRound = Math.max(
    1,
    enemyAttack.reduce(
      (sum, attack) => sum + Math.max(1, (Number(attack) || 0) - normalizedDefense),
      0
    )
  );
  const totalEnemyHp = enemyHp.reduce((sum, hp) => sum + Math.max(0, Number(hp) || 0), 0);
  const playerDamage = Math.max(1, Number(playerDamagePerRound) || 0);
  const expectedTurnsToWin = Math.max(1, Math.ceil(totalEnemyHp / playerDamage));
  const survivalTurns = Math.floor(Math.max(0, normalizedHp - 1) / incomingDamagePerRound);
  const maxRecovery = Math.max(
    potionAvailable ? Number(potionHeal) || 0 : 0,
    diosAvailable ? Number(diosHeal) || 0 : 0
  );
  const recoveryHp = Math.min(normalizedMaxHp, normalizedHp + maxRecovery);
  const recoverySurvivalTurns = Math.floor(
    Math.max(0, recoveryHp - 1) / incomingDamagePerRound
  );
  const normalizedHealThreshold = Math.max(0, Math.min(1, Number(healThreshold)));
  const normalizedFleeThreshold = Math.max(0, Math.min(1, Number(fleeThreshold)));
  const hpRate = normalizedHp / normalizedMaxHp;
  const hpBelowHealThreshold = normalizedHp <= normalizedMaxHp * normalizedHealThreshold;
  const hpBelowFleeThreshold = normalizedHp <= normalizedMaxHp * normalizedFleeThreshold;
  const terms = includeTerms
    ? {
        currentHp: normalizedHp,
        maxHp: normalizedMaxHp,
        hpRate,
        totalEnemyHp,
        enemyAttack: normalizedEnemyAttack,
        playerDefense: normalizedDefense,
        incomingDamagePerRound,
        playerDamagePerRound: playerDamage,
        expectedTurnsToWin,
        survivalTurns,
        maxRecovery,
        recoveryHp,
        recoverySurvivalTurns,
        healThreshold: normalizedHealThreshold,
        fleeThreshold: normalizedFleeThreshold,
        hpBelowHealThreshold,
        hpBelowFleeThreshold,
        turnDeficit: expectedTurnsToWin - survivalTurns
      }
    : undefined;

  if (expectedTurnsToWin <= survivalTurns) {
    return { decision: "fight", reason: "fight-current-survival", terms };
  }
  if (
    hpBelowHealThreshold &&
    maxRecovery > 0 &&
    expectedTurnsToWin <= recoverySurvivalTurns
  ) {
    return { decision: "recover", reason: "recover-then-survive", terms };
  }
  if (
    expectedTurnsToWin > recoverySurvivalTurns &&
    hpBelowFleeThreshold
  ) {
    return {
      decision: "flee",
      reason: "flee-low-hp-recovery-insufficient",
      terms
    };
  }
  return {
    decision: expectedTurnsToWin > survivalTurns ? "flee" : "fight",
    reason: "flee-survival-deficit",
    terms
  };
}

export function evaluateCombatRecoveryAction(args) {
  return evaluateCombatRecoveryActionInternal(args, true);
}

export function calculateCombatRecoveryAction(args) {
  recordRuntimeCall(args.runtimeDiagnostics, "recovery.combat-policy");
  return evaluateCombatRecoveryActionInternal(args, false).decision;
}
