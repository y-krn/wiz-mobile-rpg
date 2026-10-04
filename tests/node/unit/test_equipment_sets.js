import assert from "node:assert/strict";

// Equipment families (#2024): three equipped, identified pieces of one family
// add that family's set effect through the existing stat entry points.

const {
  EQUIPMENT_SETS,
  EQUIPMENT_SET_SIZE,
  compareEquipmentSets,
  getEquipmentSetAffixBonus,
  getEquipmentSetStatBonus,
  getEquipmentSetCounts,
  getItemSetFamilies,
  listEquipmentSets
} = await import("../../../src/rules/equipment_sets.js");
const { AFFIX_BALANCE } = await import("../../../src/data/affixes.js");
const { ITEMS } = await import("../../../src/data/items.js");
const { getCharAffixSum } = await import("../../../src/rules/item_rules.js");
const { getCharDef, getCharEquipmentDef } = await import("../../../src/rules/character_stats.js");
const { applyArmorMend } = await import("../../../src/rules/special_rooms.js");
const { getEquipmentPreview, getUnequipPreview } = await import("../../../src/rules/equipment_preview.js");
const { createDepartureCharacter, getAvailableStartingKits } =
  await import("../../../src/systems/departure_preparation.js");
const { FACILITIES } = await import("../../../src/data/facilities.js");

let serial = 0;
const piece = (baseId, tags, { identified = true, affixes = [] } = {}) => ({
  kind: "equipment",
  instanceId: `eq_set_${serial += 1}`,
  baseId,
  rarity: "magic",
  level: 1,
  identified,
  enhanceLevel: 0,
  affixes,
  tags
});
const hero = equipment => ({
  name: "冒険者",
  level: 1,
  hp: 45,
  maxHp: 45,
  mp: 1,
  maxMp: 1,
  status: "ok",
  mediumState: { mediumKey: null, socketedRunes: [] },
  equipment: { weapon: null, shield: null, armor: null, accessory: null, accessory2: null, ...equipment }
});

// --- The catalog -------------------------------------------------------------------

assert.equal(EQUIPMENT_SET_SIZE, 3);
assert.deepEqual(EQUIPMENT_SETS.map(set => [set.id, set.label, set.effect, set.bonus]), [
  ["iron", "鉄", "防御力+2", { def: 2 }],
  ["ward", "守勢", "魔除け+10%", { spellGuard: 10 }],
  ["spirit", "霊", "術力+10%", { spellPower: 10 }],
  ["ambush", "奇襲", "先制+5", { firstStrike: 5 }]
]);
// Each effect is one Support's worth: no larger than the same axis at rare quality.
const supportValues = AFFIX_BALANCE.supportValuesByRarity;
assert.ok(EQUIPMENT_SETS[0].bonus.def <= supportValues.def.rare);
assert.equal(EQUIPMENT_SETS[1].bonus.spellGuard, supportValues.spellGuard.magic);
assert.equal(EQUIPMENT_SETS[2].bonus.spellPower, AFFIX_BALANCE.spellPowerByRarity.magic);
assert.equal(EQUIPMENT_SETS[3].bonus.firstStrike, supportValues.firstStrike.magic);
console.log("[PASS] four families have a set effect, each one Support in size");

// --- Counting -----------------------------------------------------------------------

assert.deepEqual(getItemSetFamilies("PLATE_MAIL"), ITEMS.PLATE_MAIL.tags);
assert.deepEqual(getItemSetFamilies(piece("VNEXT_RING", ["ward", "ward", "spirit"])), ["ward", "spirit"],
  "one piece counts once for a family");
assert.deepEqual(getItemSetFamilies(piece("VNEXT_RING", ["ward"], { identified: false })), [],
  "an unidentified piece counts for nothing");
assert.deepEqual(getItemSetFamilies({ baseId: "ROBE", identified: true }), ITEMS.ROBE.tags,
  "an instance without its own families falls back to its base");
