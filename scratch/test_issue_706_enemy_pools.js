import assert from "node:assert/strict";
import {
  BIOME_ENCOUNTER_POOLS,
  ENCOUNTER_POOLS,
  getEncounterPoolForFloor,
  getEncounterWeightForFloor
} from "../src/data/encounters.js";
import { MONSTERS } from "../src/data/monsters.js";

const monsterByName = new Map(MONSTERS.map(monster => [monster.name, monster]));
const b1 = getEncounterPoolForFloor(1);
const b2 = getEncounterPoolForFloor(2);
const b1Set = new Set(b1);
const b2Set = new Set(b2);

assert.equal(ENCOUNTER_POOLS[1], BIOME_ENCOUNTER_POOLS.collapsed_mine);
assert.ok(
  b1.every(name => BIOME_ENCOUNTER_POOLS.collapsed_mine.includes(name)),
  "B1 keeps the biome pool identity while applying weights"
);
assert.ok(!b1Set.has("フラッシュバット"), "B1 must not generate blind threat");
assert.ok(!b1Set.has("まどろみ胞子"), "B1 must not generate sleep threat");
assert.ok(b2Set.has("フラッシュバット"), "blind threat unlocks on local floor 2");
assert.ok(b2Set.has("まどろみ胞子"), "sleep threat unlocks on local floor 2");
assert.equal(getEncounterWeightForFloor("かみつき蟲", 1), 1);
assert.equal(getEncounterWeightForFloor("フラッシュバット", 1), 0);
assert.equal(getEncounterWeightForFloor("フラッシュバット", 2), 1);
assert.equal(getEncounterWeightForFloor("フラッシュバット", 5), 1);
assert.equal(getEncounterWeightForFloor("催眠コウモリ", 6), 0);
assert.ok(getEncounterWeightForFloor("催眠コウモリ", 7) > 0);

for (const pool of Object.values(BIOME_ENCOUNTER_POOLS)) {
  for (const name of pool) assert.ok(monsterByName.has(name), `unknown pool enemy: ${name}`);
}

console.log("[PASS] Issue #706 keeps biome identity, gates B1 blind/sleep threats, and applies gradual local-floor weights.");
