import { getItemBaseId, getCharAffixSum } from "../data.js";
import { recordCharDeath } from "../state.js";
import { getBuffTotal } from "./status_effects.js";

export function getMeleeModifiers(char, actorIdx) {
  const classMeleeRates = {
    Fighter: 1.00,
    Samurai: 0.95,
    Ninja: 0.95,
    Ranger: 0.85,
    Thief: 0.75,
    Priest: 0.60,
    Bishop: 0.50,
    Mage: 0.35
  };
  const classRate = classMeleeRates[char.class] ?? 1.00;
  
  let rowRate = 1.00;
  if (actorIdx >= 2) {
    const weaponId = char.equipment.weapon;
    const baseId = getItemBaseId(weaponId);
    if (baseId === "DAGGER" || baseId === "WAND") {
      rowRate = 0.35;
    } else {
      rowRate = 0.50;
    }
  }
  return classRate * rowRate;
}

export function getEffectiveDef(mon) {
  return Math.max(0, mon.def + Math.max(-6, Math.min(6, getBuffTotal(mon, "def"))));
}

export function getEffectiveMagicResist(mon) {
  const base = mon.magicResist || 0;
  const buff = Math.max(-0.5, Math.min(0.5, getBuffTotal(mon, "magicResist")));
  return Math.max(-1, Math.min(0.9, base + buff));
}

export function getEffectiveAtk(mon) {
  return Math.max(1, mon.atk + Math.max(-6, Math.min(6, getBuffTotal(mon, "atk"))));
}

export function applyTargetedDamageBonus(char, target, dmg) {
  let next = dmg;
  if (target.tags?.includes("undead")) {
    next = Math.round(next * (1 + getCharAffixSum(char, "antiUndead") / 100));
  }
  if (target.tags?.includes("dragon")) {
    next = Math.round(next * (1 + getCharAffixSum(char, "antiDragon") / 100));
  }
  if (target.tags?.includes("demon")) {
    next = Math.round(next * (1 + getCharAffixSum(char, "antiDemon") / 100));
  }
  return Math.max(1, next);
}

export function reduceIncomingDamage(char, dmg, options = {}) {
  let next = dmg;
  const reductions = [];
  if (options.spell && char.magicVulnerableTurns > 0) {
    next = Math.max(1, Math.round(next * 1.3));
  }
  if (char.hp / char.maxHp <= 0.25) {
    const guardian = getCharAffixSum(char, "guardian");
    if (guardian > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - guardian / 100)));
      if (next < before) reductions.push("守護");
    }
  }
  if (options.spell) {
    let resistPct = 0;
    const spellGuard = getCharAffixSum(char, "spellGuard");
    if (spellGuard > 0) resistPct += spellGuard;
    if (char.mabarrierTurns > 0) resistPct += 30;
    resistPct = Math.min(60, resistPct);
    
    if (resistPct > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - resistPct / 100)));
      if (next < before) {
        if (char.mabarrierTurns > 0 && spellGuard > 0) {
          reductions.push("結界と魔除け");
        } else if (char.mabarrierTurns > 0) {
          reductions.push("結界");
        } else {
          reductions.push("魔除け");
        }
      }
    }
  }
  if (options.dragon) {
    const dragonGuard = getCharAffixSum(char, "antiDragon");
    if (dragonGuard > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - dragonGuard / 100)));
      if (next < before) reductions.push("竜殺し");
    }
  }
  if (options.logQueue && reductions.length > 0) {
    options.logQueue.push({ msg: `[味方] ${char.name}の${reductions.join("・")}がダメージを和らげた。` });
  }
  return next;
}

export function applyPartyDamage(state, combatSelection, logQueue, sourceName, minDmg, maxDmg, options = {}) {
  state.party.forEach((c, charIdx) => {
    if (c.status === "dead") return;
    const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
    let dmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    if (isDefending) dmg = Math.max(1, Math.round(dmg * (options.defendRate ?? 0.5)));
    dmg = reduceIncomingDamage(c, dmg, { spell: options.spell, dragon: options.dragon, logQueue });
    c.hp = Math.max(0, c.hp - dmg);
    if (c.hp === 0) {
      c.status = "dead";
      let causeText = `${sourceName}の攻撃`;
      if (options.spell) {
        causeText = `${sourceName}の魔術`;
      } else if (options.dragon) {
        causeText = `${sourceName}のブレス`;
      }
      recordCharDeath(state, c, causeText);
    }
    logQueue.push({ msg: `[ 敵 ] ${sourceName}により${c.name}は${dmg}のダメージを受けた。${isDefending ? "(防御)" : ""}` });
  });
}

export function applyMagicResistBuffs(monsters, callback) {
  const original = monsters.map(mon => mon.magicResist);
  monsters.forEach(mon => {
    mon.magicResist = getEffectiveMagicResist(mon);
  });
  const result = callback();
  monsters.forEach((mon, idx) => {
    if (original[idx] === undefined) delete mon.magicResist;
    else mon.magicResist = original[idx];
  });
  return result;
}
