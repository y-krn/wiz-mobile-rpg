import {
  FORCE_DAMAGE_MULTIPLIER,
  SCOUT_TRAP_DAMAGE_MULTIPLIER
} from "./trap_rules.js";

export function hasTrapScout(party = []) {
  return party.some(char => ["Thief", "Ninja"].includes(char?.class) && char?.hp > 0);
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
    effect.targetDamage = weakened ? 6 : 12;
    effect.targetPoisonTriggered = !weakened || rng() < 0.50;
    const hpAfter = Math.max(0, (target?.hp || 0) - effect.targetDamage);
    effect.targetPoisonResisted = hpAfter > 0 && effect.targetPoisonTriggered &&
      poisonWard > 0 && rng() * 100 < poisonWard;
  } else if (trap === "gas bomb") {
    const min = weakened ? 2 : 5;
    const range = weakened ? 5 : 8;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      return Math.floor(rng() * range) + min;
    });
  } else if (trap === "teleporter") {
    if (weakened && rng() < 0.50) {
      effect.teleporterFailed = true;
    } else {
      effect.teleported = true;
    }
  } else if (trap === "flash bomb") {
    const blindChance = weakened ? 0.30 : 0.60;
    effect.partyBlind = party.map(char =>
      char?.status === "ok" && rng() < blindChance
    );
  }

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

function getFloorTrapPowerMultiplier({ trapType, party, weakened }) {
  let powerMultiplier = weakened ? FORCE_DAMAGE_MULTIPLIER : 1;
  if (hasTrapScout(party) && (trapType === "pitfall" || !weakened)) {
    powerMultiplier *= SCOUT_TRAP_DAMAGE_MULTIPLIER;
  }
  return powerMultiplier;
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
    trapType: trap.type,
    party,
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
  const scoutMitigated = hasTrapScout(party);
  const effect = {
    type: trap?.type,
    partyDamage: party.map(() => 0),
    partyMpDrain: party.map(() => 0),
    alarm: trap?.type === "alarm",
    alarmWeakened: weakened,
    scoutMitigated
  };
  const powerMultiplier = getFloorTrapPowerMultiplier({
    trapType: trap?.type,
    party,
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
      if (char?.status === "dead" || char?.maxMp <= 0) return 0;
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
