import assert from "node:assert/strict";
import { createStartingKitCharacter, state } from "../../../src/state.js";
import {
  createLoadoutDraft,
  getLoadoutDraftChanges,
  isLoadoutDraftDirty,
  stageDiscardInventoryItem,
  stageEquip,
  stageSocketRune,
  stageUnequip,
  validateLoadoutDraft
} from "../../../src/rules/loadout_transaction.js";
import { commitLoadoutDraft } from "../../../src/systems/loadout_transaction.js";
import { getActiveRuneSpellKeys } from "../../../src/rules/magic_rules.js";
import { recordDungeonObjectLoot } from "../../../src/state/run_loot.js";

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
const commitResult = commitLoadoutDraft(draft, { stateLike: state });
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
resetState(createStartingKitCharacter("vanguard"), [lateLoot]);
recordDungeonObjectLoot(state, lateLoot);
draft = createLoadoutDraft(state);
const discardedLateLoot = stageDiscardInventoryItem(draft, 0);
assert.equal(discardedLateLoot.ok, true);
const lateLootCommit = commitLoadoutDraft(discardedLateLoot.draft, { stateLike: state });
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
const discardedEquippedCommit = commitLoadoutDraft(discardedReturnedLoot.draft, { stateLike: state });
assert.equal(discardedEquippedCommit.ok, true);
assert.deepEqual(state.currentRun.unbankedObjectLoot, [], "discarded equipped loot must leave the run ledger");

console.log("[PASS] loadout drafts validate and commit atomically");
