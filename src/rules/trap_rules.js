import { getDungeonFloor } from "./dungeons.js";

export const FLOOR_DISARM_CALIBRATION = Object.freeze({
  // Exploration verbs are universal. Difficulty is supplied by the trap (or
  // by the floor fallback below); Build support is the only run-local bonus.
  universalBase: 95,
  difficultyScale: 0.35,
  min: 5,
  max: 95,
  defaultDifficultyPerFloor: 15,
  defaultDifficultyFloorScale: 15
});

export const CHEST_DISARM_BASE_CHANCE = 0.25;

export const FORCE_DAMAGE_MULTIPLIER = 0.5;
export const PARTIAL_SUCCESS_BAND = 15;
export const PITFALL_EDGE_BONUS = 20;
export const DETECT_RATE_CAP = 1;

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

// 解除と強行の期待被害を等しくするsuccessRate。trap_effect_rules.jsの
// partial bandを入力へ反映し、sim側の閾値写経を防ぐ。
export function calculateFloorDisarmEvThreshold({ trapType } = {}) {
  const isPitfall = trapType === "pitfall";
  const partialBand = isPitfall ? 0 : PARTIAL_SUCCESS_BAND;
  const partialMultiplier = FORCE_DAMAGE_MULTIPLIER;
  const fullMultiplier = 1;
  const forcedMultiplier = FORCE_DAMAGE_MULTIPLIER;
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

// 宝箱は「開ける（自動解除）」「キットを使って開ける」「立ち去る」の三択。
// 開けたときの期待損失は自動解除の失敗率×罠の全効果リスク。fullRiskは
// trap_effect_rules.jsの純関数から渡し、呼び出し側で罠効果を再実装しない。
// キットの将来価値は、未来chest数と現在chestの開封損失を1段先の近似として使う。
// 立ち去るかどうかは報酬価値との比較になるため、ここでは判定しない。
export function calculateChestOpenActionEv({
  successRate = 0,
  fullRisk = 1,
  kitCount = 0,
  futureChestCount = 0
} = {}) {
  const chance = clampUnit(successRate);
  const full = Math.max(0, Number(fullRisk) || 0);
  const openExpectedLoss = (1 - chance) * full;
  const kits = Math.max(0, Math.floor(Number(kitCount) || 0));
  const futureChests = Math.max(0, Math.floor(Number(futureChestCount) || 0));
  const kitReservedForFuture = kits > 0 && futureChests > 0 && kits <= futureChests;
  const kitOpportunityCost = kitReservedForFuture ? openExpectedLoss : 0;
  const kitExpectedLoss = kits > 0 ? kitOpportunityCost : Infinity;
  const action = kits > 0 && kitExpectedLoss < openExpectedLoss ? "kit" : "open";

  return {
    action,
    openExpectedLoss,
    kitExpectedLoss,
    kitOpportunityCost,
    kitReservedForFuture
  };
}

// `floor` is the running floor number; difficulty follows the floor inside
// the dungeon (#2060).
function getDefaultFloorDifficulty(floor = 1) {
  const depth = getDungeonFloor(floor);
  return FLOOR_DISARM_CALIBRATION.defaultDifficultyPerFloor +
    depth * FLOOR_DISARM_CALIBRATION.defaultDifficultyFloorScale;
}

function getTrapDifficulty({ trap, floor } = {}) {
  const explicitDifficulty = Number(trap?.difficulty);
  return Number.isFinite(explicitDifficulty) && explicitDifficulty >= 0
    ? explicitDifficulty
    : getDefaultFloorDifficulty(floor);
}

// Level and class are intentionally not accepted inputs. Passing stale fields
// from old callers is harmless, but they cannot affect the run-local result.
export function calculateDisarmRate({ floor = 1, difficulty, affixBonus = 0 } = {}) {
  const normalizedDifficulty = Number.isFinite(Number(difficulty))
    ? Math.max(0, Number(difficulty))
    : getDefaultFloorDifficulty(floor);
  const buildBonus = Number.isFinite(Number(affixBonus)) ? Number(affixBonus) : 0;
  const raw = FLOOR_DISARM_CALIBRATION.universalBase -
    normalizedDifficulty * FLOOR_DISARM_CALIBRATION.difficultyScale +
    buildBonus;
  return Math.round(Math.max(
    FLOOR_DISARM_CALIBRATION.min,
    Math.min(FLOOR_DISARM_CALIBRATION.max, raw)
  ));
}

export function calculateChestDisarmChance({ trapBonus = 0, blind = false } = {}) {
  const buildBonus = Number.isFinite(Number(trapBonus)) ? Math.max(0, Number(trapBonus)) : 0;
  const chance = Math.min(1, CHEST_DISARM_BASE_CHANCE + buildBonus);
  return blind ? chance / 2 : chance;
}

export function calculateFloorTrapSuccessRate({
  trap,
  floor,
  affixBonus = 0
} = {}) {
  const rate = calculateDisarmRate({
    floor,
    difficulty: getTrapDifficulty({ trap, floor }),
    affixBonus
  });
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

// 察知は全員共通。罠がルート選択の障害物である以上、
// 情報を全員へ確定配布し、踏むかどうかをプレイヤーへ戻す。
export function calculateDetectRate() {
  return DETECT_RATE_CAP;
}
