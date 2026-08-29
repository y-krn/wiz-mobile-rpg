import { SPELLS } from "../data/spells.js";
import { getSpellStatBonus } from "../rules/spell_rules.js";
import { getCharInt, getCharPie, getCharMaxHp } from "../rules/character_stats.js";
import { getCharAffixSum, getEffectiveHealAmount } from "../rules/item_rules.js";
import { DIR_NAMES, DX, DY } from "../constants/directions.js";
import { isMapDirectionBlocked } from "../rules/map_movement.js";
import {
  getDamageAffixResult,
  getSpellAccuracyBonus,
  recordExecutionerTrigger,
  tryApplyExecutionerSetup
} from "../rules/affix_rules.js";
import {
  applyStatusEffect,
  hasStatusEffect,
  removeStatusEffect,
  STATUS_EFFECT_IDS
} from "../combat_logic/status_effects.js";

function rollHealing(spellName, rng, minOverride = null, maxOverride = null) {
  const spell = SPELLS[spellName];
  const min = minOverride ?? spell.healMin;
  const max = maxOverride ?? spell.healMax;
  return Math.floor(rng() * (max - min + 1)) + min;
}

function applyOffensiveAffixes(
  caster,
  target,
  damage,
  { rng = Math.random, state = null, logQueue = null, spellIntrinsicTagBonus = null } = {}
) {
  tryApplyExecutionerSetup(caster, target, { rng, logQueue });
  const result = getDamageAffixResult(caster, target, damage, {
    floor: caster?.combatFloor || 1,
    maxHp: getCharMaxHp(caster),
    state,
    spellIntrinsicTagBonus
  });
  recordExecutionerTrigger(state, result.coreIds);
  return result;
}

function getSpellPowerBonus(caster) {
  return caster ? (1.0 + getCharAffixSum(caster, "spellPower") / 100) : 1.0;
}

const DUMAPIC_ONE_WAY_RADIUS = 3;

function getCompassDirection(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return "現在地";
  const vertical = dy < 0 ? "北" : (dy > 0 ? "南" : "");
  const horizontal = dx < 0 ? "西" : (dx > 0 ? "東" : "");
  if (Math.abs(dx) >= Math.abs(dy) * 2) return horizontal;
  if (Math.abs(dy) >= Math.abs(dx) * 2) return vertical;
  return `${vertical}${horizontal}`;
}

function findNearestCell(state, predicate) {
  let best = null;
  const map = state.maps?.[state.floor - 1] || state.map;
  if (!map) return null;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const cell = map[y][x];
      if (!cell || !predicate(cell)) continue;
      const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
      if (!best || dist < best.dist) best = { x, y, dist, cell };
    }
  }
  return best;
}

function getUnexploredDirection(state) {
  const map = state.maps?.[state.floor - 1] || state.map;
  if (!map) return null;
  const visitedMap = state.visitedMaps?.[state.floor - 1] || state.visitedMap;
  let nearest = null;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (!map[y]?.[x] || (x === state.x && y === state.y) || visitedMap?.[y]?.[x]) continue;
      const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
      if (!nearest || dist < nearest.dist) nearest = { x, y, dist };
    }
  }
  return nearest ? getCompassDirection(state.x, state.y, nearest.x, nearest.y) : null;
}

function getStairDistanceCategory(distance) {
  if (distance <= 3) return "近い";
  if (distance <= 7) return "やや遠い";
  return "遠い";
}

function hasNearbyOneWayPassage(state) {
  const map = state.maps?.[state.floor - 1] || state.map;
  if (!map) return false;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const cell = map[y]?.[x];
      const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
      if (!cell || dist > DUMAPIC_ONE_WAY_RADIUS || !Array.isArray(cell.walls)) continue;
      for (let dir = 0; dir < cell.walls.length; dir++) {
        if (!map?.[y + DY[dir]]?.[x + DX[dir]]) continue;
        if (cell.walls[dir] || !isMapDirectionBlocked(map, x, y, dir)) continue;
        return true;
      }
    }
  }
  return false;
}

