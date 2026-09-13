import assert from "node:assert/strict";
import {
  CHEST_PHASES,
  canTransitionChestPhase,
  createChestLootHint,
  generateChestMaterials,
  resolveChestInspection
} from "../../../src/chest/chest_domain.js";
import { rollChestTrap } from "../../../src/rules/chest_rules.js";

assert.equal(
  canTransitionChestPhase({ phase: CHEST_PHASES.MENU }, CHEST_PHASES.RESOLVING),
  true
);
assert.equal(
  canTransitionChestPhase({ phase: CHEST_PHASES.TERMINAL }, CHEST_PHASES.MENU),
  false
);

const inspection = resolveChestInspection({
  chest: { trap: "gas bomb" },
  party: [{ status: "ok" }],
  lightPower: "lomilwa",
  rng: (() => {
    const rolls = [0.54, 0];
    return () => rolls.shift() ?? 0;
  })()
});
assert.equal(inspection.chance, 0.55);
assert.equal(inspection.lightBonus, 0.25);
assert.equal(inspection.identifiedTrap, "gas bomb");

const lootHint = createChestLootHint({
  item: { kind: "equipment", rarity: "rare", affixes: [{ type: "arcane" }] },
  party: [],
  rng: () => 0
});
assert.deepEqual(lootHint, {
  hasEquipmentSignal: true,
  aura: "medium",
  label: "装備品の反応あり / 気配:秘術"
});

assert.deepEqual(
  generateChestMaterials(1, () => 0),
  { "獣の牙": 1 }
);

let b1TrapRolls = 0;
assert.equal(rollChestTrap(1, () => {
  b1TrapRolls += 1;
  return 0.99;
}), "none");
assert.equal(b1TrapRolls, 1, "B1F disabled chest trap preserves one legacy RNG draw");
assert.equal(rollChestTrap(2, () => 0), "poison needle");
assert.equal(rollChestTrap(6, () => 0), "poison needle");

console.log("[PASS] chest domain rules remain side-effect free and deterministic");
