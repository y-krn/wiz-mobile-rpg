// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { ITEMS, MONSTERS } from "../src/data.js";

const RUNS_PER_TARGET = 1000;
const PARTY_FIXTURES = {
  baselineLegacy: "baselineLegacy",
  current: "current"
};

const LEGACY_EQUIPMENT_COMPAT = {
  weapon: {
    "ロングソード": { baseId: "LONG_SWORD", atk: 12 },
    "刀": { baseId: "NINJA_BLADE", atk: 14 },
    "メイス": { baseId: "SACRED_MACE", atk: 8 },
    "スタッフ": { baseId: "ARCH_WAND", atk: 4 }
  },
  shield: {
    "ヒーターシールド": { baseId: "LARGE_SHIELD", def: 5 },
    "ターゲットシールド": { baseId: "SMALL_SHIELD", def: 3 }
  },
  armor: {
    "鎖帷子": { baseId: "SCALE_MAIL", def: 6 },
    "ハラアテ": { baseId: "LEATHER_ARMOR", def: 4 },
    "革鎧": { baseId: "EXPLORER_CLOAK", def: 3 },
    "ローブ": { baseId: "ROBE", def: 1 }
  }
};

function createLegacyEquipment(baseId, targetStats) {
  const base = ITEMS[baseId];
  if (!base) throw new Error(`Legacy equipment compat target not found: ${baseId}`);

  const affixes = [];
  const statKey = base.type === "weapon" ? "atk" : "def";
  const targetValue = targetStats[statKey];
  const delta = targetValue - (base[statKey] || 0);
  if (delta !== 0) {
    affixes.push({ type: statKey, value: delta });
  }

  if (affixes.length === 0) return baseId;
  return {
    id: `${baseId}_LEGACY_COMPAT`,
    baseId,
    identified: true,
    rarity: "legacy",
    affixes
  };
}

function normalizeLegacyEquipmentSlot(slot, legacyItem) {
  if (!legacyItem) return null;
  if (typeof legacyItem === "string" || legacyItem.baseId || legacyItem.id) return legacyItem;

  const match = LEGACY_EQUIPMENT_COMPAT[slot]?.[legacyItem.name];
  if (!match) throw new Error(`Unmapped legacy ${slot}: ${legacyItem.name}`);

  return createLegacyEquipment(match.baseId, match);
}

function normalizeLegacyEquipment(equipment) {
  return {
    weapon: normalizeLegacyEquipmentSlot("weapon", equipment?.weapon),
    shield: normalizeLegacyEquipmentSlot("shield", equipment?.shield),
    armor: normalizeLegacyEquipmentSlot("armor", equipment?.armor),
    accessory: normalizeLegacyEquipmentSlot("accessory", equipment?.accessory)
  };
}

// Helper to create a standard level party
function createBaselineLegacyParty(level = 5) {
  const hpScale = level - 5;
  const party = [
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

  return party.map(char => ({
    ...char,
    equipment: normalizeLegacyEquipment(char.equipment)
  }));
}

// Helper to create a standard level party
function createCurrentParty(level = 5, withAccessories = false) {
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
      equipment: { weapon: "LONG_SWORD", shield: "LARGE_SHIELD", armor: "CHAIN_MAIL", accessory: withAccessories ? "RING_STR" : null },
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
      equipment: { weapon: "NINJA_BLADE", shield: null, armor: "BATTLE_GARB", accessory: withAccessories ? "SWIFT_BAND" : null },
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
      equipment: { weapon: "SACRED_MACE", shield: "SMALL_SHIELD", armor: "PRIEST_ROBE", accessory: withAccessories ? "HOLY_BAND" : null },
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
      equipment: { weapon: "ARCH_WAND", shield: null, armor: "SORCERER_ROBE", accessory: withAccessories ? "AMULET_MP" : null },
      spells: ["HALITO", "MONTINO", "LAHALITO", "MORLIS"]
    }
  ];
}

