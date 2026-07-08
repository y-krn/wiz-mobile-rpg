import { getSpellStatBonus } from "../rules/spell_rules.js";
import { getCharInt, getCharPie, getCharMaxHp } from "../rules/character_stats.js";
import { getCharAffixSum, getEffectiveHealAmount } from "../rules/item_rules.js";
import { DIR_NAMES } from "../constants/directions.js";
import { EVENT_TYPES } from "../constants/events.js";

// Helper functions for DUMAPIC
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

function getNearbyEventHints(state, range) {
  const map = state.maps?.[state.floor - 1] || state.map;
  if (!map) return [];
  const hints = [];
  const labels = {
    [EVENT_TYPES.CHEST]: "宝箱",
    [EVENT_TYPES.SPRING]: "泉",
    [EVENT_TYPES.TABLET]: "石碑",
    [EVENT_TYPES.MERCHANT]: "商人",
    [EVENT_TYPES.MIDBOSS]: "強敵",
    [EVENT_TYPES.BOSS]: "巨大な気配"
  };
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const cell = map[y][x];
      const dist = Math.abs(x - state.x) + Math.abs(y - state.y);
      if (!cell || dist === 0 || dist > range) continue;
      if (cell.event && labels[cell.event]) {
        hints.push(`${labels[cell.event]}:${getCompassDirection(state.x, state.y, x, y)}`);
      }
    }
  }
  return hints.slice(0, 3);
}

function getDangerHint(state) {
  const floorDanger = state.floor >= 5 ? "極めて危険" : state.floor >= 4 ? "危険" : state.floor >= 3 ? "警戒" : "低め";
  const nearbyThreat = findNearestCell(state, cell => cell.event === EVENT_TYPES.BOSS || cell.event === EVENT_TYPES.MIDBOSS);
  if (nearbyThreat && nearbyThreat.dist <= 4) return `${floorDanger}。近くに強大な気配`;
  return floorDanger;
}

