import assert from "node:assert/strict";
import { createStartingKitCharacter, state } from "../../../src/state.js";
import {
  createLoadoutDraft,
  getItemIdentity,
  getLoadoutInventoryChanges,
  getLoadoutDraftChanges,
  isLoadoutDraftDirty,
  stageDiscardInventoryItem,
  stageEquip,
  stageTrialEquip,
  stageSocketRune,
  stageUnequip,
  validateLoadoutDraft,
  sameItemIdentity
} from "../../../src/rules/loadout_transaction.js";
import { commitLoadoutDraft } from "../../../src/systems/loadout_transaction.js";
import { commitLoadoutDraft as commitLoadoutDraftOwner } from "../../../src/systems/loadout_transaction.ts";
import { getActiveRuneSpellKeys } from "../../../src/rules/magic_rules.js";
import { recordDungeonObjectLoot } from "../../../src/state/run_loot.js";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackRunStart
} from "../../../src/telemetry.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

assert.equal(commitLoadoutDraft, commitLoadoutDraftOwner, "the JS compatibility facade preserves owner function identity");

const identityA = { instanceId: "a", baseId: "SHORT_SWORD", rarity: "rare" };
const identityAClone = { rarity: "rare", baseId: "SHORT_SWORD", instanceId: "a" };
const identityB = { instanceId: "b", baseId: "SHORT_SWORD", rarity: "rare" };
assert.equal(sameItemIdentity(identityA, identityAClone), true, "same instance ID survives object cloning");
assert.equal(sameItemIdentity(identityA, identityB), false, "different instance IDs remain distinct");
assert.equal(getItemIdentity(identityA), getItemIdentity(identityAClone), "property order is not part of identity");
assert.equal(sameItemIdentity({ baseId: "SHORT_SWORD", rarity: "rare" }, { rarity: "rare", baseId: "SHORT_SWORD" }), false, "legacy objects use reference identity, not serialization");
assert.equal(sameItemIdentity("HEAL_POTION", "HEAL_POTION"), true, "static item IDs use canonical value identity");

const duplicateCharacter = createStartingKitCharacter("vanguard");
resetState(duplicateCharacter, [identityA, identityB, "HEAL_POTION", "HEAL_POTION"]);
let identityDraft = createLoadoutDraft(state);
identityDraft.inventory = [identityAClone, "HEAL_POTION"];
const duplicateChanges = getLoadoutDraftChanges(identityDraft);
assert.deepEqual(duplicateChanges.discarded, [identityB, "HEAL_POTION"], "duplicate object and primitive accounting remain one-for-one");
identityDraft.committed = true;
const duplicateCombatState = { ...state, gameState: "combat" };
assert.equal(commitLoadoutDraft(identityDraft, { stateLike: duplicateCombatState }).duplicate, true, "duplicate handling precedes combat lock");
identityDraft.committed = false;

