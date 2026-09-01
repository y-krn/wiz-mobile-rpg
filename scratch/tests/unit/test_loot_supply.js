import assert from "node:assert/strict";
import {
  CORE_AFFIXES,
  LOOT_BUILD_ROLES,
  LOOT_ROLE_SUPPLY_BY_BAND,
  SUPPORT_AFFIXES,
  getLootRoleSupply
} from "../../../src/data/affixes.js";
import { EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } from "../../../src/data/equipment_tables.js";
import {
  generateRandomEquipment,
  rollLootBuildRole
} from "../../../src/systems/equipment_generation.js";
import { CHEST_ITEM_CANDIDATES_BY_FLOOR } from "../../../src/rules/chest_rules.js";
import { ITEMS } from "../../../src/data/items.js";

const roleIds = new Set(Object.values(LOOT_BUILD_ROLES));

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.deepEqual(
  LOOT_ROLE_SUPPLY_BY_BAND.map(band => band.weights),
  [
    { reinforce: 75, convert: 20, pivot: 5 },
    { reinforce: 60, convert: 30, pivot: 10 },
    { reinforce: 55, convert: 30, pivot: 15 },
    { reinforce: 50, convert: 35, pivot: 15 },
    { reinforce: 45, convert: 35, pivot: 20 }
  ],
  "depth bands expose the canonical role supply targets"
);

for (let floor = 1; floor <= 30; floor += 1) {
  assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[floor], `B${floor} equipment candidates exist`);
  assert.ok(CHEST_ITEM_CANDIDATES_BY_FLOOR[floor], `B${floor} chest candidates exist`);
  EQUIPMENT_CANDIDATES_BY_FLOOR[floor].forEach(baseId => {
    assert.ok(ITEMS[baseId], `B${floor} references known base ${baseId}`);
    assert.ok(["weapon", "armor", "shield"].includes(ITEMS[baseId].type));
  });
}
assert.notDeepEqual(EQUIPMENT_CANDIDATES_BY_FLOOR[6], EQUIPMENT_CANDIDATES_BY_FLOOR[5]);
assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[6].includes("HOLY_BLADE"));
assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[11].includes("LEGENDARY_SWORD"));
assert.ok(CHEST_ITEM_CANDIDATES_BY_FLOOR[20].every(baseId => !RESTRICTED_CHEST_BASES.includes(baseId)));

assert.equal(getLootRoleSupply(1).id, "B1_5");
assert.equal(getLootRoleSupply(10).id, "B6_10");
assert.equal(getLootRoleSupply(30).id, "B21_PLUS");
assert.equal(rollLootBuildRole(1, () => 0), "reinforce");
assert.equal(rollLootBuildRole(1, () => 0.751), "convert");
assert.equal(rollLootBuildRole(1, () => 0.951), "pivot");

CORE_AFFIXES.forEach(affix => assert.ok(roleIds.has(affix.buildRole), `${affix.id} has a loot role`));
SUPPORT_AFFIXES.forEach(affix => assert.ok(roleIds.has(affix.buildRole), `${affix.id} has a loot role`));

for (const floor of [1, 6, 11, 16, 21, 30]) {
  const item = generateRandomEquipment(floor, { forceRarity: "epic", rng: lcg(floor) });
  assert.ok(roleIds.has(item.buildRole), `B${floor} generated item has a role`);
  assert.ok(item.buildRoles.every(role => roleIds.has(role)));
}

const supportOnlyItem = generateRandomEquipment(1, {
  forceRarity: "magic",
  allowCores: false,
  rng: () => 0
});
assert.ok(supportOnlyItem.affixes.length > 0);
assert.ok(supportOnlyItem.affixes.every(affix => affix.kind === "support" && roleIds.has(affix.buildRole)));
assert.ok(supportOnlyItem.buildRoles.includes(supportOnlyItem.affixes[0].buildRole));

const emptyLoadout = [{
  class: "Fighter",
  status: "ok",
  equipment: { weapon: null, shield: null, armor: null }
}];
const occupiedLoadout = [{
  class: "Fighter",
  status: "ok",
  equipment: { weapon: { baseId: "SHORT_SWORD" }, shield: null, armor: null }
}];
const sameSeedEmpty = generateRandomEquipment(12, { rng: lcg(991), party: emptyLoadout });
const sameSeedOccupied = generateRandomEquipment(12, { rng: lcg(991), party: occupiedLoadout });
assert.deepEqual(
  sameSeedEmpty,
  sameSeedOccupied,
  "loot generation must not adapt to the currently equipped loadout"
);

console.log("[PASS] B1-B30 loot supply, role bands, deterministic generation, and non-adaptive selection verified.");
