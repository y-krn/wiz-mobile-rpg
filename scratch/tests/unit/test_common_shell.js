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

assert.equal(classifyEventLine("【気配】壁の向こうで音がした。").kind, "unresolved");
assert.equal(classifyEventLine("戦闘に勝利した。").kind, "transient");

const events = getEventStripEntries([
  "【痕跡】隣接する床に罠の気配がある。",
  ...Array.from({ length: 20 }, (_, index) => `通常ログ ${index + 1}`)
]);
assert.deepEqual(events.unresolved.map(entry => entry.text), ["【痕跡】隣接する床に罠の気配がある。"]);
assert.equal(events.transient.at(-1).text, "通常ログ 20");

assert.equal(getDockStateForView({ gameState: "explore" }), DOCK_STATES.COMPACT);
assert.equal(getDockStateForView({ gameState: "combat" }), DOCK_STATES.DECISION);
assert.equal(getDockStateForView({ gameState: "submenu" }), DOCK_STATES.EXPANDED);

const townPotion = { baseId: "HEAL_POTION", instanceId: "town-1" };
const dungeonPotion = { baseId: "HEAL_POTION", instanceId: "dungeon-1" };
const state = {
  currentRun: {
    townInventory: [townPotion],
    unbankedObjectLoot: [{ id: "loot-1", item: dungeonPotion }],
    lostObjectLoot: []
  }
};
assert.equal(getItemOwnership(townPotion, { state }), OWNERSHIP_STATES.TOWN_CONFIRMED);
assert.equal(getItemOwnership(dungeonPotion, { state }), OWNERSHIP_STATES.DUNGEON_UNCONFIRMED);
assert.equal(
  getItemOwnership(dungeonPotion, { state, selectedLootIds: new Set(["loot-1"]) }),
  OWNERSHIP_STATES.WING_SELECTED
);
state.currentRun.lostObjectLoot = [dungeonPotion];
assert.equal(getItemOwnership(dungeonPotion, { state }), OWNERSHIP_STATES.LOST);
assert.match(getOwnershipLabel(OWNERSHIP_STATES.DUNGEON_UNCONFIRMED), /迷宮/);

console.log("[PASS] common shell Dock, Event Strip, and ownership contracts");
