export const RECOVERY_BALANCE = Object.freeze({
  startingHealPotions: 4
});

export function getStartingHealPotionCount() {
  return RECOVERY_BALANCE.startingHealPotions;
}
