export const RECOVERY_BALANCE = Object.freeze({
  startingHealPotions: 3
});

export function getStartingHealPotionCount() {
  return RECOVERY_BALANCE.startingHealPotions;
}
