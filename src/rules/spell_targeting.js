const DAMAGED_HEAL_SPELL_KEYS = Object.freeze([
  "DIOS",
  "MADIOS",
  "DIALMA",
  "MADI"
]);

const STATUS_CURE_RULES = Object.freeze({
  DIURCO: char => char.status === "blind",
  DIALKO: char => ["sleep", "paralyze", "paralyzed"].includes(char.status),
  LATUMOFIS: char => char.status === "poisoned"
});

export const HEAL_SPELL_KEYS = Object.freeze([
  ...DAMAGED_HEAL_SPELL_KEYS,
  ...Object.keys(STATUS_CURE_RULES)
]);

export const CURE_SPELL_KEYS = Object.freeze(Object.keys(STATUS_CURE_RULES));

export function getSpellAllyTargetStatus(spellKey, char) {
  if (!char || char.status === "dead") {
    return { isDisabled: true, reason: "対象外", isRecommended: false };
  }

  if (DAMAGED_HEAL_SPELL_KEYS.includes(spellKey)) {
    if (char.hp >= char.maxHp) {
      return { isDisabled: true, reason: "HP満タン", isRecommended: false };
    }

    return {
      isDisabled: false,
      reason: "回復推奨",
      isRecommended: char.hp / char.maxHp <= 0.5
    };
  }

  const isValidStatusTarget = STATUS_CURE_RULES[spellKey];
  if (isValidStatusTarget) {
    if (isValidStatusTarget(char)) {
      return { isDisabled: false, reason: "治療可", isRecommended: true };
    }
    return { isDisabled: true, reason: "健康", isRecommended: false };
  }

  return { isDisabled: false, reason: "選択可能", isRecommended: false };
}

export function getSpellAllyTargetIndices(spellKey, party) {
  if (!Array.isArray(party)) return [];
  return party.reduce((indices, char, index) => {
    if (!getSpellAllyTargetStatus(spellKey, char).isDisabled) {
      indices.push(index);
    }
    return indices;
  }, []);
}

export function getLivingAllyTargetIndices(party) {
  if (!Array.isArray(party)) return [];
  return party.reduce((indices, char, index) => {
    if (["ok", "poisoned", "blind"].includes(char?.status)) {
      indices.push(index);
    }
    return indices;
  }, []);
}

export function getItemAllyTargetIndices(party) {
  if (!Array.isArray(party)) return [];
  return party.reduce((indices, char, index) => {
    if (char?.status !== "dead") {
      indices.push(index);
    }
    return indices;
  }, []);
}
