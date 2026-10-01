import { FORCE_DAMAGE_MULTIPLIER } from "./trap_rules.js";
import { getCharMaxHp, getCharMaxMp } from "./character_stats.js";

// Chest traps resolve at full strength only: a chest is either disarmed
// automatically on opening, disarmed with a kit, or its trap fires.
const CHEST_POISON_NEEDLE_DAMAGE = 12;
const CHEST_GAS_BOMB_RANGE = Object.freeze({ min: 5, range: 8 });
const CHEST_FLASH_BLIND_CHANCE = 0.60;
export const B5_FLAME_TRAP_DAMAGE_PROFILE = "b5-flame";
const FLOOR_TRAP_DAMAGE_PROFILES = Object.freeze({
  [B5_FLAME_TRAP_DAMAGE_PROFILE]: Object.freeze({ min: 8, max: 16 })
});

function reduceTrapDamage(damage, trapGuard = 0) {
  const numericGuard = Number(trapGuard);
  if (!Number.isFinite(numericGuard) || numericGuard <= 0 || damage <= 0) return damage;
  const reduction = Math.max(0, Math.min(100, numericGuard)) / 100;
  return Math.max(1, Math.round(damage * (1 - reduction)));
}

// The game is solo: every trap effect targets the one character. trapGuard
// only reduces HP damage; status, MP, teleport, and alarm are unchanged.
export function applyTrapGuardToEffect(effect, { trapGuard = 0 } = {}) {
  if (!effect) return effect;
  return {
    ...effect,
    damage: reduceTrapDamage(effect.damage, trapGuard)
  };
}

export function resolveChestTrapEffect({
  trap,
  character = null,
  poisonWard = 0,
  rng = Math.random
}) {
  const effect = {
    trap,
    damage: 0,
    poisonTriggered: false,
    poisonResisted: false,
    blinded: false,
    teleported: false
  };

  if (trap === "poison needle") {
    effect.damage = CHEST_POISON_NEEDLE_DAMAGE;
    effect.poisonTriggered = true;
    const hpAfter = Math.max(0, (character?.hp || 0) - effect.damage);
    effect.poisonResisted = hpAfter > 0 && poisonWard > 0 && rng() * 100 < poisonWard;
  } else if (trap === "gas bomb") {
    const { min, range } = CHEST_GAS_BOMB_RANGE;
    if (character && character.status !== "dead") {
      effect.damage = Math.floor(rng() * range) + min;
    }
  } else if (trap === "teleporter") {
    effect.teleported = true;
  } else if (trap === "flash bomb") {
    effect.blinded = character?.status === "ok" && rng() < CHEST_FLASH_BLIND_CHANCE;
  }

  return effect;
}

function isLivingCharacter(char) {
  return char?.status !== "dead" && Number(char?.hp) > 0;
}

function uniformAtLeastProbability(min, range, hp) {
  const max = min + range - 1;
  if (hp <= min) return 1;
  if (hp > max) return 0;
  return (max - hp + 1) / range;
}

// 宝箱罠効果を乱数消費なしで期待値化する。riskは異種効果を共通通貨へ
// 換算できないため、HP割合・致死・各状態/転送確率の最大成分を採用する保守近似。
export function calculateChestTrapExpectedRisk({
  trap,
  character = null,
  poisonWard = 0
} = {}) {
  const effect = {
    trap,
    expectedDamageHp: 0,
    poisonProbability: 0,
    blindProbability: 0,
    teleportProbability: 0,
    fatalityProbability: 0,
    maxHp: 0,
    risk: 0
  };
  const alive = isLivingCharacter(character);
  if (alive) {
    effect.maxHp = Math.max(0, Number(character.maxHp) || Number(character.hp) || 0);
  }

  if (trap === "poison needle") {
    if (alive) {
      const damage = CHEST_POISON_NEEDLE_DAMAGE;
      const hpAfter = Math.max(0, character.hp - damage);
      effect.expectedDamageHp = damage;
      effect.poisonProbability = hpAfter > 0
        ? 1 - Math.max(0, Math.min(100, Number(poisonWard) || 0)) / 100
        : 0;
      effect.fatalityProbability = hpAfter <= 0 ? 1 : 0;
    }
  } else if (trap === "gas bomb") {
    if (alive) {
      const { min, range } = CHEST_GAS_BOMB_RANGE;
      effect.expectedDamageHp = min + (range - 1) / 2;
      effect.fatalityProbability = uniformAtLeastProbability(min, range, character.hp);
    }
  } else if (trap === "teleporter") {
    effect.teleportProbability = 1;
  } else if (trap === "flash bomb") {
    effect.blindProbability = alive && character.status === "ok" ? CHEST_FLASH_BLIND_CHANCE : 0;
  }

  const damageRisk = effect.maxHp > 0
    ? effect.expectedDamageHp / effect.maxHp
    : 0;
  effect.risk = Math.min(1, Math.max(
    damageRisk,
    effect.poisonProbability,
    effect.blindProbability,
    effect.teleportProbability,
    effect.fatalityProbability
  ));
  return effect;
}