assert.deepEqual(getItemSetFamilies(null), []);

const vanguard = createDepartureCharacter("vanguard").character;
assert.deepEqual(getEquipmentSetCounts(vanguard), { iron: 1, ward: 2, spirit: 0, ambush: 1 });
assert.equal(listEquipmentSets(vanguard).some(set => set.active), false);
assert.deepEqual(getEquipmentSetCounts(hero({})), { iron: 0, ward: 0, spirit: 0, ambush: 0 });
assert.deepEqual(getEquipmentSetCounts(null), { iron: 0, ward: 0, spirit: 0, ambush: 0 });

// No kit starts with a set complete; the four base kits start one piece short of one.
const everyKit = getAvailableStartingKits({ nodes: FACILITIES.flatMap(facility => facility.nodes.map(node => node.id)) });
assert.equal(everyKit.length, 10);
everyKit.forEach(kit => {
  const sets = listEquipmentSets(createDepartureCharacter(kit.id).character);
  assert.equal(sets.some(set => set.active), false, `${kit.id} starts with no set complete`);
});
const nearSets = kitId => listEquipmentSets(createDepartureCharacter(kitId).character)
  .filter(set => set.count === 2).map(set => set.id);
assert.deepEqual(
  ["vanguard", "scout", "devotion", "arcana"].map(nearSets),
  [["ward"], ["ward", "ambush"], ["ward"], ["spirit"]]
);
console.log("[PASS] families are counted once per identified piece and no kit starts with a set");

// --- Three pieces switch the effect on, two switch it off -------------------------------

const wardTwo = hero({ shield: "BUCKLER", armor: "LEATHER_ARMOR" });
assert.equal(getEquipmentSetAffixBonus(wardTwo, "spellGuard"), 0);
assert.equal(getCharAffixSum(wardTwo, "spellGuard"), 0);
const wardThree = hero({ shield: "BUCKLER", armor: "LEATHER_ARMOR", accessory: piece("VNEXT_AMULET", ["ward"]) });
assert.equal(getEquipmentSetAffixBonus(wardThree, "spellGuard"), 10);
assert.equal(getCharAffixSum(wardThree, "spellGuard"), 10);
const wardFour = hero({
  shield: "BUCKLER",
  armor: "LEATHER_ARMOR",
  accessory: piece("VNEXT_AMULET", ["ward"]),
  accessory2: piece("VNEXT_RING", ["ward"])
});
assert.equal(getCharAffixSum(wardFour, "spellGuard"), 10, "a fourth piece adds nothing more");
const wardHidden = hero({ shield: "BUCKLER", armor: "LEATHER_ARMOR", accessory: piece("VNEXT_AMULET", ["ward"], { identified: false }) });
assert.equal(getCharAffixSum(wardHidden, "spellGuard"), 0, "an unidentified third piece does not complete the set");

// The set adds to what the equipment already gives, under the existing cap.
const guarded = hero({
  shield: "BUCKLER",
  armor: "LEATHER_ARMOR",
  accessory: piece("VNEXT_AMULET", ["ward"], { affixes: [{ type: "spellGuard", value: 20 }] }),
  accessory2: piece("VNEXT_RING", ["ward"], { affixes: [{ type: "spellGuard", value: 30 }] })
});
assert.equal(getCharAffixSum(guarded, "spellGuard"), 50, "20 + 30 + 10 stays under the 50 cap");