function createParty(level = 5, fixture = PARTY_FIXTURES.current, withAccessories = false) {
  if (fixture === PARTY_FIXTURES.baselineLegacy) {
    return createBaselineLegacyParty(level);
  }
  return createCurrentParty(level, withAccessories);
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
function simulateEncounter(monsterTemplate, count, strategy, level = 5, fixture = PARTY_FIXTURES.current, withAccessories = false) {
  const party = createParty(level, fixture, withAccessories);
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
          // Attack the first living enemy.
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

// Run bulk simulation for a monster type
function runSimulationSuite(monsterName, override, count = 1, runs = RUNS_PER_TARGET, level = 5, fixture = PARTY_FIXTURES.current, withAccessories = false) {
  const monsterTemplate = getMonster(monsterName, override);
  
  let autoStats = { wins: 0, tpks: 0, totalTurns: 0, totalDeaths: 0, totalDmg: 0, totalMp: 0 };
  let manualStats = { wins: 0, tpks: 0, totalTurns: 0, totalDeaths: 0, totalDmg: 0, totalMp: 0 };

  for (let i = 0; i < runs; i++) {
    const resAuto = simulateEncounter(monsterTemplate, count, "auto", level, fixture, withAccessories);
    autoStats.wins += resAuto.win;
    autoStats.tpks += resAuto.tpk;
    autoStats.totalTurns += resAuto.turns;
    autoStats.totalDeaths += resAuto.deaths;
    autoStats.totalDmg += resAuto.totalDmgTaken;
    autoStats.totalMp += resAuto.mpConsumed;

    const resManual = simulateEncounter(monsterTemplate, count, "manual", level, fixture, withAccessories);
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
console.log(`Runs per target: ${RUNS_PER_TARGET}`);

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
  const before = runSimulationSuite(t.name, t.overrideBefore, t.count, RUNS_PER_TARGET, t.level, PARTY_FIXTURES.baselineLegacy, false);
  const after = runSimulationSuite(t.name, t.overrideAfter, t.count, RUNS_PER_TARGET, t.level, PARTY_FIXTURES.current, true);

  console.log(`  [Baseline legacy-compatible]`);
  console.log(`    Auto  : TPK=${(before.auto.tpkRate*100).toFixed(1)}%, AvgDmg=${before.auto.avgDmg.toFixed(1)}, AvgTurns=${before.auto.avgTurns.toFixed(1)}, AvgMp=${before.auto.avgMp.toFixed(1)}`);
  console.log(`    Manual: TPK=${(before.manual.tpkRate*100).toFixed(1)}%, AvgDmg=${before.manual.avgDmg.toFixed(1)}, AvgTurns=${before.manual.avgTurns.toFixed(1)}, AvgMp=${before.manual.avgMp.toFixed(1)}`);
  console.log(`  [Current + full accessories]`);
  console.log(`    Auto  : TPK=${(after.auto.tpkRate*100).toFixed(1)}%, AvgDmg=${after.auto.avgDmg.toFixed(1)}, AvgTurns=${after.auto.avgTurns.toFixed(1)}, AvgMp=${after.auto.avgMp.toFixed(1)}`);
  console.log(`    Manual: TPK=${(after.manual.tpkRate*100).toFixed(1)}%, AvgDmg=${after.manual.avgDmg.toFixed(1)}, AvgTurns=${after.manual.avgTurns.toFixed(1)}, AvgMp=${after.manual.avgMp.toFixed(1)}`);
  console.log(`  [Delta current - baseline]`);
  console.log(`    Auto  : TPK=${((after.auto.tpkRate - before.auto.tpkRate)*100).toFixed(1)}pt, AvgDmg=${(after.auto.avgDmg - before.auto.avgDmg).toFixed(1)}, AvgTurns=${(after.auto.avgTurns - before.auto.avgTurns).toFixed(1)}`);
  console.log(`    Manual: TPK=${((after.manual.tpkRate - before.manual.tpkRate)*100).toFixed(1)}pt, AvgDmg=${(after.manual.avgDmg - before.manual.avgDmg).toFixed(1)}, AvgTurns=${(after.manual.avgTurns - before.manual.avgTurns).toFixed(1)}`);
});
