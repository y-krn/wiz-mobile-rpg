import { MEDIUMS, RUNES } from "../data/magic.js";

function getBaseId(item) {
  if (!item) return "";
  if (typeof item === "object") return item.baseId || item.key || item.id || "";
  return item;
}

function getMediumIdentity(item) {
  if (!item) return "";
  return typeof item === "object" && item.instanceId ? item.instanceId : getBaseId(item);
}

export function getEquippedMedium(char) {
  const weapon = char?.equipment?.weapon;
  const baseId = getBaseId(weapon);
  return MEDIUMS[baseId] ? { ...MEDIUMS[baseId], item: weapon } : null;
}

export function isMedium(item) {
  return Boolean(MEDIUMS[getBaseId(item)]);
}

export function getMediumRuneCapacity(char) {
  return getEquippedMedium(char)?.runeSlots || 0;
}

export function getMediumMaxMpBonus(char) {
  return getEquippedMedium(char)?.maxMpBonus || 0;
}

function normalizeRuneSpellKey(rune) {
  if (typeof rune === "string") {
    if (RUNES[rune]) return RUNES[rune].spellKey;
    if (Object.values(RUNES).some(candidate => candidate.spellKey === rune)) return rune;
    return null;
  }
  return RUNES[getBaseId(rune)]?.spellKey || null;
}

export function getActiveRuneSpellKeys(char) {
  if (!char?.startingKit || !getEquippedMedium(char)) return [];
  const mediumKey = getMediumIdentity(getEquippedMedium(char).item);
  if (char.mediumState?.mediumKey !== mediumKey) return [];
  const seen = new Set();
  return (char.mediumState.socketedRunes || [])
    .map(normalizeRuneSpellKey)
    .filter(spellKey => spellKey && !seen.has(spellKey) && seen.add(spellKey))
    .slice(0, getMediumRuneCapacity(char));
}

export function getActiveSpellKeys(char) {
  return char?.startingKit
    ? getActiveRuneSpellKeys(char)
    : (Array.isArray(char?.spells) ? [...char.spells] : []);
}

export function getRuneSpellKey(rune) {
  return normalizeRuneSpellKey(rune);
}

export function getRuneItemId(spellKey) {
  return Object.values(RUNES).find(rune => rune.spellKey === spellKey)?.id || null;
}

export function syncMediumState(char, { preserveRunes = false } = {}) {
  if (!char?.startingKit) return char;
  const medium = getEquippedMedium(char);
  const mediumKey = getMediumIdentity(medium?.item);
  const previousRunes = preserveRunes ? char.mediumState?.socketedRunes : [];
  if (!medium) {
    char.mediumState = { mediumKey: null, socketedRunes: [] };
  } else if (char.mediumState?.mediumKey !== mediumKey) {
    char.mediumState = { mediumKey, socketedRunes: previousRunes || [] };
  } else {
    char.mediumState.socketedRunes = (char.mediumState.socketedRunes || [])
      .map(normalizeRuneSpellKey)
      .filter(Boolean)
      .map(spellKey => getRuneItemId(spellKey) || spellKey)
      .slice(0, medium.runeSlots);
  }
  return char;
}

export function socketRune(char, rune) {
  if (!char?.startingKit) return { ok: false, reason: "legacy_character" };
  const medium = getEquippedMedium(char);
  const spellKey = normalizeRuneSpellKey(rune);
  if (!medium || !spellKey) return { ok: false, reason: "medium_or_rune_missing" };
  syncMediumState(char);
  const runes = char.mediumState.socketedRunes;
  if (runes.includes(spellKey)) return { ok: false, reason: "already_socketed" };
  if (runes.length >= medium.runeSlots) return { ok: false, reason: "capacity" };
  runes.push(getRuneItemId(spellKey) || spellKey);
  return { ok: true, spellKey, runeSlots: medium.runeSlots };
}

export function unsocketRune(char, spellKey) {
  if (!char?.startingKit) return { ok: false, reason: "legacy_character" };
  const index = char.mediumState?.socketedRunes?.findIndex(rune => normalizeRuneSpellKey(rune) === spellKey) ?? -1;
  if (index < 0) return { ok: false, reason: "not_socketed" };
  char.mediumState.socketedRunes.splice(index, 1);
  return { ok: true, spellKey };
}

export function clampCurrentMpToMax(char, getMaxMp) {
  if (!char || typeof getMaxMp !== "function") return char;
  const maxMp = Math.max(0, getMaxMp(char));
  if (Number.isFinite(char.mp)) char.mp = Math.min(char.mp, maxMp);
  return char;
}