const iron = hero({ weapon: "MACE", shield: "LARGE_SHIELD", armor: "PLATE_MAIL" });
assert.equal(getCharEquipmentDef(iron), ITEMS.LARGE_SHIELD.def + ITEMS.PLATE_MAIL.def);
assert.equal(getCharDef(iron), getCharEquipmentDef(iron) + 2);
assert.equal(getCharAffixSum(iron, "def"), 0, "DEF is added once, on the DEF entry point");
assert.deepEqual([getEquipmentSetStatBonus(iron, "def"), getEquipmentSetAffixBonus(iron, "def")], [2, 0]);
assert.deepEqual([getEquipmentSetStatBonus(wardThree, "spellGuard"), getEquipmentSetAffixBonus(wardThree, "spellGuard")], [0, 10]);
const ironTwo = hero({ weapon: "MACE", armor: "PLATE_MAIL" });
assert.equal(getCharDef(ironTwo), getCharEquipmentDef(ironTwo));
// A mend is sized from the equipment DEF alone, so the set does not feed it.
const mend = applyArmorMend(iron, getCharEquipmentDef(iron));
assert.equal(getCharDef(iron), getCharEquipmentDef(iron) + 2 + mend.bonus);

const spirit = hero({ weapon: "WAND", armor: "ROBE", accessory: piece("VNEXT_AMULET", ["spirit"]) });
assert.equal(getEquipmentSetAffixBonus(spirit, "spellPower"), 10);
assert.equal(getCharAffixSum(spirit, "spellPower"), 10);
assert.equal(getCharAffixSum(hero({ weapon: "WAND", armor: "ROBE" }), "spellPower"), 0);

const ambush = hero({ weapon: "DAGGER", shield: "BUCKLER", accessory: piece("VNEXT_RING", ["ambush"]) });
assert.equal(getCharAffixSum(ambush, "firstStrike"), 5);
const swift = hero({
  weapon: "DAGGER",
  shield: "BUCKLER",
  accessory: piece("VNEXT_RING", ["ambush"], { affixes: [{ type: "firstStrike", value: 8 }] }),
  accessory2: piece("VNEXT_RING", ["ambush"], { affixes: [{ type: "firstStrike", value: 5 }] })
});
assert.equal(getCharAffixSum(swift, "firstStrike"), 15, "8 + 5 + 5 is held at the 15 cap");

// Axes no set touches are left alone, and two sets can hold at once.
assert.equal(getEquipmentSetAffixBonus(wardThree, "physicalAccuracy"), 0);
const both = hero({ weapon: "DAGGER", shield: "BUCKLER", armor: "ROBE", accessory: piece("VNEXT_RING", ["ambush", "ward"]) });
assert.deepEqual(listEquipmentSets(both).filter(set => set.active).map(set => set.id), ["ward", "ambush"]);
console.log("[PASS] three pieces switch a set effect on through the existing stat entry points and caps");

// --- What a change does to the sets ------------------------------------------------------

const amulet = piece("VNEXT_AMULET", ["ward"]);
assert.deepEqual(compareEquipmentSets(wardTwo, wardThree), [
  { id: "ward", label: "守勢", effect: "魔除け+10%", before: 2, after: 3, gained: true, lost: false }
]);
assert.deepEqual(compareEquipmentSets(wardThree, wardTwo).map(change => [change.id, change.gained, change.lost]),
  [["ward", false, true]]);
assert.deepEqual(compareEquipmentSets(wardThree, wardThree), []);

const equipPreview = getEquipmentPreview(wardTwo, amulet, "accessory");
assert.deepEqual(equipPreview.sets.map(change => [change.id, change.before, change.after, change.gained]), [["ward", 2, 3, true]]);
assert.deepEqual(wardTwo.equipment.accessory, null, "a preview does not touch the loadout");
const unequipPreview = getUnequipPreview(wardThree, "shield");
assert.deepEqual(unequipPreview.sets.map(change => [change.id, change.before, change.after, change.lost]),
  [["ward", 3, 2, true], ["ambush", 1, 0, false]]);
// Swapping the buckler for a great shield keeps ward and moves ambush and iron.
const swap = getEquipmentPreview(wardThree, "LARGE_SHIELD", "shield");
assert.deepEqual(swap.sets.map(change => [change.id, change.before, change.after]), [["iron", 0, 1], ["ambush", 1, 0]]);
console.log("[PASS] an equipment preview reports which family counts move and which sets start or stop");