const equipIdentityCharacter = createStartingKitCharacter("vanguard");
const equipIdentityItem = { kind: "equipment", instanceId: "equip-identity", baseId: "DAGGER", rarity: "rare", identified: true, affixes: [] };
resetState(equipIdentityCharacter, [equipIdentityItem]);
let equipIdentityDraft = createLoadoutDraft(state);
let equipIdentityStage = stageEquip(equipIdentityDraft, { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(equipIdentityStage.ok, true);
equipIdentityStage = stageUnequip(equipIdentityStage.draft, { actorIdx: 0, slot: "weapon" });
assert.equal(equipIdentityStage.ok, true);
assert.equal(equipIdentityStage.draft.inventory.at(-1), equipIdentityItem, "equip and unequip preserve the object instance");

const swapOldItem = { kind: "equipment", instanceId: "swap-old", baseId: "SHORT_SWORD", rarity: "rare", identified: true, affixes: [] };
const swapNewItem = { kind: "equipment", instanceId: "swap-new", baseId: "DAGGER", rarity: "rare", identified: true, affixes: [] };
const swapCharacter = createStartingKitCharacter("vanguard");
swapCharacter.equipment.weapon = swapOldItem;
resetState(swapCharacter, [swapNewItem]);
const swapStage = stageEquip(createLoadoutDraft(state), { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(swapStage.ok, true);
assert.equal(swapStage.draft.party[0].equipment.weapon, swapNewItem, "swap equips the new object instance");
assert.equal(swapStage.draft.inventory[0], swapOldItem, "swap returns the old object instance");
assert.equal(sameItemIdentity(swapOldItem, swapNewItem), false, "swap instances are not collapsed");

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
const repeatedCommit = commitLoadoutDraft(draft, { stateLike: state, turnCost: 1 });
assert.deepEqual(repeatedCommit, {
  ok: true,
  changed: false,
  duplicate: true,
  turnCost: 0,
  changes: getLoadoutDraftChanges(draft)
}, "the same semantic loadout transaction cannot commit twice");
assert.equal(state.party[0].equipment.weapon, "SAGE_STAFF");
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
assert.deepEqual(
  getLoadoutInventoryChanges(["CLAYMORE"], ["DAGGER", "SMALL_SHIELD"]),
  { removed: ["CLAYMORE"], added: ["DAGGER", "SMALL_SHIELD"] },
  "inventory projection reports returned equipment without duplicating transaction rules"
);

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
const invalidPartyBefore = state.party;
const invalidInventoryBefore = state.inventory;
const invalidErrors = validateLoadoutDraft(invalidDraft).errors;
const invalidCommit = commitLoadoutDraft(invalidDraft, { stateLike: state, turnCost: 1 });
assert.equal(invalidCommit.ok, false);
assert.equal(invalidCommit.reason, "invalid_draft");
assert.deepEqual(invalidCommit.errors, invalidErrors, "validation errors pass through unchanged");
assert.equal(invalidDraft.committed, undefined);
assert.equal(state.party, invalidPartyBefore);
assert.equal(state.inventory, invalidInventoryBefore);
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
assert.equal(state.logs.at(-1), "試用を確定した。ダガー → 未鑑定の装備品（試用済）（探索時間が進む）");
assert.ok(state.logs.includes("[呪い装備] 未鑑定の装備品（試用済）は外せない。"));

// Trial policy keeps location, explicit world-action escape hatch, and strict turn-cost semantics.
const locationTrialCharacter = createStartingKitCharacter("vanguard");
locationTrialCharacter.equipment.weapon = "DAGGER";
const locationTrialItem = { ...unknownTrial, instanceId: "location-trial", knowledgeStage: "discovery", trialCount: 0, curseLocked: false };
resetState(locationTrialCharacter, [locationTrialItem]);
draft = createLoadoutDraft(state);
staged = stageTrialEquip(draft, { actorIdx: 0, inventoryIndex: 0 });
state.gameState = "town";
const locationFailure = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1 });
assert.deepEqual(locationFailure, { ok: false, reason: "未鑑定装備の試用は探索中のみ実行できます。" });
assert.equal(staged.draft.committed, undefined);
const turnFailure = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: "1" });
assert.deepEqual(turnFailure, { ok: false, reason: "未鑑定装備の試用は探索中のみ実行できます。" });
const worldActionTrial = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1, worldAction: "explore" });
assert.equal(worldActionTrial.ok, true, "worldAction explore retains the location escape hatch");
assert.equal(worldActionTrial.changed && state.logs.at(-1), "試用を確定した。ダガー → 未鑑定の装備品（試用済）（探索時間が進む）");

// Strict numeric turn cost, normal lifecycle, log, reference, copy, and finite MP clamp.
const normalCharacter = createStartingKitCharacter("arcana");
normalCharacter.equipment.weapon = "DAGGER";
normalCharacter.mp = 1;
resetState(normalCharacter, ["SHORT_SWORD"]);
state.gameState = "explore";
const normalDraft = createLoadoutDraft(state);
staged = stageEquip(normalDraft, { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(staged.ok, true);
staged.draft.party[0].mp = 999;
const previousParty = state.party;
const normalDraftInventory = staged.draft.inventory;
const normalCommit = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: "1" });
assert.equal(normalCommit.ok, true);
assert.equal(normalCommit.turnCost, 0, "string turn cost is not coerced");
assert.equal(state.party, staged.draft.party, "commit preserves the draft party reference");
assert.notEqual(state.inventory, normalDraftInventory, "commit shallow-copies the inventory array");
assert.equal(state.inventory[0], normalDraftInventory[0], "inventory items preserve identity");
assert.ok(state.party[0].mp < 999 && Number.isFinite(state.party[0].mp), "finite MP is clamped");
assert.equal(state.logs.at(-1), "装備変更を確定した。ダガー → ショートソード");
assert.equal(staged.draft.committed, true, "successful commit marks the draft only after applying it");

