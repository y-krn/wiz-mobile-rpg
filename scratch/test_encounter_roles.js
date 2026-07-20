import assert from "node:assert/strict";
import {
  ENCOUNTER_COMPOSITION_RULES,
  ENCOUNTER_POOLS,
  ENCOUNTER_SIZE_WEIGHTS,
  getEncounterSizeWeightsForFloor
} from "../src/data/encounters.js";
import { ENEMY_ROLES, MONSTERS, MONSTER_ROLE_BY_NAME } from "../src/data/monsters.js";
import { generateEncounter } from "../src/combat_ui/encounter.js";
import { isEncounterCompositionAllowed } from "../src/rules/encounter_rules.js";

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function baseName(name) {
  return name.replace(/ [A-Z]$/, "");
}

function run() {
  assert.deepEqual(ENCOUNTER_SIZE_WEIGHTS[1], [0.70, 0.30, 0.00]);
  assert.deepEqual(ENCOUNTER_SIZE_WEIGHTS[2], [0.55, 0.45, 0.00]);
  assert.equal(getEncounterSizeWeightsForFloor(6), ENCOUNTER_SIZE_WEIGHTS[1]);
  assert.equal(getEncounterSizeWeightsForFloor(7), ENCOUNTER_SIZE_WEIGHTS[2]);

  const validRoles = new Set(Object.values(ENEMY_ROLES));
  assert.equal(Object.keys(MONSTER_ROLE_BY_NAME).length, MONSTERS.length, "Every monster must have one role mapping.");
  for (const monster of MONSTERS) {
    assert.ok(validRoles.has(monster.role), `${monster.name} must expose a valid role.`);
    assert.equal(monster.role, MONSTER_ROLE_BY_NAME[monster.name], `${monster.name} role must match its declaration.`);
  }

  const amplifier = MONSTERS.find(monster => monster.role === ENEMY_ROLES.AMPLIFIER);
  const disruptors = MONSTERS.filter(monster => monster.role === ENEMY_ROLES.DISRUPTOR).slice(0, 2);
  assert.equal(isEncounterCompositionAllowed([amplifier], 1), false, "Amplifiers must not appear alone.");
  assert.equal(isEncounterCompositionAllowed(disruptors, 2), false, "Two disruptors must not share an encounter.");

  for (const [floorText, pool] of Object.entries(ENCOUNTER_POOLS)) {
    const floor = Number(floorText);
    assert.equal(ENCOUNTER_SIZE_WEIGHTS[floor].length, ENCOUNTER_COMPOSITION_RULES.maxSize);
    for (const name of pool) {
      assert.ok(MONSTERS.some(monster => monster.name === name), `B${floor} pool references unknown monster ${name}.`);
    }

    const seenSizes = new Set();
    const rng = createRng(149000 + floor);
    for (let sample = 0; sample < 2000; sample++) {
      const { monsters } = generateEncounter(
        { floor, x: 0, y: 0, party: [{ status: "ok" }] },
        false,
        false,
        false,
        null,
        rng
      );
      seenSizes.add(monsters.length);
      assert.ok(monsters.length >= 1 && monsters.length <= 3, `B${floor} generated ${monsters.length} monsters.`);
      assert.ok(isEncounterCompositionAllowed(
        monsters.map(monster => ({ ...monster, name: baseName(monster.name) })),
        monsters.length
      ), `B${floor} generated an invalid role composition.`);
    }
    const localFloor = ((floor - 1) % 5) + 1;
    const expectedSizes = localFloor <= 2 ? [1, 2] : [1, 2, 3];
    assert.deepEqual([...seenSizes].sort(), expectedSizes, `B${floor} must generate its weighted group sizes.`);
  }
}

try {
  run();
  console.log("[PASS] Enemy roles and 1-3 member encounter rules verified across 10,000 deterministic samples.");
} catch (error) {
  console.error("[FAIL] Enemy role/encounter verification failed:", error);
  process.exit(1);
}
