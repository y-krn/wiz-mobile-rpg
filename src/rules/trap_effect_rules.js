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
  let powerMultiplier = weakened ? FORCE_DAMAGE_MULTIPLIER : 1;
  if (scoutMitigated && (trap?.type === "pitfall" || !weakened)) {
    powerMultiplier *= SCOUT_TRAP_DAMAGE_MULTIPLIER;
  }

  if (trap?.type === "damage") {
    const baseMin = 6 + floor * 2;
    const baseMax = 12 + floor * 4;
    const range = baseMax - baseMin + 1;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      const rawDamage = Math.floor(rng() * range) + baseMin;
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
    const baseMin = floor * 2 + 4;
    const range = 7;
    effect.partyDamage = party.map(char => {
      if (char?.status === "dead") return 0;
      const rawDamage = Math.floor(rng() * range) + baseMin;
      return Math.max(1, Math.floor(rawDamage * powerMultiplier));
    });
  }

  return effect;
}
