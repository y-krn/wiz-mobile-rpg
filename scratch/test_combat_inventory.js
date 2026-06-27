// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

function createState(inventorySize) {
  const char = {
    name: "Tester",
    class: "Fighter",
    level: 1,
    hp: 30,
    maxHp: 30,
    mp: 0,
    maxMp: 0,
    status: "ok",
    str: 99,
    int: 8,
    pie: 8,
    vit: 10,
    agi: 99,
    luk: 8,
    equipment: { weapon: null, shield: null, armor: null },
    spells: [],
    exp: 0
  };
  const dead = { ...char, name: "Dead", status: "dead", hp: 0 };

  return {
    party: [char, dead, dead, dead],
    combatState: {
      monsters: [
        { name: "M", hp: 1, maxHp: 1, atk: 1, def: 0, exp: 1, gold: 1, row: "front" }
      ],
      isMidboss: true
    },
    inventory: Array(inventorySize).fill("HEAL_POTION"),
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    gold: 0,
    floor: 3
  };
}

function runForcedMidbossDrop(inventorySize) {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    return runCombatRoundCalculation(createState(inventorySize), {
      actions: [{ actorIdx: 0, type: "fight", targetIdx: 0 }]
    });
  } finally {
    Math.random = originalRandom;
  }
}

function createFleeOnlyState() {
  const char = {
    name: "Tester",
    class: "Fighter",
    level: 1,
    hp: 30,
    maxHp: 30,
    mp: 0,
    maxMp: 0,
    status: "ok",
    str: 1,
    int: 8,
    pie: 8,
    vit: 10,
    agi: 1,
    luk: 8,
    equipment: { weapon: null, shield: null, armor: null },
    spells: [],
    exp: 0
  };
  const dead = { ...char, name: "Dead", status: "dead", hp: 0 };

  return {
    party: [char, dead, dead, dead],
    combatState: {
      monsters: [
        { name: "Runner", hp: 10, maxHp: 10, atk: 1, def: 0, exp: 100, gold: 100, fleeChance: 1, row: "front" }
      ],
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { kills: 0, goldGained: 0, expGained: 0, equipmentFound: [], itemsFound: [] },
    roamingMonsters: [],
    floorChestsTotal: [0, 0, 0, 0, 0],
    gold: 0,
    floor: 3
  };
}

function runForcedFleeOnlyCombat() {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    return runCombatRoundCalculation(createFleeOnlyState(), {
      actions: [{ actorIdx: 0, type: "defend" }]
    });
  } finally {
    Math.random = originalRandom;
  }
}

console.log("Starting Combat Inventory Verification Tests...");

const partialBagResult = runForcedMidbossDrop(11);
assert.strictEqual(partialBagResult.state.inventory.length, 12, "Enemy drop should be added when bag is 11/20");
assert.strictEqual(partialBagResult.state.currentRun.equipmentFound.length, 1, "Enemy drop should be recorded");
assert.ok(!partialBagResult.logQueue.some(log => log.msg?.includes("満杯")), "11/20 should not produce a full-bag log");
console.log("[PASS] Enemy drop is added at 11/20.");

const fullBagResult = runForcedMidbossDrop(20);
assert.strictEqual(fullBagResult.state.inventory.length, 20, "Non-quest enemy drop should not exceed 20/20");
assert.strictEqual(fullBagResult.state.currentRun.equipmentFound.length, 0, "Rejected enemy drop should not be recorded");
assert.ok(fullBagResult.logQueue.some(log => log.msg?.includes("満杯")), "20/20 should produce a full-bag log");
console.log("[PASS] Enemy drop is rejected at 20/20.");

const fleeOnlyResult = runForcedFleeOnlyCombat();
assert.strictEqual(fleeOnlyResult.state.inventory.length, 0, "Fled-only combat should not add drops");
assert.strictEqual(fleeOnlyResult.state.gold, 0, "Fled-only combat should not award gold");
assert.strictEqual(fleeOnlyResult.state.currentRun.kills, 0, "Fled-only combat should not count kills");
assert.ok(fleeOnlyResult.logQueue.some(log => log.endCombat), "Fled-only combat should end without chest");
assert.ok(!fleeOnlyResult.logQueue.some(log => log.triggerChest), "Fled-only combat should not trigger a chest");
assert.ok(!fleeOnlyResult.logQueue.some(log => log.msg?.includes("骸")), "Fled-only combat should not produce corpse loot");
console.log("[PASS] Fled-only combat ends without rewards or chest.");

console.log("All Combat Inventory verification tests passed successfully!");
