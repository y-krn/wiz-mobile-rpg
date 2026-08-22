const DISARM_APT_CLASSES = new Set(["Thief", "Ninja", "Ranger"]);

export const FLOOR_DISARM_CALIBRATION = Object.freeze({
  aptBase: 80,
  nonAptBase: 40,
  aptLevelGain: 1.0,
  nonAptLevelGain: 0.5,
  depthLoss: 2.0,
  aptMin: 20,
  nonAptMin: 5,
  // Probability safety bound: apt trapBonus investment must remain effective.
  aptMax: 100,
  nonAptMax: 60
});

export const CHEST_DISARM_BASE_CHANCE_BY_CLASS = Object.freeze({
  Thief: 0.85,
  Ninja: 0.70,
  Ranger: 0.60,
  default: 0.25
});

export const FORCE_DAMAGE_MULTIPLIER = 0.5;
export const PARTIAL_SUCCESS_BAND = 15;
export const PITFALL_EDGE_BONUS = 20;
export const SCOUT_TRAP_DAMAGE_MULTIPLIER = 0.7;
export const DETECT_RATE_CAP = 1;

export const CHEST_WEAKENED_RISK_MULTIPLIER = 0.5;

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

// 解除と強行の期待被害を等しくするsuccessRate。trap_effect_rules.jsの
// scout条件とpartial bandを入力へ反映し、sim側の閾値写経を防ぐ。
export function calculateFloorDisarmEvThreshold({
  trapType,
  scoutMitigated = false
} = {}) {
  const isPitfall = trapType === "pitfall";
  const partialBand = isPitfall ? 0 : PARTIAL_SUCCESS_BAND;
  const partialMultiplier = FORCE_DAMAGE_MULTIPLIER;
  const fullMultiplier = scoutMitigated ? SCOUT_TRAP_DAMAGE_MULTIPLIER : 1;
  const forcedMultiplier = FORCE_DAMAGE_MULTIPLIER *
    (scoutMitigated && isPitfall ? SCOUT_TRAP_DAMAGE_MULTIPLIER : 1);
  if (fullMultiplier <= 0) return 100;
  const threshold = 100 - partialBand - (
    100 * forcedMultiplier - partialBand * partialMultiplier
  ) / fullMultiplier;
  return clampPercent(threshold);
}

// 解除/強行の期待被害。解除成功率とpartial bandから導出し、
// sim側で罠ダメージ式を再実装しない。
export function calculateFloorTrapActionExpectedDamage({
  action,
  trapType,
  successRate = 0,
  fullDamage = 0,
  weakenedDamage = 0
} = {}) {
  const full = Math.max(0, Number(fullDamage) || 0);
  const weakened = Math.max(0, Number(weakenedDamage) || 0);
  if (action === "force") return weakened;
  if (action !== "disarm") return full;

  const success = clampPercent(Number(successRate) || 0) / 100;
  const partial = trapType === "pitfall"
    ? 0
    : Math.min(PARTIAL_SUCCESS_BAND, 100 - success * 100) / 100;
  const fullFailure = Math.max(0, 1 - success - partial);
  return partial * weakened + fullFailure * full;
}

// 迂回追加歩数を遭遇確率へ変換し、罠の直接対応と期待被害を比較する。
// expectedDamagePerEncounter=null は測定値不足。保守的に回避しない。
export function calculateFloorTrapAvoidanceEv({
  encounterChances = [],
  expectedDamagePerEncounter = null,
  directExpectedDamage = 0
} = {}) {
  const expectedEncounters = encounterChances.reduce(
    (sum, chance) => sum + Math.max(0, Number(chance) || 0),
    0
  );
  const directDamage = Math.max(0, Number(directExpectedDamage) || 0);
  const parsedCombatDamage = Number(expectedDamagePerEncounter);
  const hasCombatDamageEstimate = expectedDamagePerEncounter !== null &&
    expectedDamagePerEncounter !== undefined &&
    Number.isFinite(parsedCombatDamage) &&
    parsedCombatDamage >= 0;
  const expectedEncounterDamage = hasCombatDamageEstimate
    ? expectedEncounters * parsedCombatDamage
    : null;

  return {
    expectedEncounters,
    expectedEncounterDamage,
    directExpectedDamage: directDamage,
    hasCombatDamageEstimate,
    shouldAvoid: hasCombatDamageEstimate && expectedEncounterDamage < directDamage
  };
}

// 宝箱の代表的な比較（完全効果1.0 vs 弱体効果0.5）における解除確率閾値。
// gasの期待ダメージ、teleporter、smash報酬破損は別効用のため個別閾値でない。
export function calculateChestDisarmEvThreshold({
  fullRiskMultiplier = 1,
  weakenedRiskMultiplier = CHEST_WEAKENED_RISK_MULTIPLIER,
  contentValue = 0,
  forcedContentLossRate = 0
} = {}) {
  const fullRisk = Math.max(0, Number(fullRiskMultiplier));
  const weakenedRisk = Math.max(0, Number(weakenedRiskMultiplier));
  const contentLoss = Math.max(0, Number(contentValue) || 0) *
    clampUnit(forcedContentLossRate);
  if (fullRisk <= 0) return 0;
  return clampUnit(1 - (weakenedRisk + contentLoss) / fullRisk);
}

