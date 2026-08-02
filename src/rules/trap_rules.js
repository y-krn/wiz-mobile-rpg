const DISARM_APT_CLASSES = new Set(["Thief", "Ninja", "Ranger"]);

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
export const DETECT_RATE_CAP = 0.95;

export const CHEST_WEAKENED_RISK_MULTIPLIER = 0.5;

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
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

// 宝箱の代表的な比較（完全効果1.0 vs 弱体効果0.5）における解除確率閾値。
// gasの期待ダメージ、teleporter、usableの30%破損は別効用のため個別閾値でない。
export function calculateChestDisarmEvThreshold({
  fullRiskMultiplier = 1,
  weakenedRiskMultiplier = CHEST_WEAKENED_RISK_MULTIPLIER
} = {}) {
  const fullRisk = Math.max(0, Number(fullRiskMultiplier));
  const weakenedRisk = Math.max(0, Number(weakenedRiskMultiplier));
  if (fullRisk <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - weakenedRisk / fullRisk));
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

  const base = apt ? 80 : 40;
  const levelGain = apt ? lv * 1.0 : lv * 0.5;
  const depthLoss = (depth - 1) * 2.0;
  const min = apt ? 20 : 5;
  const max = apt ? 90 : 60;

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
// 情報を全員に配らないと選択が成立しない。
export function calculateDetectRate({ floor, scoutBonus = 0 }) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const raw = 0.85 - 0.015 * (depth - 1);
  const base = Math.max(0.6, raw);
  const bonus = Math.max(0, Number(scoutBonus) || 0);
  return Math.round(Math.min(DETECT_RATE_CAP, base + bonus) * 1000) / 1000;
}
