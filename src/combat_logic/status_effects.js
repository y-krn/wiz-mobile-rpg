export const STATUS_EFFECT_IDS = Object.freeze({
  POISONED: "poisoned",
  BLIND: "blind",
  SLEEP: "sleep",
  PARALYZED: "paralyzed",
  SILENCE: "silence",
  BLEEDING: "bleeding"
});

// Bleeding is a combat-only, non-legacy effect.  A successful reapplication
// refreshes the timer and never adds stacks.
export const BLEEDING_DURATION_TURNS = 3;
export const BLEEDING_PAYOFF_DAMAGE_CANDIDATES = Object.freeze([1, 2, 3]);
export const BLEEDING_PAYOFF_DAMAGE = 1;

// Exploration poison is intentionally separate from combat-round poison.
// Combat poison remains a legacy status until the character next takes an
// exploration step, where the finite exploration window is initialized.
export const EXPLORATION_POISON_DAMAGE_CHANCE = 0.30;
export const EXPLORATION_POISON_DURATION_MIN = 7;
export const EXPLORATION_POISON_DURATION_MAX = 12;
// Retained for simulation and save-compatibility consumers that use the old
// nominal duration as an explicit scenario override. Gameplay no longer uses
// this value as the poison duration.
export const EXPLORATION_POISON_DURATION_STEPS = 10;
export const EXPLORATION_POISON_DAMAGE_MIN = 1;
export const EXPLORATION_POISON_DAMAGE_MAX = 2;

export function rollExplorationPoisonDuration(rng = Math.random) {
  const roll = Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
  return EXPLORATION_POISON_DURATION_MIN
    + Math.floor(roll * (EXPLORATION_POISON_DURATION_MAX - EXPLORATION_POISON_DURATION_MIN + 1));
}

