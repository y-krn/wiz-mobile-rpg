const BASIC_CLASSES = new Set(["Fighter", "Thief", "Priest", "Mage"]);
const HOLY_TARGET_TAGS = new Set(["undead", "spirit", "demon"]);
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
  "MADIOS",
  "DIOS"
];

function hasSpell(character, spellName) {
  return character.spells?.includes(spellName) === true;
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
  canCastSpell = () => true
) {
  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  const canCast = spellName =>
    hasSpell(character, spellName) && canCastSpell(spellName, reserveMp);

  if (character.class === "Mage") {
    return getMageOffensiveSpellName(monsters, canCast);
  }
  if (character.class === "Priest" && canCast("BADIOS")) return "BADIOS";
  if (character.class === "Samurai" && canCast("HALITO")) return "HALITO";
  if (character.class === "Bishop") {
    if (canCast("BADIOS")) return "BADIOS";
    if (canCast("HALITO")) return "HALITO";
  }
  if (character.class === "Ranger" && canCast("BADIOS")) return "BADIOS";
  return null;
}

function getPreferredHealingSpellName(character, canCastSpell) {
  return PRIEST_HEALING_SPELLS.find(spellName =>
    hasSpell(character, spellName) && canCastSpell(spellName, 0)
  ) || null;
}

export function chooseAutoCombatAction({
  character,
  monsters,
  roundNumber,
  healingTargetIdx = null,
  canCastSpell = () => false
}) {
  if (!BASIC_CLASSES.has(character.class)) return null;

  const statusTargetIdx = getLowestHpEnemyIndex(
    monsters,
    monster => monster.status && !["ok", "dead"].includes(monster.status)
  );
  const lowestHpIdx = statusTargetIdx >= 0
    ? statusTargetIdx
    : getLowestHpEnemyIndex(monsters);
  const livingMonsters = monsters.filter(monster => monster.hp > 0);
  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  const canCast = spellName =>
    hasSpell(character, spellName) && canCastSpell(spellName, reserveMp);

  if (healingTargetIdx !== null && character.class === "Priest") {
    const healingSpell = getPreferredHealingSpellName(character, canCastSpell);
    if (healingSpell) {
      return { type: "spell", targetIdx: healingTargetIdx, spellName: healingSpell };
    }
  }

  if (roundNumber === 1 && livingMonsters.length >= 2 && canCast("KATINO")) {
    return { type: "spell", targetIdx: lowestHpIdx, spellName: "KATINO" };
  }

  if (character.class === "Priest" && canCast("BADIOS")) {
    const holyTargetIdx = monsters.findIndex(monster => monster.hp > 0 && hasHolyTag(monster));
    const firstLivingIdx = monsters.findIndex(monster => monster.hp > 0);
    return {
      type: "spell",
      targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : firstLivingIdx,
      spellName: "BADIOS"
    };
  }

  if (character.class === "Mage") {
    const spellName = getMageOffensiveSpellName(monsters, canCast);
    if (spellName) {
      return { type: "spell", targetIdx: lowestHpIdx, spellName };
    }
  }

  return { type: "fight", targetIdx: lowestHpIdx };
}
