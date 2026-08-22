export const STATUS_EFFECT_IDS = Object.freeze({
  POISONED: "poisoned",
  BLIND: "blind",
  SLEEP: "sleep",
  PARALYZED: "paralyzed",
  SILENCE: "silence"
});

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
  const statusId = legacyStatusId(target.status);
  if (statusId) {
    const remainingTurns = statusId === STATUS_EFFECT_IDS.SLEEP
      ? normalizeRemainingTurns(target.sleepTurns)
      : statusId === STATUS_EFFECT_IDS.PARALYZED
        ? normalizeRemainingTurns(target.paralyzeTurns)
        : null;
    setLegacyEffect(target, effects, statusId, remainingTurns);
  }
  if (Number(target.silenceTurns) > 0) {
    setLegacyEffect(target, effects, STATUS_EFFECT_IDS.SILENCE, target.silenceTurns);
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
  normalizeStatusEffectTarget(target);
  if (target.status && !["ok", "dead"].includes(target.status)) return true;
  return Object.keys(target.statusEffects).some(id => id !== STATUS_EFFECT_IDS.SILENCE);
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

  effects[id] = createCanonicalEffect(id, { remainingTurns, stacks, source });
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

export function tickStatusEffects(target, { tickSleep = true } = {}) {
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

  if (!tickSleep) return;

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

export function getBuffTotal(mon, type) {
  return (mon.buffs || []).reduce((sum, buff) => {
    return buff.type === type ? sum + buff.value : sum;
  }, 0);
}

export function addMonsterBuff(mon, type, value, turns) {
  if (!mon.buffs) mon.buffs = [];
  mon.buffs.push({ type, value, turns });
}

export function tickMonsterBuffs(monsters) {
  monsters.forEach(mon => {
    tickStatusEffects(mon);
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
