export const IDENTIFICATION_BALANCE = {
  startingPowder: 2,
  identifyCost: 1,
  chestPowderChance: 0.18,
  baseCurseChance: 0.10,
  curseChancePerFloor: 0.0225,
  maxCurseChance: 0.42,
  baseCurseDetect: 0.9,
  curseDetectDecayPerFloor: 0.05,
  minCurseDetect: 0.4,
  coreCurseBonus: 0.08,
  cursePowerPerFloor: 0.15,
  maxCursePower: 2.5,
  qualityPerFloor: 0.06,
  maxQualityMultiplier: 1.75
};

export function getIdentificationGambleProfile(floor = 1) {
  const depth = Math.max(1, Number(floor) || 1);
  const steps = depth - 1;
  return {
    floor: depth,
    curseChance: Math.min(
      IDENTIFICATION_BALANCE.maxCurseChance,
      IDENTIFICATION_BALANCE.baseCurseChance + steps * IDENTIFICATION_BALANCE.curseChancePerFloor
    ),
    curseDetectChance: Math.max(
      IDENTIFICATION_BALANCE.minCurseDetect,
      IDENTIFICATION_BALANCE.baseCurseDetect - steps * IDENTIFICATION_BALANCE.curseDetectDecayPerFloor
    ),
    cursePower: Math.min(
      IDENTIFICATION_BALANCE.maxCursePower,
      1 + steps * IDENTIFICATION_BALANCE.cursePowerPerFloor
    ),
    qualityMultiplier: Math.min(
      IDENTIFICATION_BALANCE.maxQualityMultiplier,
      1 + steps * IDENTIFICATION_BALANCE.qualityPerFloor
    ),
    epicChance: Math.min(0.20, 0.02 + steps * 0.015),
    rareChance: Math.min(0.45, 0.18 + steps * 0.03)
  };
}

export function getScaledCurseModifier(curse, affixType, cursePower = 1) {
  const value = curse?.mod?.[affixType];
  if (!Number.isFinite(value)) return 0;
  if (value >= 0) return value;
  return Math.round(value * Math.max(1, cursePower || 1));
}

export function isCurseLocked(item) {
  return Boolean(item && typeof item === "object" && item.identified && item.curseEffectId);
}
