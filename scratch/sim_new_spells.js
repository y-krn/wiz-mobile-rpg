// Balance impact sim for PROPOSED spells (ZILWAN / DEF-down / ATK-down / MADI).
// Prototype spells are registered into the live SPELLS object and exercised via
// the real combat engine. Baseline and enhanced arms share ONE base plan; the
// enhanced arm only inserts the new spell (all other behavior held identical),
// so the delta is attributable to the spell, not to AI differences.
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { MONSTERS, SPELLS } from "../src/data.js";
import { getSpellStatBonus } from "../src/rules/spell_rules.js";
import { getCharInt, getCharPie, getCharMaxHp } from "../src/rules/character_stats.js";

// ---- Prototype spells (mirror existing effect conventions) ----
SPELLS.ZILWAN = {
  name: "ZILWAN", type: "mage", level: 4, cost: 3, target: "single_enemy",
  effect: (caster, target) => {
    let dmg = Math.round((Math.floor(Math.random() * 11) + 10) * (caster ? getSpellStatBonus(getCharInt(caster)) : 1));
    const tags = target.tags || [];
    let mult = (tags.includes("undead") || tags.includes("dragon") || tags.includes("demon")) ? (target.isBoss ? 1.3 : 2.0) : 0.5;
    dmg = Math.round(dmg * mult);
    if (target.magicResist) dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
    return { damage: dmg, log: `ZILWAN ${dmg}` };
  }
};
SPELLS.BAKADI = { // enemy physical DEF down
  name: "BAKADI", type: "mage", level: 3, cost: 3, target: "all_enemies",
  effect: (_c, ts) => { ts.forEach(t => { if (t.hp > 0) { (t.buffs = t.buffs || []).push({ type: "def", value: -4, turns: 3 }); } }); return { log: "BAKADI" }; }
};
SPELLS.WEAKEN = { // enemy physical ATK down
  name: "WEAKEN", type: "priest", level: 3, cost: 3, target: "all_enemies",
  effect: (_c, ts) => { ts.forEach(t => { if (t.hp > 0) { (t.buffs = t.buffs || []).push({ type: "atk", value: -4, turns: 3 }); } }); return { log: "WEAKEN" }; }
};
SPELLS.MADI = { // group heal, spread thin
  name: "MADI", type: "priest", level: 5, cost: 5, target: "all_allies",
  effect: (caster, allies) => {
    const b = caster ? getSpellStatBonus(getCharPie(caster)) : 1;
    allies.forEach(t => { if (t.status !== "dead") t.hp = Math.min(getCharMaxHp(t), t.hp + Math.round((Math.floor(Math.random() * 16) + 25) * b)); });
    return { log: "MADI" };
  }
};

function createParty(level = 5) {
  const s = level - 5;
  return [
    { name: "Fighter", class: "Fighter", level, hp: 55 + s*9, maxHp: 55 + s*9, mp: 0, maxMp: 0, status: "ok", str: 15, int: 8, pie: 8, vit: 14, agi: 12, luk: 10, equipment: { weapon: { name: "ロングソード", atk: 12 }, shield: { name: "ヒーターシールド", def: 5 }, armor: { name: "鎖帷子", def: 6 } }, spells: [] },
    { name: "Samurai", class: "Samurai", level, hp: 48 + s*8, maxHp: 48 + s*8, mp: Math.max(0, 4 + s), maxMp: Math.max(0, 4 + s), status: "ok", str: 14, int: 11, pie: 8, vit: 12, agi: 13, luk: 9, equipment: { weapon: { name: "刀", atk: 14 }, shield: null, armor: { name: "ハラアテ", def: 4 } }, spells: ["HALITO"] },
    { name: "Priest", class: "Priest", level, hp: 36 + s*6, maxHp: 36 + s*6, mp: Math.max(0, 12 + s*2), maxMp: Math.max(0, 12 + s*2), status: "ok", str: 10, int: 10, pie: 15, vit: 10, agi: 11, luk: 10, equipment: { weapon: { name: "メイス", atk: 8 }, shield: { name: "ターゲットシールド", def: 3 }, armor: { name: "革鎧", def: 3 } }, spells: ["DIOS", "MABARRIER"] },
    { name: "Mage", class: "Mage", level, hp: 24 + s*4, maxHp: 24 + s*4, mp: Math.max(0, 10 + s*2), maxMp: Math.max(0, 10 + s*2), status: "ok", str: 8, int: 16, pie: 8, vit: 9, agi: 12, luk: 11, equipment: { weapon: { name: "スタッフ", atk: 4 }, shield: null, armor: { name: "ローブ", def: 1 } }, spells: ["HALITO", "MAHALITO", "LAHALITO", "MONTINO"] }
  ];
}
function getMonster(name, o = {}) {
  const m = MONSTERS.find(x => x.name === name); if (!m) throw new Error(name);
  return { ...m, hp: o.hp ?? m.hp, maxHp: o.hp ?? m.hp, isBoss: o.isBoss ?? m.isBoss, spell: o.spell ?? m.spell, spellChance: o.spellChance ?? m.spellChance, magicResist: o.magicResist ?? m.magicResist };
}
const firstLiving = s => s.combatState.monsters.findIndex(m => m.hp > 0);
const hpFrac = c => c.hp / c.maxHp;

