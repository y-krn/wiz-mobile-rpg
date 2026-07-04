import assert from "assert";
import { resolvePlayerSpell } from "../src/combat_logic/spell_resolution.js";

function createCaster(overrides = {}) {
  return {
    name: "MageChar",
    class: "Mage",
    hp: 30,
    maxHp: 30,
    mp: 10,
    status: "ok",
    int: 10,
    pie: 10,
    equipment: {},
    ...overrides
  };
}

function createState(caster) {
  return {
    party: [caster],
    floor: 1,
    currentRun: { deathLogs: [] },
    combatState: { turn: 1 }
  };
}

function withRandom(values, fn) {
  const originalRandom = Math.random;
  let idx = 0;
  Math.random = () => values[idx++] ?? values[values.length - 1] ?? 0;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

console.log("Starting magic reflect AoE tests...");

{
  console.log("- Test 1: single-target spell reflection still prevents spell damage");
  const caster = createCaster();
  const state = createState(caster);
  const monsters = [
    {
      name: "Mirror",
      hp: 20,
      maxHp: 20,
      traits: ["reflectMagic"],
      magicReflect: { chance: 1 },
      color: "#fff"
    }
  ];
  const logQueue = [];

  withRandom([0, 0], () => {
    resolvePlayerSpell(caster, { spellName: "HALITO", targetIdx: 0 }, state, monsters, logQueue);
  });

  assert.strictEqual(caster.hp, 25, "Single reflect should deal 5 reflected damage.");
  assert.strictEqual(caster.mp, 9, "Spell cost should be spent on reflected cast.");
  assert.strictEqual(monsters[0].hp, 20, "Reflected single-target spell should not damage the reflector.");
  assert.ok(logQueue.some(log => log.msg.includes("Mirrorは呪文を反射した")), "Reflect log should mention the reflector.");
}

{
  console.log("- Test 2: AoE spell reflects per target and still hits non-reflectors");
  const caster = createCaster();
  const state = createState(caster);
  const monsters = [
    {
      name: "Mirror",
      hp: 40,
      maxHp: 40,
      traits: ["reflectMagic"],
      magicReflect: { chance: 1 },
      color: "#fff"
    },
    {
      name: "Slime",
      hp: 40,
      maxHp: 40,
      color: "#0f0"
    }
  ];
  const logQueue = [];

  withRandom([0, 0, 0], () => {
    resolvePlayerSpell(caster, { spellName: "LAHALITO", targetIdx: -1 }, state, monsters, logQueue);
  });

  assert.strictEqual(caster.hp, 25, "AoE reflect should deal reflected damage to caster.");
  assert.strictEqual(caster.mp, 7, "AoE spell cost should be spent.");
  assert.strictEqual(monsters[0].hp, 40, "Reflecting target should not take reflected AoE damage.");
  assert.ok(monsters[1].hp < 40, "Non-reflecting target should still take AoE damage.");
  assert.ok(logQueue.some(log => log.msg.includes("ラハリト")), "AoE spell log should still be emitted.");
  assert.ok(logQueue.some(log => log.msg.includes("Mirrorは呪文を反射した")), "AoE reflect log should mention the reflector.");
}

{
  console.log("- Test 3: multiple AoE reflectors combine reflected damage");
  const caster = createCaster();
  const state = createState(caster);
  const monsters = [
    {
      name: "Mirror A",
      hp: 40,
      maxHp: 40,
      traits: ["reflectMagic"],
      magicReflect: { chance: 1 },
      color: "#fff"
    },
    {
      name: "Mirror B",
      hp: 40,
      maxHp: 40,
      traits: ["reflectMagic"],
      magicReflect: { chance: 1 },
      color: "#fff"
    }
  ];
  const logQueue = [];

  withRandom([0, 0, 0, 0], () => {
    resolvePlayerSpell(caster, { spellName: "LAHALITO", targetIdx: -1 }, state, monsters, logQueue);
  });

  assert.strictEqual(caster.hp, 20, "Two reflectors should combine reflected damage.");
  assert.deepStrictEqual(monsters.map(mon => mon.hp), [40, 40], "Reflectors should not take reflected AoE damage.");
  assert.ok(logQueue.some(log => log.msg.includes("Mirror A、Mirror Bは呪文を反射した")), "Combined reflect log should list reflectors.");
}

console.log("Magic reflect AoE tests passed.");
