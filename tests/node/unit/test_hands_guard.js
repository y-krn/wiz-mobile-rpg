import assert from "node:assert/strict";
import * as equipmentHandsFacade from "../../../src/rules/equipment_hands.js";
import * as equipmentHandsOwner from "../../../src/rules/equipment_hands.ts";
import { ITEMS } from "../../../src/data/items.js";
import {
  getCharacterEquipmentHands,
  getEquipmentHandConflict,
  getEquipmentHands,
  getEquipmentHandSummary
} from "../../../src/rules/equipment_hands.js";
import { canEquipEquipment } from "../../../src/rules/equipment_rules.js";
import {
  getGuardProfile,
  getGuardProfileId,
  resolveGuardMitigation,
  resolveGuardStatusChance
} from "../../../src/rules/guard_rules.js";
import { state } from "../../../src/state/state_core.js";
import { equipEquipment } from "../../../src/systems/equipment_actions.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { recordReceivedDamage } from "../../../src/combat_logic/damage.js";

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

assert.deepEqual(Object.keys(equipmentHandsFacade).sort(), Object.keys(equipmentHandsOwner).sort());
for (const name of Object.keys(equipmentHandsOwner)) {
  assert.strictEqual(equipmentHandsFacade[name], equipmentHandsOwner[name], `${name} facade identity`);
}
assert.equal(equipmentHandsOwner.MAX_EQUIPMENT_HANDS, 2);

function character(equipment = {}) {
  return {
    name: "hands/guard test",
    level: 1,
    hp: 20,
    maxHp: 20,
    mp: 0,
    maxMp: 0,
    str: 10,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 10,
    luk: 10,
    status: "ok",
    equipment: {
      weapon: null,
      shield: null,
      armor: null,
      accessory: null,
      accessory2: null,
      ...equipment
    }
  };
}

const weaponHands = Object.values(ITEMS)
  .filter(item => item.type === "weapon" && !item.id.startsWith("RUNE_"));
