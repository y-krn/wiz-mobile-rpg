import {
  getCharAffixSum,
  getCharMaxHp,
  getCharMaxMp,
  getCharWeaponAtk,
  getCharStr,
  calculatePhysicalAttackFormula,
  combinePhysicalResistances,
  getPhysicalDefenseResistance,
  getEffectiveDef
} from "../data.js";
import { recordCharDeath } from "../state.js";
import { getBuffTotal, wakeSleepingCharOnDamage } from "./status_effects.js";
import { getCharCoreParams, getCoreLogText, getDamageAffixResult } from "../rules/affix_rules.js";
import { resolvePurifyRecovery } from "../rules/purify_rules.js";

export function logCoreActivation(
  state,
  logQueue,
  char,
  coreId,
  { once = true, message = null, metadata = null } = {}
) {
  if (!state?.combatState || !logQueue) return;
  const key = `${char.name}:${coreId}`;
  state.combatState.loggedCoreActivations ||= [];
  if (once && state.combatState.loggedCoreActivations.includes(key)) return;
  if (once) state.combatState.loggedCoreActivations.push(key);
  logQueue.push({
    msg: message || getCoreLogText(coreId),
    ...(metadata || {})
  });
}

export function getMeleeModifiers(char) {
  const classMeleeRates = {
    Fighter: 1.00,
    Samurai: 1.00,
    Ninja: 1.00,
    Ranger: 1.00,
    Thief: 1.00,
    Priest: 1.00,
    Bishop: 1.00,
    Mage: 1.00
  };
  return classMeleeRates[char.class] ?? 1.00;
}

export { getEffectiveDef } from "../rules/character_stats.js";

export function getEffectivePhysicalResistance(mon) {
  return combinePhysicalResistances(
    getPhysicalDefenseResistance(getEffectiveDef(mon)),
    mon?.physResist
  );
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
  const result = getDamageAffixResult(char, target, dmg, options);
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
    const hpBefore = char.hp;
    char.hp = Math.min(getCharMaxHp(char), char.hp + killHeal);
    if (state?.simTelemetry) {
      state.simTelemetry.killHealActivations =
        (state.simTelemetry.killHealActivations || 0) + 1;
      state.simTelemetry.killHealPotentialHp =
        (state.simTelemetry.killHealPotentialHp || 0) + killHeal;
      state.simTelemetry.killHealRecoveredHp =
        (state.simTelemetry.killHealRecoveredHp || 0) + (char.hp - hpBefore);
    }
  }

  const killMp = getCharAffixSum(char, "killMp");
  if (killMp > 0 && char.hp > 0 && char.mp < getCharMaxMp(char)) {
    const recovered = Math.min(killMp, getCharMaxMp(char) - char.mp);
    char.mp += recovered;
    logQueue.push({ msg: `[職業特性] ${char.name}は敵撃破でMPが${recovered}回復した！` });
  }

  const purify = getCharCoreParams(char, "CORE_PURIFY_RING");
  if (purify) {
    const recovery = resolvePurifyRecovery({
      target,
      targetTags: purify.targetTags,
      hp: char.hp,
      maxHp: getCharMaxHp(char),
      mp: char.mp,
      maxMp: getCharMaxMp(char),
      mpRecovery: purify.mpRecovery,
      fullMpHpRecovery: purify.fullMpHpRecovery
    });
    if (recovery.mpRecovered > 0 || recovery.hpRecovered > 0) {
      char.mp += recovery.mpRecovered;
      char.hp += recovery.hpRecovered;
      const recovered = recovery.mpRecovered > 0
        ? `MPが${recovery.mpRecovered}`
        : `HPが${recovery.hpRecovered}`;
      logCoreActivation(state, logQueue, char, "CORE_PURIFY_RING", {
        once: false,
        message: `[浄化の環] ${char.name}は${recovered}回復した！`,
        metadata: { purifyRecovery: recovery }
      });
    }
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
  const base = Math.max(1, Math.floor(calculatePhysicalAttackFormula({
    weaponAtk: getCharWeaponAtk(char),
    str: getCharStr(char),
    def: getEffectiveDef(monster),
    physResist: monster.physResist,
    meleeMod: getMeleeModifiers(char, actorIdx)
  })));
  const damage = Math.max(1, Math.round(base * thorn.counterPower));
  monster.hp = Math.max(0, monster.hp - damage);
  logCoreActivation(state, logQueue, char, "CORE_THORN_SHIELD", { once: false });
  logQueue.push({ msg: `[味方] ${char.name}の棘が${monster.name}に${damage}の反撃ダメージ！` });
  return damage;
}

