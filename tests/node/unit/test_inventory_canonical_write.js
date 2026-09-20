import assert from "node:assert/strict";
import {
  __setTelemetryClientForTests,
  __resetTelemetryForTests,
  trackRunStart
} from "../../../src/telemetry.js";
import {
  INVENTORY_CAPACITY,
  addCanonicalInventoryItemToState,
  addInventoryItemToState
} from "../../../src/state/inventory_state.js";

const validEquipment = {
  kind: "equipment",
  instanceId: "canonical-write-equipment",
  baseId: "WAND",
  rarity: "magic",
  level: 1,
  identified: false,
  affixes: []
};

const createState = (inventory = [], currentRun = null) => ({ inventory, currentRun });

assert.equal(addCanonicalInventoryItemToState(createState(), "HEAL_POTION"), true);
assert.deepEqual(createState(["HEAL_POTION"]).inventory, ["HEAL_POTION"]);

const identityState = createState();
assert.equal(addCanonicalInventoryItemToState(identityState, validEquipment), true);
assert.strictEqual(identityState.inventory[0], validEquipment, "EquipmentInstance identity is preserved");

for (const invalid of [
  "",
  "UNKNOWN_ITEM_ID",
  { baseId: "WAND" },
  { ...validEquipment, kind: "item" }
]) {
  const currentRun = { unbankedObjectLoot: [{ id: "existing", item: "DAGGER" }] };
  const state = createState(["HEAL_POTION"], currentRun);
  const beforeInventory = state.inventory.slice();
  const beforeLoot = structuredClone(currentRun);
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart({ startedAt: 1, startFloor: 1 }, { level: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1 }, state);
  const eventCountBeforeWrite = events.length;

  assert.equal(addCanonicalInventoryItemToState(state, invalid, { dungeonLoot: true }), false);
  assert.deepEqual(state.inventory, beforeInventory, `invalid input rejected: ${String(invalid)}`);
  assert.deepEqual(state.currentRun, beforeLoot, `run loot unchanged: ${String(invalid)}`);
  assert.equal(events.length, eventCountBeforeWrite, `telemetry unchanged: ${String(invalid)}`);
}
__resetTelemetryForTests();

const fullState = createState(Array.from({ length: INVENTORY_CAPACITY }, () => "HEAL_POTION"));
assert.equal(addCanonicalInventoryItemToState(fullState, "HEAL_POTION"), false, "capacity remains enforced");
assert.equal(fullState.inventory.length, INVENTORY_CAPACITY);
assert.equal(addCanonicalInventoryItemToState(fullState, "DRAGON_KEY"), true, "quest overflow remains allowed");
assert.equal(fullState.inventory.at(-1), "DRAGON_KEY");

const portalState = createState();
assert.equal(addCanonicalInventoryItemToState(portalState, "TOWN_PORTAL"), true);
assert.equal(addCanonicalInventoryItemToState(portalState, "TOWN_PORTAL"), false, "portal remains unique");
assert.deepEqual(portalState.inventory, ["TOWN_PORTAL"]);

const events = [];
__setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
const lootState = createState([], {
  startedAt: 1,
  lootSequence: 0,
  unbankedObjectLoot: []
});
trackRunStart(
  { startedAt: 1, startFloor: 1 },
  { level: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1 },
  lootState
);
assert.equal(addCanonicalInventoryItemToState(lootState, validEquipment, {
  dungeonLoot: true,
  source: "combat"
}), true);
assert.strictEqual(lootState.currentRun.unbankedObjectLoot[0].item, validEquipment);
assert.deepEqual(
  events.filter(event => event.name === "loot_lifecycle").map(event => event.properties.lifecycleStage),
  ["found", "bagged"]
);
__resetTelemetryForTests();

const legacyState = createState();
const legacyItem = { baseId: "WAND", instanceId: "legacy-compatible", affixes: [] };
assert.equal(addInventoryItemToState(legacyState, legacyItem), true, "runtime helper accepts supported legacy ref");
assert.strictEqual(legacyState.inventory[0], legacyItem);
assert.equal(addCanonicalInventoryItemToState(createState(), { ...legacyItem, affixes: [] }), false, "canonical write rejects legacy ref");

for (const invalid of ["UNKNOWN_ITEM_ID", { baseId: "WAND", instanceId: "malformed" }, { baseId: "NO_SUCH_ITEM", instanceId: "unknown", affixes: [] }]) {
  const state = createState(["HEAL_POTION"]);
  assert.equal(addInventoryItemToState(state, invalid), false, `runtime write rejects ${String(invalid)}`);
  assert.deepEqual(state.inventory, ["HEAL_POTION"], "invalid runtime write leaves inventory unchanged");
}

console.log("[PASS] canonical inventory write validates, delegates, preserves identity, and keeps legacy semantics");
