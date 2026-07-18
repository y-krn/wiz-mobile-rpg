import assert from "node:assert/strict";
import { bankRunMaterials } from "../src/rules/material_rules.js";
import { purchaseWorkshopNode } from "../src/systems/workshop.js";

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

test("retreat banks all run materials without changing the run balance", () => {
  const run = { "獣の牙": 9, "竜鱗": 2 };
  const result = bankRunMaterials({ "獣の牙": 1 }, run, "retreat");
  assert.equal(result.banked["獣の牙"], 9);
  assert.equal(result.banked["竜鱗"], 2);
  assert.equal(result.balance["獣の牙"], 10);
  assert.deepEqual(run, { "獣の牙": 9, "竜鱗": 2 });
});

test("death banks floor of 30 percent and no other bonus", () => {
  const result = bankRunMaterials({}, { "獣の牙": 9, "竜鱗": 10 }, "death");
  assert.equal(result.banked["獣の牙"], 2);
  assert.equal(result.banked["竜鱗"], 3);
  assert.equal(result.balance["獣の牙"], 2);
});

test("workshop purchase spends declared materials and records unlock", () => {
  const result = purchaseWorkshopNode({ "獣の牙": 4, "鉄片": 2 }, { ranks: {} }, "gear_rapier");
  assert.equal(result.ok, true);
  assert.equal(result.metaMaterials["獣の牙"], 0);
  assert.equal(result.metaMaterials["鉄片"], 0);
  assert.equal(result.workshop.ranks.gear_rapier, 1);
});

test("permanent stat line stops at rank 5", () => {
  let materials = { "獣の牙": 100 };
  let workshop = { ranks: {} };
  for (let rank = 0; rank < 5; rank++) {
    const result = purchaseWorkshopNode(materials, workshop, "stat_str");
    assert.equal(result.ok, true);
    materials = result.metaMaterials;
    workshop = result.workshop;
  }
  const capped = purchaseWorkshopNode(materials, workshop, "stat_str");
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, "max_rank");
  assert.equal(workshop.ranks.stat_str, 5);
});

if (failures > 0) process.exit(1);
