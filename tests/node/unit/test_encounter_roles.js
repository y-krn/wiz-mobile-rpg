import assert from "node:assert/strict";
import {
  ENCOUNTER_COMPOSITION_RULES,
  ENCOUNTER_POOLS,
  ENCOUNTER_SIZE_WEIGHTS,
  getEncounterSizeWeightsForFloor
} from "../../../src/data/encounters.js";
import { ENEMY_ROLES, MONSTERS, MONSTER_ROLE_BY_NAME } from "../../../src/data/monsters.js";
import { getBiomeForFloor } from "../../../src/data/biomes.js";
import { generateEncounter } from "../../../src/combat_ui/encounter.js";
import { isEncounterCompositionAllowed } from "../../../src/rules/encounter_rules.js";
import { scaleEnemyForDepth } from "../../../src/rules/depth_scaling.js";
import { getBandTrialForFloor, getTrialGuardianPressures } from "../../../src/rules/floor_trials.js";

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

  for (const floor of [5, 10, 15, 20, 25, 30]) {
    const bossName = getBiomeForFloor(floor).bossName;
    const template = MONSTERS.find(monster => monster.name === bossName);
    const encounterBoss = generateEncounter({ floor }, true, false, false).monsters[0];
    const scaledBoss = scaleEnemyForDepth(template, floor, { boss: true });
    for (const stat of ["def", "exp", "depthFloor"]) {
      assert.equal(encounterBoss[stat], scaledBoss[stat], `B${floor} boss ${stat} must use production scaling`);
    }
    if (floor === 30) {
      assert.equal(encounterBoss.hp, template.hp);
      assert.equal(encounterBoss.maxHp, template.hp);
      assert.equal(encounterBoss.atk, template.atk);
      assert.deepEqual(
        { hp: encounterBoss.hp, maxHp: encounterBoss.maxHp, atk: encounterBoss.atk, def: encounterBoss.def },
        { hp: 640, maxHp: 640, atk: 26, def: 25 }
      );
    } else {
      for (const stat of ["hp", "maxHp", "atk"]) {
        assert.equal(encounterBoss[stat], scaledBoss[stat], `B${floor} boss ${stat} must retain production scaling`);
      }
    }
  }
  const runSeed = "ISSUE-1670-B30-TRIAL";
  const b30Trial = getBandTrialForFloor(runSeed, 30);
  const b30Biome = getBiomeForFloor(30);
  const pressureTemplates = [
    ...b30Biome.enemyPool.map(name => MONSTERS.find(monster => monster.name === name)).filter(Boolean),
    ...MONSTERS
  ].filter((template, index, all) => all.findIndex(candidate => candidate.name === template.name) === index);
  const expectedPressures = getTrialGuardianPressures(
    b30Trial,
    pressureTemplates,
    { maxLevel: MONSTERS.find(monster => monster.name === b30Biome.bossName).level }
  );
  const b30Guardian = generateEncounter({ floor: 30, currentRun: { runSeed } }, true, false, false).monsters[0];
  assert.deepEqual(b30Guardian.trialThemeIds, [b30Trial.mainId, b30Trial.subId]);
  assert.equal(b30Guardian.trialDensity, "high");
  assert.deepEqual(b30Guardian.trialPressures.map(({ role, themeId, sourceName }) => ({ role, themeId, sourceName })),
    expectedPressures.map(({ role, themeId, sourceName }) => ({ role, themeId, sourceName })));

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
