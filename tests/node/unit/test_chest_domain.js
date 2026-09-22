import assert from "node:assert/strict";
import {
  CHEST_PHASES,
  canTransitionChestPhase,
  createChestLootHint,
  generateChestMaterials,
  getActiveChestCharacter,
  getChestRewardEntries,
  getChestPhase,
  isChestActionAllowed,
  isEligibleChestCharacter,
  rollChestEncounter,
  resolveChestInspection
} from "../../../src/chest/chest_domain.js";
import * as chestDomainOwner from "../../../src/chest/chest_domain.ts";
import { rollChestTrap } from "../../../src/rules/chest_rules.js";

assert.equal(getChestPhase({}), CHEST_PHASES.MENU);
assert.equal(getChestPhase({ phase: "unsupported" }), "unsupported");
assert.equal(isChestActionAllowed({ phase: CHEST_PHASES.MENU }, [CHEST_PHASES.MENU]), true);
assert.equal(isChestActionAllowed({ phase: CHEST_PHASES.MENU }, [CHEST_PHASES.MENU], true), false);

const eligible = { status: "poisoned" };
const dead = { status: "dead" };
const party = [dead, eligible];
assert.equal(isEligibleChestCharacter(eligible, party), true);
assert.equal(isEligibleChestCharacter({ status: "ok" }, party), false);
assert.equal(getActiveChestCharacter(party), eligible);

assert.deepEqual(
  getChestRewardEntries({ item: "main", specialItem: "special", accessoryItem: "accessory" }),
  [
    { role: "main", item: "main" },
    { role: "special", item: "special" },
    { role: "accessory", item: "accessory" }
  ]
);

assert.equal(
  chestDomainOwner.rollChestEncounter,
  rollChestEncounter,
  "JS import remains a thin facade over the TS owner"
);

const ordinaryRolls = [0.5, 0.99, 0.99, 0.99];
const ordinaryEncounter = rollChestEncounter({
  floor: 6,
  x: 3,
  y: 4,
  seed: "domain-test",
  party: [],
  customRng: () => ordinaryRolls.shift() ?? 1
});
assert.deepEqual(ordinaryEncounter, {
  trap: "teleporter",
  item: null,
  specialItem: null,
  accessoryItem: null,
  consumedFirstChestGuarantee: false,
  lootHint: { hasEquipmentSignal: false, aura: "weak", label: "消耗品または反応なし" }
});
assert.equal(ordinaryRolls.length, 0, "ordinary encounter preserves RNG call order/count");

const dropRolls = [0.5, 0.99, 0.99];
const dropEncounter = rollChestEncounter({
  floor: 6,
  x: 3,
  y: 4,
  party: [],
  fromDrop: true,
  customRng: () => dropRolls.shift() ?? 1
});
assert.equal(dropEncounter.specialItem, null);
assert.equal(dropRolls.length, 0, "fromDrop encounter preserves omitted special roll");

const forcedRolls = [];
const forcedEncounter = rollChestEncounter({
  floor: 6,
  x: 3,
  y: 4,
  forcedTrap: "none",
  forcedItem: "HEAL_POTION",
  customRng: () => {
    forcedRolls.push(true);
    return 0;
  }
});
assert.equal(forcedEncounter.item, "HEAL_POTION");
assert.equal(forcedRolls.length, 0, "forced trap/item do not add RNG draws");

const firstChest = rollChestEncounter({ floor: 1, x: 0, y: 0, party: [], customRng: () => 0 });
assert.equal(firstChest.consumedFirstChestGuarantee, true);

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
