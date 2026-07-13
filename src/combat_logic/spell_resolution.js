import { SPELLS } from "../data.js";
import { recordCharDeath } from "../state.js";
import { getEffectiveMagicResist, applyMagicResistBuffs } from "./damage.js";
import { hasTrait, processMonsterDefeat } from "./monster_traits.js";
import { wakeSleepingMonsterOnDamage } from "./status_effects.js";

/**
 * Resolves player spell casting logic.
 */
function tryReflectMagic(target) {
  if (!hasTrait(target, "reflectMagic")) return 0;
  if (Math.random() >= (target.magicReflect?.chance ?? 0.5)) return 0;
  return Math.floor(Math.random() * 11) + 5;
}

function applyReflectionDamage(char, state, sources, logQueue) {
  const total = sources.reduce((sum, source) => sum + source.damage, 0);
  char.hp = Math.max(0, char.hp - total);
  if (char.hp === 0) {
    char.status = "dead";
    const cause = sources.length === 1 ? `${sources[0].name}の魔法反射` : "魔法反射";
    recordCharDeath(state, char, cause);
  }

  const sourceText = sources.length === 1
    ? `${sources[0].name}は呪文を反射した！`
    : `${sources.map(source => source.name).join("、")}は呪文を反射した！`;
  logQueue.push({
    msg: `[ 敵 ] ${sourceText}${char.name}に${total}の反射ダメージ！`,
    sound: "cast_spell",
    shake: 8,
    floatText: `${total}`,
    floatColor: "#ff3b30"
  });
}

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
    
    const reflected = tryReflectMagic(target);
    if (reflected > 0) {
      applyReflectionDamage(char, state, [{ name: target.name, damage: reflected }], logQueue);
      return;
    }

    const originalMagicResist = target.magicResist;
    target.magicResist = getEffectiveMagicResist(target);
    const result = spell.effect(char, target, state.party);
    if (originalMagicResist === undefined) delete target.magicResist;
    else target.magicResist = originalMagicResist;
    target.hp = Math.max(0, target.hp - result.damage);
    const wakeSuffix = result.damage > 0 && wakeSleepingMonsterOnDamage(target) ? `${target.name}は目を覚ました！` : "";
    logQueue.push({
      msg: `[味方] ${result.log}${wakeSuffix}`,
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
    const reflectedSources = monsters
      .filter(mon => mon.hp > 0)
      .map(mon => ({ monster: mon, damage: tryReflectMagic(mon) }))
      .filter(source => source.damage > 0);
    const reflectedMonsters = new Set(reflectedSources.map(source => source.monster));
    const affectedMonsters = monsters.filter(mon => !reflectedMonsters.has(mon));
    const beforeHp = monsters.map(mon => mon.hp);
    const result = applyMagicResistBuffs(affectedMonsters, () => spell.effect(char, affectedMonsters, state.party));
    const wokeNames = monsters
      .filter((mon, idx) => beforeHp[idx] > mon.hp && wakeSleepingMonsterOnDamage(mon))
      .map(mon => mon.name);
    const wakeSuffix = wokeNames.length > 0 ? ` ${wokeNames.join("、")}は目を覚ました！` : "";
    logQueue.push({
      msg: `[味方] ${result.log}${wakeSuffix}`,
      sound: "cast_spell",
      shake: 15,
      flash: true
    });
    if (reflectedSources.length > 0) {
      applyReflectionDamage(
        char,
        state,
        reflectedSources.map(source => ({ name: source.monster.name, damage: source.damage })),
        logQueue
      );
    }
    
    monsters.forEach(m => {
      if (m.hp === 0 && !m.loggedDeath) {
        m.loggedDeath = true;
        logQueue.push({ msg: `[味方] [!] ${m.name}を倒した！` });
        processMonsterDefeat(monsters, m, logQueue);
      }
    });
  } else if (spell.target === "single_ally") {
    const target = state.party[act.targetIdx];
    const result = spell.effect(char, target, state.party);
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
    const result = spell.effect(char, state.party, state.party);
    const floatText = spell.name === "MADI" ? (result.heal ? `+${result.heal}` : "HEAL") : "BARRIER";
    logQueue.push({
      msg: `[味方] ${result.log}`,
      sound: "heal",
      floatText,
      floatColor: "#00ff66"
    });
  }
}