export function reduceIncomingDamage(char, dmg, options = {}) {
  let next = dmg;
  const reductions = [];
  const incomingPenalties = [];
  // #611: 会心・特効・軽減の発動率計装。既定は state.combatFormulaTelemetry
  // が未設定なため no-op。結果・分岐・乱数消費順序は変更しない。
  const mitigations = options.state?.combatFormulaTelemetry?.mitigations;
  const mitigationCalls = options.state?.combatFormulaTelemetry?.mitigationCalls;
  const spellMonsterHits = options.spell
    ? options.state?.combatFormulaTelemetry?.spellMonsterHits
    : null;
  const mitigationCall = mitigationCalls
    ? {
        id: mitigationCalls.length,
        floor: options.state?.floor ?? null,
        targetClassName: char.class,
        spell: Boolean(options.spell),
        dragon: Boolean(options.dragon),
        before: dmg,
        after: null
      }
    : null;
  const recordMitigation = (type, before, after, extra = {}) => {
    mitigations?.push({
      type,
      before,
      after,
      eventId: extra.eventId ?? mitigations.length,
      floor: options.state?.floor ?? null,
      targetClassName: char.class,
      spell: Boolean(options.spell),
      dragon: Boolean(options.dragon),
      callId: mitigationCall?.id ?? null,
      ...extra
    });
  };
  if (options.spell && char.magicVulnerableTurns > 0) {
    const before = next;
    next = Math.max(1, Math.round(next * 1.3));
    recordMitigation("magicVulnerable", before, next);
  }
  const thinIcePact = getCharCoreParams(char, "CORE_THIN_ICE_PACT");
  if (thinIcePact && char.hp / Math.max(1, char.maxHp) <= thinIcePact.hpThreshold) {
    const before = next;
    next = Math.max(1, Math.round(next * thinIcePact.incomingDamageMultiplier));
    if (next > before) incomingPenalties.push("薄氷の誓約");
    recordMitigation("thinIcePact", before, next);
  }
  if (char.hp / char.maxHp <= 0.25) {
    const guardian = getCharAffixSum(char, "guardian");
    if (guardian > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - guardian / 100)));
      if (next < before) reductions.push("守護");
      recordMitigation("guardian", before, next);
    }
  }
  if (options.spell) {
    let resistPct = 0;
    const spellGuard = getCharAffixSum(char, "spellGuard");
    const mabarrierActive = char.mabarrierTurns > 0;
    if (spellGuard > 0) resistPct += spellGuard;
    if (mabarrierActive) resistPct += 30;
    resistPct = Math.min(60, resistPct);

    if (resistPct > 0) {
      const before = next;
      const eventId = mitigations?.length;
      next = Math.max(1, Math.round(next * (1 - resistPct / 100)));
      if (next < before) {
        if (mabarrierActive && spellGuard > 0) {
          reductions.push("結界と魔除け");
        } else if (mabarrierActive) {
          reductions.push("結界");
        } else {
          reductions.push("魔除け");
        }
      }
      if (spellGuard > 0) {
        recordMitigation("spellGuard", before, next, {
          eventId,
          combinedStage: mabarrierActive
        });
      }
      if (mabarrierActive) {
        recordMitigation("mabarrier", before, next, {
          eventId,
          combinedStage: spellGuard > 0
        });
      }
    }
  }
  if (!options.spell) {
    // #271: 物理版マバリア。通常被弾と逃走追撃は同じ経路を通るため、
    // ここに置くだけで死因の大半を占める追撃にも効く。
    // 呪文側（マバリア＋魔除け）と対称に上限60%。
    const physGuard = Math.min(60, getBuffTotal(char, "physGuard"));
    if (physGuard > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - physGuard / 100)));
      if (next < before) reductions.push("守りの薬");
      recordMitigation("physGuard", before, next);
    }
  }
  if (options.dragon) {
    const dragonGuard = getCharAffixSum(char, "antiDragon");
    if (dragonGuard > 0) {
      const before = next;
      next = Math.max(1, Math.round(next * (1 - dragonGuard / 100)));
      if (next < before) reductions.push("竜殺し");
      recordMitigation("antiDragon", before, next);
    }
  }
  if (options.logQueue && reductions.length > 0) {
    options.logQueue.push({ msg: `[味方] ${char.name}の${reductions.join("・")}がダメージを和らげた。` });
  }
  if (options.logQueue && incomingPenalties.length > 0) {
    options.logQueue.push({ msg: `[味方] ${char.name}は${incomingPenalties.join("・")}の代償でダメージが増えた。` });
  }
  if (mitigationCall) {
    mitigationCall.after = next;
    mitigationCalls.push(mitigationCall);
  }
  spellMonsterHits?.push({
    floor: options.state?.floor ?? null,
    targetClassName: char.class,
    dragon: Boolean(options.dragon),
    callId: mitigationCall?.id ?? null,
    damageBeforeMitigation: dmg,
    damage: next
  });
  return Math.max(1, next);
}

export function applyPartyDamage(state, combatSelection, logQueue, sourceName, minDmg, maxDmg, options = {}) {
  state.party.forEach((c, charIdx) => {
    if (c.status === "dead") return;
    const isDefending = combatSelection.actions.some(a => a.actorIdx === charIdx && a.type === "defend");
    let dmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    if (isDefending) dmg = Math.max(1, Math.round(dmg * (options.defendRate ?? 0.5)));
    dmg = reduceIncomingDamage(c, dmg, {
      spell: options.spell,
      dragon: options.dragon,
      logQueue,
      state
    });
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
      recordCharDeath(state, c, causeText, { type: "combat", source: sourceName });
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
