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

export function applyTrapGuardToEffect(
  effect,
  { trapGuardByParty = [], targetIndex = 0 } = {}
) {
  if (!effect) return effect;
  return {
    ...effect,
    targetDamage: reduceTrapDamage(
      effect.targetDamage,
      trapGuardByParty[targetIndex]
    ),
    partyDamage: (effect.partyDamage || []).map((damage, index) =>
      reduceTrapDamage(damage, trapGuardByParty[index])
    )
  };
}

export function resolveChestTrapEffect({
  trap,
  party = [],
  targetIndex = 0,
  poisonWard = 0,
  rng = Math.random
}) {
  const effect = {
    trap,
    targetDamage: 0,
    targetPoisonTriggered: false,
    targetPoisonResisted: false,
    partyDamage: party.map(() => 0),
    partyBlind: party.map(() => false),
    teleported: false
  };

  if (trap === "poison needle") {
    const target = party[targetIndex] || party[0];
    effect.targetDamage = CHEST_POISON_NEEDLE_DAMAGE;
    effect.targetPoisonTriggered = true;
    const hpAfter = Math.max(0, (target?.hp || 0) - effect.targetDamage);
    effect.targetPoisonResisted = hpAfter > 0 && effect.targetPoisonTriggered &&
      poisonWard > 0 && rng() * 100 < poisonWard;
  } else if (trap === "gas bomb") {
    const { min, range } = CHEST_GAS_BOMB_RANGE;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      return Math.floor(rng() * range) + min;
    });
  } else if (trap === "teleporter") {
    effect.teleported = true;
  } else if (trap === "flash bomb") {
    effect.partyBlind = party.map(char =>
      char?.status === "ok" && rng() < CHEST_FLASH_BLIND_CHANCE
    );
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
  party = [],
  targetIndex = 0,
  poisonWard = 0
} = {}) {
  const effect = {
    trap,
    expectedDamageHp: 0,
    poisonProbability: 0,
    blindProbability: 0,
    teleportProbability: 0,
    fatalityProbability: 0,
    partyMaxHp: 0,
    risk: 0
  };
  const living = party.filter(isLivingCharacter);
  effect.partyMaxHp = living.reduce(
    (sum, char) => sum + Math.max(0, Number(char.maxHp) || Number(char.hp) || 0),
    0
  );

  if (trap === "poison needle") {
    const target = party[targetIndex] || party[0];
    if (isLivingCharacter(target)) {
      const damage = CHEST_POISON_NEEDLE_DAMAGE;
      const hpAfter = Math.max(0, target.hp - damage);
      effect.expectedDamageHp = damage;
      effect.poisonProbability = hpAfter > 0
        ? 1 - Math.max(0, Math.min(100, Number(poisonWard) || 0)) / 100
        : 0;
      effect.fatalityProbability = hpAfter <= 0 && living.length === 1 ? 1 : 0;
    }
  } else if (trap === "gas bomb") {
    const { min, range } = CHEST_GAS_BOMB_RANGE;
    const expectedDamage = min + (range - 1) / 2;
    effect.expectedDamageHp = living.length * expectedDamage;
    effect.fatalityProbability = living.reduce(
      (probability, char) => probability * uniformAtLeastProbability(min, range, char.hp),
      living.length > 0 ? 1 : 0
    );
  } else if (trap === "teleporter") {
    effect.teleportProbability = 1;
  } else if (trap === "flash bomb") {
    const eligible = party.filter(char => char?.status === "ok" && isLivingCharacter(char));
    effect.blindProbability = 1 - Math.pow(1 - CHEST_FLASH_BLIND_CHANCE, eligible.length);
  }

  const damageRisk = effect.partyMaxHp > 0
    ? effect.expectedDamageHp / effect.partyMaxHp
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
  party = [],
  weakened = false
} = {}) {
  if (!getFloorTrapDamageRange({ trap, floor })) return party.map(() => 0);

  const powerMultiplier = getFloorTrapPowerMultiplier({
    weakened
  });
  return party.map(char => {
    if (char?.status === "dead") return 0;
    const range = getVictimTrapDamageRange(trap, floor, char);
    const rollCount = range.max - range.min + 1;
    return Array.from(
      { length: rollCount },
      (_, index) => Math.max(1, Math.floor((range.min + index) * powerMultiplier))
    ).reduce((sum, damage) => sum + damage, 0) / rollCount;
  });
}

export function resolveFloorTrapEffect({
  trap,
  floor,
  party = [],
  weakened = false,
  rng = Math.random
}) {
  const effect = {
    type: trap?.type,
    partyDamage: party.map(() => 0),
    partyMpDrain: party.map(() => 0),
    alarm: trap?.type === "alarm",
    alarmWeakened: weakened
  };
  const powerMultiplier = getFloorTrapPowerMultiplier({
    weakened
  });

  if (trap?.type === "damage") {
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      const range = getVictimTrapDamageRange(trap, floor, char);
      const rollCount = range.max - range.min + 1;
      const rawDamage = Math.floor(rng() * rollCount) + range.min;
      return Math.max(1, Math.floor(rawDamage * powerMultiplier));
    });
  } else if (trap?.type === "mpDrain") {
    const baseMin = 1;
    const baseMax = Math.max(2, Math.floor(floor * 1.2));
    const range = baseMax - baseMin + 1;
    effect.partyMpDrain = party.map(char => {
      if (char?.status === "dead" || getCharMaxMp(char) <= 0) return 0;
      const rawDrain = Math.floor(rng() * range) + baseMin;
      return Math.max(1, Math.floor(rawDrain * powerMultiplier));
    });
  } else if (trap?.type === "pitfall") {
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      const range = getVictimTrapDamageRange(trap, floor, char);
      const rollCount = range.max - range.min + 1;
      const rawDamage = Math.floor(rng() * rollCount) + range.min;
      return Math.max(1, Math.floor(rawDamage * powerMultiplier));
    });
  }

  return effect;
}
