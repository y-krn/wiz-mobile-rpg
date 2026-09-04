import assert from "node:assert/strict";
import {
  BASE_STARTING_MP,
  ITEMS,
  RUNE_ITEM_IDS,
  SPELLS,
  getCharMaxMp,
  isSpellcaster,
  canUseMageSpells,
  canUsePriestSpells,
  canUseManaItems
} from "../../../src/data.js";
import { STARTING_KITS, createStartingKitCharacter, state } from "../../../src/state.js";
import { SAVE_VERSION, migrateSavePayload } from "../../../src/state/save_migrations.js";
import { getChestItemCandidatesByFloor } from "../../../src/rules/chest_rules.js";
import {
  getActiveSpellKeys,
  getMediumRuneCapacity,
  socketRune,
  syncMediumState,
  clampCurrentMpToMax
} from "../../../src/rules/magic_rules.js";
import { resolvePlayerSpell } from "../../../src/combat_logic/spell_resolution.js";
import { chooseAutoCombatAction, getAutoHealTargetIdx } from "../../../src/combat_logic/auto_action.js";
import { socketRuneFromInventory, unsocketRuneToInventory } from "../../../src/systems/magic_actions.js";
import { equipEquipment, unequipEquipment } from "../../../src/systems/equipment_actions.js";

for (const kit of STARTING_KITS) {
  const character = createStartingKitCharacter(kit.id);
  assert.equal(character.maxMp, BASE_STARTING_MP, `${kit.id} uses universal base MP`);
  assert.equal(character.mp, BASE_STARTING_MP, `${kit.id} starts with one MP`);
  assert.deepEqual(character.spells, [], `${kit.id} has no permanent spell truth`);
}

const arcana = createStartingKitCharacter("arcana");
assert.equal(getCharMaxMp(arcana), 3, "WAND contributes medium capacity");
assert.equal(getMediumRuneCapacity(arcana), 1);
assert.deepEqual(getActiveSpellKeys(arcana), ["HALITO"]);
assert.equal(isSpellcaster(arcana), true);
assert.equal(canUseMageSpells(arcana), true);
assert.equal(canUsePriestSpells(arcana), false);
assert.equal(canUseManaItems(arcana), true);

arcana.class = "Ranger";
assert.deepEqual(chooseAutoCombatAction({
  character: arcana,
  monsters: [{ hp: 30, status: "ok", tags: [] }],
  roundNumber: 2,
  canCastSpell: () => true
}), { type: "spell", targetIdx: 0, spellName: "HALITO" });
assert.equal(getAutoHealTargetIdx(arcana), null, "mage Rune remains non-healing after class mutation");

const staleSpellLog = [];
resolvePlayerSpell(arcana, { spellName: "DIOS", targetIdx: 0 }, { party: [arcana], floor: 1 }, [], staleSpellLog);
assert.equal(arcana.mp, 1, "combat resolution rejects a spell absent from the active Rune set");
assert.match(staleSpellLog[0].msg, /Rune/);

// The compatibility class and char.spells[] cannot grant or remove a Rune-owned spell.
arcana.class = "Priest";
arcana.spells = ["DIOS"];
assert.deepEqual(getActiveSpellKeys(arcana), ["HALITO"]);
assert.equal(canUsePriestSpells(arcana), false);
assert.equal(canUseMageSpells(arcana), true);

const fighter = createStartingKitCharacter("vanguard");
fighter.equipment.weapon = "WAND";
syncMediumState(fighter);
assert.equal(socketRune(fighter, "RUNE_DIOS").ok, true);
assert.deepEqual(getActiveSpellKeys(fighter), ["DIOS"]);
assert.equal(getMediumRuneCapacity(fighter), 1);
assert.equal(socketRune(fighter, "RUNE_HALITO").reason, "capacity");

const sage = createStartingKitCharacter("arcana");
sage.equipment.weapon = "SAGE_STAFF";
syncMediumState(sage);
assert.equal(socketRune(sage, "RUNE_DIOS").ok, true);
assert.equal(socketRune(sage, "RUNE_DIOS").reason, "already_socketed");