export const SPELL_EFFECTS = {
  // Mage Spells
  HALITO: ({ caster, target, rng = Math.random, telemetryEnabled = false, state = null, logQueue = null }) => {
    const baseRoll = Math.floor(rng() * 11) + 12;
    let dmg = baseRoll;
    const statValue = caster ? getCharInt(caster) : 10;
    const bonus = caster ? getSpellStatBonus(statValue) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
    const fireRiteBonus = caster ? (1.0 + getCharAffixSum(caster, "fireRite") / 100) : 1.0;
    dmg = Math.round(dmg * bonus * spellPowerBonus * arcaneBonus * fireRiteBonus);
    const preAffixDamage = dmg;
    const affixResult = applyOffensiveAffixes(caster, target, dmg, { rng, state, logQueue });
    dmg = affixResult.damage;
    const postAffixDamage = dmg;
    let suffix = "";
    if (target && target.magicResist) {
      dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      if (target.magicResist > 0) {
        suffix = "【レジスト！】呪文がレジストされた…";
      } else if (target.magicResist < 0) {
        suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
      }
    }
    return {
      damage: dmg,
      preMagicResistDamage: affixResult.damage,
      coreIds: affixResult.coreIds,
      formulaTelemetry: telemetryEnabled ? {
        baseRoll,
        statName: "int",
        statValue,
        statBonus: bonus,
        spellPowerBonus,
        arcaneBonus,
        fireRiteBonus,
        preAffixDamage,
        postAffixDamage,
        magicResist: target?.magicResist ?? 0,
        damage: dmg
      } : undefined,
      log: `${caster.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！${suffix}`
    };
  },
  KATINO: ({ caster, target: targets, rng = Math.random }) => {
    let sleptCount = 0;
    const intVal = caster ? getCharInt(caster) : 10;
    const bonus = Math.min(0.10, Math.max(0, (intVal - 10) * 0.005));
    const baseChance = Math.min(1, 0.6 + bonus + getSpellAccuracyBonus(caster));
    targets.forEach(t => {
      const chance = (t.isBoss || t.isMidboss) ? baseChance * 0.4 : baseChance;
      if (t.hp > 0 && rng() < chance) {
        applyStatusEffect(t, STATUS_EFFECT_IDS.SLEEP, { remainingTurns: 2 });
        sleptCount++;
      }
    });
    return { log: `${caster.name}はカティノを唱えた！敵${sleptCount}体を眠らせた。` };
  },
  LAHALITO: ({ caster, target: targets, rng = Math.random, telemetryEnabled = false, state = null, logQueue = null }) => {
    const statValue = caster ? getCharInt(caster) : 10;
    const bonus = caster ? getSpellStatBonus(statValue) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const results = targets.map(t => {
      if (t.hp <= 0) return 0;
      const baseRoll = Math.floor(rng() * 21) + 15;
      let dmg = baseRoll;
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      const fireRiteBonus = caster ? (1.0 + getCharAffixSum(caster, "fireRite") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * spellPowerBonus * arcaneBonus * fireRiteBonus);
      const preAffixDamage = dmg;
      const affixResult = applyOffensiveAffixes(caster, t, dmg, { rng, state, logQueue });
      dmg = affixResult.damage;
      const postAffixDamage = dmg;
      let isResisted = false;
      let isWeakness = false;
      if (t.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
        if (t.magicResist > 0) isResisted = true;
        if (t.magicResist < 0) isWeakness = true;
      }
      t.hp = Math.max(0, t.hp - dmg);
      return {
        target: t,
        name: t.name,
        dmg,
        preMagicResistDamage: affixResult.damage,
        isResisted,
        isWeakness,
        coreIds: affixResult.coreIds,
        formulaTelemetry: telemetryEnabled ? {
          baseRoll,
          statName: "int",
          statValue,
          statBonus: bonus,
          spellPowerBonus,
          arcaneBonus,
          fireRiteBonus,
          preAffixDamage,
          postAffixDamage,
          magicResist: t.magicResist ?? 0,
          damage: dmg
        } : undefined
      };
    }).filter(r => r !== 0);
    
    const logDetails = results.map(r => {
      let suffix = "";
      if (r.isResisted) suffix = "【レジスト】";
      if (r.isWeakness) suffix = "【弱点直撃！】";
      return `${r.name}に${r.dmg}のダメージ${suffix}`;
    }).join(", ");
    return {
      damageByTarget: results,
      coreIds: [...new Set(results.flatMap(result => result.coreIds))],
      log: `${caster.name}はラハリトを唱えた！激しい炎が敵全体を焼き尽くす！(${logDetails})`
    };
  },
  DUMAPIC: ({ caster, target: state }) => {
    const stairs = findNearestCell(state, cell => cell.type === "stairs-down");
    const surveyLines = [
      `DUMAPIC — B${state.floor} / ${DIR_NAMES[state.dir]}向き`,
      `測量座標 X:${state.x} Y:${state.y}`
    ];
    const unexploredDirection = getUnexploredDirection(state);
    if (unexploredDirection) surveyLines.push(`${unexploredDirection}方に未踏領域の広がりを感じる。`);
    if (stairs) {
      const stairDirection = getCompassDirection(state.x, state.y, stairs.x, stairs.y);
      surveyLines.push(`${stairDirection}の${getStairDistanceCategory(stairs.dist)}に下層へ続く構造を感知した。`);
    }
    if (hasNearbyOneWayPassage(state)) surveyLines.push("近辺の空間にわずかな歪みがある。");
    if (surveyLines.length === 2) surveyLines.push("特異な構造は感じない。");
    return { log: `${caster.name}はデュマピックを唱えた！\n${surveyLines.join("\n")}` };
  },
  MAHALITO: ({ caster, target, rng = Math.random, telemetryEnabled = false, state = null, logQueue = null }) => {
    const baseRoll = Math.floor(rng() * 21) + 30;
    let dmg = baseRoll;
    const statValue = caster ? getCharInt(caster) : 10;
    const bonus = caster ? getSpellStatBonus(statValue) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
    const fireRiteBonus = caster ? (1.0 + getCharAffixSum(caster, "fireRite") / 100) : 1.0;
    dmg = Math.round(dmg * bonus * spellPowerBonus * arcaneBonus * fireRiteBonus);
    const preAffixDamage = dmg;
    const affixResult = applyOffensiveAffixes(caster, target, dmg, { rng, state, logQueue });
    dmg = affixResult.damage;
    const postAffixDamage = dmg;
    let suffix = "";
    if (target && target.magicResist) {
      dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      if (target.magicResist > 0) {
        suffix = "【レジスト！】呪文がレジストされた…";
      } else if (target.magicResist < 0) {
        suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
      }
    }
    return {
      damage: dmg,
      preMagicResistDamage: affixResult.damage,
      coreIds: affixResult.coreIds,
      formulaTelemetry: telemetryEnabled ? {
        baseRoll,
        statName: "int",
        statValue,
        statBonus: bonus,
        spellPowerBonus,
        arcaneBonus,
        fireRiteBonus,
        preAffixDamage,
        postAffixDamage,
        magicResist: target?.magicResist ?? 0,
        damage: dmg
      } : undefined,
      log: `${caster.name}はマハリトを唱えた！${target.name}に${dmg}の熱線ダメージ！${suffix}`
    };
  },
  MASFEAL: ({ caster, target: state }) => {
    const intVal = caster ? getCharInt(caster) : 10;
    const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
    const steps = Math.round(30 * durationBonus);
    state.repelTurns = steps;
    return { log: `${caster.name}はマスペアルを唱えた！気配が消え、魔物を寄せ付けなくなった。(${steps}歩の間有効)` };
  },
  MADALTO: ({ caster, target: targets, rng = Math.random, telemetryEnabled = false, state = null, logQueue = null }) => {
    const statValue = caster ? getCharInt(caster) : 10;
    const bonus = caster ? getSpellStatBonus(statValue) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const results = targets.map(t => {
      if (t.hp <= 0) return 0;
      const baseRoll = Math.floor(rng() * 31) + 30;
      let dmg = baseRoll;
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * spellPowerBonus * arcaneBonus);
      const preAffixDamage = dmg;
      const affixResult = applyOffensiveAffixes(caster, t, dmg, { rng, state, logQueue });
      dmg = affixResult.damage;
      const postAffixDamage = dmg;
      let isResisted = false;
      let isWeakness = false;
      if (t.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
        if (t.magicResist > 0) isResisted = true;
        if (t.magicResist < 0) isWeakness = true;
      }
      t.hp = Math.max(0, t.hp - dmg);
      return {
        target: t,
        name: t.name,
        dmg,
        preMagicResistDamage: affixResult.damage,
        isResisted,
        isWeakness,
        coreIds: affixResult.coreIds,
        formulaTelemetry: telemetryEnabled ? {
          baseRoll,
          statName: "int",
          statValue,
          statBonus: bonus,
          spellPowerBonus,
          arcaneBonus,
          fireRiteBonus: 1,
          preAffixDamage,
          postAffixDamage,
          magicResist: t.magicResist ?? 0,
          damage: dmg
        } : undefined
      };
    }).filter(r => r !== 0);
    
    const logDetails = results.map(r => {
      let suffix = "";
      if (r.isResisted) suffix = "【レジスト】";
      if (r.isWeakness) suffix = "【弱点直撃！】";
      return `${r.name}に${r.dmg}のダメージ${suffix}`;
    }).join(", ");
    return {
      damageByTarget: results,
      coreIds: [...new Set(results.flatMap(result => result.coreIds))],
      log: `${caster.name}はマダルトを唱えた！氷の嵐が敵全体を凍りつかせる！(${logDetails})`
    };
  },
  TILTOWAIT: ({ caster, target: targets, rng = Math.random, telemetryEnabled = false, state = null, logQueue = null }) => {
    const statValue = caster ? getCharInt(caster) : 10;
    const bonus = caster ? getSpellStatBonus(statValue) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const results = targets.map(t => {
      if (t.hp <= 0) return 0;
      const baseRoll = Math.floor(rng() * 51) + 50;
      let dmg = baseRoll;
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * spellPowerBonus * arcaneBonus);
      const preAffixDamage = dmg;
      const affixResult = applyOffensiveAffixes(caster, t, dmg, { rng, state, logQueue });
      dmg = affixResult.damage;
      const postAffixDamage = dmg;
      let isResisted = false;
      let isWeakness = false;
      if (t.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
        if (t.magicResist > 0) isResisted = true;
        if (t.magicResist < 0) isWeakness = true;
      }
      t.hp = Math.max(0, t.hp - dmg);
      return {
        target: t,
        name: t.name,
        dmg,
        preMagicResistDamage: affixResult.damage,
        isResisted,
        isWeakness,
        coreIds: affixResult.coreIds,
        formulaTelemetry: telemetryEnabled ? {
          baseRoll,
          statName: "int",
          statValue,
          statBonus: bonus,
          spellPowerBonus,
          arcaneBonus,
          fireRiteBonus: 1,
          preAffixDamage,
          postAffixDamage,
          magicResist: t.magicResist ?? 0,
          damage: dmg
        } : undefined
      };
    }).filter(r => r !== 0);
    
    const logDetails = results.map(r => {
      let suffix = "";
      if (r.isResisted) suffix = "【レジスト】";
      if (r.isWeakness) suffix = "【弱点直撃！】";
      return `${r.name}に${r.dmg}のダメージ${suffix}`;
    }).join(", ");
    return {
      damageByTarget: results,
      coreIds: [...new Set(results.flatMap(result => result.coreIds))],
      log: `${caster.name}はティルトウェイトを唱えた！極大爆裂の光が敵全体を消滅させる！(${logDetails})`
    };
  },

  // Priest Spells
  DIOS: ({ caster, target, rng = Math.random }) => {
    let heal = rollHealing("DIOS", rng);
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    heal = Math.round(heal * bonus * spellPowerBonus * devotionBonus);
    heal = getEffectiveHealAmount(target, heal);
    const oldHp = target.hp;
    const maxHp = getCharMaxHp(target);
    target.hp = Math.min(maxHp, target.hp + heal);
    const actualHeal = target.hp - oldHp;
    if (actualHeal === 0) {
      return { heal: 0, log: `${caster.name}はディオスを唱えたが、${target.name}のHPは最大だった。` };
    }
    return { heal: actualHeal, log: `${caster.name}はディオスを唱えた！${target.name}のHPを${actualHeal}回復した。` };
  },
  DIURCO: ({ caster, target }) => {
    let cured = false;
    if (hasStatusEffect(target, STATUS_EFFECT_IDS.BLIND)) {
      removeStatusEffect(target, STATUS_EFFECT_IDS.BLIND);
      cured = true;
    }
    return { log: `${caster.name}は${target.name}にディウルコを唱えた。${cured ? "状態異常が回復した！" : "しかし効果がなかった。"}` };
  },
  BADIOS: ({ caster, target, rng = Math.random, telemetryEnabled = false, state = null, logQueue = null }) => {
    const baseRoll = Math.floor(rng() * 11) + 8;
    let dmg = baseRoll;
    const statValue = caster ? getCharPie(caster) : 10;
    const bonus = caster ? getSpellStatBonus(statValue) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
    dmg = Math.round(dmg * bonus * spellPowerBonus * arcaneBonus);
    
    const preTargetBonusDamage = dmg;
    const preAffixDamage = dmg;
    const affixResult = applyOffensiveAffixes(caster, target, dmg, {
      state,
      rng,
      logQueue,
      spellIntrinsicTagBonus: SPELLS.BADIOS.intrinsicTagBonus
    });
    dmg = affixResult.damage;
    const postAffixDamage = dmg;

    let suffix = "";
    if (target && target.magicResist) {
      dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      if (target.magicResist > 0) {
        suffix = "【レジスト！】呪文がレジストされた…";
      } else if (target.magicResist < 0) {
        suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
      }
    }
    return {
      damage: dmg,
      preMagicResistDamage: affixResult.damage,
      coreIds: affixResult.coreIds,
      formulaTelemetry: telemetryEnabled ? {
        baseRoll,
        statName: "pie",
        statValue,
        statBonus: bonus,
        spellPowerBonus,
        arcaneBonus,
        fireRiteBonus: 1,
        preTargetBonusDamage,
        targetTagBonus: affixResult.targetTagBonus,
        targetTagContributions: affixResult.targetTagContributions,
        spellIntrinsicTagBonus: SPELLS.BADIOS.intrinsicTagBonus,
        preAffixDamage,
        postAffixDamage,
        magicResist: target?.magicResist ?? 0,
        damage: dmg
      } : undefined,
      log: `${caster.name}はバディオスを唱えた！${target.name}に${dmg}の神聖ダメージ！${suffix}`
    };
  },
  MILWA: ({ caster, target: state }) => {
    const pieVal = caster ? getCharPie(caster) : 10;
    const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
    const steps = Math.round(30 * durationBonus);
    state.lightTurns = (state.lightTurns || 0) + steps;
    if (state.lightPower !== "lomilwa") state.lightPower = "milwa";
    return { log: `${caster.name}はミルワを唱えた！${steps}歩の間、明かりが罠と不意打ちへの警戒を助ける。` };
  },
  DIALKO: ({ caster, target }) => {
    let cured = false;
    const id = target.status === "sleep"
      ? STATUS_EFFECT_IDS.SLEEP
      : target.status === "paralyze" || target.status === "paralyzed"
        ? STATUS_EFFECT_IDS.PARALYZED
        : null;
    if (id && hasStatusEffect(target, id)) {
      removeStatusEffect(target, id);
      cured = true;
    }
    return { log: `${caster.name}は${target.name}にディアルコを唱えた。${cured ? "状態異常が回復した！" : "しかし効果がなかった。"}` };
  },
  MADIOS: ({ caster, target, rng = Math.random }) => {
    let heal = rollHealing("MADIOS", rng);
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    heal = Math.round(heal * bonus * spellPowerBonus * devotionBonus);
    heal = getEffectiveHealAmount(target, heal);
    const oldHp = target.hp;
    const maxHp = getCharMaxHp(target);
    target.hp = Math.min(maxHp, target.hp + heal);
    const actualHeal = target.hp - oldHp;
    if (actualHeal === 0) {
      return { heal: 0, log: `${caster.name}はマディオスを唱えたが、${target.name}のHPは最大だった。` };
    }
    return { heal: actualHeal, log: `${caster.name}はマディオスを唱えた！${target.name}のHPを${actualHeal}大幅に回復した。` };
  },
  LATUMOFIS: ({ caster, target }) => {
    let cured = false;
    if (hasStatusEffect(target, STATUS_EFFECT_IDS.POISONED)) {
      removeStatusEffect(target, STATUS_EFFECT_IDS.POISONED);
      cured = true;
    }
    return { log: `${caster.name}は${target.name}にラツモフィスを唱えた。${cured ? "毒が消え去った！" : "しかし効果がなかった。"}` };
  },
  LOMILWA: ({ caster, target: state }) => {
    const pieVal = caster ? getCharPie(caster) : 10;
    const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
    const steps = Math.round(100 * durationBonus);
    state.lightTurns = (state.lightTurns || 0) + steps;
    state.lightPower = "lomilwa";
    return { log: `${caster.name}はロミルワを唱えた！${steps}歩の間、強い光が罠・不意打ち・隠れた気配を照らす。` };
  },
  DIALMA: ({ caster, target, rng = Math.random }) => {
    let heal = rollHealing("DIALMA", rng);
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    heal = Math.round(heal * bonus * spellPowerBonus * devotionBonus);
    heal = getEffectiveHealAmount(target, heal);
    const oldHp = target.hp;
    const maxHp = getCharMaxHp(target);
    target.hp = Math.min(maxHp, target.hp + heal);
    const actualHeal = target.hp - oldHp;
    if (actualHeal === 0) {
      return { heal: 0, log: `${caster.name}はディアルマを唱えたが、${target.name}のHPは最大だった。` };
    }
    return { heal: actualHeal, log: `${caster.name}はディアルマを唱えた！${target.name}のHPを${actualHeal}大回復した。` };
  },
  MADI: ({ caster, target, rng = Math.random, healMin = null, healMax = null }) => {
    let heal = rollHealing("MADI", rng, healMin, healMax);
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const spellPowerBonus = getSpellPowerBonus(caster);
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    heal = Math.round(heal * bonus * spellPowerBonus * devotionBonus);
    heal = getEffectiveHealAmount(target, heal);
    const oldHp = target.hp;
    const maxHp = getCharMaxHp(target);
    target.hp = Math.min(maxHp, target.hp + heal);
    const actualHeal = target.hp - oldHp;
    if (actualHeal === 0) {
      return { heal: 0, log: `${caster.name}はマディを唱えたが、${target.name}のHPは最大だった。` };
    }
    return {
      heal: actualHeal,
      log: `${caster.name}はマディを唱えた！${target.name}のHPを${actualHeal}回復した。`
    };
  },
  MABARRIER: ({ caster, target: allies }) => {
    allies.forEach(char => {
      if (char.status !== "dead") {
        char.mabarrierTurns = 3;
      }
    });
    return { log: `${caster.name}はマバリアを唱えた！自身に魔力障壁が張られた。` };
  },
  MONTINO: ({ caster, target: targets, rng = Math.random }) => {
    let silencedCount = 0;
    const intVal = caster ? getCharInt(caster) : 10;
    const pieVal = caster ? getCharPie(caster) : 10;
    const maxStat = Math.max(intVal, pieVal);
    const bonus = Math.min(0.15, Math.max(0, (maxStat - 10) * 0.015));
    const baseChance = Math.min(1, 0.5 + bonus + getSpellAccuracyBonus(caster));

    targets.forEach(t => {
      if (t.hp > 0) {
        const chance = (t.isBoss || t.isMidboss) ? baseChance * 0.6 : baseChance;
        if (rng() < chance) {
          applyStatusEffect(t, STATUS_EFFECT_IDS.SILENCE, { remainingTurns: 2 });
          silencedCount++;
        }
      }
    });
    return { log: `${caster.name}はモンティノを唱えた！敵${silencedCount}体を沈黙させた。` };
  },
  MORLIS: ({ caster, target: targets }) => {
    targets.forEach(t => {
      if (t.hp > 0) {
        if (!t.buffs) t.buffs = [];
        t.buffs.push({ type: "magicResist", value: -0.2, turns: 3 });
      }
    });
    return { log: `${caster.name}はモーリスを唱えた！敵全体の魔法耐性を下げた。` };
  },
  WEAKEN: ({ caster, target: targets }) => {
    targets.forEach(t => {
      if (t.hp > 0) {
        if (!t.buffs) t.buffs = [];
        t.buffs.push({ type: "atk", value: -3, turns: 3 });
      }
    });
    return { log: `${caster.name}はウィークンを唱えた！敵全体の攻撃力を下げた。` };
  }
};
