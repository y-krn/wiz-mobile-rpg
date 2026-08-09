import assert from "node:assert/strict";
import { getCharMaxHp, getCharMaxMp } from "../src/data.js";
import { createSoloCharacter } from "../src/state.js";
import {
  EQUIPMENT_SLOTS,
  getEquipmentSlot,
  getEquipmentSlotsForType
} from "../src/rules/equipment_slots.js";

const failures = [];

function check(name, callback) {
  try {
    callback();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("every solo class exposes two accessory keys", () => {
  for (const className of ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"]) {
    const equipment = createSoloCharacter(className).equipment;
    assert.equal(equipment.accessory, null, className);
    assert.equal(equipment.accessory2, null, className);
  }
});

check("two accessory slots both contribute their item effects", () => {
  const character = createSoloCharacter("Priest");
  character.equipment.accessory = "AMULET_HP";
  character.equipment.accessory2 = "AMULET_MP";
  assert.equal(getCharMaxHp(character), character.maxHp + 10);
  assert.equal(getCharMaxMp(character), character.maxMp + 3);
});

check("slot metadata keeps accessory type separate from slot identity", () => {
  assert.deepEqual(getEquipmentSlotsForType("accessory").map(slot => slot.id), [
    "accessory",
    "accessory2"
  ]);
  assert.equal(getEquipmentSlot("accessory2").itemType, "accessory");
  assert.equal(getEquipmentSlot("accessory2").label, "装飾2");
  assert.equal(EQUIPMENT_SLOTS.length, 5);
});

if (failures.length > 0) {
  console.error(`${failures.length} accessory slot test(s) failed.`);
  process.exit(1);
}

console.log("Accessory slot tests passed.");
