import { FORCE_DAMAGE_MULTIPLIER } from "./trap_rules.js";
import { getCharMaxMp } from "./character_stats.js";

const CHEST_POISON_NEEDLE_DAMAGE = Object.freeze({ full: 12, weakened: 6 });
const CHEST_GAS_BOMB_RANGE = Object.freeze({
  full: Object.freeze({ min: 5, range: 8 }),
  weakened: Object.freeze({ min: 2, range: 5 })
});
const CHEST_POISON_WEAKENED_TRIGGER_CHANCE = 0.50;
const CHEST_TELEPORTER_WEAKENED_FAILURE_CHANCE = 0.50;
const CHEST_FLASH_BLIND_CHANCE = Object.freeze({ full: 0.60, weakened: 0.30 });

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
  weakened = false,
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
    teleported: false,
    teleporterFailed: false
  };

  if (trap === "poison needle") {
    const target = party[targetIndex] || party[0];
    effect.targetDamage = CHEST_POISON_NEEDLE_DAMAGE[weakened ? "weakened" : "full"];
    effect.targetPoisonTriggered = !weakened ||
      rng() < CHEST_POISON_WEAKENED_TRIGGER_CHANCE;
    const hpAfter = Math.max(0, (target?.hp || 0) - effect.targetDamage);
    effect.targetPoisonResisted = hpAfter > 0 && effect.targetPoisonTriggered &&
      poisonWard > 0 && rng() * 100 < poisonWard;
  } else if (trap === "gas bomb") {
    const rangeData = CHEST_GAS_BOMB_RANGE[weakened ? "weakened" : "full"];
    const { min, range } = rangeData;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      return Math.floor(rng() * range) + min;
    });
  } else if (trap === "teleporter") {
    if (weakened && rng() < CHEST_TELEPORTER_WEAKENED_FAILURE_CHANCE) {
      effect.teleporterFailed = true;
    } else {
      effect.teleported = true;
    }
  } else if (trap === "flash bomb") {
    const blindChance = CHEST_FLASH_BLIND_CHANCE[weakened ? "weakened" : "full"];
    effect.partyBlind = party.map(char =>
      char?.status === "ok" && rng() < blindChance
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
  weakened = false,
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
      const damage = CHEST_POISON_NEEDLE_DAMAGE[weakened ? "weakened" : "full"];
      const hpAfter = Math.max(0, target.hp - damage);
      effect.expectedDamageHp = damage;
      effect.poisonProbability = hpAfter > 0
        ? (weakened ? CHEST_POISON_WEAKENED_TRIGGER_CHANCE : 1) *
          (1 - Math.max(0, Math.min(100, Number(poisonWard) || 0)) / 100)
        : 0;
      effect.fatalityProbability = hpAfter <= 0 && living.length === 1 ? 1 : 0;
    }
  } else if (trap === "gas bomb") {
    const { min, range } = CHEST_GAS_BOMB_RANGE[weakened ? "weakened" : "full"];
    const expectedDamage = min + (range - 1) / 2;
    effect.expectedDamageHp = living.length * expectedDamage;
    effect.fatalityProbability = living.reduce(
      (probability, char) => probability * uniformAtLeastProbability(min, range, char.hp),
      living.length > 0 ? 1 : 0
    );
  } else if (trap === "teleporter") {
    effect.teleportProbability = weakened
      ? 1 - CHEST_TELEPORTER_WEAKENED_FAILURE_CHANCE
      : 1;
  } else if (trap === "flash bomb") {
    const eligible = party.filter(char => char?.status === "ok" && isLivingCharacter(char));
    const blindChance = CHEST_FLASH_BLIND_CHANCE[weakened ? "weakened" : "full"];
    effect.blindProbability = 1 - Math.pow(1 - blindChance, eligible.length);
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

function getFloorTrapDamageRange(trapType, floor) {
  if (trapType === "damage") {
    return { min: 6 + floor * 2, max: 12 + floor * 4 };
  }
  if (trapType === "pitfall") {
    return { min: floor * 2 + 4, max: floor * 2 + 10 };
  }
  return null;
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
  const range = getFloorTrapDamageRange(trap?.type, floor);
  if (!range) return party.map(() => 0);

  const powerMultiplier = getFloorTrapPowerMultiplier({
    weakened
  });
  const rollCount = range.max - range.min + 1;
  const expectedDamage = Array.from(
    { length: rollCount },
    (_, index) => Math.max(1, Math.floor((range.min + index) * powerMultiplier))
  ).reduce((sum, damage) => sum + damage, 0) / rollCount;

  return party.map(char => char?.status === "dead" ? 0 : expectedDamage);
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
    const range = getFloorTrapDamageRange(trap.type, floor);
    const rollCount = range.max - range.min + 1;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
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
    const range = getFloorTrapDamageRange(trap.type, floor);
    const rollCount = range.max - range.min + 1;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      const rawDamage = Math.floor(rng() * rollCount) + range.min;
      return Math.max(1, Math.floor(rawDamage * powerMultiplier));
    });
  }

  return effect;
}