const previousParty = state.party;
const previousInventory = state.inventory;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
state.party = [sage];
state.inventory = ["RUNE_HALITO"];
assert.equal(socketRuneFromInventory({ actorIdx: 0, inventoryIndex: 0 }).ok, true);
assert.deepEqual(state.inventory, []);
assert.equal(unsocketRuneToInventory({ actorIdx: 0, spellKey: "HALITO" }).ok, true);
assert.deepEqual(state.inventory, ["RUNE_HALITO"]);
state.party = previousParty;
state.inventory = previousInventory;

const previousLogs = state.logs;
state.logs = [];
const transitionCharacter = createStartingKitCharacter("arcana");
state.party = [transitionCharacter];
state.inventory = ["SAGE_STAFF", "RUNE_DIOS"];
transitionCharacter.mp = 3;
assert.equal(equipEquipment({ inventoryIndex: 0, actorIdx: 0 }).ok, true);
assert.equal(transitionCharacter.equipment.weapon, "SAGE_STAFF");
assert.equal(getActiveSpellKeys(transitionCharacter).length, 0, "new medium starts with no active Rune");
assert.ok(state.inventory.includes("WAND"), "old medium returns to the bag");
assert.ok(state.inventory.includes("RUNE_HALITO"), "socketed Rune returns to the bag on medium swap");
const diosIndex = state.inventory.indexOf("RUNE_DIOS");
assert.equal(socketRuneFromInventory({ actorIdx: 0, inventoryIndex: diosIndex }).ok, true);
assert.equal(unequipEquipment({ actorIdx: 0, slot: "weapon" }).ok, true);
assert.equal(transitionCharacter.equipment.weapon, null);
assert.ok(state.inventory.includes("SAGE_STAFF"), "unequipped medium returns to the bag");
assert.ok(state.inventory.includes("RUNE_DIOS"), "socketed Rune returns on medium unequip");
state.party = previousParty;
state.inventory = previousInventory;
state.logs = previousLogs;

const nonWeaponCharacter = createStartingKitCharacter("arcana");
state.party = [nonWeaponCharacter];
state.inventory = Array(20).fill("MAGE_CLOAK");
assert.equal(equipEquipment({ inventoryIndex: 0, actorIdx: 0 }).ok, true,
  "full bag does not block unrelated armor changes");
assert.deepEqual(getActiveSpellKeys(nonWeaponCharacter), ["HALITO"],
  "armor changes keep the active weapon Medium Rune");
assert.equal(state.inventory.filter(item => item === "RUNE_HALITO").length, 0,
  "non-weapon changes never duplicate socketed Runes");
state.party = previousParty;
state.inventory = previousInventory;

const objectMediumCharacter = createStartingKitCharacter("arcana");
delete objectMediumCharacter.mediumState;
objectMediumCharacter.equipment.weapon = { baseId: "WAND", instanceId: "wand-instance-1" };
const migratedObjectMedium = migrateSavePayload({
  version: SAVE_VERSION,
  party: [objectMediumCharacter],
  inventory: [],
  logs: ["resume"]
});
assert.equal(migratedObjectMedium.party[0].mediumState.mediumKey, "wand-instance-1");
assert.deepEqual(migratedObjectMedium.party[0].mediumState.socketedRunes, ["RUNE_HALITO"],
  "object-form medium migration keeps Arcana Rune active");

// Swapping away from a medium disables its active build and never restores MP.
fighter.mp = 3;
fighter.equipment.weapon = "SHORT_SWORD";
syncMediumState(fighter);
clampCurrentMpToMax(fighter, getCharMaxMp);
assert.deepEqual(getActiveSpellKeys(fighter), []);
assert.equal(fighter.mp, 1);

for (const runeId of RUNE_ITEM_IDS) {
  assert.equal(ITEMS[runeId].type, "rune");
  assert.ok(SPELLS[ITEMS[runeId].spellKey]);
  assert.ok(getChestItemCandidatesByFloor(1, { includeRunes: true }).includes(runeId), `${runeId} is a normal chest candidate`);
}

console.log("[PASS] medium and Rune ownership");
