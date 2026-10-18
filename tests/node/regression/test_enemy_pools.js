import assert from "node:assert/strict";
import {
  BIOME_ENCOUNTER_POOLS,
  ENCOUNTER_COMPOSITION_RULES,
  ENCOUNTER_POOLS,
  getEncounterPoolForFloor,
  getEncounterWeightForFloor,
  getEnemyTier,
  getNewRosterNotice
} from "../../../src/data/encounters.js";
import { BIOMES } from "../../../src/data/biomes.js";
import { ENEMY_ROLES, MONSTERS } from "../../../src/data/monsters.js";
import { isEncounterCompositionAllowed } from "../../../src/rules/encounter_rules.js";

const monsterByName = new Map(MONSTERS.map(monster => [monster.name, monster]));
const ROLE_TRAITS = ["guardAdjacent", "buffAtk", "buffPhysicalDef", "buffMagicDef", "cleanseAlly", "summonAlly", "selfDestruct", "splitOnDeath"];
const STATUS_KEYS = ["isBlinding", "isSleepInflicting", "isParalyzing", "isPoisonous", "isSilencing", "isCursing"];

assert.equal(ENCOUNTER_POOLS[1], BIOME_ENCOUNTER_POOLS.collapsed_mine);
for (const pool of Object.values(BIOME_ENCOUNTER_POOLS)) {
  for (const name of pool) assert.ok(monsterByName.has(name), `unknown pool enemy: ${name}`);
}

BIOMES.forEach((biome, index) => {
  const firstFloor = index * 5 + 1;
  // Every pool enemy has exactly one tier, so its first and fading floors are set.
  const tiered = Object.values(biome.enemyTiers).flat();
  assert.deepEqual([...tiered].sort(), [...biome.enemyPool].sort(), `${biome.id} tiers cover the pool`);

  // The first floors hold only plain attackers: no role, ailment or self-destruct.
  biome.enemyTiers.early.forEach(name => {
    const monster = monsterByName.get(name);
    assert.equal(monster.role, ENEMY_ROLES.AGGRESSOR, `${name} is a plain attacker`);
    assert.ok(!STATUS_KEYS.some(key => monster[key]), `${name} inflicts no ailment`);
    assert.ok(!(monster.traits || []).some(trait => ROLE_TRAITS.includes(trait)), `${name} has no role trait`);
    assert.ok(!monster.signature?.status || monster.signature.status === "defDown", `${name} has no ailment signature`);
  });
  [firstFloor, firstFloor + 1].forEach(floor => {
    getEncounterPoolForFloor(floor).forEach(name => {
      assert.equal(getEnemyTier(name, floor), "early", `B${floor} holds only plain attackers: ${name}`);
    });
  });
  const third = getEncounterPoolForFloor(firstFloor + 2);
  const fourth = getEncounterPoolForFloor(firstFloor + 3);
  assert.ok(biome.enemyTiers.role.every(name => third.includes(name)), `${biome.id} roles arrive on the third floor`);
  assert.ok(biome.enemyTiers.late.every(name => !third.includes(name)), `${biome.id} troublemakers wait for the fourth floor`);
  assert.ok(biome.enemyTiers.late.every(name => fourth.includes(name)), `${biome.id} troublemakers arrive on the fourth floor`);

  // Deep floors: plain attackers stay possible but rare.
  [firstFloor + 3, firstFloor + 4].forEach(floor => {
    const pool = getEncounterPoolForFloor(floor);
    const early = pool.filter(name => getEnemyTier(name, floor) === "early").length;
    assert.ok(early > 0, `B${floor} still has plain attackers`);
    assert.ok(early / pool.length < 0.15, `B${floor} plain attackers are rare (${early}/${pool.length})`);
  });

  // A legal group of every size can be built on every floor.
  for (let floor = firstFloor; floor < firstFloor + 5; floor++) {
    const templates = [...new Set(getEncounterPoolForFloor(floor))].map(name => monsterByName.get(name));
    for (let size = ENCOUNTER_COMPOSITION_RULES.minSize; size <= ENCOUNTER_COMPOSITION_RULES.maxSize; size++) {
      const group = [];
      while (group.length < size) {
        const next = templates.find(template => isEncounterCompositionAllowed([...group, template], size));
        if (!next) break;
        group.push(next);
      }
      assert.ok(isEncounterCompositionAllowed(group, size), `B${floor} can build a legal group of ${size}`);
    }
  }
});

assert.equal(getEncounterWeightForFloor("かみつき蟲", 1), 1);
assert.equal(getEncounterWeightForFloor("フラッシュバット", 2), 0);
assert.equal(getEncounterWeightForFloor("フラッシュバット", 3), 1);
assert.equal(getEncounterWeightForFloor("分裂スライム", 3), 0);
assert.ok(getEncounterWeightForFloor("かみつき蟲", 5) > 0);

// The notice marks the local floors where a new tier begins.
assert.equal(getNewRosterNotice(1), null);
assert.equal(getNewRosterNotice(2), null);
assert.ok(getNewRosterNotice(3));
assert.ok(getNewRosterNotice(4));
assert.equal(getNewRosterNotice(5), null);
assert.equal(getNewRosterNotice(6), null);
assert.equal(getNewRosterNotice(8), getNewRosterNotice(3), "the notice follows the local floor");

console.log("[PASS] #2123 floor rosters: plain attackers first, roles from the third floor, troublemakers from the fourth.");
