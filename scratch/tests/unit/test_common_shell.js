import assert from "node:assert/strict";
import {
  DOCK_STATES,
  OWNERSHIP_STATES,
  classifyEventLine,
  getDockStateForView,
  getEventStripEntries,
  getItemOwnership,
  getOwnershipLabel
} from "../../../src/ui/common_shell.js";
import { state, addEventLog, resolveEventObservation } from "../../../src/state.js";

assert.equal(classifyEventLine("【気配】壁の向こうで音がした。").kind, "unresolved");
assert.equal(classifyEventLine("戦闘に勝利した。").kind, "transient");

const events = getEventStripEntries([
  "【痕跡】隣接する床に罠の気配がある。",
  ...Array.from({ length: 20 }, (_, index) => `通常ログ ${index + 1}`)
]);
assert.deepEqual(events.unresolved.map(entry => entry.text), ["【痕跡】隣接する床に罠の気配がある。"]);
assert.equal(events.transient.at(-1).text, "通常ログ 20");

const observation = {
  "aura:1:boss:4:4": {
    key: "aura:1:boss:4:4",
    scope: "aura:1",
    text: "【気配】強敵が近い。",
    lifecycle: "active"
  }
};
assert.equal(
  getEventStripEntries(["【気配】強敵が近い。", "通常ログ"], { activeObservations: observation }).unresolved.length,
  1
);
observation["aura:1:boss:4:4"].lifecycle = "resolved";
assert.equal(
  getEventStripEntries(["【気配】強敵が近い。", "通常ログ"], { activeObservations: observation }).unresolved.length,
  0
);

state.logs = [];
state.currentRun = { eventObservations: {} };
addEventLog("【気配】観測中", { key: "test:observation", scope: "test" });
assert.equal(state.currentRun.eventObservations["test:observation"].lifecycle, "active");
resolveEventObservation("test:observation");
assert.equal(state.currentRun.eventObservations["test:observation"].lifecycle, "resolved");

assert.equal(getDockStateForView({ gameState: "explore" }), DOCK_STATES.COMPACT);
assert.equal(getDockStateForView({ gameState: "combat" }), DOCK_STATES.DECISION);
assert.equal(getDockStateForView({ gameState: "submenu" }), DOCK_STATES.EXPANDED);

const townPotion = { baseId: "HEAL_POTION", instanceId: "town-1" };
const dungeonPotion = { baseId: "HEAL_POTION", instanceId: "dungeon-1" };
const ownershipState = {
  currentRun: {
    townInventory: [townPotion],
    unbankedObjectLoot: [{ id: "loot-1", item: dungeonPotion }],
    lostObjectLoot: []
  }
};
assert.equal(getItemOwnership(townPotion, { state: ownershipState }), OWNERSHIP_STATES.TOWN_CONFIRMED);
assert.equal(getItemOwnership(dungeonPotion, { state: ownershipState }), OWNERSHIP_STATES.DUNGEON_UNCONFIRMED);
assert.equal(
  getItemOwnership(dungeonPotion, { state: ownershipState, selectedLootIds: new Set(["loot-1"]) }),
  OWNERSHIP_STATES.WING_SELECTED
);
ownershipState.currentRun.lostObjectLoot = [dungeonPotion];
assert.equal(getItemOwnership(dungeonPotion, { state: ownershipState }), OWNERSHIP_STATES.LOST);
assert.match(getOwnershipLabel(OWNERSHIP_STATES.DUNGEON_UNCONFIRMED), /迷宮/);

const ambiguousState = {
  currentRun: {
    townInventory: ["HEAL_POTION"],
    unbankedObjectLoot: [{ id: "loot-primitive", item: "HEAL_POTION" }],
    lostObjectLoot: []
  }
};
assert.equal(
  getItemOwnership("HEAL_POTION", { state: ambiguousState }),
  OWNERSHIP_STATES.AMBIGUOUS
);
assert.equal(
  getItemOwnership("HEAL_POTION", { state: ambiguousState, lootEntryId: "loot-primitive" }),
  OWNERSHIP_STATES.DUNGEON_UNCONFIRMED
);
assert.match(getOwnershipLabel(OWNERSHIP_STATES.AMBIGUOUS), /不明/);

console.log("[PASS] common shell Dock, Event Strip, and ownership contracts");
