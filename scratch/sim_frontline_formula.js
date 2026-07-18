// 前衛火力バランス検証: 現行式 vs 方針A(武器主導+STR補正) vs A+B(敵底上げ)
// 決定論。roll[0-4]は平均2/最小0/最大4で評価。TTK=撃破必要ヒット数。
import { MONSTERS } from "../src/data/monsters.js";

// --- 前衛キャラ（初期クラス相当値） ---
const FRONT = {
  Fighter: { str: 15, hp: 20, meleeRate: 1.00 },
  Samurai: { str: 14, hp: 18, meleeRate: 0.95 }
};
// 参考: 素手だと弱いクラスも見る(盗賊/魔術師 前列時)
const BACKISH = {
  Thief: { str: 10, hp: 15, meleeRate: 0.75 },
  Mage:  { str: 7,  hp: 9,  meleeRate: 0.35 }
};

// --- 武器(atk) ---
const WEAPONS = { unarmed: 0, DAGGER: 2, SHORT_SWORD: 6, MACE: 5, RAPIER: 8,
                  LONG_SWORD: 12, CLAYMORE: 18, KATANA: 25 };

// --- ダメージ式 ---
// 現行: floor((str + wp + roll - def) * rate)
function dmgCurrent(str, wp, roll, def, rate) {
  return Math.max(1, Math.floor((str + wp + roll - def) * rate));
}
// A: floor((wp + floor((str-S0)/D) + roll - def) * rate)
function dmgA(str, wp, roll, def, rate, S0, D) {
  const strMod = Math.floor((str - S0) / D);
  return Math.max(1, Math.floor((wp + strMod + roll - def) * rate));
}
// A2: STR補正 str-10(D=1), 武器係数wMul, DEF係数dMul で高DEF破綻を緩和
function dmgA2(str, wp, roll, def, rate, { S0 = 10, wMul = 1, dMul = 1 } = {}) {
  const strMod = str - S0;
  const effDef = Math.ceil(def * dMul);
  return Math.max(1, Math.floor((wp * wMul + strMod + roll - effDef) * rate));
}

function ttk(hp, dmgAvg) { return Math.ceil(hp / Math.max(1, dmgAvg)); }

// B1(level1)/B2(level2) 敵
function enemies(level, hpMul = 1, atkAdd = 0) {
  return MONSTERS.filter(m => m.level === level && !m.isRare && !m.isBoss).map(m => ({
    name: m.name,
    hp: Math.round(m.hp * hpMul),
    def: m.def,
    atk: m.atk + atkAdd,
    physResist: m.physResist || 0
  }));
}

function applyResist(d, r) { return r ? Math.max(1, Math.round(d * (1 - r))) : d; }

// 1体に対する Fighter+SHORT_SWORD の挙動を要約
function evalFront(char, wpAtk, e, formula) {
  const f = (roll) => {
    let d = formula(char.str, wpAtk, roll, e.def, char.meleeRate);
    return applyResist(d, e.physResist);
  };
  const avg = f(2), min = f(0), max = f(4);
  const oneShot = max >= e.hp;               // 最大ロールで一撃可能か
  const oneShotAvg = avg >= e.hp;            // 平均で一撃か
  return { avg, min, max, hits: ttk(e.hp, avg), oneShot, oneShotAvg };
}

// 敵の被ダメ(緊張proxy): effAtk - charDef
function enemyDmgTo(charDef, e) { return Math.max(1, e.atk - charDef); }

function report(title, level, formula, hpMul = 1, atkAdd = 0) {
  const es = enemies(level, hpMul, atkAdd);
  console.log(`\n### ${title}  (B${level}, hpMul=${hpMul}, atkAdd=+${atkAdd})`);
  let oneShotCount = 0, oneShotAvgCount = 0;
  const fighterDef = 6; // LEATHER(4)+SMALL_SHIELD(2)
  const mageDef = 0, mageHp = 9;
  const rows = es.map(e => {
    const r = evalFront(FRONT.Fighter, WEAPONS.SHORT_SWORD, e, formula);
    if (r.oneShot) oneShotCount++;
    if (r.oneShotAvg) oneShotAvgCount++;
    const dmgToMage = enemyDmgTo(mageDef, e);
    const roundsMageSurvives = Math.ceil(mageHp / dmgToMage);
    return { name: e.name, hp: e.hp, def: e.def, avg: r.avg, hits: r.hits,
             one: r.oneShotAvg ? "★平均1発" : (r.oneShot ? "△最大1発" : ""),
             mageDmg: dmgToMage, mageTurns: roundsMageSurvives };
  });
  rows.forEach(x => {
    console.log(`  ${x.name.padEnd(14)} hp${String(x.hp).padStart(3)} def${x.def} | Ftr平均${String(x.avg).padStart(3)}/${x.hits}発 ${x.one.padEnd(7)} | →Mage被${x.mageDmg}(${x.mageTurns}発で落ち)`);
  });
  console.log(`  -- 平均1発撃破: ${oneShotAvgCount}/${es.length}  最大1発: ${oneShotCount}/${es.length}`);
}

