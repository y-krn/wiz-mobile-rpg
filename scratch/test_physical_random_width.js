import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import {
  DEFAULT_PHYSICAL_RANDOM_RANGE,
  ITEMS,
  getCharWeaponPhysicalRandomRange,
  rollCharWeaponPhysicalRandom
} from "../src/data.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const weapons = Object.values(ITEMS).filter(item => item.type === "weapon");
assert.equal(weapons.length, 21, "all current weapons are covered");
for (const weapon of weapons) {
  assert.ok(Array.isArray(weapon.randRange), `${weapon.id} has a randRange`);
  assert.equal(weapon.randRange.length, 2, `${weapon.id} has two range endpoints`);
  assert.ok(weapon.randRange.every(Number.isInteger), `${weapon.id} range is integral`);
  assert.ok(weapon.randRange[0] <= weapon.randRange[1], `${weapon.id} range is ordered`);
  assert.equal((weapon.randRange[0] + weapon.randRange[1]) / 2, 2, `${weapon.id} keeps mean roll 2.0`);
}

function makeChar(weapon) {
  return {
    class: "Fighter",
    level: 1,
    equipment: { weapon, shield: null, armor: null, accessory: null }
  };
}

assert.deepEqual(getCharWeaponPhysicalRandomRange(makeChar("VENOM_FANG")), [0, 4]);
assert.deepEqual(getCharWeaponPhysicalRandomRange(makeChar("NINJA_DAGGER")), [1, 3]);
assert.deepEqual(
  getCharWeaponPhysicalRandomRange({ equipment: { weapon: null } }),
  DEFAULT_PHYSICAL_RANDOM_RANGE,
  "bare hands use the explicit default"
);
assert.deepEqual(
  getCharWeaponPhysicalRandomRange(makeChar("SMALL_SHIELD")),
  DEFAULT_PHYSICAL_RANDOM_RANGE,
  "a non-weapon in the weapon slot uses the explicit default"
);
assert.equal(rollCharWeaponPhysicalRandom(makeChar("VENOM_FANG"), () => 0), 0);
assert.equal(rollCharWeaponPhysicalRandom(makeChar("VENOM_FANG"), () => 0.999999), 4);
assert.equal(rollCharWeaponPhysicalRandom(makeChar("NINJA_DAGGER"), () => 0), 1);
assert.equal(rollCharWeaponPhysicalRandom(makeChar("NINJA_DAGGER"), () => 0.999999), 3);

function createCombatState({ weapon, followUp = false, className = "Fighter" } = {}) {
  return {
    party: [{
      name: "Tester",
      class: className,
      level: 5,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      str: 15,
      int: 8,
      pie: 8,
      vit: 10,
      agi: 100,
      luk: 10,
      status: "ok",
      spells: [],
      equipment: {
        weapon,
        shield: null,
        armor: null,
        accessory: followUp
          ? { baseId: "SWIFT_BAND", identified: true, affixes: [{ type: "followUp", value: 50 }] }
          : null
      }
    }],
    combatState: {
      monsters: [{ name: "Target", hp: 1000, maxHp: 1000, atk: 1, def: 0, row: "front", status: "ok" }],
      roundNumber: 1,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 1,
    combatFormulaTelemetry: {
      physicalPlayerHits: [],
      physicalMonsterHits: [],
      targetedBonuses: [],
      mitigations: [],
      mitigationCalls: []
    }
  };
}

function executeCombat({ weapon, followUp = false, className = "Fighter" }, rng) {
  const originalRandom = Math.random;
  Math.random = rng;
  try {
    return runCombatRoundCalculation(createCombatState({ weapon, followUp, className }), {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    });
  } finally {
    Math.random = originalRandom;
  }
}

function runCombat({ weapon, followUp = false, className = "Fighter" }) {
  const randomValues = followUp
    ? className === "Ninja"
      ? [0, 0, 0.999999, 0, 0, 0.999999]
      : [0, 0, 0.999999, 0, 0.999999]
    : [0, 0, 0.999999];
  return executeCombat({ weapon, followUp, className }, () => randomValues.shift() ?? 0);
}

const wideAttack = runCombat({ weapon: "VENOM_FANG" });
assert.equal(wideAttack.state.combatFormulaTelemetry.physicalPlayerHits[0].randRoll, 4);
const narrowAttack = runCombat({ weapon: "NINJA_DAGGER" });
assert.equal(narrowAttack.state.combatFormulaTelemetry.physicalPlayerHits[0].randRoll, 3);

const wideFollowUp = runCombat({ weapon: "VENOM_FANG", followUp: true, className: "Ninja" });
const followUpLog = wideFollowUp.logQueue.find(entry => entry.msg?.includes("【🗡️追撃】"));
assert.ok(followUpLog, "follow-up attack still fires");
assert.match(followUpLog.msg, /に15のダメージ/);

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function collectTelemetryDistribution(weapon, seed, count = 500) {
  const rng = createRng(seed);
  const rolls = new Map();
  const damages = new Map();
  for (let i = 0; i < count; i++) {
    const result = executeCombat({ weapon }, rng);
    const hit = result.state.combatFormulaTelemetry.physicalPlayerHits.at(-1);
    rolls.set(hit.randRoll, (rolls.get(hit.randRoll) || 0) + 1);
    damages.set(hit.damage, (damages.get(hit.damage) || 0) + 1);
  }
  return { rolls, damages };
}

function sortedDistribution(distribution) {
  return [...distribution.entries()].sort(([left], [right]) => left - right);
}

const narrowDistribution = collectTelemetryDistribution("NINJA_DAGGER", 727);
const wideDistribution = collectTelemetryDistribution("VENOM_FANG", 1727);
assert.deepEqual(sortedDistribution(narrowDistribution.rolls).map(([roll]) => roll), [1, 2, 3]);
assert.deepEqual(sortedDistribution(wideDistribution.rolls).map(([roll]) => roll), [0, 1, 2, 3, 4]);
assert.ok(sortedDistribution(narrowDistribution.damages).length < sortedDistribution(wideDistribution.damages).length);
console.log(`telemetry narrow N=500 randRoll=${JSON.stringify(sortedDistribution(narrowDistribution.rolls))} damage=${JSON.stringify(sortedDistribution(narrowDistribution.damages))}`);
console.log(`telemetry wide N=500 randRoll=${JSON.stringify(sortedDistribution(wideDistribution.rolls))} damage=${JSON.stringify(sortedDistribution(wideDistribution.damages))}`);

console.log("[PASS] weapon random ranges, telemetry roll, fallback, and follow-up use are verified.");