// Shared base plan: Priest heals <50% (DIOS), Mage nukes LAHALITO, else fight.
function basePlan(char, idx, state) {
  if (char.class === "Priest" && char.mp >= 1) {
    const t = state.party.findIndex(c => c.status !== "dead" && hpFrac(c) < 0.5);
    if (t >= 0) return { type: "spell", actorIdx: idx, targetIdx: t, spellName: "DIOS" };
  }
  if (char.class === "Mage" && char.mp >= 3) return { type: "spell", actorIdx: idx, targetIdx: firstLiving(state), spellName: "LAHALITO" };
  return { type: "fight", actorIdx: idx, targetIdx: firstLiving(state) };
}

function simulate(tmpl, count, plan, level, { isBoss = false, immortal = false } = {}) {
  const party = createParty(level);
  const monsters = Array.from({ length: count }, (_, i) => ({ ...JSON.parse(JSON.stringify(tmpl)), id: `m_${i}` }));
  const state = { party, combatState: { monsters, isBoss, isMidboss: false, isRoamingFlack: false, allParalyzedTurns: 0, phase: "choose_actions" }, inventory: [], firstKills: [], codex: null, currentRun: { itemsFound: [], equipmentFound: [] }, roamingMonsters: [], floorChestsTotal: [], gold: 0, floor: 5 };
  let turns = 0, dmgTaken = 0, killTurn = -1;
  while (turns < 30) {
    const alive = state.party.some(c => c.status !== "dead");
    const monAlive = state.combatState.monsters.some(m => m.hp > 0);
    if (!monAlive && killTurn < 0) killTurn = turns;
    if (!alive || !monAlive) break;
    const before = state.party.map(c => c.hp);
    const actions = [];
    state.party.forEach((char, idx) => { if (!["dead", "paralyzed", "sleep"].includes(char.status)) actions.push(plan(char, idx, state)); });
    const r = runCombatRoundCalculation(state, { actions });
    state.party = r.state.party; state.combatState = r.state.combatState;
    state.party.forEach((c, i) => { dmgTaken += Math.max(0, before[i] - c.hp); });
    if (immortal) state.party.forEach(c => { if (c.status !== "dead") c.hp = c.maxHp; });
    turns++;
  }
  const monLeft = state.combatState.monsters.reduce((a, m) => a + Math.max(0, m.hp), 0);
  const win = state.party.some(c => c.status !== "dead") && !state.combatState.monsters.some(m => m.hp > 0);
  return { win: win ? 1 : 0, tpk: state.party.some(c => c.status !== "dead") ? 0 : 1, turns, dmgTaken, killTurn: killTurn < 0 ? 30 : killTurn, monLeft };
}

function suite(label, monsterName, override, count, plan, level, runs, opt = {}) {
  const tmpl = getMonster(monsterName, override);
  let tpk = 0, win = 0, turns = 0, dmg = 0, kill = 0, left = 0;
  for (let i = 0; i < runs; i++) { const r = simulate(tmpl, count, plan, level, opt); tpk += r.tpk; win += r.win; turns += r.turns; dmg += r.dmgTaken; kill += r.killTurn; left += r.monLeft; }
  const cols = opt.immortal
    ? `KillTurns=${(kill/runs).toFixed(1)}  BossHPleft@30=${(left/runs).toFixed(0)}`
    : `TPK=${(tpk/runs*100).toFixed(1)}%  Win=${(win/runs*100).toFixed(1)}%  KillTurns=${(kill/runs).toFixed(1)}  DmgTaken=${(dmg/runs).toFixed(0)}`;
  console.log(`    ${label.padEnd(9)}: ${cols}`);
}

// enhanced plan factory: base plan + insert new spell for a class under a condition
function withSpell(spellName, forClass, cond) {
  return (char, idx, state) => {
    if (char.class === forClass && cond(char, idx, state)) return { type: "spell", actorIdx: idx, targetIdx: cond.targetIdx ? cond.targetIdx(state) : firstLiving(state), spellName };
    return basePlan(char, idx, state);
  };
}

console.log("=== Proposed Spell Balance Impact (real engine, 800 runs) ===");
const RUNS = 800;

// Single-target mage plan using 020-buffed MAHALITO (30-50) — proper single-target baseline.
const mageSpell = name => (c, i, s) => c.class === "Mage" && c.mp >= 3 ? { type: "spell", actorIdx: i, targetIdx: firstLiving(s), spellName: name } : basePlan(c, i, s);

