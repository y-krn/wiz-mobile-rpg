global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { generateEncounter } from "../src/combat_ui/encounter.js";

const TARGET = Object.freeze({
  minAverageDamageRate: 0.10,
  maxAverageDamageRate: 0.65,
  maxNoDamageRate: 0.25,
  minAverageVictoryTurns: 3,
  maxAverageVictoryTurns: 9,
  minWinRate: 0.80
});

const FLOOR_PROFILES = Object.freeze({
  1: { level: 1, maxHp: 20, str: 15, vit: 14, agi: 10, weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" },
  2: { level: 3, maxHp: 36, str: 16, vit: 15, agi: 11, weapon: "LONG_SWORD", shield: "SMALL_SHIELD", armor: "SCALE_MAIL" },
  3: { level: 4, maxHp: 44, str: 16, vit: 15, agi: 11, weapon: "LONG_SWORD", shield: "LARGE_SHIELD", armor: "CHAIN_MAIL" },
  4: { level: 5, maxHp: 52, str: 16, vit: 15, agi: 12, weapon: "CLAYMORE", shield: "LARGE_SHIELD", armor: "CHAIN_MAIL" },
  5: { level: 8, maxHp: 76, str: 17, vit: 16, agi: 13, weapon: "KATANA", shield: "KNIGHT_SHIELD", armor: "PLATE_MAIL" }
});

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createFighter(profile) {
  return {
    name: "Solo Fighter",
    class: "Fighter",
    level: profile.level,
    exp: 0,
    hp: profile.maxHp,
    maxHp: profile.maxHp,
    mp: 0,
    maxMp: 0,
    str: profile.str,
    int: 7,
    pie: 8,
    vit: profile.vit,
    agi: profile.agi,
    luk: 9,
    status: "ok",
    spells: [],
    equipment: {
      weapon: profile.weapon,
      shield: profile.shield,
      armor: profile.armor,
      accessory: null
    }
  };
}

function getPriorityTarget(monsters) {
  const priorities = { disruptor: 0, amplifier: 1, aggressor: 2 };
  return monsters
    .map((monster, index) => ({ monster, index }))
    .filter(({ monster }) => monster.hp > 0)
    .sort((left, right) => (priorities[left.monster.role] - priorities[right.monster.role]) || (left.monster.hp - right.monster.hp))[0]?.index ?? -1;
}

function simulateCombat(floor, monsters, rng) {
  const profile = FLOOR_PROFILES[floor];
  let state = {
    party: [createFighter(profile)],
    combatState: {
      monsters: structuredClone(monsters),
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    openedGates: [],
    gold: 0,
    floor
  };

  let turns = 0;
  const originalRandom = Math.random;
  Math.random = rng;
  try {
    while (turns < 12 && state.party[0].status !== "dead" && state.combatState.monsters.some(monster => monster.hp > 0)) {
      const warned = state.combatState.monsters.some(monster =>
        monster.hp > 0 && (monster.lahalitoQueued || monster.madaltoQueued || monster.chargeQueued)
      );
      const action = warned
        ? { type: "defend", actorIdx: 0 }
        : { type: "fight", actorIdx: 0, targetIdx: getPriorityTarget(state.combatState.monsters) };
      state = runCombatRoundCalculation(state, { actions: [action] }).state;
      turns++;
    }
  } finally {
    Math.random = originalRandom;
  }

  const won = state.combatState.monsters.every(monster => monster.hp <= 0);
  return {
    won,
    turns,
    damage: profile.maxHp - Math.max(0, state.party[0].hp)
  };
}

function generateMultiEncounter(floor, rng) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = generateEncounter({ floor, x: 0, y: 0, party: [{ status: "ok" }] }, false, false, false, null, rng);
    if (!result.isRare && result.monsters.length >= 2) return result.monsters;
  }
  throw new Error(`B${floor} could not generate a multi-enemy encounter.`);
}

function runFloor(floor, samples = 1000) {
  const rng = createRng(1490000 + floor);
  const totals = { wins: 0, damaged: 0, damage: 0, victoryTurns: 0 };
  for (let sample = 0; sample < samples; sample++) {
    const result = simulateCombat(floor, generateMultiEncounter(floor, rng), rng);
    totals.wins += Number(result.won);
    totals.damaged += Number(result.damage > 0);
    totals.damage += result.damage;
    if (result.won) totals.victoryTurns += result.turns;
  }

  const profile = FLOOR_PROFILES[floor];
  const metrics = {
    winRate: totals.wins / samples,
    noDamageRate: 1 - totals.damaged / samples,
    averageDamage: totals.damage / samples,
    averageDamageRate: totals.damage / samples / profile.maxHp,
    averageVictoryTurns: totals.wins > 0 ? totals.victoryTurns / totals.wins : Infinity
  };
  const pass = metrics.winRate >= TARGET.minWinRate
    && metrics.averageDamageRate >= TARGET.minAverageDamageRate
    && metrics.averageDamageRate <= TARGET.maxAverageDamageRate
    && metrics.noDamageRate <= TARGET.maxNoDamageRate
    && metrics.averageVictoryTurns >= TARGET.minAverageVictoryTurns
    && metrics.averageVictoryTurns <= TARGET.maxAverageVictoryTurns;
  return { ...metrics, pass };
}

console.log("Solo multi-enemy target: win>=80%, no-damage<=25%, damage=10-65% maxHP, victory turns=3-9");
let failed = false;
for (let floor = 1; floor <= 5; floor++) {
  const result = runFloor(floor);
  console.log(
    `B${floor}: win=${(result.winRate * 100).toFixed(1)}% no-damage=${(result.noDamageRate * 100).toFixed(1)}% damage=${result.averageDamage.toFixed(1)}`
    + ` (${(result.averageDamageRate * 100).toFixed(1)}% maxHP) turns=${result.averageVictoryTurns.toFixed(2)} ${result.pass ? "PASS" : "FAIL"}`
  );
  failed ||= !result.pass;
}

if (failed) process.exit(1);
