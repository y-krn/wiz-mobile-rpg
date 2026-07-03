// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { MONSTERS } from "../src/data.js";

// Helper to create a standard level party
function createParty(level = 5) {
  const hpScale = level - 5;
  return [
    {
      name: "Fighter",
      class: "Fighter",
      level: level,
      hp: 55 + hpScale * 9, maxHp: 55 + hpScale * 9,
      mp: 0, maxMp: 0,
      status: "ok",
      str: 15, int: 8, pie: 8, vit: 14, agi: 12, luk: 10,
      equipment: { weapon: { name: "ロングソード", atk: 12 }, shield: { name: "ヒーターシールド", def: 5 }, armor: { name: "鎖帷子", def: 6 } },
      spells: []
    },
    {
      name: "Samurai",
      class: "Samurai",
      level: level,
      hp: 48 + hpScale * 8, maxHp: 48 + hpScale * 8,
      mp: Math.max(0, 4 + hpScale * 1), maxMp: Math.max(0, 4 + hpScale * 1),
      status: "ok",
      str: 14, int: 11, pie: 8, vit: 12, agi: 13, luk: 9,
      equipment: { weapon: { name: "刀", atk: 14 }, shield: null, armor: { name: "ハラアテ", def: 4 } },
      spells: ["HALITO"]
    },
    {
      name: "Priest",
      class: "Priest",
      level: level,
      hp: 36 + hpScale * 6, maxHp: 36 + hpScale * 6,
      mp: Math.max(0, 12 + hpScale * 2), maxMp: Math.max(0, 12 + hpScale * 2),
      status: "ok",
      str: 10, int: 10, pie: 15, vit: 10, agi: 11, luk: 10,
      equipment: { weapon: { name: "メイス", atk: 8 }, shield: { name: "ターゲットシールド", def: 3 }, armor: { name: "革鎧", def: 3 } },
      spells: ["DIOS", "MABARRIER", "LATUMOF"]
    },
    {
      name: "Mage",
      class: "Mage",
      level: level,
      hp: 24 + hpScale * 4, maxHp: 24 + hpScale * 4,
      mp: Math.max(0, 10 + hpScale * 2), maxMp: Math.max(0, 10 + hpScale * 2),
      status: "ok",
      str: 8, int: 16, pie: 8, vit: 9, agi: 12, luk: 11,
      equipment: { weapon: { name: "スタッフ", atk: 4 }, shield: null, armor: { name: "ローブ", def: 1 } },
      spells: ["HALITO", "MONTINO", "LAHALITO", "MORLIS"]
    }
  ];
}

// Find monster template from MONSTERS list
function getMonster(name, override = {}) {
  const mon = MONSTERS.find(m => m.name === name);
  if (!mon) throw new Error(`Monster not found: ${name}`);
  return {
    ...mon,
    hp: override.hp !== undefined ? override.hp : mon.hp,
    maxHp: override.hp !== undefined ? override.hp : mon.hp,
    spell: override.spell !== undefined ? override.spell : mon.spell,
    spellChance: override.spellChance !== undefined ? override.spellChance : mon.spellChance,
    traitChance: override.traitChance !== undefined ? override.traitChance : mon.traitChance,
    atk: override.atk !== undefined ? override.atk : mon.atk
  };
}