// [1] Single-target throughput vs boss dragon (immortal isolates火力). 3 arms.
console.log("\n[1] 単体火力 vs いにしえの竜 (dragon boss 640HP) @L8  ※不死・30T残HP小=火力高");
suite("LAHALITO", "いにしえの竜", {}, 1, basePlan, 8, RUNS, { isBoss: true, immortal: true });
suite("MAHALITO", "いにしえの竜", {}, 1, mageSpell("MAHALITO"), 8, RUNS, { isBoss: true, immortal: true });
suite("ZILWAN", "いにしえの竜", {}, 1, mageSpell("ZILWAN"), 8, RUNS, { isBoss: true, immortal: true });

// [1b] Single chunky dragon (non-boss). ZILWAN full 2.0x vs buffed MAHALITO.
console.log("\n[1b] 単体火力 vs レッドドラゴン x1 (dragon 200HP, 非ボス) @L7  ※不死・討伐T小=火力高");
suite("LAHALITO", "レッドドラゴン", {}, 1, basePlan, 7, RUNS, { immortal: true });
suite("MAHALITO", "レッドドラゴン", {}, 1, mageSpell("MAHALITO"), 7, RUNS, { immortal: true });
suite("ZILWAN", "レッドドラゴン", {}, 1, mageSpell("ZILWAN"), 7, RUNS, { immortal: true });

// [2] BAKADI (DEF down): two rows.
//   (a) 石像兵 = 装甲だが魔法弱点(magicResist -0.4) → 現ロスターの典型。nukeが上位でBAKADIは損。
//   (b) 仮想「装甲+魔法耐性」敵(magicResist +0.4に上書き) → BAKADIが機能する条件の天井。
console.log("\n[2a] BAKADI (敵DEF↓) vs 石像兵 x2 (def15, 魔法弱点) @L5  ※装甲=魔法弱点の実例");
suite("baseline", "石像兵", {}, 2, basePlan, 5, RUNS);
suite("+BAKADI", "石像兵", {}, 2, (c, i, s) => {
  if (c.class === "Mage" && c.mp >= 3 && !s.combatState.monsters.some(m => m.hp > 0 && (m.buffs || []).some(b => b.type === "def")))
    return { type: "spell", actorIdx: i, targetIdx: firstLiving(s), spellName: "BAKADI" };
  return basePlan(c, i, s);
}, 5, RUNS);
console.log("[2b] BAKADI vs 仮想:石像兵(magicResist+0.4に上書き) x2 @L5  ※装甲+魔法耐性が居たらの天井");
const noNuke = (c, i, s) => c.class === "Mage" ? { type: "fight", actorIdx: i, targetIdx: firstLiving(s) } : basePlan(c, i, s);
suite("baseline", "石像兵", { magicResist: 0.4 }, 2, noNuke, 5, RUNS);
suite("+BAKADI", "石像兵", { magicResist: 0.4 }, 2, (c, i, s) => {
  if (c.class === "Mage" && c.mp >= 3 && !s.combatState.monsters.some(m => m.hp > 0 && (m.buffs || []).some(b => b.type === "def")))
    return { type: "spell", actorIdx: i, targetIdx: firstLiving(s), spellName: "BAKADI" };
  return noNuke(c, i, s);
}, 5, RUNS);

// [3] WEAKEN (ATK down) vs lethal physical pack — survivability delta
console.log("\n[3] WEAKEN (敵ATK↓) vs ポイズンジャイアント x2 (atk19) @L6  ※致死パック");
suite("baseline", "ポイズンジャイアント", {}, 2, basePlan, 6, RUNS);
suite("+WEAKEN", "ポイズンジャイアント", {}, 2, (c, i, s) => {
  if (c.class === "Priest" && c.mp >= 3 && !s.party.some(p => p.status !== "dead" && hpFrac(p) < 0.5) && !s.combatState.monsters.some(m => m.hp > 0 && (m.buffs || []).some(b => b.type === "atk")))
    return { type: "spell", actorIdx: i, targetIdx: firstLiving(s), spellName: "WEAKEN" };
  return basePlan(c, i, s);
}, 6, RUNS);

// [4] MADI (group heal) vs sustained physical pack — survivability vs single-heal
console.log("\n[4] MADI (全体回復) vs ポイズンジャイアント x2 (atk19) @L6");
suite("baseline", "ポイズンジャイアント", {}, 2, basePlan, 6, RUNS);
suite("+MADI", "ポイズンジャイアント", {}, 2, (c, i, s) => {
  if (c.class === "Priest" && c.mp >= 5 && s.party.filter(p => p.status !== "dead" && hpFrac(p) < 0.6).length >= 2)
    return { type: "spell", actorIdx: i, targetIdx: -1, spellName: "MADI" };
  return basePlan(c, i, s);
}, 6, RUNS);

console.log("\n(注: prototype数値。ZILWAN=10-20×INT×tag[mob2.0/boss1.3]、BAKADI/WEAKEN=-4/3T、MADI=25-40×PIE/人。[1][1b]は不死パーティ=火力純測定)");