assert.ok(weaponHands.length > 0);
assert.ok(weaponHands.every(item => [1, 2].includes(item.hands)), "every weapon declares hand usage");
assert.ok(Object.values(ITEMS).filter(item => item.type === "shield").every(item => item.hands === 1));
assert.equal(ITEMS.WAND.hands, 1);
assert.equal(ITEMS.SAGE_STAFF.hands, 2);
assert.equal(ITEMS.ARCH_WAND.hands, 2);
assert.equal(getEquipmentHands("SHORT_SWORD"), 1);
assert.equal(getEquipmentHands("CLAYMORE"), 2);
assert.equal(getEquipmentHands("SMALL_SHIELD"), 1);
const originalWandHands = ITEMS.WAND.hands;
try {
  ITEMS.WAND.hands = "2";
  assert.equal(getEquipmentHands("WAND"), 2, "weapon hands preserve Number coercion");
  ITEMS.WAND.hands = "2.1";
  assert.equal(getEquipmentHands("WAND"), 1, "non-exact coerced value remains one hand");
  ITEMS.WAND.hands = 0;
  assert.equal(getEquipmentHands("WAND"), 1, "zero weapon hands remains one hand");
  ITEMS.WAND.hands = "2";
  assert.equal(getEquipmentHands("SMALL_SHIELD"), 1, "shield hand cost ignores hands data");
} finally {
  ITEMS.WAND.hands = originalWandHands;
}
assert.equal(getEquipmentHands("UNKNOWN_HANDS_ITEM"), 0);
assert.equal(getEquipmentHands("LEATHER_ARMOR"), 0);
assert.equal(getEquipmentHands(null), 0);
assert.equal(getEquipmentHandSummary("UNKNOWN_HANDS_ITEM"), "");
assert.equal(getEquipmentHandSummary("LEATHER_ARMOR"), "");
assert.equal(getEquipmentHandSummary("SHORT_SWORD"), "片手");
assert.equal(getEquipmentHandSummary("CLAYMORE"), "両手");
assert.equal(getEquipmentHandSummary("SMALL_SHIELD"), "片手");
assert.equal(getCharacterEquipmentHands(character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD" })), 2);
assert.equal(getCharacterEquipmentHands({ equipment: { weapon: "CLAYMORE", shield: "SMALL_SHIELD" } }), 3);
assert.equal(getCharacterEquipmentHands({ equipment: false }), 0);
assert.equal(getCharacterEquipmentHands(null), 0);
assert.throws(() => getCharacterEquipmentHands(null, null), TypeError, "null options retain destructuring failure");
assert.equal(getCharacterEquipmentHands({ equipment: { weapon: "CLAYMORE", shield: "SMALL_SHIELD" } }, {
  replacingSlot: "weapon",
  nextItem: "SHORT_SWORD"
}), 2);
assert.equal(getCharacterEquipmentHands({ equipment: { weapon: "CLAYMORE", shield: "SMALL_SHIELD" } }, {
  replacingSlot: new String("weapon"),
  nextItem: "SHORT_SWORD"
}), 4, "replacingSlot uses strict identity comparison");
const handsInput = { equipment: { weapon: "CLAYMORE", shield: "SMALL_SHIELD" } };
const handsInputBefore = JSON.stringify(handsInput);
getCharacterEquipmentHands(handsInput, { replacingSlot: "weapon", nextItem: "SHORT_SWORD" });
assert.equal(JSON.stringify(handsInput), handsInputBefore, "hand calculation does not mutate input");

const oneHanded = character({ weapon: "SHORT_SWORD" });
assert.equal(canEquipEquipment(oneHanded, "SMALL_SHIELD", "shield").ok, true);
assert.equal(canEquipEquipment(character({ weapon: "WAND" }), "SMALL_SHIELD", "shield").ok, true);
assert.equal(canEquipEquipment(character({ weapon: "CLAYMORE" }), "SMALL_SHIELD", "shield").ok, false);
assert.equal(canEquipEquipment(character({ weapon: "SAGE_STAFF" }), "SMALL_SHIELD", "shield").ok, false);
assert.equal(canEquipEquipment(character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD" }), "CLAYMORE", "weapon").ok, false);
assert.equal(getEquipmentHandConflict(character({ weapon: "SHORT_SWORD" }), "CLAYMORE", "weapon"), null,
  "replacing a 1H weapon with a 2H weapon is valid when the shield slot is empty");
const conflict = getEquipmentHandConflict(character({ weapon: "CLAYMORE", shield: "SMALL_SHIELD" }), "SMALL_SHIELD", "shield");
assert.equal(conflict.hands, 3);
assert.deepEqual(conflict, {
  hands: 3,
  maxHands: 2,
  message: "スモールシールドを装備するには、両手武器を先に外してください。"
});
const weaponConflict = getEquipmentHandConflict(character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD" }), "CLAYMORE", "weapon");
assert.deepEqual(weaponConflict, {
  hands: 3,
  maxHands: 2,
  message: "クレイモアは両手武器のため、盾を先に外してください。"
});
const originalClaymoreName = ITEMS.CLAYMORE.name;
try {
  ITEMS.CLAYMORE.name = "";
  assert.equal(
    getEquipmentHandConflict(character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD" }), "CLAYMORE", "weapon").message,
    "CLAYMOREは両手武器のため、盾を先に外してください。",
    "empty item name falls back to getItemBaseId"
  );
} finally {
  ITEMS.CLAYMORE.name = originalClaymoreName;
}

const blocked = character({ weapon: "CLAYMORE", shield: "SMALL_SHIELD" });
state.party = [blocked];
state.inventory = ["CLAYMORE"];
state.floor = 1;
state.logs = [];
const blockedBefore = JSON.stringify(blocked.equipment);
const inventoryBefore = [...state.inventory];
const equipResult = equipEquipment({ inventoryIndex: 0, actorIdx: 0, requestedSlot: "weapon" });
assert.equal(equipResult.ok, false);
assert.equal(equipResult.code, "hands_exceeded");
assert.match(equipResult.reason, /盾を先に外してください/);
assert.equal(JSON.stringify(blocked.equipment), blockedBefore, "blocked equip cannot discard or replace the shield");
assert.deepEqual(state.inventory, inventoryBefore);

const unshielded = character();
assert.equal(getGuardProfileId(unshielded), "universal_brace");
assert.equal(resolveGuardMitigation(unshielded, 10, { isDefending: true, attackType: "physical" }), 5);
assert.equal(resolveGuardMitigation(unshielded, 10, { isDefending: true, attackType: "spell" }), 5);
assert.equal(resolveGuardStatusChance(unshielded, 1, { isDefending: true }), 0.5);
assert.equal(resolveGuardMitigation(unshielded, 10, { isDefending: false, attackType: "physical" }), 10);
const guardTelemetry = { mitigations: [] };
assert.equal(resolveGuardMitigation(unshielded, 10, {
  isDefending: true,
  attackType: "physical",
  telemetry: guardTelemetry
}), 5);
assert.deepEqual(guardTelemetry.mitigations, [{
  type: "guardAction",
  attackType: "physical",
  before: 10,
  after: 5,
  reduction: 5
}]);

const largeShield = character({ shield: "LARGE_SHIELD" });
assert.equal(getGuardProfileId(largeShield), "physical");
assert.equal(resolveGuardMitigation(largeShield, 20, { isDefending: true, attackType: "physical" }), 7);
assert.equal(resolveGuardMitigation(largeShield, 20, { isDefending: true, attackType: "spell" }), 10);
const magicShield = character({ shield: "MAGIC_SHIELD" });
assert.equal(getGuardProfileId(magicShield), "arcane");
assert.equal(resolveGuardMitigation(magicShield, 20, { isDefending: true, attackType: "spell" }), 7);
assert.equal(resolveGuardMitigation(magicShield, 20, { isDefending: true, attackType: "breath" }), 7);
assert.equal(resolveGuardMitigation(magicShield, 20, { isDefending: true, attackType: "physical" }), 10);
assert.equal(resolveGuardMitigation(magicShield, 100, {
  isDefending: true,
  attackType: "special",
  baseMultiplier: 0.4
}), 40);
assert.equal(getGuardProfile(character({ shield: "SMALL_SHIELD" })).statusChanceMultiplier, 0.5);

const migrated = normalizeSavePayload({
  party: [{
    startingKit: "arcana",
    equipment: { weapon: "SAGE_STAFF", shield: "SMALL_SHIELD" }
  }],
  inventory: [],
  storage: []
});
assert.equal(migrated.party[0].equipment.shield, null, "legacy 2H + shield loadout is repaired");
assert.deepEqual(migrated.storage, ["SMALL_SHIELD"], "displaced shield is preserved in storage");
assert.equal(getEquipmentHands(migrated.party[0].equipment.weapon), 2);

const causalDamageEvents = [];
const telemetryCharacter = character({ shield: "MAGIC_SHIELD" });
telemetryCharacter.hp = 18;
recordReceivedDamage(
  { floor: 5 },
  telemetryCharacter,
  "いにしえの竜",
  10,
  5,
  23,
  { attackType: "breath", isDefending: true, measurement: { causalDamageEvents } }
);
assert.equal(causalDamageEvents.at(-1).attackType, "breath", "Guarded breath keeps its attack type in simulation telemetry");

console.log("[PASS] hands ownership and common guard resolver");