// Simulate one combat encounter
// strategy: 'auto' or 'manual'
function simulateEncounter(monsterTemplate, count, strategy, level = 5) {
  const party = createParty(level);
  const monsters = Array.from({ length: count }, (_, i) => ({
    ...JSON.parse(JSON.stringify(monsterTemplate)),
    id: `m_${i}`
  }));

  const state = {
    party,
    combatState: {
      monsters,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    gold: 0,
    floor: 3
  };

  let turns = 0;
  let mpConsumed = 0;
  let totalDmgTaken = 0;
  // Track initial HP to calculate damage taken
  const initialHp = party.map(c => c.hp);

  while (turns < 30) {
    // Check end condition
    const partyAlive = state.party.some(c => c.status !== "dead");
    const monstersAlive = state.combatState.monsters.some(m => m.hp > 0);

    if (!partyAlive || !monstersAlive) {
      break;
    }

    // Track MP before actions
    const mpBefore = state.party.reduce((acc, c) => acc + (c.mp || 0), 0);

    // Determine actions
    const actions = [];
    state.party.forEach((char, idx) => {
      if (char.status === "dead" || char.status === "paralyzed" || char.status === "sleep") return;

      if (strategy === "auto") {
        // Auto strategy: always attack the first living monster
        const targetIdx = state.combatState.monsters.findIndex(m => m.hp > 0);
        actions.push({ type: "fight", actorIdx: idx, targetIdx });
      } else {
        // Manual strategy:
        // 1. If Priest and MABARRIER is available and not active, and enemy has spell/charge, cast MABARRIER
        // 2. If Mage and enemy is spellcaster and not silenced, try MONTINO (if MP available)
        // 3. If any monster has lahalitoQueued or chargeQueued, defend!
        // 4. Otherwise, Priest heals low HP characters, Mage/Samurai casts HALITO, others fight dangerous targets.

        // Check if any monster has warning queued
        const hasWarning = state.combatState.monsters.some(m => m.hp > 0 && (m.lahalitoQueued || m.chargeQueued));

        if (hasWarning) {
          // Defend against warning
          actions.push({ type: "defend", actorIdx: idx });
        } else if (char.class === "Priest" && char.mp > 0 && !state.party.some(c => c.mabarrierTurns > 0) && monsterTemplate.spell) {
          actions.push({ type: "spell", actorIdx: idx, targetIdx: -1, spellName: "MABARRIER" });
        } else if (char.class === "Mage" && char.mp > 0 && monsterTemplate.spell && state.combatState.monsters.some(m => m.hp > 0 && m.silenceTurns <= 0)) {
          const targetIdx = state.combatState.monsters.findIndex(m => m.hp > 0 && m.silenceTurns <= 0);
          actions.push({ type: "spell", actorIdx: idx, targetIdx, spellName: "MONTINO" });
        } else if (char.class === "Priest" && char.mp > 0 && state.party.some(c => c.status !== "dead" && c.hp < c.maxHp * 0.5)) {
          // Heal
          const healTargetIdx = state.party.findIndex(c => c.status !== "dead" && c.hp < c.maxHp * 0.5);
          actions.push({ type: "spell", actorIdx: idx, targetIdx: healTargetIdx, spellName: "DIOS" });
        } else {
          // Prioritize back row or low hp enemy if sniper or targeted
          const targetIdx = state.combatState.monsters.findIndex(m => m.hp > 0);
          actions.push({ type: "fight", actorIdx: idx, targetIdx });
        }
      }
    });

    const result = runCombatRoundCalculation(state, { actions });
    // Update state
    state.party = result.state.party;
    state.combatState = result.state.combatState;

    const mpAfter = state.party.reduce((acc, c) => acc + (c.mp || 0), 0);
    mpConsumed += Math.max(0, mpBefore - mpAfter);

    turns++;
  }

  const partyAlive = state.party.some(c => c.status !== "dead");
  const deaths = state.party.filter(c => c.status === "dead").length;

  party.forEach((c, idx) => {
    totalDmgTaken += Math.max(0, initialHp[idx] - c.hp);
  });

  return {
    win: partyAlive ? 1 : 0,
    tpk: partyAlive ? 0 : 1,
    turns,
    deaths,
    totalDmgTaken,
    mpConsumed
  };
}

// Run bulk simulation for a monster type
function runSimulationSuite(monsterName, override, count = 1, runs = 1000, level = 5) {
  const monsterTemplate = getMonster(monsterName, override);
  
  let autoStats = { wins: 0, tpks: 0, totalTurns: 0, totalDeaths: 0, totalDmg: 0, totalMp: 0 };
  let manualStats = { wins: 0, tpks: 0, totalTurns: 0, totalDeaths: 0, totalDmg: 0, totalMp: 0 };

  for (let i = 0; i < runs; i++) {
    const resAuto = simulateEncounter(monsterTemplate, count, "auto", level);
    autoStats.wins += resAuto.win;
    autoStats.tpks += resAuto.tpk;
    autoStats.totalTurns += resAuto.turns;
    autoStats.totalDeaths += resAuto.deaths;
    autoStats.totalDmg += resAuto.totalDmgTaken;
    autoStats.totalMp += resAuto.mpConsumed;

    const resManual = simulateEncounter(monsterTemplate, count, "manual", level);
    manualStats.wins += resManual.win;
    manualStats.tpks += resManual.tpk;
    manualStats.totalTurns += resManual.turns;
    manualStats.totalDeaths += resManual.deaths;
    manualStats.totalDmg += resManual.totalDmgTaken;
    manualStats.totalMp += resManual.mpConsumed;
  }

  return {
    auto: {
      tpkRate: autoStats.tpks / runs,
      avgTurns: autoStats.totalTurns / runs,
      avgDeaths: autoStats.totalDeaths / runs,
      avgDmg: autoStats.totalDmg / runs,
      avgMp: autoStats.totalMp / runs
    },
    manual: {
      tpkRate: manualStats.tpks / runs,
      avgTurns: manualStats.totalTurns / runs,
      avgDeaths: manualStats.totalDeaths / runs,
      avgDmg: manualStats.totalDmg / runs,
      avgMp: manualStats.totalMp / runs
    }
  };
}

console.log("=== Combat Balance Simulation Results ===");

const targets = [
  { name: "マスターメイジ", count: 2, level: 5, overrideBefore: { spellChance: 0.35 }, overrideAfter: {} },
  { name: "黒曜の魔導士", count: 2, level: 8, overrideBefore: { spell: "MADALTO", spellChance: 0.30 }, overrideAfter: {} },
  { name: "破滅の導師", count: 1, level: 8, overrideBefore: { traitChance: 0.35, hp: 124 }, overrideAfter: {} },
  { name: "マナドレイン", count: 2, level: 4, overrideBefore: { hp: 30, traitChance: 0.25 }, overrideAfter: {} },
  { name: "魔封じの目玉", count: 2, level: 4, overrideBefore: { hp: 40, traitChance: 0.25 }, overrideAfter: {} },
  { name: "スケルトンアーチャー", count: 3, level: 4, overrideBefore: { hp: 32 }, overrideAfter: {} },
  { name: "血塗れの処刑人", count: 1, level: 5, overrideBefore: { hp: 84 }, overrideAfter: {} },
  { name: "火薬コウモリ", count: 3, level: 3, overrideBefore: { hp: 16 }, overrideAfter: {} }
];

targets.forEach(t => {
  console.log(`\nMonster: ${t.name} (x${t.count}), Party Level: ${t.level}`);
  const before = runSimulationSuite(t.name, t.overrideBefore, t.count, 500, t.level);
  const after = runSimulationSuite(t.name, t.overrideAfter, t.count, 500, t.level);

  console.log(`  [Before]`);
  console.log(`    Auto  : TPK=${(before.auto.tpkRate*100).toFixed(1)}%, AvgDmg=${before.auto.avgDmg.toFixed(1)}, AvgTurns=${before.auto.avgTurns.toFixed(1)}, AvgMp=${before.auto.avgMp.toFixed(1)}`);
  console.log(`    Manual: TPK=${(before.manual.tpkRate*100).toFixed(1)}%, AvgDmg=${before.manual.avgDmg.toFixed(1)}, AvgTurns=${before.manual.avgTurns.toFixed(1)}, AvgMp=${before.manual.avgMp.toFixed(1)}`);
  console.log(`  [After]`);
  console.log(`    Auto  : TPK=${(after.auto.tpkRate*100).toFixed(1)}%, AvgDmg=${after.auto.avgDmg.toFixed(1)}, AvgTurns=${after.auto.avgTurns.toFixed(1)}, AvgMp=${after.auto.avgMp.toFixed(1)}`);
  console.log(`    Manual: TPK=${(after.manual.tpkRate*100).toFixed(1)}%, AvgDmg=${after.manual.avgDmg.toFixed(1)}, AvgTurns=${after.manual.avgTurns.toFixed(1)}, AvgMp=${after.manual.avgMp.toFixed(1)}`);
});
