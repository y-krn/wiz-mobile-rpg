// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { MONSTERS } from "../src/data.js";

// Helper to create a standard level party with correct item IDs
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
      equipment: { weapon: "LONG_SWORD", shield: "LARGE_SHIELD", armor: "CHAIN_MAIL" },
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
      equipment: { weapon: "CLAYMORE", shield: null, armor: "LEATHER_ARMOR" },
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
      equipment: { weapon: "MACE", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" },
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
      equipment: { weapon: "WAND", shield: null, armor: "ROBE" },
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

// Simulate one combat encounter with exact member list
function simulateEncounter(monsterTemplates, strategy, level = 5) {
  const party = createParty(level);
  const monsters = monsterTemplates.map((mon, i) => ({
    ...JSON.parse(JSON.stringify(mon)),
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
    floor: 5
  };

  let turns = 0;
  let mpConsumed = 0;
  let totalDmgTaken = 0;
  const initialHp = party.map(c => c.hp);

  const hasSpells = monsters.some(m => m.spell);

  while (turns < 30) {
    const partyAlive = state.party.some(c => c.status !== "dead");
    const monstersAlive = state.combatState.monsters.some(m => m.hp > 0);

    if (!partyAlive || !monstersAlive) {
      break;
    }

    const mpBefore = state.party.reduce((acc, c) => acc + (c.mp || 0), 0);

    const actions = [];
    state.party.forEach((char, idx) => {
      if (char.status === "dead" || char.status === "paralyzed" || char.status === "sleep") return;

      if (strategy === "auto") {
        const targetIdx = state.combatState.monsters.findIndex(m => m.hp > 0);
        actions.push({ type: "fight", actorIdx: idx, targetIdx });
      } else {
        const hasWarning = state.combatState.monsters.some(m => m.hp > 0 && (m.lahalitoQueued || m.chargeQueued));

        if (hasWarning) {
          actions.push({ type: "defend", actorIdx: idx });
        } else if (char.class === "Priest" && char.mp > 0 && !state.party.some(c => c.mabarrierTurns > 0) && hasSpells) {
          actions.push({ type: "spell", actorIdx: idx, targetIdx: -1, spellName: "MABARRIER" });
        } else if (char.class === "Mage" && char.mp > 0 && hasSpells && state.combatState.monsters.some(m => m.hp > 0 && m.spell && m.silenceTurns <= 0)) {
          const targetIdx = state.combatState.monsters.findIndex(m => m.hp > 0 && m.spell && m.silenceTurns <= 0);
          actions.push({ type: "spell", actorIdx: idx, targetIdx, spellName: "MONTINO" });
        } else if (char.class === "Priest" && char.mp > 0 && state.party.some(c => c.status !== "dead" && c.hp < c.maxHp * 0.5)) {
          const healTargetIdx = state.party.findIndex(c => c.status !== "dead" && c.hp < c.maxHp * 0.5);
          actions.push({ type: "spell", actorIdx: idx, targetIdx: healTargetIdx, spellName: "DIOS" });
        } else {
          const targetIdx = state.combatState.monsters.findIndex(m => m.hp > 0);
          actions.push({ type: "fight", actorIdx: idx, targetIdx });
        }
      }
    });

    const result = runCombatRoundCalculation(state, { actions });
    state.party = result.state.party;
    state.combatState = result.state.combatState;

    const mpAfter = state.party.reduce((acc, c) => acc + (c.mp || 0), 0);
    mpConsumed += Math.max(0, mpBefore - mpAfter);

    turns++;
  }

  const partyAlive = state.party.some(c => c.status !== "dead");
  const deaths = state.party.filter(c => c.status === "dead").length;

  state.party.forEach((c, idx) => {
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

function runSimulationSuite(memberConfigs, runs = 1000, level = 5) {
  const templates = memberConfigs.map(cfg => getMonster(cfg.name, cfg.override || {}));
  
  let autoStats = { wins: 0, tpks: 0, totalTurns: 0, totalDeaths: 0, totalDmg: 0, totalMp: 0 };
  let manualStats = { wins: 0, tpks: 0, totalTurns: 0, totalDeaths: 0, totalDmg: 0, totalMp: 0 };

  for (let i = 0; i < runs; i++) {
    const resAuto = simulateEncounter(templates, "auto", level);
    autoStats.wins += resAuto.win;
    autoStats.tpks += resAuto.tpk;
    autoStats.totalTurns += resAuto.turns;
    autoStats.totalDeaths += resAuto.deaths;
    autoStats.totalDmg += resAuto.totalDmgTaken;
    autoStats.totalMp += resAuto.mpConsumed;

    const resManual = simulateEncounter(templates, "manual", level);
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

const targets = [
  {
    name: "Floor 4: マスターメイジ x1",
    level: 5,
    members: [{ name: "マスターメイジ" }],
    afterMembers: [{ name: "マスターメイジ", override: { spellChance: 0.35 } }]
  },
  {
    name: "Floor 5: レッドドラゴン x1 + ワイバーン x1",
    level: 8,
    members: [{ name: "レッドドラゴン" }, { name: "ワイバーン" }],
    afterMembers: [
      { name: "レッドドラゴン", override: { spellChance: 0.12 } },
      { name: "ワイバーン", override: { spellChance: 0.10 } }
    ]
  },
  {
    name: "Floor 5: マスターデーモン x1 + プリーストデーモン x1",
    level: 8,
    members: [{ name: "マスターデーモン" }, { name: "プリーストデーモン" }],
    afterMembers: [
      { name: "マスターデーモン", override: { spellChance: 0.25 } },
      { name: "プリーストデーモン" }
    ]
  },
  {
    name: "Floor 5: 破滅の導師 x1 + 盾持ちデーモン x1",
    level: 8,
    members: [{ name: "破滅の導師" }, { name: "盾持ちデーモン" }],
    afterMembers: [
      { name: "破滅の導師", override: { traitChance: 0.35, hp: 120 } },
      { name: "盾持ちデーモン" }
    ]
  },
  {
    name: "Floor 5: 黒曜の魔導士 x1",
    level: 8,
    members: [{ name: "黒曜の魔導士" }],
    afterMembers: [{ name: "黒曜の魔導士", override: { spellChance: 0.35 } }]
  }
];

console.log("=== Comprehensive Balance Simulation ===");

targets.forEach(t => {
  console.log(`\nPack: ${t.name}, Party Level: ${t.level}`);
  const before = runSimulationSuite(t.members, 1000, t.level);
  const after = runSimulationSuite(t.afterMembers, 1000, t.level);

  console.log(`  [Before]`);
  console.log(`    Auto  : TPK=${(before.auto.tpkRate*100).toFixed(1)}%, AvgTurns=${before.auto.avgTurns.toFixed(1)}`);
  console.log(`    Manual: TPK=${(before.manual.tpkRate*100).toFixed(1)}%, AvgTurns=${before.manual.avgTurns.toFixed(1)}`);
  console.log(`  [After]`);
  console.log(`    Auto  : TPK=${(after.auto.tpkRate*100).toFixed(1)}%, AvgTurns=${after.auto.avgTurns.toFixed(1)}`);
  console.log(`    Manual: TPK=${(after.manual.tpkRate*100).toFixed(1)}%, AvgTurns=${after.manual.avgTurns.toFixed(1)}`);
});
