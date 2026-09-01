import assert from "node:assert/strict";
import { ITEMS } from "../../../src/data/items.js";
import {
  CHEST_ITEM_CANDIDATES_BY_FLOOR,
  rollChestReward
} from "../../../src/rules/chest_rules.js";
import { RESTRICTED_CHEST_BASES } from "../../../src/data/equipment_tables.js";

const failures = [];
const B1_GEAR = new Set([
  "DAGGER",
  "WAND",
  "MACE",
  "RAPIER",
  "BUCKLER",
  "SMALL_SHIELD",
  "ROBE",
  "LEATHER_ARMOR",
  "EXPLORER_CLOAK"
]);

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function captureCandidates(floor) {
  let captured = null;
  rollChestReward({
    floor,
    rng: () => 0,
    trap: "none",
    itemCandidateFilter: (_item, _index, candidates) => {
      captured = candidates;
      return false;
    }
  });
  return captured;
}

function rollAtReplacementThreshold(floor) {
  const values = [0, 0, 0.899];
  const consumed = [];
  const reward = rollChestReward({
    floor,
    rng: () => {
      const value = values.shift() ?? 0;
      consumed.push(value);
      return value;
    },
    trap: "none"
  });
  return { reward, consumed };
}

await test("floor 6/20 use the authored deep chest pool without quest or B1 gear", () => {
  const b5Candidates = CHEST_ITEM_CANDIDATES_BY_FLOOR[5];

  for (const floor of [6, 20]) {
    const candidates = captureCandidates(floor);
    assert.notDeepEqual(candidates, b5Candidates);
    assert.ok(candidates.includes("HOLY_BLADE"));
    if (floor >= 11) assert.ok(!candidates.includes("LEGENDARY_SWORD"));
    assert.ok(candidates.every(item => ITEMS[item]?.type !== "quest"));
    assert.ok(candidates.every(item => !B1_GEAR.has(item)));
    assert.ok(candidates.every(item => !RESTRICTED_CHEST_BASES.includes(item)));
  }
});

await test("floor 6/20 enter generateRandomEquipment at rng 0.899", () => {
  for (const floor of [6, 20]) {
    const { reward, consumed } = rollAtReplacementThreshold(floor);
    assert.ok(reward.item && typeof reward.item === "object");
    assert.deepEqual(consumed.slice(0, 3), [0, 0, 0.899]);
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} deep chest fallback test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] deep chest fallback regression coverage");