console.log("=".repeat(70));
console.log("前衛火力: 現行 vs 方針A vs A+B  (Fighter str15 + SHORT_SWORD atk6, 前列)");
console.log("=".repeat(70));

for (const lvl of [1, 2]) {
  report("現行式", lvl, dmgCurrent);
  report("A2 str-10, wMul1, dMul1", lvl, (s,w,r,d,rt)=>dmgA2(s,w,r,d,rt,{wMul:1,dMul:1}));
  report("A2 str-10, wMul1.5, dMul0.5 (武器強/DEF半減)", lvl, (s,w,r,d,rt)=>dmgA2(s,w,r,d,rt,{wMul:1.5,dMul:0.5}));
  report("A2 str-10, wMul2, dMul0.5 (武器主導)", lvl, (s,w,r,d,rt)=>dmgA2(s,w,r,d,rt,{wMul:2,dMul:0.5}));
  report("[A2 wMul1.5/dMul0.5]+B hp×1.3 atk+1", lvl, (s,w,r,d,rt)=>dmgA2(s,w,r,d,rt,{wMul:1.5,dMul:0.5}), 1.3, 1);
}

// 武器差の可視化(方針A, def1想定, Fighter)
// ===== 深層 B3-B5 波及検証 =====
// パーティも成長する前提: str・武器を階層相応に。敵はlevel帯 + 高DEF/ボス。
const A2 = (s,w,r,d,rt)=>dmgA2(s,w,r,d,rt,{wMul:1.5,dMul:0.5}); // 採用案

function reportDeep(label, enemyList, str, wpAtk, wpName) {
  console.log(`\n### ${label}  (Fighter str${str} + ${wpName} atk${wpAtk}, 前列)`);
  const mageHp = 9;
  enemyList.forEach(e => {
    const cur = evalFront({ str, meleeRate: 1.0 }, wpAtk, e, dmgCurrent);
    const a2  = evalFront({ str, meleeRate: 1.0 }, wpAtk, e, A2);
    const mgDmg = enemyDmgTo(0, e), mgT = Math.ceil(mageHp / mgDmg);
    const flag = a2.hits >= 12 ? " ⚠詰み気味" : "";
    console.log(`  ${e.name.padEnd(14)} hp${String(e.hp).padStart(3)} def${String(e.def).padStart(2)} pR${e.physResist||0} | 現行 ${String(cur.avg).padStart(3)}/${cur.hits}発  A2 ${String(a2.avg).padStart(3)}/${a2.hits}発${flag} | →Mage被${mgDmg}(${mgT}発)`);
  });
}

// 高DEF/耐性/ボスの代表を明示的に拾う
function pick(names, hpMul=1) {
  return names.map(n => {
    const m = MONSTERS.find(x => x.name === n);
    return { name: m.name, hp: Math.round(m.hp*hpMul), def: m.def, atk: m.atk, physResist: m.physResist||0 };
  });
}

reportDeep("B3 (通常敵)", enemies(3), 16, WEAPONS.LONG_SWORD, "LONG_SWORD");
reportDeep("B3 (高DEF/耐性)", pick(["アイアンゴーレム","呪文喰い","石像兵"]), 16, WEAPONS.LONG_SWORD, "LONG_SWORD");
reportDeep("B4 (通常敵)", enemies(4), 17, WEAPONS.CLAYMORE, "CLAYMORE");
reportDeep("B5 (通常敵 lvl5)", enemies(5), 17, WEAPONS.KATANA, "KATANA");
reportDeep("B5 (高DEF/耐性)", pick(["ストーンガード","反逆の鎧","盾持ちデーモン","竜血の再生者"]), 17, WEAPONS.KATANA, "KATANA");
reportDeep("ボス/エリート", pick(["デーモンガード","フラック","レッドドラゴン","いにしえの竜"]), 17, WEAPONS.KATANA, "KATANA");

console.log("\n" + "=".repeat(70));
console.log("武器差 (Fighter str15, def1敵, 平均roll) — 現行 vs A2各案");
const variants = {
  "現行":                 (wa)=>dmgCurrent(15, wa, 2, 1, 1.0),
  "A2 wMul1.5/dMul0.5":  (wa)=>dmgA2(15, wa, 2, 1, 1.0, {wMul:1.5,dMul:0.5}),
  "A2 wMul2/dMul0.5":    (wa)=>dmgA2(15, wa, 2, 1, 1.0, {wMul:2,dMul:0.5})
};
for (const [vn, fn] of Object.entries(variants)) {
  console.log(`  [${vn}]`);
  for (const [wn, wa] of Object.entries(WEAPONS)) {
    console.log(`    ${wn.padEnd(12)} atk${String(wa).padStart(2)} -> ${fn(wa)} dmg/hit`);
  }
}