// Trial turn-cost reason is exact when the location constraint is satisfied.
const strictTrialCharacter = createStartingKitCharacter("vanguard");
const strictTrialItem = { ...unknownTrial, instanceId: "strict-trial", knowledgeStage: "discovery", trialCount: 0, curseLocked: false };
resetState(strictTrialCharacter, [strictTrialItem]);
state.gameState = "explore";
staged = stageTrialEquip(createLoadoutDraft(state), { actorIdx: 0, inventoryIndex: 0 });
const strictTrialFailure = commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: "1" });
assert.deepEqual(strictTrialFailure, { ok: false, reason: "試用には探索時間1ターンが必要です。" });
assert.equal(staged.draft.committed, undefined);
recordDungeonObjectLoot(state, strictTrialItem);
const fallbackTrialLootId = state.currentRun.unbankedObjectLoot[0].id;
trackRunStart({ characterClass: "Fighter", startFloor: 1 }, state.party[0], state);
staged = stageTrialEquip(createLoadoutDraft(state), { actorIdx: 0, inventoryIndex: 0, lootId: "" });
assert.equal(commitLoadoutDraft(staged.draft, { stateLike: state, turnCost: 1 }).ok, true);
assert.equal(telemetryEvents.filter(event => event.name === "loot_lifecycle").at(-1)?.properties.lootSequence, Number(fallbackTrialLootId.split(":loot:")[1]));

// Use the same trial-stage lifecycle for a non-cursed item; cursed trial gear remains locked.
const trialReequipCharacter = createStartingKitCharacter("vanguard");
trialReequipCharacter.equipment.weapon = unknownTrial;
resetState(trialReequipCharacter, []);
state.gameState = "explore";
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

// Ordinary equipment emits adopted lifecycle.
const adoptedItem = { kind: "equipment", instanceId: "adopted-loadout", baseId: "DAGGER", rarity: "rare", identified: true, affixes: [] };
resetState(createStartingKitCharacter("vanguard"), [adoptedItem]);
state.gameState = "explore";
trackRunStart({ characterClass: "Fighter", startFloor: 1 }, state.party[0], state);
staged = stageEquip(createLoadoutDraft(state), { actorIdx: 0, inventoryIndex: 0, requestedSlot: "weapon" });
assert.equal(commitLoadoutDraft(staged.draft, { stateLike: state }).ok, true);
assert.equal(telemetryEvents.filter(event => event.name === "loot_lifecycle").at(-1)?.properties.lifecycleStage, "adopted");
assert.notEqual(state.party, previousParty);

const discardedItem = { baseId: "DAGGER", instanceId: "discarded-loadout", type: "weapon", identified: true };
resetState(createStartingKitCharacter("vanguard"), [discardedItem]);
state.gameState = "explore";
trackRunStart({ characterClass: "Fighter", startFloor: 1 }, state.party[0], state);
recordDungeonObjectLoot(state, discardedItem);
const discardedLootId = state.currentRun.unbankedObjectLoot[0].id;
const discardStart = telemetryEvents.length;
const discardStage = stageDiscardInventoryItem(createLoadoutDraft(state), 0);
assert.equal(discardStage.ok, true);
assert.equal(commitLoadoutDraft(discardStage.draft, { stateLike: state }).ok, true);
assert.equal(state.currentRun.unbankedObjectLoot.length, 0);
const discardEvents = telemetryEvents.slice(discardStart);
assert.deepEqual(discardEvents.map(event => event.name), ["equipment_decision", "loot_lifecycle", "loadout_transaction"]);
assert.equal(discardEvents[1].properties.lifecycleStage, "discarded");
assert.equal(discardEvents[1].properties.lootSequence, Number(discardedLootId.split(":loot:")[1]));
assert.equal(discardEvents[1].properties.unbankedObjectLootCount, 0, "loot is consumed before discarded lifecycle telemetry");

const combatTrialCharacter = createStartingKitCharacter("vanguard");
const combatTrialState = {
  ...state,
  party: [combatTrialCharacter],
  inventory: [unknownTrial],
  gameState: "explore"
};
const combatTrial = stageTrialEquip(createLoadoutDraft(combatTrialState), { actorIdx: 0, inventoryIndex: 0 });
combatTrialState.gameState = "combat";
assert.deepEqual(
  commitLoadoutDraft(combatTrial.draft, { stateLike: combatTrialState, turnCost: 1 }),
  { ok: false, reason: "combat_locked" },
  "combat lock rejects commits with its exact reason"
);
__resetTelemetryForTests();

console.log("[PASS] loadout drafts validate and commit atomically");