// Solo HP budget: generic floor traps scale with the victim's max HP so a
// B1 trap and a B25 trap cost a comparable share of the run's HP. The legacy
// floor-linear ranges were authored for a party and exceeded a solo
// character's whole HP pool from mid depth onward.
const FLOOR_TRAP_MAX_HP_SHARE = Object.freeze({
  damage: Object.freeze({ min: 0.12, max: 0.25 }),
  pitfall: Object.freeze({ min: 0.08, max: 0.16 })
});

export function getFloorTrapDamageRange({ trap, floor, maxHp } = {}) {
  const profile = FLOOR_TRAP_DAMAGE_PROFILES[trap?.damageProfile];
  if (profile) return profile;

  const trapType = trap?.type;
  const share = FLOOR_TRAP_MAX_HP_SHARE[trapType];
  const hp = Number(maxHp);
  if (share && Number.isFinite(hp) && hp > 0) {
    const min = Math.max(1, Math.round(hp * share.min));
    return { min, max: Math.max(min, Math.round(hp * share.max)) };
  }
  if (trapType === "damage") {
    return { min: 6 + floor * 2, max: 12 + floor * 4 };
  }
  if (trapType === "pitfall") {
    return { min: floor * 2 + 4, max: floor * 2 + 10 };
  }
  return null;
}

function getVictimTrapDamageRange(trap, floor, char) {
  const maxHp = char ? getCharMaxHp(char) : undefined;
  return getFloorTrapDamageRange({ trap, floor, maxHp });
}

function getFloorTrapPowerMultiplier({ weakened }) {
  return weakened ? FORCE_DAMAGE_MULTIPLIER : 1;
}

// resolveFloorTrapEffectと同じ乱数域を全結果で平均し、期待被害だけ返す。
// 期待値判定から乱数を消費しないため、simの本筋と乱数列を分離する。
export function calculateFloorTrapExpectedDamage({
  trap,
  floor,
  character = null,
  weakened = false
} = {}) {
  if (!getFloorTrapDamageRange({ trap, floor })) return 0;
  if (!character || character.status === "dead") return 0;

  const powerMultiplier = getFloorTrapPowerMultiplier({ weakened });
  const range = getVictimTrapDamageRange(trap, floor, character);
  const rollCount = range.max - range.min + 1;
  return Array.from(
    { length: rollCount },
    (_, index) => Math.max(1, Math.floor((range.min + index) * powerMultiplier))
  ).reduce((sum, damage) => sum + damage, 0) / rollCount;
}

export function resolveFloorTrapEffect({
  trap,
  floor,
  character = null,
  weakened = false,
  rng = Math.random
}) {
  const effect = {
    type: trap?.type,
    damage: 0,
    mpDrain: 0,
    alarm: trap?.type === "alarm",
    alarmWeakened: weakened
  };
  const powerMultiplier = getFloorTrapPowerMultiplier({ weakened });
  const alive = Boolean(character) && character.status !== "dead";

  if ((trap?.type === "damage" || trap?.type === "pitfall") && alive) {
    const range = getVictimTrapDamageRange(trap, floor, character);
    const rollCount = range.max - range.min + 1;
    const rawDamage = Math.floor(rng() * rollCount) + range.min;
    effect.damage = Math.max(1, Math.floor(rawDamage * powerMultiplier));
  } else if (trap?.type === "mpDrain" && alive && getCharMaxMp(character) > 0) {
    const baseMin = 1;
    const baseMax = Math.max(2, Math.floor(floor * 1.2));
    const range = baseMax - baseMin + 1;
    const rawDrain = Math.floor(rng() * range) + baseMin;
    effect.mpDrain = Math.max(1, Math.floor(rawDrain * powerMultiplier));
  }

  return effect;
}