// 宝箱のdirect/force/kitを同一の近似リスク単位で比較する。
// fullRisk/weakenedRiskはtrap_effect_rules.jsの純関数から渡す。item品質、状態異常時間、
// teleporterの追加歩数を素材やHPへ換算する共通ルールはないため、呼び出し側で数字を作らない。
// kitの将来価値は、未来chest数と現在chestの最良non-kit損失を1段先の近似として使う。
export function calculateChestDisarmActionEv({
  successRate = 0,
  fullRisk = 1,
  weakenedRisk = CHEST_WEAKENED_RISK_MULTIPLIER,
  contentValue = 0,
  forcedContentLossRate = 0,
  kitCount = 0,
  futureChestCount = 0
} = {}) {
  const chance = clampUnit(successRate);
  const full = Math.max(0, Number(fullRisk) || 0);
  const weakened = Math.max(0, Number(weakenedRisk) || 0);
  const content = Math.max(0, Number(contentValue) || 0);
  const contentLoss = content * clampUnit(forcedContentLossRate);
  const directExpectedLoss = (1 - chance) * full;
  const forceExpectedLoss = weakened + contentLoss;
  const nonKitAction = directExpectedLoss <= forceExpectedLoss ? "direct" : "force";
  const nonKitExpectedLoss = Math.min(directExpectedLoss, forceExpectedLoss);
  const kits = Math.max(0, Math.floor(Number(kitCount) || 0));
  const futureChests = Math.max(0, Math.floor(Number(futureChestCount) || 0));
  const kitReservedForFuture = kits > 0 && futureChests > 0 && kits <= futureChests;
  const kitOpportunityCost = kitReservedForFuture ? nonKitExpectedLoss : 0;
  const kitExpectedLoss = kits > 0 ? kitOpportunityCost : Infinity;
  const action = kits > 0 && kitExpectedLoss < nonKitExpectedLoss
    ? "kit"
    : nonKitAction;

  return {
    action,
    nonKitAction,
    threshold: calculateChestDisarmEvThreshold({
      fullRiskMultiplier: full,
      weakenedRiskMultiplier: weakened,
      contentValue: content,
      forcedContentLossRate
    }),
    directExpectedLoss,
    forceExpectedLoss,
    nonKitExpectedLoss,
    kitExpectedLoss,
    kitOpportunityCost,
    kitReservedForFuture
  };
}

export function isDisarmAptClass(className) {
  return DISARM_APT_CLASSES.has(className);
}

// 解除率はクラス適性で二極化する。適性は深層でも主軸として機能し、
// 非適性は浅層の安いギャンブルに留めて強行と回り込みへ寄せる。
export function calculateDisarmRate({ className, level, floor, affixBonus = 0 }) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const apt = isDisarmAptClass(className);

  const base = apt
    ? FLOOR_DISARM_CALIBRATION.aptBase
    : FLOOR_DISARM_CALIBRATION.nonAptBase;
  const levelGain = apt
    ? lv * FLOOR_DISARM_CALIBRATION.aptLevelGain
    : lv * FLOOR_DISARM_CALIBRATION.nonAptLevelGain;
  const depthLoss = (depth - 1) * FLOOR_DISARM_CALIBRATION.depthLoss;
  const min = apt
    ? FLOOR_DISARM_CALIBRATION.aptMin
    : FLOOR_DISARM_CALIBRATION.nonAptMin;
  const max = apt
    ? FLOOR_DISARM_CALIBRATION.aptMax
    : FLOOR_DISARM_CALIBRATION.nonAptMax;

  const raw = base + levelGain - depthLoss + affixBonus;
  return Math.round(Math.max(min, Math.min(max, raw)));
}

export function calculateChestDisarmChance({ className, trapBonus = 0, blind = false }) {
  const base = CHEST_DISARM_BASE_CHANCE_BY_CLASS[className] ||
    CHEST_DISARM_BASE_CHANCE_BY_CLASS.default;
  const chance = base + trapBonus;
  return blind ? chance / 2 : chance;
}

export function calculateFloorTrapSuccessRate({
  trap,
  className,
  level,
  floor,
  affixBonus = 0
}) {
  const rate = calculateDisarmRate({ className, level, floor, affixBonus });
  return trap?.type === "pitfall" ? Math.min(100, rate + PITFALL_EDGE_BONUS) : rate;
}

export function resolveTrapAction({ action, trap, successRate, rng = Math.random }) {
  if (action === "force") {
    return { outcome: "triggered", partialSuccess: true };
  }
  if (action !== "disarm") {
    return { outcome: "avoided", partialSuccess: false };
  }

  const roll = rng() * 100;
  if (roll < successRate) {
    return { outcome: "disarmed", partialSuccess: false };
  }
  if (trap?.type !== "pitfall" && roll < successRate + PARTIAL_SUCCESS_BAND) {
    return { outcome: "triggered", partialSuccess: true };
  }
  return { outcome: "triggered", partialSuccess: false };
}

// 察知はクラス非依存。罠がルート選択の障害物である以上、
// 情報を全員へ確定配布し、踏むかどうかをプレイヤーへ戻す。
export function calculateDetectRate() {
  return DETECT_RATE_CAP;
}
