import assert from "node:assert/strict";
import { buildRunStartPayload } from "../../../src/telemetry_run_start.ts";
import {
  runStartPayloadFixture,
  runStartPayloadInputFixture
} from "../fixtures/typescript/telemetry_run_start_input.ts";

assert.deepEqual(buildRunStartPayload(runStartPayloadInputFixture), runStartPayloadFixture);
assert.deepEqual(Object.keys(runStartPayloadFixture), [
  "runId", "contextOnly", "level", "startFloor", "maxHp", "maxMp", "effectiveMaxHp",
  "effectiveMaxMp", "equipmentIds", "startingInventoryCount", "startingInventoryFreeSlots",
  "startingWingCount", "startingUnbankedObjectLootCount"
]);
assert.equal(runStartPayloadFixture.level, 4);
assert.equal(runStartPayloadFixture.startFloor, 2.5);
assert.equal(runStartPayloadFixture.maxHp, 18);
assert.equal(runStartPayloadFixture.effectiveMaxHp, 24);
assert.equal(runStartPayloadFixture.maxMp, 7);
assert.equal(runStartPayloadFixture.effectiveMaxMp, 9);

const reads = [];
let levelRead = 0;
let maxHpRead = 0;
let maxMpRead = 0;
const character = {
  get level() { reads.push(`level:${++levelRead}`); return levelRead; },
  get maxHp() { reads.push(`maxHp:${++maxHpRead}`); return maxHpRead * 10; },
  get maxMp() { reads.push(`maxMp:${++maxMpRead}`); return maxMpRead * 5; }
};
const resources = [
  { inventoryCount: 11, inventoryFreeSlots: 101, consumableWingCount: 1001 },
  { inventoryCount: 22, inventoryFreeSlots: 202, consumableWingCount: 2002 },
  { inventoryCount: 33, inventoryFreeSlots: 303, consumableWingCount: 3003 }
];
let equipmentCalls = 0;
let hpCalls = 0;
let mpCalls = 0;
let lootCalls = 0;
const payload = buildRunStartPayload({
  runId: "outer-run",
  context: {
    runId: "context-run", level: 999, startFloor: 999, maxHp: 999, maxMp: 999,
    effectiveMaxHp: 999, effectiveMaxMp: 999, equipmentIds: ["context"],
    startingInventoryCount: 999, startingInventoryFreeSlots: 999, startingWingCount: 999,
    startingUnbankedObjectLootCount: 999, marker: true
  },
  run: { get startFloor() { reads.push("startFloor"); return "3.5"; } },
  character,
  getCharMaxHp(value) { hpCalls++; reads.push("effectiveHp"); assert.equal(value, character); return ""; },
  getCharMaxMp(value) { mpCalls++; reads.push("effectiveMp"); assert.equal(value, character); return Infinity; },
  buildEquipmentSnapshot(value) {
    equipmentCalls++;
    reads.push("equipment");
    assert.equal(value, character);
    return { equipmentIds: ["first", null] };
  },
  buildResourceSnapshot() {
    const index = reads.filter(value => value.startsWith("resource:")).length;
    reads.push(`resource:${index + 1}`);
    return resources[index];
  },
  getUnbankedLootSummary() { lootCalls++; reads.push("loot"); return { count: 7 }; },
  stateSnapshot: {}
});

assert.deepEqual(Object.keys(payload), [
  "runId", "level", "startFloor", "maxHp", "maxMp", "effectiveMaxHp",
  "effectiveMaxMp", "equipmentIds", "startingInventoryCount", "startingInventoryFreeSlots",
  "startingWingCount", "startingUnbankedObjectLootCount", "marker"
]);
assert.equal(payload.runId, "context-run");
assert.equal(payload.level, 1);
assert.equal(payload.startFloor, 3.5);
assert.equal(payload.maxHp, 10);
assert.equal(payload.maxMp, 5);
assert.equal(payload.effectiveMaxHp, 0);
assert.equal(payload.effectiveMaxMp, null);
assert.deepEqual(payload.equipmentIds, ["first", null]);
assert.equal(payload.startingInventoryCount, 11);
assert.equal(payload.startingInventoryFreeSlots, 202);
assert.equal(payload.startingWingCount, 3003);
assert.equal(payload.startingUnbankedObjectLootCount, 7);
assert.deepEqual(reads, [
  "level:1", "startFloor", "maxHp:1", "maxMp:1", "effectiveHp", "effectiveMp", "equipment",
  "resource:1", "resource:2", "resource:3", "loot"
]);
assert.equal(hpCalls, 1);
assert.equal(mpCalls, 1);
assert.equal(equipmentCalls, 1);
assert.equal(lootCalls, 1);

console.log("[PASS] TypeScript run_start owner preserves payload order, reads, callbacks, and independent snapshots");
