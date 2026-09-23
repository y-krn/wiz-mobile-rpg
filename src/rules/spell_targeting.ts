type LegacySpell = {
  target?: string;
  combatOnly?: unknown;
};

type LegacyCharacter = {
  status?: unknown;
  hp: number;
  maxHp: number;
};

const DAMAGED_HEAL_SPELL_KEYS = Object.freeze([
  "DIOS",
  "MADIOS",
  "DIALMA",
  "MADI"
]);

const STATUS_CURE_RULES = Object.freeze({
  DIURCO: (char: LegacyCharacter) => char.status === "blind",
  DIALKO: (char: LegacyCharacter) => ["sleep", "paralyze", "paralyzed"].includes(char.status as string),
  LATUMOFIS: (char: LegacyCharacter) => char.status === "poisoned"
});

export const HEAL_SPELL_KEYS = Object.freeze([
  ...DAMAGED_HEAL_SPELL_KEYS,
  ...Object.keys(STATUS_CURE_RULES)
]);

export const CURE_SPELL_KEYS = Object.freeze(Object.keys(STATUS_CURE_RULES));

export const COMBAT_SPELL_TARGETS = Object.freeze([
  "single_enemy",
  "all_enemies",
  "single_ally",
  "all_allies"
]);

export const EXPLORATION_SPELL_TARGETS = Object.freeze([
  "utility",
  "single_ally",
  "all_allies"
]);

export function isSpellAvailableInContext(spell: unknown, context: unknown): boolean {
  if (!spell) return false;

  const allowedTargets = context === "combat"
    ? COMBAT_SPELL_TARGETS
    : context === "exploration"
      ? EXPLORATION_SPELL_TARGETS
      : null;
  const legacySpell = spell as LegacySpell;
  if (!allowedTargets?.includes(legacySpell.target as typeof allowedTargets[number])) return false;
  return context === "combat" || !legacySpell.combatOnly;
}

export function getSpellAllyTargetStatus(spellKey: unknown, char: unknown) {
  if (!char || (char as LegacyCharacter).status === "dead") {
    return { isDisabled: true, reason: "対象外" };
  }

  const legacyChar = char as LegacyCharacter;
  if (DAMAGED_HEAL_SPELL_KEYS.includes(spellKey as typeof DAMAGED_HEAL_SPELL_KEYS[number])) {
    if (legacyChar.hp >= legacyChar.maxHp) {
      return { isDisabled: true, reason: "HP満タン" };
    }

    return {
      isDisabled: false,
      reason: "回復可"
    };
  }

  const isValidStatusTarget = STATUS_CURE_RULES[spellKey as keyof typeof STATUS_CURE_RULES];
  if (isValidStatusTarget) {
    if (isValidStatusTarget(legacyChar)) {
      return { isDisabled: false, reason: "治療可" };
    }
    return { isDisabled: true, reason: "健康" };
  }

  return { isDisabled: false, reason: "選択可能" };
}

export function getSpellAllyTargetIndices(spellKey: unknown, party: unknown) {
  if (!Array.isArray(party)) return [];
  return (party as unknown[]).reduce<number[]>((indices, char, index) => {
    if (!getSpellAllyTargetStatus(spellKey, char).isDisabled) {
      indices.push(index);
    }
    return indices;
  }, []);
}

export function getLivingAllyTargetIndices(party: unknown) {
  if (!Array.isArray(party)) return [];
  return (party as unknown[]).reduce<number[]>((indices, char, index) => {
    if (["ok", "poisoned", "blind"].includes((char as LegacyCharacter | null | undefined)?.status as string)) {
      indices.push(index);
    }
    return indices;
  }, []);
}

export function getItemAllyTargetIndices(party: unknown) {
  if (!Array.isArray(party)) return [];
  return (party as unknown[]).reduce<number[]>((indices, char, index) => {
    if ((char as LegacyCharacter | null | undefined)?.status !== "dead") {
      indices.push(index);
    }
    return indices;
  }, []);
}
