import { getItemBaseId, getCharAffixSum, getCharMaxHp, getCharMaxMp, getCharWeaponAtk, getCharStr } from "../data.js";
import { recordCharDeath } from "../state.js";
import { getBuffTotal, wakeSleepingCharOnDamage } from "./status_effects.js";
import { getCharCoreParams, getCoreLogText, getDamageAffixResult } from "../rules/affix_rules.js";

export function logCoreActivation(state, logQueue, char, coreId, { once = true } = {}) {
  if (!state?.combatState || !logQueue) return;
  const key = `${char.name}:${coreId}`;
  state.combatState.loggedCoreActivations ||= [];
  if (once && state.combatState.loggedCoreActivations.includes(key)) return;
  if (once) state.combatState.loggedCoreActivations.push(key);
  logQueue.push({ msg: getCoreLogText(coreId) });
}

export function getMeleeModifiers(char, actorIdx, options = {}) {
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
    const rearguard = getCharCoreParams(char, "CORE_REARGUARD");
    if (rearguard) {
      rowRate = rearguard.rowRate;
      logCoreActivation(options.state, options.logQueue, char, "CORE_REARGUARD");
    } else {
      const weaponId = char.equipment.weapon;
      const baseId = getItemBaseId(weaponId);
      if (baseId === "DAGGER" || baseId === "WAND") {
        rowRate = 0.35;
      } else {
        rowRate = 0.50;
      }
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

export function applyTargetedDamageBonus(char, target, dmg, options = {}) {
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
  const result = getDamageAffixResult(char, target, next, options);
  result.coreIds.forEach(coreId => {
    logCoreActivation(options.state, options.logQueue, char, coreId);
  });
  return result.damage;
}

export function applyKillAffixEffects(char, target, state, logQueue) {
  if (!char || !target || target.affixKillProcessed) return;
  target.affixKillProcessed = true;

  const killHeal = getCharAffixSum(char, "killHeal");
  if (killHeal > 0 && char.hp > 0) {
    char.hp = Math.min(getCharMaxHp(char), char.hp + killHeal);
  }

  const purify = getCharCoreParams(char, "CORE_PURIFY_RING");
  if (purify && purify.targetTags.some(tag => target.tags?.includes(tag))) {
    char.mp = Math.min(getCharMaxMp(char), char.mp + purify.mpRecovery);
    logCoreActivation(state, logQueue, char, "CORE_PURIFY_RING", { once: false });
  }
}

export function tryApplyHitFlinch(char, target, logQueue, rng = Math.random) {
  const chance = getCharAffixSum(char, "hitFlinch") / 100;
  if (chance <= 0 || target.hp <= 0 || rng() >= chance) return false;
  target.flinched = true;
  logQueue.push({ msg: `[味方] ${char.name}の威圧で${target.name}は怯んだ！` });
  return true;
}

export function tryThornCounter(char, monster, actorIdx, state, logQueue, rng = Math.random) {
  const thorn = getCharCoreParams(char, "CORE_THORN_SHIELD");
  if (!thorn || char.hp <= 0 || monster.hp <= 0 || rng() >= thorn.counterChance) return 0;
  const base = Math.max(1, Math.floor(
    ((getCharWeaponAtk(char) * 1.5) + (getCharStr(char) - 10) - Math.floor(getEffectiveDef(monster) / 2))
      * getMeleeModifiers(char, actorIdx)
  ));
  const damage = Math.max(1, Math.round(base * thorn.counterPower));
  monster.hp = Math.max(0, monster.hp - damage);
  logCoreActivation(state, logQueue, char, "CORE_THORN_SHIELD", { once: false });
  logQueue.push({ msg: `[味方] ${char.name}の棘が${monster.name}に${damage}の反撃ダメージ！` });
  return damage;
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
    const wakeSuffix = wakeSleepingCharOnDamage(c) ? `${c.name}は目を覚ました！` : "";
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
    logQueue.push({ msg: `[ 敵 ] ${sourceName}により${c.name}は${dmg}のダメージを受けた。${isDefending ? "(防御)" : ""}${wakeSuffix}` });
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
