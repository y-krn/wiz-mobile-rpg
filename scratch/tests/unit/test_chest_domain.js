import assert from "node:assert/strict";
import {
  CHEST_PHASES,
  canTransitionChestPhase,
  createChestLootHint,
  generateChestMaterials,
  resolveChestInspection
} from "../../../src/chest/chest_domain.js";

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
  party: [{ class: "Fighter", status: "ok" }],
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

console.log("[PASS] chest domain rules remain side-effect free and deterministic");
