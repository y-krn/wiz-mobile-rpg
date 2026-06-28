export const getSpellStatBonus = (stat) => {
  return 1.0 + Math.min(0.40, Math.max(0, (stat - 10) * 0.02));
};
