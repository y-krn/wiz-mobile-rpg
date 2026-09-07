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
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackRunStart
} from "../../../src/telemetry.js";

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

resetState(Array.from({ length: 20 }, () => "HEAL_POTION"));
state.party[0].equipment.weapon = null;
const fullBagEquipBundle = stagePendingRewardBundle(state, [{ role: "main", item: "DAGGER" }]);
fullBagEquipBundle.entries[0].decision = "take";
fullBagEquipBundle.entries[0].loadoutAction = { type: "equip", actorIdx: 0 };
const fullBagEquipResolved = resolvePendingRewardBundle(state);
assert.equal(fullBagEquipResolved.ok, true, "20/20 bag can equip pending gear into an empty slot");
assert.equal(state.inventory.length, 20);
assert.equal(state.party[0].equipment.weapon, "DAGGER");

resetState(Array.from({ length: 20 }, () => "HEAL_POTION"));
state.party = [createStartingKitCharacter("arcana")];
state.party[0].mediumState.socketedRunes = [];
const fullBagRuneBundle = stagePendingRewardBundle(state, [{ role: "main", item: "RUNE_DIOS" }]);
fullBagRuneBundle.entries[0].decision = "take";
fullBagRuneBundle.entries[0].loadoutAction = { type: "socket", actorIdx: 0 };
const fullBagRuneResolved = resolvePendingRewardBundle(state);
assert.equal(fullBagRuneResolved.ok, true, "20/20 bag can socket pending Rune into an empty slot");
assert.equal(state.inventory.length, 20);
assert.deepEqual(state.party[0].mediumState.socketedRunes, ["RUNE_DIOS"]);

resetState(Array.from({ length: 20 }, () => "HEAL_POTION"));
const replacementBundle = stagePendingRewardBundle(state, [{ role: "main", item: "DAGGER" }]);
replacementBundle.entries[0].decision = "take";
replacementBundle.entries[0].loadoutAction = { type: "equip", actorIdx: 0 };
const replacementResolved = resolvePendingRewardBundle(state);
assert.equal(replacementResolved.ok, false, "replacing gear with a full bag requires room for the displaced item");
assert.equal(state.inventory.length, 20);
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

const unknownTrial = {
  kind: "equipment",
  instanceId: "pending-unknown-trial",
  baseId: "SHORT_SWORD",
  rarity: "rare",
  level: 2,
  identified: false,
  knowledgeStage: "discovery",
  trialCount: 0,
  tags: ["blade"],
  hintTags: ["blade"],
  observedHintTags: [],
  curseEffectId: "curse_blood_thirst",
  cursePower: 1,
  curseSuspected: true,
  affixes: []
};
resetState(Array.from({ length: 19 }, () => "HEAL_POTION"));
state.party[0].equipment.weapon = "DAGGER";
const telemetryEvents = [];
__setTelemetryClientForTests({ capture: (name, properties) => telemetryEvents.push({ name, properties }) });
trackRunStart({ characterClass: "Fighter", startFloor: 1 }, state.party[0], state);
const trialBundle = stagePendingRewardBundle(state, [{ role: "main", item: unknownTrial }]);
trialBundle.entries[0].decision = "take";
trialBundle.entries[0].loadoutAction = { type: "trial", actorIdx: 0 };
const trialResolved = resolvePendingRewardBundle(state);
assert.equal(trialResolved.ok, true, "pending unknown equipment uses the dedicated trial path");
assert.equal(trialResolved.turnCost, 1);
assert.equal(state.currentRun.steps, 1, "pending trial costs one exploration turn total");
assert.equal(state.inventory.length, 20, "displaced gear returns without a hidden 21st slot");
assert.equal(state.party[0].equipment.weapon, unknownTrial);
assert.equal(unknownTrial.knowledgeStage, "trial");
assert.equal(unknownTrial.curseLocked, true);
assert.equal(
  telemetryEvents.filter(event => event.name === "loot_lifecycle" && event.properties.lifecycleStage === "tried").at(-1)?.properties.lootSequence,
  1,
  "pending trial keeps its loot sequence through the commit"
);
assert.equal(
  telemetryEvents.filter(event => event.name === "loot_lifecycle" && event.properties.lifecycleStage === "bagged").at(-1)?.properties.lootSequence,
  1,
  "pending trial adoption keeps the same loot sequence"
);
__resetTelemetryForTests();

const trialStageItem = {
  ...unknownTrial,
  instanceId: "pending-trial-stage",
  curseEffectId: null,
  curseLocked: false,
  trialCount: 1,
  knowledgeStage: "trial"
};
resetState(Array.from({ length: 19 }, () => "HEAL_POTION"));
state.party[0].equipment.weapon = "DAGGER";
const trialStageBundle = stagePendingRewardBundle(state, [{ role: "main", item: trialStageItem }]);
trialStageBundle.entries[0].decision = "take";
trialStageBundle.entries[0].loadoutAction = { type: "equip", actorIdx: 0 };
const trialStageResolved = resolvePendingRewardBundle(state);
assert.equal(trialStageResolved.ok, true, "trial-stage pending gear uses the normal equip path");
assert.equal(trialStageItem.trialCount, 1, "pending normal re-equip does not count as another trial");

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
