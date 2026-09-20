import assert from "node:assert/strict";
import { createStartingKitCharacter } from "../../../src/state/initial_state.js";
import {
  EQUIPMENT_SLOT_IDS,
  isCharacterEquipment,
  isEquipmentSlotId
} from "../../../src/state/equipment.js";
import { normalizeSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";
import {
  createEquipmentPreviewChar,
  getEquipmentPreview,
  getUnequipPreview
} from "../../../src/rules/equipment_preview.js";
import { EQUIPMENT_SLOTS } from "../../../src/rules/equipment_slots.js";

const validEquipment = {
  kind: "equipment",
  instanceId: "character-equipment-contract",
  baseId: "WAND",
  rarity: "magic",
  level: 1,
  identified: false,
  affixes: []
};

const emptyEquipment = () => Object.fromEntries(EQUIPMENT_SLOT_IDS.map(slot => [slot, null]));

assert.deepEqual(EQUIPMENT_SLOTS.map(slot => slot.id), [...EQUIPMENT_SLOT_IDS]);
for (const kitId of ["vanguard", "scout", "devotion", "arcana"]) {
  assert.deepEqual(Object.keys(createStartingKitCharacter(kitId).equipment), [...EQUIPMENT_SLOT_IDS]);
}

assert.deepEqual(
  EQUIPMENT_SLOTS.map(slot => slot.id),
  ["weapon", "shield", "armor", "accessory", "accessory2"]
);
assert.equal(isEquipmentSlotId("weapon"), true);
assert.equal(isEquipmentSlotId("accessory2"), true);
assert.equal(isEquipmentSlotId("helmet"), false);
assert.equal(isEquipmentSlotId(null), false);

const stringEquipment = { ...emptyEquipment(), weapon: "WAND" };
const legacyEquipment = { baseId: "WAND", instanceId: "legacy-character-equipment", affixes: [] };
assert.equal(isCharacterEquipment(stringEquipment), true);
assert.equal(isCharacterEquipment({ ...emptyEquipment(), weapon: validEquipment }), true);
assert.equal(isCharacterEquipment({ ...emptyEquipment(), weapon: legacyEquipment }), true);
assert.equal(isCharacterEquipment(emptyEquipment()), true);
assert.equal(isCharacterEquipment({ ...stringEquipment, accessory2: undefined }), false);
assert.equal(isCharacterEquipment({ ...stringEquipment, weapon: {} }), false);
assert.equal(isCharacterEquipment({ ...stringEquipment, weapon: [] }), false);
assert.equal(isCharacterEquipment({ ...stringEquipment, accessory2: "" }), false);
const missingSlot = emptyEquipment();
delete missingSlot.accessory2;
assert.equal(isCharacterEquipment(missingSlot), false);

const identityChar = { equipment: { ...emptyEquipment(), weapon: validEquipment } };
const previewChar = createEquipmentPreviewChar(identityChar);
assert.strictEqual(previewChar.equipment.weapon, validEquipment);

const malformedPreviewChar = createEquipmentPreviewChar({
  equipment: { ...emptyEquipment(), weapon: { baseId: "WAND" } }
});
assert.equal(malformedPreviewChar, null);
assert.equal(getEquipmentPreview({
  equipment: { ...emptyEquipment(), weapon: { baseId: "WAND" } }
}, "WAND"), null);
assert.equal(getUnequipPreview({
  equipment: { ...emptyEquipment(), weapon: { baseId: "WAND" } }
}, "weapon"), null);

const legacySave = normalizeSavePayload({
  version: SAVE_VERSION,
  inventory: [legacyEquipment],
  party: [{ equipment: { weapon: legacyEquipment } }]
});
assert.equal(legacySave.version, SAVE_VERSION);
assert.deepEqual(legacySave.party[0].equipment, {
  weapon: legacySave.party[0].equipment.weapon,
  shield: null,
  armor: null,
  accessory: null,
  accessory2: null
});
assert.strictEqual(legacySave.party[0].equipment.weapon, legacySave.inventory[0]);

console.log("[PASS] canonical CharacterEquipment slots, guards, identity, drift, and legacy normalization");
