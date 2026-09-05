import assert from "node:assert/strict";
import {
  applySavePayload,
  createDefaultCurrentRun,
  createSavePayload,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import {
  hasPendingRewardBundle,
  resolvePendingRewardBundle,
  stagePendingRewardBundle
} from "../../../src/pending_rewards.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const dummyElement = () => ({
  style: {}, dataset: {}, className: "", innerHTML: "", textContent: "", children: [],
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  appendChild(child) { this.children.push(child); return child; },
  replaceChildren(...children) { this.children = children; },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }
});
globalThis.document = {
  getElementById: () => dummyElement(), querySelector: () => null, querySelectorAll: () => [],
  createElement: dummyElement,
  createTextNode: text => ({ textContent: text })
};

function resetState(inventory = []) {
  state.party = [createStartingKitCharacter("vanguard")];
  state.inventory = [...inventory];
  state.currentRun = createDefaultCurrentRun();
  state.gameState = "explore";
  state.floor = 1;
  state.logs = [];
}

resetState(Array.from({ length: 20 }, () => "HEAL_POTION"));
const originalBag = [...state.inventory];
const bundle = stagePendingRewardBundle(state, [
  { role: "main", item: "DAGGER" },
  { role: "special", item: "TOWN_PORTAL" },
  { role: "accessory", item: "AMULET_HP" }
]);
assert.equal(hasPendingRewardBundle(state), true);
assert.deepEqual(state.inventory, originalBag, "pending rewards never use a hidden inventory slot");
assert.deepEqual(state.currentRun.unbankedObjectLoot, [], "pending rewards are not ledger-owned before resolution");
assert.equal(bundle.entries.length, 3, "all chest object rewards share one decision state");

bundle.entries.forEach(entry => { entry.decision = "take"; });
bundle.discardIndexes = [0, 1, 2];
const resolved = resolvePendingRewardBundle(state);
assert.equal(resolved.ok, true);
assert.equal(resolved.turnCost, 0, "bag-only pickup resolution is free");
assert.equal(state.inventory.length, 20, "final bag includes every selected reward after explicit discards");
assert.equal(state.currentRun.unbankedObjectLoot.length, 3, "only adopted rewards enter the run ledger");
assert.equal(state.currentRun.pendingRewardBundle, null);

resetState(Array.from({ length: 20 }, () => "HEAL_POTION"));
const rejectedBundle = stagePendingRewardBundle(state, [{ role: "main", item: "DAGGER" }]);
rejectedBundle.entries[0].decision = "take";
assert.equal(resolvePendingRewardBundle(state).ok, false, "full bags require an explicit discard");
assert.equal(state.currentRun.pendingRewardBundle !== null, true);

resetState([]);
const loadoutBundle = stagePendingRewardBundle(state, [{ role: "main", item: "DAGGER" }]);
loadoutBundle.entries[0].decision = "take";
loadoutBundle.entries[0].loadoutAction = { type: "equip", actorIdx: 0 };
const loadoutResolved = resolvePendingRewardBundle(state);
assert.equal(loadoutResolved.ok, true);
assert.equal(loadoutResolved.turnCost, 1, "loadout adoption pays one exploration turn");
assert.equal(state.currentRun.steps, 1);
assert.equal(state.party[0].equipment.weapon, "DAGGER");
assert.equal(state.currentRun.unbankedObjectLoot.length, 1);

resetState(["RUNE_HALITO"]);
state.party = [createStartingKitCharacter("arcana")];
state.party[0].mediumState.socketedRunes = [];
const runeBundle = stagePendingRewardBundle(state, [{ role: "main", item: "RUNE_DIOS" }]);
runeBundle.entries[0].decision = "take";
runeBundle.entries[0].loadoutAction = { type: "socket", actorIdx: 0 };
const runeResolved = resolvePendingRewardBundle(state);
assert.equal(runeResolved.ok, true, "known Rune can join the same loadout transaction");
assert.equal(runeResolved.turnCost, 1);
assert.equal(state.currentRun.unbankedObjectLoot.length, 1);

resetState([]);
const saveBundle = stagePendingRewardBundle(state, [{ role: "main", item: "HEAL_POTION" }]);
saveBundle.entries[0].decision = "take";
assert.equal(hasPendingRewardBundle(state), true);
const savedPending = JSON.parse(JSON.stringify(state));
const payload = createSavePayload();
assert.equal(payload.currentRun.pendingRewardBundle.entries[0].item, "HEAL_POTION");
applySavePayload(JSON.parse(JSON.stringify(payload)));
assert.equal(hasPendingRewardBundle(state), true, "reload keeps the unresolved bundle without rerolling");
assert.deepEqual(state.inventory, [], "reload does not materialize pending rewards into the bag");
console.log("[PASS] pending reward bundles resolve fairly without hidden bag slots");
