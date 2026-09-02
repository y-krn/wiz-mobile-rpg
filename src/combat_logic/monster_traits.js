import { addMonsterBuff } from "./status_effects.js";

export function hasTrait(mon, trait) {
  return mon.traits?.includes(trait);
}

export function getEliteAttackMultiplier(mon, target) {
  let multiplier = 1;
  if (mon?.combatTrait === "berserk" && mon.hp > 0 && mon.hp / mon.maxHp <= 0.5) {
    multiplier *= 1.35;
  }
  if (mon?.combatTrait === "executioner" && target?.hp > 0 && target.hp / target.maxHp <= 0.5) {
    multiplier *= 1.4;
  }
  return multiplier;
}

export function triggerEliteSpellEater(mon, logQueue) {
  if (mon?.combatTrait !== "spell_eater" || mon.hp <= 0) return false;
  addMonsterBuff(mon, "atk", 4, 2);
  logQueue.push({ msg: `[ 敵 ] ${mon.name}は呪文を喰らい、攻撃力を一時的に高めた！`, sound: "cast_spell" });
  return true;
}

export function processMonsterDefeat(monsters, mon, logQueue) {
  if (mon.hp > 0 || mon.deathProcessed) return;
  mon.deathProcessed = true;
  if (!hasTrait(mon, "splitOnDeath") || mon.hasSplit) return;

  const split = mon.split || {};
  const count = split.count ?? 2;
  const hp = Math.max(1, Math.floor(mon.maxHp * (split.hpRate ?? 0.5)));
  for (let i = 0; i < count; i++) {
    monsters.push({
      ...mon,
      name: `${mon.name}の分裂体${i + 1}`,
      hp,
      maxHp: hp,
      exp: Math.max(1, Math.floor(mon.exp * 0.25)),
      hasSplit: true,
      deathProcessed: false,
      fled: false
    });
  }
  logQueue.push({ msg: `[ 敵 ] ${mon.name}は崩れ落ち、${count}体に分裂した！` });
}
