import { recordRuntimeCall } from "../runtime_diagnostics.js";

export const RECOVERY_BALANCE = Object.freeze({
  startingHealPotions: 0
});

export function getStartingHealPotionCount() {
  return RECOVERY_BALANCE.startingHealPotions;
}

// Simulation-only combat policy helper. The game action loop does not call this.
export function calculateCombatRecoveryAction({
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
  runtimeDiagnostics = null
}) {
  recordRuntimeCall(runtimeDiagnostics, "recovery.combat-policy");
  const normalizedMaxHp = Math.max(1, Number(maxHp) || 0);
  const normalizedHp = Math.max(0, Number(currentHp) || 0);
  const normalizedDefense = Math.max(0, Number(playerDefense) || 0);
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

  if (expectedTurnsToWin <= survivalTurns) return "fight";
  if (
    normalizedHp <= normalizedMaxHp * Math.max(0, Math.min(1, Number(healThreshold))) &&
    maxRecovery > 0 &&
    expectedTurnsToWin <= recoverySurvivalTurns
  ) return "recover";

  const normalizedFleeThreshold = Math.max(0, Math.min(1, Number(fleeThreshold)));
  if (
    expectedTurnsToWin > recoverySurvivalTurns &&
    normalizedHp <= normalizedMaxHp * normalizedFleeThreshold
  ) return "flee";
  return expectedTurnsToWin > survivalTurns ? "flee" : "fight";
}
