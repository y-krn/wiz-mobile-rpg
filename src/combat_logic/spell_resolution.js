import { SPELLS } from "../data.js";
import { getEffectiveMagicResist, applyMagicResistBuffs } from "./damage.js";
import { hasTrait, processMonsterDefeat } from "./monster_traits.js";

/**
 * Resolves player spell casting logic.
 */
export function resolvePlayerSpell(char, act, state, monsters, logQueue) {
  const spell = SPELLS[act.spellName];

  if (char.silenceTurns > 0) {
    logQueue.push({ msg: `[味方] ${char.name}は沈黙していて呪文を唱えられない！` });
    return;
  }
  
  if (char.mp < spell.cost) {
    logQueue.push({ msg: `[味方] ${char.name}は${spell.name}を唱えようとしたが、MPが足りない！` });
    return;
  }
  char.mp -= spell.cost;

  if (spell.target === "single_enemy") {
    let target = monsters[act.targetIdx];
    if (target.hp <= 0) {
      const livingTargetIdx = monsters.findIndex(m => m.hp > 0);
      if (livingTargetIdx === -1) return;
      target = monsters[livingTargetIdx];
    }
    
    if (hasTrait(target, "reflectMagic") && Math.random() < (target.magicReflect?.chance ?? 0.5)) {
      const reflected = Math.floor(Math.random() * 11) + 5;
      char.hp = Math.max(0, char.hp - reflected);
      if (char.hp === 0) char.status = "dead";
      logQueue.push({
        msg: `[ 敵 ] ${target.name}は呪文を反射した！${char.name}に${reflected}の反射ダメージ！`,
        sound: "cast_spell",
        shake: 8,
        floatText: `${reflected}`,
        floatColor: "#ff3b30"
      });
      return;
    }

    const originalMagicResist = target.magicResist;
    target.magicResist = getEffectiveMagicResist(target);
    const result = spell.effect(char, target);
    if (originalMagicResist === undefined) delete target.magicResist;
    else target.magicResist = originalMagicResist;
    target.hp = Math.max(0, target.hp - result.damage);
    logQueue.push({
      msg: `[味方] ${result.log}`,
      sound: "hit",
      shake: 12,
      floatText: `${result.damage}`,
      floatColor: target.color
    });

    if (target.hp === 0) {
      logQueue.push({ msg: `[味方] [!] ${target.name}を倒した！` });
      processMonsterDefeat(monsters, target, logQueue);
    }
  } else if (spell.target === "all_enemies") {
    const result = applyMagicResistBuffs(monsters, () => spell.effect(char, monsters));
    logQueue.push({
      msg: `[味方] ${result.log}`,
      sound: "cast_spell",
      shake: 15,
      flash: true
    });
    
    monsters.forEach(m => {
      if (m.hp === 0 && !m.loggedDeath) {
        m.loggedDeath = true;
        logQueue.push({ msg: `[味方] [!] ${m.name}を倒した！` });
        processMonsterDefeat(monsters, m, logQueue);
      }
    });
  } else if (spell.target === "single_ally") {
    const target = state.party[act.targetIdx];
    const result = spell.effect(char, target);
    let floatText = undefined;
    if (result.heal) {
      floatText = `+${result.heal}`;
    } else if (spell.name === "LATUMOFIS" || spell.name === "DIALKO" || spell.name === "DIURCO") {
      floatText = "CURED";
    }
    logQueue.push({
      msg: `[味方] ${result.log}`,
      sound: "heal",
      floatText,
      floatColor: "#00ff66"
    });
  } else if (spell.target === "all_allies") {
    const result = spell.effect(char, state.party);
    logQueue.push({
      msg: `[味方] ${result.log}`,
      sound: "heal",
      floatText: "BARRIER",
      floatColor: "#00ff66"
    });
  }
}
