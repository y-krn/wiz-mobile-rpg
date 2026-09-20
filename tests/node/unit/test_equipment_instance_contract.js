import assert from "node:assert/strict";
import {
  isEquipmentAffix,
  isEquipmentInstance
} from "../../../src/state/equipment.js";
import {
  generateRandomAccessory,
  generateRandomEquipment
} from "../../../src/systems/equipment_generation.js";

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function assertGeneratedEquipment(item, label) {
  assert.equal(isEquipmentInstance(item), true, `${label} must satisfy EquipmentInstance`);
  assert.equal(item.kind, "equipment");
  assert.equal(typeof item.instanceId, "string");
  assert.equal(typeof item.baseId, "string");
  assert.ok(["magic", "rare", "epic"].includes(item.rarity));
  assert.equal(Number.isFinite(item.level), true);
  assert.equal(item.identified, false);
  assert.equal(Array.isArray(item.affixes), true);
  assert.equal(item.affixes.every(isEquipmentAffix), true);
}

const equipment = generateRandomEquipment(5, { forceRarity: "rare", rng: lcg(1411) });
const accessory = generateRandomAccessory(5, { forceRarity: "epic", rng: lcg(1412) });
assertGeneratedEquipment(equipment, "equipment");
assertGeneratedEquipment(accessory, "accessory");
assert.notEqual(equipment, accessory);
assert.notEqual(equipment.affixes, accessory.affixes);

const valid = {
  kind: "equipment",
  instanceId: "eq-valid",
  baseId: "WAND",
  rarity: "magic",
  level: 1,
  identified: false,
  affixes: [{ id: "atk", kind: "support", type: "atk", value: 1.5, buildRole: "reinforce" }]
};
assert.equal(isEquipmentInstance(valid), true);
assert.equal(isEquipmentAffix(valid.affixes[0]), true);

for (const [field, value] of [
  ["instanceId", ""],
  ["instanceId", "   "],
  ["baseId", ""],
  ["kind", "item"],
  ["rarity", "common"],
  ["level", 0],
  ["level", Number.NaN],
  ["level", Infinity],
  ["identified", "false"],
  ["affixes", null]
]) {
  assert.equal(isEquipmentInstance({ ...valid, [field]: value }), false, `${field} rejects malformed core`);
}

for (const affix of [
  null,
  { ...valid.affixes[0], id: "" },
  { ...valid.affixes[0], kind: "unknown" },
  { ...valid.affixes[0], type: 1 },
  { ...valid.affixes[0], value: Number.NaN },
  { ...valid.affixes[0], buildRole: "unknown" },
  { ...valid.affixes[0], buildRole: undefined }
]) {
  assert.equal(isEquipmentAffix(affix), false, "malformed affix rejected");
  assert.equal(isEquipmentInstance({ ...valid, affixes: [affix] }), false, "malformed affix rejects instance");
}

assert.equal(isEquipmentInstance({ ...valid, affixes: new Array(1) }), false, "sparse affixes rejected");
console.log("[PASS] EquipmentInstance generation boundary, identity, shape, and fail-closed guards");
