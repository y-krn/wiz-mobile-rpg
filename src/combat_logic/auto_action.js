import { getCharMaxHp } from "../rules/character_stats.js";

import { getActiveSpellKeys } from "../rules/magic_rules.js";
import { SPELLS } from "../data/spells.js";

const HOLY_TARGET_TAGS = new Set(["undead", "spirit", "demon"]);
const AUTO_HEAL_HP_THRESHOLD = 0.55;
const MAGE_ALL_SPELLS = [
  { name: "TILTOWAIT", expectedDamage: 75 },
  { name: "MADALTO", expectedDamage: 45 },
  { name: "LAHALITO", expectedDamage: 25 }
];
const MAGE_SINGLE_SPELLS = [
  { name: "MAHALITO", expectedDamage: 40 },
  { name: "HALITO", expectedDamage: 17 }
];
const PRIEST_HEALING_SPELLS = [
  "DIALMA",
  "MADI",
  "MADIOS",
  "DIOS"
];

function getPolicySpellKeys(character, activeSpellKeys = null) {
  return Array.isArray(activeSpellKeys) ? activeSpellKeys : getActiveSpellKeys(character);
}

function hasSpell(character, spellName, activeSpellKeys = null) {
  return getPolicySpellKeys(character, activeSpellKeys).includes(spellName);
}

function hasSpellType(character, type, activeSpellKeys = null) {
  return getPolicySpellKeys(character, activeSpellKeys).some(spellName => SPELLS[spellName]?.type === type);
}

function usesSpellPolicy(character, spellType, activeSpellKeys = null) {
  return hasSpellType(character, spellType, activeSpellKeys);
}

function getLowestHpEnemyIndex(monsters, predicate = () => true) {
  let selectedIdx = -1;
  let selectedHp = Infinity;
  monsters.forEach((monster, idx) => {
    if (monster.hp > 0 && predicate(monster) && monster.hp < selectedHp) {
      selectedIdx = idx;
      selectedHp = monster.hp;
    }
  });
  return selectedIdx;
}

function hasHolyTag(monster) {
  return monster.tags?.some(tag => HOLY_TARGET_TAGS.has(tag)) === true;
}

function getMageOffensiveSpellName(monsters, canCast) {
  const livingMonsters = monsters.filter(monster => monster.hp > 0);
  if (livingMonsters.length === 0) return null;

  const bestAvailableAllSpell = MAGE_ALL_SPELLS.find(spell => canCast(spell.name));
  if (livingMonsters.length >= 2) {
    const totalHp = livingMonsters.reduce((sum, monster) => sum + monster.hp, 0);
    const targetCount = livingMonsters.length;
    const efficientAllSpell = MAGE_ALL_SPELLS.find(spell =>
      canCast(spell.name) && totalHp >= spell.expectedDamage * targetCount * 0.75
    );
    if (efficientAllSpell) return efficientAllSpell.name;
  }

  const lowestHp = Math.min(...livingMonsters.map(monster => monster.hp));
  const singleSpell = MAGE_SINGLE_SPELLS.find(spell => {
    if (!canCast(spell.name)) return false;
    return spell.name !== "MAHALITO" || lowestHp > 22;
  });
  return singleSpell?.name || bestAvailableAllSpell?.name || null;
}

export function getPreferredOffensiveSpellName(
  character,
  monsters = [],
  canCastSpell = () => true,
  activeSpellKeys = null
) {
  const reserveMp = hasSpell(character, "DIOS", activeSpellKeys) ? 1 : 0;
  const canCast = spellName =>
    hasSpell(character, spellName, activeSpellKeys) && canCastSpell(spellName, reserveMp);

  if (usesSpellPolicy(character, "mage", activeSpellKeys)) {
    return getMageOffensiveSpellName(monsters, canCast);
  }
  if (usesSpellPolicy(character, "priest", activeSpellKeys) && canCast("BADIOS")) return "BADIOS";
  return null;
}

export function getPreferredHealingSpellName(
  character,
  canCastSpell = () => false,
  activeSpellKeys = null
) {
  return PRIEST_HEALING_SPELLS.find(
    spellName => hasSpell(character, spellName, activeSpellKeys) && canCastSpell(spellName, 0)
  ) || null;
}

export function getAutoHealTargetIdx(
  character,
  healThreshold = AUTO_HEAL_HP_THRESHOLD,
  activeSpellKeys = null
) {
  if (!getPolicySpellKeys(character, activeSpellKeys).some(spellName => PRIEST_HEALING_SPELLS.includes(spellName))) return null;
  return character.hp < getCharMaxHp(character) * healThreshold ? 0 : null;
}

export function chooseAutoCombatAction({
  character,
  monsters,
  roundNumber,
  healingTargetIdx = null,
  canCastSpell = () => false,
  activeSpellKeys = null
}) {
  const statusTargetIdx = getLowestHpEnemyIndex(
    monsters,
    monster => monster.status && !["ok", "dead"].includes(monster.status)
  );
  const lowestHpIdx = statusTargetIdx >= 0
    ? statusTargetIdx
    : getLowestHpEnemyIndex(monsters);
  const livingMonsters = monsters.filter(monster => monster.hp > 0);
  const reserveMp = hasSpell(character, "DIOS", activeSpellKeys) ? 1 : 0;
  const canCast = spellName =>
    hasSpell(character, spellName, activeSpellKeys) && canCastSpell(spellName, reserveMp);

  if (healingTargetIdx !== null && usesSpellPolicy(character, "priest", activeSpellKeys)) {
    const healingSpell = getPreferredHealingSpellName(character, canCastSpell, activeSpellKeys);
    if (healingSpell) {
      return { type: "spell", targetIdx: healingTargetIdx, spellName: healingSpell };
    }
  }

  if (roundNumber === 1 && livingMonsters.length >= 2 && canCast("KATINO")) {
    return { type: "spell", targetIdx: lowestHpIdx, spellName: "KATINO" };
  }

  if (usesSpellPolicy(character, "priest", activeSpellKeys) && canCast("BADIOS")) {
    const holyTargetIdx = monsters.findIndex(monster => monster.hp > 0 && hasHolyTag(monster));
    const firstLivingIdx = monsters.findIndex(monster => monster.hp > 0);
    return {
      type: "spell",
      targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : firstLivingIdx,
      spellName: "BADIOS"
    };
  }

  if (usesSpellPolicy(character, "mage", activeSpellKeys)) {
    const spellName = getMageOffensiveSpellName(monsters, canCast);
    if (spellName) {
      return { type: "spell", targetIdx: lowestHpIdx, spellName };
    }
  }

  return { type: "fight", targetIdx: lowestHpIdx };
}