const LEGACY_STATUS_IDS = new Set([
  STATUS_EFFECT_IDS.POISONED,
  STATUS_EFFECT_IDS.BLIND,
  STATUS_EFFECT_IDS.SLEEP,
  STATUS_EFFECT_IDS.PARALYZED
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRemainingTurns(value) {
  if (value === null || value === undefined) return null;
  const turns = Number(value);
  return Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : null;
}

function normalizeStacks(value) {
  const stacks = Number(value);
  return Number.isFinite(stacks) ? Math.max(1, Math.floor(stacks)) : 1;
}

function createCanonicalEffect(id, effect = {}) {
  return {
    id,
    remainingTurns: normalizeRemainingTurns(effect.remainingTurns),
    stacks: normalizeStacks(effect.stacks),
    source: typeof effect.source === "string" ? effect.source : null
  };
}

export function normalizeStatusEffects(statusEffects) {
  if (!isRecord(statusEffects)) return {};
  return Object.fromEntries(
    Object.entries(statusEffects)
      .filter(([id, effect]) => typeof id === "string" && id.length > 0 && isRecord(effect))
      .map(([id, effect]) => [id, createCanonicalEffect(id, effect)])
  );
}

function legacyStatusId(status) {
  if (status === "paralyze") return STATUS_EFFECT_IDS.PARALYZED;
  return LEGACY_STATUS_IDS.has(status) ? status : null;
}

function isLegacyStatusActive(target, id) {
  return legacyStatusId(target?.status) === id;
}

function setLegacyEffect(target, effects, id, remainingTurns = null, source = null) {
  effects[id] = createCanonicalEffect(id, {
    remainingTurns,
    source: source ?? effects[id]?.source
  });
}

/**
 * Keep the additive model in sync with the existing string/duration fields.
 * The legacy fields remain authoritative at this boundary; this function does
 * not change their values or introduce new gameplay semantics.
 */
export function normalizeStatusEffectTarget(target) {
  if (!isRecord(target)) return target;

  const effects = normalizeStatusEffects(target.statusEffects);
  const legacySources = Object.fromEntries(
    [...LEGACY_STATUS_IDS, STATUS_EFFECT_IDS.SILENCE]
      .map(id => [id, effects[id]?.source ?? null])
  );
  const legacyPoisonRemainingTurns = effects[STATUS_EFFECT_IDS.POISONED]?.remainingTurns ?? null;
  [...LEGACY_STATUS_IDS, STATUS_EFFECT_IDS.SILENCE].forEach(id => {
    delete effects[id];
  });
  const statusId = legacyStatusId(target.status);
  if (statusId) {
    const remainingTurns = statusId === STATUS_EFFECT_IDS.POISONED
      ? legacyPoisonRemainingTurns
      : statusId === STATUS_EFFECT_IDS.SLEEP
        ? normalizeRemainingTurns(target.sleepTurns)
        : statusId === STATUS_EFFECT_IDS.PARALYZED
          ? normalizeRemainingTurns(target.paralyzeTurns)
          : null;
    setLegacyEffect(target, effects, statusId, remainingTurns, legacySources[statusId]);
  }
  if (Number(target.silenceTurns) > 0) {
    setLegacyEffect(
      target,
      effects,
      STATUS_EFFECT_IDS.SILENCE,
      target.silenceTurns,
      legacySources[STATUS_EFFECT_IDS.SILENCE]
    );
  }
  target.statusEffects = effects;
  return target;
}

export function hasStatusEffect(target, id) {
  if (!target || typeof id !== "string") return false;
  normalizeStatusEffectTarget(target);
  if (id === STATUS_EFFECT_IDS.SILENCE) return Number(target.silenceTurns) > 0;
  return isLegacyStatusActive(target, id) || Object.hasOwn(target.statusEffects, id);
}

export function hasLegacyStatusEffect(target) {
  if (!target) return false;
  return [
    STATUS_EFFECT_IDS.POISONED,
    STATUS_EFFECT_IDS.BLIND,
    STATUS_EFFECT_IDS.SLEEP,
    STATUS_EFFECT_IDS.PARALYZED
  ].some(id => hasStatusEffect(target, id));
}

export function hasStatusEffectForDamage(target) {
  if (!target) return false;
  // CORE_EXECUTIONER is intentionally poison-only (#313).  Do not let the
  // additive adapter make newly added statuses implicit executioner inputs.
  return hasLegacyStatusEffect(target);
}

export function getStatusEffectRemainingTurns(target, id) {
  if (!target || typeof id !== "string") return null;
  normalizeStatusEffectTarget(target);
  return target.statusEffects[id]?.remainingTurns ?? null;
}

/**
 * Apply an existing status while retaining the legacy projection. Applying a
 * legacy string status keeps the old mutually-exclusive string behavior;
 * silence remains an independent duration field exactly as before.
 */
export function applyStatusEffect(target, id, { remainingTurns = null, stacks = 1, source = null } = {}) {
  if (!target || typeof id !== "string") return false;
  normalizeStatusEffectTarget(target);
  const effects = target.statusEffects;

  if (LEGACY_STATUS_IDS.has(id)) {
    LEGACY_STATUS_IDS.forEach(legacyId => {
      if (legacyId !== id) delete effects[legacyId];
    });
    target.status = id;
    if (id === STATUS_EFFECT_IDS.SLEEP) {
      target.sleepTurns = normalizeRemainingTurns(remainingTurns);
    } else {
      delete target.sleepTurns;
    }
    if (id === STATUS_EFFECT_IDS.PARALYZED) {
      if (remainingTurns !== null && remainingTurns !== undefined) {
        target.paralyzeTurns = normalizeRemainingTurns(remainingTurns);
      }
    } else {
      delete target.paralyzeTurns;
    }
  } else if (id === STATUS_EFFECT_IDS.SILENCE) {
    target.silenceTurns = normalizeRemainingTurns(remainingTurns) ?? 0;
  }

  effects[id] = createCanonicalEffect(id, {
    remainingTurns,
    stacks: id === STATUS_EFFECT_IDS.BLEEDING ? 1 : stacks,
    source
  });
  return true;
}

export function removeStatusEffect(target, id, { legacyStatus = "ok" } = {}) {
  if (!target || typeof id !== "string") return false;
  normalizeStatusEffectTarget(target);
  const hadEffect = hasStatusEffect(target, id);
  delete target.statusEffects[id];

  if (id === STATUS_EFFECT_IDS.SILENCE) {
    target.silenceTurns = 0;
  }
  if (isLegacyStatusActive(target, id)) {
    if (legacyStatus === "delete") delete target.status;
    else if (legacyStatus === "ok") target.status = "ok";
    if (id === STATUS_EFFECT_IDS.SLEEP || id === STATUS_EFFECT_IDS.PARALYZED) {
      delete target.sleepTurns;
      delete target.paralyzeTurns;
    }
  }
  return hadEffect;
}

/**
 * Resolve one exploration step of poison. A null remainingTurns value is the
 * legacy representation; finite duration is initialized lazily so old saves
 * and combat-applied poison remain readable and cureable.
 */
export function resolveExplorationPoisonStep(
  target,
  {
    rng = Math.random,
    damageChance = EXPLORATION_POISON_DAMAGE_CHANCE,
    durationSteps = null,
    damageMin = EXPLORATION_POISON_DAMAGE_MIN,
    damageMax = EXPLORATION_POISON_DAMAGE_MAX
  } = {}
) {
  if (!target || target.status !== STATUS_EFFECT_IDS.POISONED || target.hp <= 0) {
    return { active: false, damage: 0, naturalCure: false, remainingSteps: null };
  }

  normalizeStatusEffectTarget(target);
  const effect = target.statusEffects[STATUS_EFFECT_IDS.POISONED];
  let remainingSteps = normalizeRemainingTurns(effect?.remainingTurns);
  const finiteDuration = Number.isFinite(durationSteps)
    ? Math.max(0, Math.floor(durationSteps))
    : null;
  if (remainingSteps === null) {
    remainingSteps = finiteDuration ?? rollExplorationPoisonDuration(rng);
    effect.remainingTurns = remainingSteps;
  }

  const legacyDamage = damageChance === null;
  const chance = legacyDamage
    ? 1
    : Math.max(0, Math.min(1, Number(damageChance) || 0));
  const shouldDamage = legacyDamage || rng() < chance;
  const minDamage = Math.max(1, Math.floor(Number(damageMin) || 1));
  const maxDamage = Math.max(minDamage, Math.floor(Number(damageMax) || minDamage));
  const damage = shouldDamage
    ? Math.floor(rng() * (maxDamage - minDamage + 1)) + minDamage
    : 0;
  if (damage > 0) target.hp = Math.max(0, target.hp - damage);

  if (remainingSteps !== null) {
    remainingSteps = Math.max(0, remainingSteps - 1);
    effect.remainingTurns = remainingSteps;
  }
  const naturalCure = remainingSteps === 0 && target.hp > 0;
  if (naturalCure) removeStatusEffect(target, STATUS_EFFECT_IDS.POISONED);

  return { active: true, damage, naturalCure, remainingSteps };
}

export function clearBleedingStatus(target) {
  if (!target) return false;
  normalizeStatusEffectTarget(target);
  if (!Object.hasOwn(target.statusEffects, STATUS_EFFECT_IDS.BLEEDING)) return false;
  delete target.statusEffects[STATUS_EFFECT_IDS.BLEEDING];
  return true;
}

export function tickStatusEffects(target, { tickSleep = true, onBleedingExpire = null } = {}) {
  if (!target) return;
  normalizeStatusEffectTarget(target);

  if (target.silenceTurns) {
    target.silenceTurns = Math.max(0, target.silenceTurns - 1);
    if (target.silenceTurns > 0) {
      target.statusEffects[STATUS_EFFECT_IDS.SILENCE].remainingTurns = target.silenceTurns;
    } else {
      delete target.statusEffects[STATUS_EFFECT_IDS.SILENCE];
    }
  }

  if (tickSleep) {
    if (target.status === STATUS_EFFECT_IDS.SLEEP) {
      target.sleepTurns = Math.max(0, (target.sleepTurns ?? 1) - 1);
      if (target.statusEffects[STATUS_EFFECT_IDS.SLEEP]) {
        target.statusEffects[STATUS_EFFECT_IDS.SLEEP].remainingTurns = target.sleepTurns;
      }
      if (target.sleepTurns === 0) {
        removeStatusEffect(target, STATUS_EFFECT_IDS.SLEEP, { legacyStatus: "delete" });
      }
    } else if (target.sleepTurns) {
      delete target.sleepTurns;
      delete target.statusEffects[STATUS_EFFECT_IDS.SLEEP];
    }
  }

  const bleeding = target.statusEffects[STATUS_EFFECT_IDS.BLEEDING];
  if (bleeding) {
    const remainingTurns = Math.max(0, (bleeding.remainingTurns ?? 0) - 1);
    if (remainingTurns > 0) {
      bleeding.remainingTurns = remainingTurns;
    } else {
      delete target.statusEffects[STATUS_EFFECT_IDS.BLEEDING];
      onBleedingExpire?.(target);
    }
  }
}

export function getBuffTotal(mon, type) {
  return (mon.buffs || []).reduce((sum, buff) => {
    return buff.type === type ? sum + buff.value : sum;
  }, 0);
}

export function addMonsterBuff(mon, type, value, turns) {
  if (!mon.buffs) mon.buffs = [];
  mon.buffs.push({ type, value, turns });
}

export function tickMonsterBuffs(monsters, options = {}) {
  monsters.forEach(mon => {
    tickStatusEffects(mon, options);
    if (!mon.buffs) return;
    mon.buffs = mon.buffs
      .map(buff => ({ ...buff, turns: buff.turns - 1 }))
      .filter(buff => buff.turns > 0);
  });
}

export function wakeSleepingMonsterOnDamage(mon, rng = Math.random) {
  if (!hasStatusEffect(mon, STATUS_EFFECT_IDS.SLEEP) || mon.hp <= 0) return false;
  if (rng() >= 0.5) return false;
  removeStatusEffect(mon, STATUS_EFFECT_IDS.SLEEP, { legacyStatus: "delete" });
  return true;
}

export function clearCharIncapacitationOnDamage(char) {
  const id = char?.status === "sleep"
    ? STATUS_EFFECT_IDS.SLEEP
    : char?.status === "paralyze" || char?.status === "paralyzed"
      ? STATUS_EFFECT_IDS.PARALYZED
      : null;
  if (!id || char.hp <= 0 || !hasStatusEffect(char, id)) return false;
  removeStatusEffect(char, id);
  return true;
}

export const wakeSleepingCharOnDamage = clearCharIncapacitationOnDamage;

export function consumeCharIncapacitation(char, logQueue = []) {
  const id = char?.status === "sleep"
    ? STATUS_EFFECT_IDS.SLEEP
    : char?.status === "paralyze" || char?.status === "paralyzed"
      ? STATUS_EFFECT_IDS.PARALYZED
      : null;
  if (!id || char.hp <= 0 || !hasStatusEffect(char, id)) return false;
  const wasSleep = char.status === "sleep";
  removeStatusEffect(char, id);
  logQueue.push({
    msg: wasSleep
      ? `[味方] ${char.name}は眠りから目を覚ました！`
      : `[味方] ${char.name}は麻痺から回復した！`,
    sound: "heal"
  });
  return true;
}

export function addCharBuff(char, type, value, turns) {
  if (!char.buffs) char.buffs = [];
  char.buffs.push({ type, value, turns });
}

export function tickCharBuffs(party) {
  party.forEach(char => {
    if (!char.buffs) return;
    char.buffs = char.buffs
      .map(buff => ({ ...buff, turns: buff.turns - 1 }))
      .filter(buff => buff.turns > 0);
  });
}