export const SPELL_EFFECTS = {
  // Mage Spells
  HALITO: ({ caster, target, rng = Math.random }) => {
    let dmg = Math.floor(rng() * 11) + 8;
    const bonus = caster ? getSpellStatBonus(getCharInt(caster)) : 1.0;
    const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
    const fireRiteBonus = caster ? (1.0 + getCharAffixSum(caster, "fireRite") / 100) : 1.0;
    dmg = Math.round(dmg * bonus * arcaneBonus * fireRiteBonus);
    let suffix = "";
    if (target && target.magicResist) {
      dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      if (target.magicResist > 0) {
        suffix = "【レジスト！】呪文がレジストされた…";
      } else if (target.magicResist < 0) {
        suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
      }
    }
    return { damage: dmg, log: `${caster.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！${suffix}` };
  },
  KATINO: ({ caster, target: targets, rng = Math.random }) => {
    let sleptCount = 0;
    const intVal = caster ? getCharInt(caster) : 10;
    const bonus = Math.min(0.10, Math.max(0, (intVal - 10) * 0.005));
    const baseChance = 0.6 + bonus;
    targets.forEach(t => {
      const chance = (t.isBoss || t.isMidboss) ? baseChance * 0.4 : baseChance;
      if (t.hp > 0 && rng() < chance) {
        t.status = "sleep";
        t.sleepTurns = 2;
        sleptCount++;
      }
    });
    return { log: `${caster.name}はカティノを唱えた！敵${sleptCount}体を眠らせた。` };
  },
  LAHALITO: ({ caster, target: targets, rng = Math.random }) => {
    const bonus = caster ? getSpellStatBonus(getCharInt(caster)) : 1.0;
    const results = targets.map(t => {
      if (t.hp <= 0) return 0;
      let dmg = Math.floor(rng() * 21) + 15;
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      const fireRiteBonus = caster ? (1.0 + getCharAffixSum(caster, "fireRite") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * arcaneBonus * fireRiteBonus);
      let isResisted = false;
      let isWeakness = false;
      if (t.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
        if (t.magicResist > 0) isResisted = true;
        if (t.magicResist < 0) isWeakness = true;
      }
      t.hp = Math.max(0, t.hp - dmg);
      return { name: t.name, dmg, isResisted, isWeakness };
    }).filter(r => r !== 0);
    
    const logDetails = results.map(r => {
      let suffix = "";
      if (r.isResisted) suffix = "【レジスト】";
      if (r.isWeakness) suffix = "【弱点直撃！】";
      return `${r.name}に${r.dmg}のダメージ${suffix}`;
    }).join(", ");
    return { log: `${caster.name}はラハリトを唱えた！激しい炎が敵全体を焼き尽くす！(${logDetails})` };
  },
  DUMAPIC: ({ caster, target: state }) => {
    const stairs = findNearestCell(state, cell => cell.type === "stairs-down");
    const stairHint = stairs ? `下り階段:${getCompassDirection(state.x, state.y, stairs.x, stairs.y)}方面` : "下り階段:この階にはない";
    const eventHints = getNearbyEventHints(state, 3);
    const eventText = eventHints.length > 0 ? `周囲の気配:${eventHints.join(" / ")}` : "周囲の気配:特になし";
    const dangerText = `危険度:${getDangerHint(state)}`;
    const hint = `${stairHint} / ${eventText} / ${dangerText}`;
    state.dumapicTurns = 30;
    state.dumapicHint = hint;
    return { log: `${caster.name}はデュマピックを唱えた！地下${state.floor}階 X:${state.x}, Y:${state.y}, 方角:${DIR_NAMES[state.dir]}。\nDUMAPIC: ${hint}` };
  },
  MAHALITO: ({ caster, target, rng = Math.random }) => {
    let dmg = Math.floor(rng() * 21) + 30;
    const bonus = caster ? getSpellStatBonus(getCharInt(caster)) : 1.0;
    const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
    const fireRiteBonus = caster ? (1.0 + getCharAffixSum(caster, "fireRite") / 100) : 1.0;
    dmg = Math.round(dmg * bonus * arcaneBonus * fireRiteBonus);
    let suffix = "";
    if (target && target.magicResist) {
      dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      if (target.magicResist > 0) {
        suffix = "【レジスト！】呪文がレジストされた…";
      } else if (target.magicResist < 0) {
        suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
      }
    }
    return { damage: dmg, log: `${caster.name}はマハリトを唱えた！${target.name}に${dmg}の熱線ダメージ！${suffix}` };
  },
  MASFEAL: ({ caster, target: state }) => {
    const intVal = caster ? getCharInt(caster) : 10;
    const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
    const steps = Math.round(30 * durationBonus);
    state.repelTurns = steps;
    return { log: `${caster.name}はマスペアルを唱えた！気配が消え、魔物を寄せ付けなくなった。(${steps}歩の間有効)` };
  },
  MADALTO: ({ caster, target: targets, rng = Math.random }) => {
    const bonus = caster ? getSpellStatBonus(getCharInt(caster)) : 1.0;
    const results = targets.map(t => {
      if (t.hp <= 0) return 0;
      let dmg = Math.floor(rng() * 31) + 30;
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * arcaneBonus);
      let isResisted = false;
      let isWeakness = false;
      if (t.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
        if (t.magicResist > 0) isResisted = true;
        if (t.magicResist < 0) isWeakness = true;
      }
      t.hp = Math.max(0, t.hp - dmg);
      return { name: t.name, dmg, isResisted, isWeakness };
    }).filter(r => r !== 0);
    
    const logDetails = results.map(r => {
      let suffix = "";
      if (r.isResisted) suffix = "【レジスト】";
      if (r.isWeakness) suffix = "【弱点直撃！】";
      return `${r.name}に${r.dmg}のダメージ${suffix}`;
    }).join(", ");
    return { log: `${caster.name}はマダルトを唱えた！氷の嵐が敵全体を凍りつかせる！(${logDetails})` };
  },
  TILTOWAIT: ({ caster, target: targets, rng = Math.random }) => {
    const bonus = caster ? getSpellStatBonus(getCharInt(caster)) : 1.0;
    const results = targets.map(t => {
      if (t.hp <= 0) return 0;
      let dmg = Math.floor(rng() * 51) + 50;
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * arcaneBonus);
      let isResisted = false;
      let isWeakness = false;
      if (t.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
        if (t.magicResist > 0) isResisted = true;
        if (t.magicResist < 0) isWeakness = true;
      }
      t.hp = Math.max(0, t.hp - dmg);
      return { name: t.name, dmg, isResisted, isWeakness };
    }).filter(r => r !== 0);
    
    const logDetails = results.map(r => {
      let suffix = "";
      if (r.isResisted) suffix = "【レジスト】";
      if (r.isWeakness) suffix = "【弱点直撃！】";
      return `${r.name}に${r.dmg}のダメージ${suffix}`;
    }).join(", ");
    return { log: `${caster.name}はティルトウェイトを唱えた！極大爆裂の光が敵全体を消滅させる！(${logDetails})` };
  },

  // Priest Spells
  DIOS: ({ caster, target, rng = Math.random }) => {
    let heal = Math.floor(rng() * 11) + 10;
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    heal = Math.round(heal * bonus * devotionBonus);
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
    if (target.status === "blind") {
      target.status = "ok";
      cured = true;
    }
    return { log: `${caster.name}は${target.name}にディウルコを唱えた。${cured ? "状態異常が回復した！" : "しかし効果がなかった。"}` };
  },
  BADIOS: ({ caster, target, rng = Math.random }) => {
    let dmg = Math.floor(rng() * 11) + 8;
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
    dmg = Math.round(dmg * bonus * arcaneBonus);
    
    let bonusMult = 1.0;
    if (target && target.tags) {
      if (target.tags.includes("undead")) {
        bonusMult = 1.5;
      } else if (target.tags.includes("spirit")) {
        bonusMult = 1.3;
      } else if (target.tags.includes("demon")) {
        bonusMult = 1.3;
      }
    }
    dmg = Math.round(dmg * bonusMult);

    let suffix = "";
    if (target && target.magicResist) {
      dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      if (target.magicResist > 0) {
        suffix = "【レジスト！】呪文がレジストされた…";
      } else if (target.magicResist < 0) {
        suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
      }
    }
    return { damage: dmg, log: `${caster.name}はバディオスを唱えた！${target.name}に${dmg}の神聖ダメージ！${suffix}` };
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
    if (target.status === "sleep" || target.status === "paralyze" || target.status === "paralyzed") {
      target.status = "ok";
      delete target.sleepTurns;
      cured = true;
    }
    return { log: `${caster.name}は${target.name}にディアルコを唱えた。${cured ? "状態異常が回復した！" : "しかし効果がなかった。"}` };
  },
  MADIOS: ({ caster, target, rng = Math.random }) => {
    let heal = Math.floor(rng() * 36) + 35;
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    heal = Math.round(heal * bonus);
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
    if (target.status === "poisoned") {
      target.status = "ok";
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
    let heal = Math.floor(rng() * 51) + 70;
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    heal = Math.round(heal * bonus * devotionBonus);
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
  MADI: ({ caster, target: allies, rng = Math.random }) => {
    const results = [];
    const bonus = caster ? getSpellStatBonus(getCharPie(caster)) : 1.0;
    const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
    let totalHeal = 0;
    let anyHealed = false;

    allies.forEach(char => {
      if (char.status === "dead") return;
      let heal = Math.floor(rng() * 16) + 25; // 25-40
      heal = Math.round(heal * bonus * devotionBonus);
      heal = getEffectiveHealAmount(char, heal);

      const oldHp = char.hp;
      const maxHp = getCharMaxHp(char);
      char.hp = Math.min(maxHp, char.hp + heal);
      const actualHeal = char.hp - oldHp;
      totalHeal += actualHeal;
      if (actualHeal > 0) {
        anyHealed = true;
      }
      results.push({ name: char.name, heal: actualHeal });
    });

    if (!anyHealed) {
      return { heal: 0, log: `${caster.name}はマディを唱えたが、味方全体のHPは最大だった。` };
    }

    const details = results.map(r => `${r.name}(+${r.heal})`).join(", ");
    return {
      heal: totalHeal,
      log: `${caster.name}はマディを唱えた！味方全員のHPを回復した。[${details}]`
    };
  },
  KADORTO: ({ caster, target, rng = Math.random }) => {
    let logMsg;
    if (target.status === "dead") {
      const successChance = Math.min(95, 70 + (target.vit || 10));
      const roll = rng() * 100;
      if (roll < successChance) {
        target.status = "ok";
        target.hp = 1;
        logMsg = `${caster.name}は${target.name}にカドルトを唱えた。奇跡が起き、息を吹き返した！`;
      } else {
        target.status = "ash";
        target.hp = 0;
        logMsg = `${caster.name}は${target.name}にカドルトを唱えたが、力及ばず... ${target.name}は灰になってしまった！`;
      }
    } else {
      logMsg = `${caster.name}は${target.name}にカドルトを唱えた。しかし効果がなかった。`;
    }
    return { log: logMsg };
  },
  MABARRIER: ({ caster, target: allies }) => {
    allies.forEach(char => {
      if (char.status !== "dead") {
        char.mabarrierTurns = 3;
      }
    });
    return { log: `${caster.name}はマバリアを唱えた！味方全体に魔力障壁が張られた。` };
  },
  MONTINO: ({ caster, target: targets, rng = Math.random }) => {
    let silencedCount = 0;
    const intVal = caster ? getCharInt(caster) : 10;
    const pieVal = caster ? getCharPie(caster) : 10;
    const maxStat = Math.max(intVal, pieVal);
    const bonus = Math.min(0.15, Math.max(0, (maxStat - 10) * 0.015));
    const baseChance = 0.5 + bonus;

    targets.forEach(t => {
      if (t.hp > 0) {
        const chance = (t.isBoss || t.isMidboss) ? baseChance * 0.6 : baseChance;
        if (rng() < chance) {
          t.silenceTurns = 2;
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
