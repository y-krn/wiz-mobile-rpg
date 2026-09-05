import assert from "node:assert/strict";
import { createStartingKitCharacter, state } from "../../../src/state.js";
import {
  createLoadoutDraft,
  getLoadoutDraftChanges,
  isLoadoutDraftDirty,
  stageDiscardInventoryItem,
  stageEquip,
  stageTrialEquip,
  stageSocketRune,
  stageUnequip,
  validateLoadoutDraft
} from "../../../src/rules/loadout_transaction.js";
import { commitLoadoutDraft } from "../../../src/systems/loadout_transaction.js";
import { getActiveRuneSpellKeys } from "../../../src/rules/magic_rules.js";
import { recordDungeonObjectLoot } from "../../../src/state/run_loot.js";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackRunStart
} from "../../../src/telemetry.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function resetState(character, inventory) {
  state.party = [character];
  state.inventory = inventory;
  state.gameState = "equip_overlay";
  state.floor = 1;
  state.logs = [];
  state.currentRun = { steps: 0, floorSteps: {}, runSeed: "loadout-test" };
}

const arcana = createStartingKitCharacter("arcana");
arcana.mp = 1;
resetState(arcana, ["SAGE_STAFF", "RUNE_DIOS"]);
const liveEquipment = JSON.stringify(arcana.equipment);
const liveInventory = [...state.inventory];
let draft = createLoadoutDraft(state);
let staged = stageEquip(draft, { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(staged.ok, true);
draft = staged.draft;
assert.equal(JSON.stringify(state.party[0].equipment), liveEquipment, "draft edits must not mutate live equipment");
assert.deepEqual(state.inventory, liveInventory, "draft edits must not mutate live bag");
assert.equal(draft.party[0].equipment.weapon, "SAGE_STAFF");
assert.deepEqual(getActiveRuneSpellKeys(draft.party[0]), []);
staged = stageSocketRune(draft, { actorIdx: 0, inventoryIndex: draft.inventory.indexOf("RUNE_DIOS") });
assert.equal(staged.ok, true);
draft = staged.draft;
assert.deepEqual(getActiveRuneSpellKeys(draft.party[0]), ["DIOS"]);
assert.equal(validateLoadoutDraft(draft).ok, true);
assert.equal(isLoadoutDraftDirty(draft), true);
const commitResult = commitLoadoutDraft(draft, { stateLike: state, turnCost: 1 });
assert.equal(commitResult.ok, true);
assert.equal(commitResult.turnCost, 1);
assert.equal(state.party[0].equipment.weapon, "SAGE_STAFF");
assert.deepEqual(getActiveRuneSpellKeys(state.party[0]), ["DIOS"]);
assert.deepEqual(state.inventory, ["WAND", "RUNE_HALITO"]);

const heavyCharacter = createStartingKitCharacter("vanguard");
resetState(heavyCharacter, ["SAGE_STAFF"]);
draft = createLoadoutDraft(state);
staged = stageEquip(draft, { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(staged.ok, true);
draft = staged.draft;
assert.equal(draft.party[0].equipment.shield, null, "2H commit projects shield removal");
assert.ok(draft.inventory.includes("SMALL_SHIELD"), "removed shield is returned to the draft bag");
assert.equal(validateLoadoutDraft(draft).ok, true);
assert.equal(getLoadoutDraftChanges(draft).equipment.some(change => change.slot === "shield" && change.to === null), true);

const fullBagCharacter = createStartingKitCharacter("vanguard");
resetState(fullBagCharacter, Array.from({ length: 20 }, (_, index) => `item-${index}`));
draft = createLoadoutDraft(state);
staged = stageUnequip(draft, { actorIdx: 0, slot: "weapon" });
assert.equal(staged.ok, true);
assert.equal(validateLoadoutDraft(staged.draft).ok, false, "returned gear cannot hide a 21st bag slot");
assert.equal(commitLoadoutDraft(staged.draft, { stateLike: state }).ok, false);
assert.equal(state.party[0].equipment.weapon, "SHORT_SWORD", "invalid commit leaves live state unchanged");

const lateLoot = { baseId: "DAGGER", instanceId: "late-loot", type: "weapon", identified: true };
resetState(createStartingKitCharacter("vanguard"), []);
draft = createLoadoutDraft(state);
state.inventory.push(lateLoot);
recordDungeonObjectLoot(state, lateLoot);
draft.inventory.push(lateLoot);
const discardedLateLoot = stageDiscardInventoryItem(draft, 0);
assert.equal(discardedLateLoot.ok, true);
const lateLootCommit = commitLoadoutDraft(discardedLateLoot.draft, { stateLike: state, turnCost: 1 });
assert.equal(lateLootCommit.ok, true);
assert.deepEqual(state.currentRun.unbankedObjectLoot, [], "discarded late loot must leave the run ledger");

const equippedLoot = { baseId: "SMALL_SHIELD", instanceId: "equipped-loot", type: "shield", identified: true };
const equippedCharacter = createStartingKitCharacter("vanguard");
equippedCharacter.equipment.shield = equippedLoot;
resetState(equippedCharacter, []);
recordDungeonObjectLoot(state, equippedLoot);
draft = createLoadoutDraft(state);
staged = stageUnequip(draft, { actorIdx: 0, slot: "shield" });
assert.equal(staged.ok, true);
const returnedLoot = staged.draft.inventory.indexOf(equippedLoot);
const discardedReturnedLoot = stageDiscardInventoryItem(staged.draft, returnedLoot);
assert.equal(discardedReturnedLoot.ok, true);
const discardedEquippedCommit = commitLoadoutDraft(discardedReturnedLoot.draft, { stateLike: state, turnCost: 1 });
assert.equal(discardedEquippedCommit.ok, true);
assert.deepEqual(state.currentRun.unbankedObjectLoot, [], "discarded equipped loot must leave the run ledger");

const telemetryEvents = [];
__setTelemetryClientForTests({ capture: (name, properties) => telemetryEvents.push({ name, properties }) });
const telemetryCharacter = createStartingKitCharacter("vanguard");
telemetryCharacter.equipment.weapon = "DAGGER";
resetState(telemetryCharacter, ["SHORT_SWORD"]);
state.gameState = "explore";
trackRunStart({ characterClass: "Fighter", startFloor: 1 }, telemetryCharacter, state);
draft = createLoadoutDraft(state);
staged = stageEquip(draft, { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(staged.ok, true);
const exploreCommit = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1 });
assert.equal(exploreCommit.turnCost, 1);
assert.equal(
  telemetryEvents.filter(event => event.name === "loadout_transaction").at(-1)?.properties.turnCost,
  1,
  "explore commits must report their actual turn cost"
);

resetState(createStartingKitCharacter("vanguard"), ["DAGGER"]);
state.gameState = "town";
trackRunStart({ characterClass: "Fighter", startFloor: 1 }, state.party[0], state);
draft = createLoadoutDraft(state);
staged = stageEquip(draft, { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(staged.ok, true);
const townCommit = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 0 });
assert.equal(townCommit.turnCost, 0);
assert.equal(
  telemetryEvents.filter(event => event.name === "loadout_transaction").at(-1)?.properties.turnCost,
  0,
  "non-explore commits must report zero turn cost"
);
const transactionCount = telemetryEvents.filter(event => event.name === "loadout_transaction").length;
const noOpCommit = commitLoadoutDraft(createLoadoutDraft(state), { stateLike: state, turnCost: 1 });
assert.equal(noOpCommit.turnCost, 0);
assert.equal(
  telemetryEvents.filter(event => event.name === "loadout_transaction").length,
  transactionCount,
  "no-op commits must not emit a paid transaction"
);
const invalidDraft = createLoadoutDraft(state);
invalidDraft.inventory = Array.from({ length: 21 }, (_, index) => `invalid-${index}`);
const invalidCommit = commitLoadoutDraft(invalidDraft, { stateLike: state, turnCost: 1 });
assert.equal(invalidCommit.ok, false);
assert.equal(
  telemetryEvents.filter(event => event.name === "loadout_transaction").length,
  transactionCount,
  "invalid commits must not emit a paid transaction"
);

const unknownTrial = {
  kind: "equipment",
  instanceId: "unknown-trial-sword",
  baseId: "SHORT_SWORD",
  rarity: "rare",
  level: 2,
  identified: false,
  halfIdentified: false,
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
const trialCharacter = createStartingKitCharacter("vanguard");
trialCharacter.equipment.weapon = "DAGGER";
resetState(trialCharacter, [unknownTrial]);
state.gameState = "explore";
draft = createLoadoutDraft(state);
assert.equal(stageEquip(draft, { actorIdx: 0, inventoryIndex: 0 }).ok, false, "unknown equipment cannot enter the normal loadout path");
staged = stageTrialEquip(draft, { actorIdx: 0, inventoryIndex: 0, lootId: "loadout-test:loot:7" });
assert.equal(staged.ok, true);
assert.equal(state.party[0].equipment.weapon, "DAGGER", "trial staging does not mutate live equipment");
assert.equal(staged.draft.trialAction.item, unknownTrial);
assert.equal(validateLoadoutDraft(staged.draft).ok, true);
const trialCommit = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1 });
assert.equal(trialCommit.ok, true);
assert.equal(state.party[0].equipment.weapon, unknownTrial);
assert.equal(unknownTrial.knowledgeStage, "trial");
assert.equal(unknownTrial.trialCount, 1);
assert.equal(unknownTrial.curseLocked, true, "curse locks only at the trial commit");
assert.equal(telemetryEvents.filter(event => event.name === "equipment_decision").at(-1)?.properties.action, "trial");
assert.equal(telemetryEvents.filter(event => event.name === "loot_lifecycle").at(-1)?.properties.lifecycleStage, "tried");
assert.equal(telemetryEvents.filter(event => event.name === "loot_lifecycle").at(-1)?.properties.lootSequence, 7);
assert.equal(telemetryEvents.filter(event => event.name === "loadout_transaction").at(-1)?.properties.mode, "trial");

// Use the same trial-stage lifecycle for a non-cursed item; cursed trial gear remains locked.
unknownTrial.curseEffectId = null;
unknownTrial.curseLocked = false;
const triedLifecycleCount = telemetryEvents.filter(event => (
  event.name === "loot_lifecycle" && event.properties.lifecycleStage === "tried"
)).length;
draft = createLoadoutDraft(state);
staged = stageUnequip(draft, { actorIdx: 0, slot: "weapon" });
assert.equal(staged.ok, true);
const unequipCommit = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1 });
assert.equal(unequipCommit.ok, true);
draft = createLoadoutDraft(state);
staged = stageEquip(draft, {
  actorIdx: 0,
  inventoryIndex: draft.inventory.indexOf(unknownTrial),
  requestedSlot: "weapon"
});
assert.equal(staged.ok, true, "a trial-stage item can return through the normal loadout path");
const reEquipCommit = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1 });
assert.equal(reEquipCommit.ok, true);
assert.equal(unknownTrial.knowledgeStage, "trial");
assert.equal(unknownTrial.trialCount, 1, "normal re-equip does not count as another trial");
assert.equal(
  telemetryEvents.filter(event => event.name === "loot_lifecycle" && event.properties.lifecycleStage === "tried").length,
  triedLifecycleCount,
  "normal re-equip does not re-emit tried telemetry"
);
assert.equal(telemetryEvents.filter(event => event.name === "equipment_decision").at(-1)?.properties.action, "equip");
assert.equal(telemetryEvents.filter(event => event.name === "loadout_transaction").at(-1)?.properties.mode, "loadout");

const combatTrialCharacter = createStartingKitCharacter("vanguard");
const combatTrialState = {
  ...state,
  party: [combatTrialCharacter],
  inventory: [unknownTrial],
  gameState: "explore"
};
const combatTrial = stageTrialEquip(createLoadoutDraft(combatTrialState), { actorIdx: 0, inventoryIndex: 0 });
combatTrialState.gameState = "combat";
assert.equal(commitLoadoutDraft(combatTrial.draft, { stateLike: combatTrialState, turnCost: 1 }).ok, false, "combat cannot commit a trial");
__resetTelemetryForTests();

console.log("[PASS] loadout drafts validate and commit atomically");
