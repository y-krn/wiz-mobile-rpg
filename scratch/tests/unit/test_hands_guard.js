import assert from "node:assert/strict";
import { ITEMS } from "../../../src/data/items.js";
import {
  getCharacterEquipmentHands,
  getEquipmentHandConflict,
  getEquipmentHands
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

function character(equipment = {}) {
  return {
    name: "hands/guard test",
    class: "Fighter",
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
assert.equal(getCharacterEquipmentHands(character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD" })), 2);

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
assert.match(conflict.message, /両手武器/);

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
assert.equal(getGuardProfile(character({ shield: "SMALL_SHIELD" })).statusChanceMultiplier, 0.65);

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
  { floor: 5, simTelemetry: { causalDamageEvents } },
  telemetryCharacter,
  "いにしえの竜",
  10,
  5,
  23,
  { attackType: "breath", isDefending: true }
);
assert.equal(causalDamageEvents.at(-1).attackType, "breath", "Guarded breath keeps its attack type in simulation telemetry");

console.log("[PASS] hands ownership and common guard resolver");
