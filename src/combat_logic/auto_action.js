const BASIC_CLASSES = new Set(["Fighter", "Thief", "Priest", "Mage"]);
const HOLY_TARGET_TAGS = new Set(["undead", "spirit", "demon"]);

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

export function chooseAutoCombatAction({
  character,
  monsters,
  roundNumber,
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

  if (character.class === "Mage" && canCast("HALITO")) {
    return { type: "spell", targetIdx: lowestHpIdx, spellName: "HALITO" };
  }

  return { type: "fight", targetIdx: lowestHpIdx };
}
