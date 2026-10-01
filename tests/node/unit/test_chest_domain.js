import assert from "node:assert/strict";
import {
  CHEST_PHASES,
  CHEST_PHASE_TRANSITIONS,
  canTransitionChestPhase,
  createChestLootHint,
  generateChestMaterials,
  getActiveChestCharacter,
  getChestRewardEntries,
  getChestPhase,
  isChestActionAllowed,
  isEligibleChestCharacter,
  rollChestEncounter,
  calculateChestTrapSignAccuracy,
  CHEST_TRAP_SIGNS,
  getChestTrapSignTier,
  resolveChestTrapSign
} from "../../../src/chest/chest_domain.js";
import * as chestDomainOwner from "../../../src/chest/chest_domain.ts";
import { rollChestTrap } from "../../../src/rules/chest_rules.js";

const phaseTransitionCases = [
  {
    phase: CHEST_PHASES.MENU,
    allowed: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING, CHEST_PHASES.TERMINAL]
  },
  {
    phase: CHEST_PHASES.DISARM_SELECT,
    allowed: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING]
  },
  {
    phase: CHEST_PHASES.OPEN_SELECT,
    allowed: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING]
  },
  {
    phase: CHEST_PHASES.RESOLVING,
    allowed: [CHEST_PHASES.REWARD, CHEST_PHASES.MENU, CHEST_PHASES.TERMINAL]
  },
  {
    phase: CHEST_PHASES.REWARD,
    allowed: [CHEST_PHASES.TERMINAL]
  },
  {
    phase: CHEST_PHASES.TERMINAL,
    allowed: []
  }
];
const allChestPhases = phaseTransitionCases.map(({ phase }) => phase);

for (const { phase, allowed } of phaseTransitionCases) {
  assert.deepEqual(CHEST_PHASE_TRANSITIONS[phase], allowed, `${phase} transition table`);
  for (const nextPhase of allChestPhases) {
    assert.equal(
      canTransitionChestPhase({ phase }, nextPhase),
      allowed.includes(nextPhase),
      `${phase} -> ${nextPhase}`
    );
  }
}

for (const { name, transitioning, allowTransition, expected } of [
  { name: "stable action remains allowed", transitioning: false, allowTransition: false, expected: true },
  { name: "transitioning action remains blocked", transitioning: true, allowTransition: false, expected: false },
  { name: "explicit transition override allows action", transitioning: true, allowTransition: true, expected: true }
]) {
  assert.equal(
    isChestActionAllowed(
      { phase: CHEST_PHASES.MENU },
      [CHEST_PHASES.MENU],
      transitioning,
      { allowTransition }
    ),
    expected,
    name
  );
}
assert.equal(
  isChestActionAllowed(null, [CHEST_PHASES.MENU], true, { allowTransition: true }),
  false,
  "missing chest remains blocked even with transition override"
);

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

// Trap sign: a tier, never a trap kind. Dangerous traps read as "danger".
assert.equal(getChestTrapSignTier("none"), CHEST_TRAP_SIGNS.NONE);
assert.equal(getChestTrapSignTier(undefined), CHEST_TRAP_SIGNS.NONE);
assert.equal(getChestTrapSignTier("flash bomb"), CHEST_TRAP_SIGNS.TRAP);
for (const trap of ["poison needle", "gas bomb", "teleporter"]) {
  assert.equal(getChestTrapSignTier(trap), CHEST_TRAP_SIGNS.DANGER, trap);
}

const plainReader = { status: "ok", equipment: {} };
const senseReader = {
  status: "ok",
  equipment: {
    accessory: {
      kind: "equipment",
      baseId: "AMULET_HP",
      identified: true,
      affixes: [{ id: "treasureSense", type: "treasureSense", value: 10 }]
    }
  }
};
const plainAccuracy = calculateChestTrapSignAccuracy({ character: plainReader }).accuracy;
assert.equal(plainAccuracy, 0.70, "the base sign misreads about 30% of the time");
assert.ok(
  calculateChestTrapSignAccuracy({ character: senseReader }).accuracy > plainAccuracy,
  "treasureSense sharpens the trap sign"
);
const lightAccuracy = calculateChestTrapSignAccuracy({ character: plainReader, lightTurns: 3 });
assert.equal(lightAccuracy.lightBonus, 0.15);
assert.ok(lightAccuracy.accuracy > plainAccuracy, "a light spell sharpens the trap sign");
assert.ok(
  calculateChestTrapSignAccuracy({ character: plainReader, lightPower: "lomilwa" }).accuracy >
    lightAccuracy.accuracy,
  "lomilwa sharpens the sign more than an ordinary light"
);
assert.ok(
  calculateChestTrapSignAccuracy({ character: { ...plainReader, status: "blind" } }).accuracy < plainAccuracy,
  "a blind reader misreads more often"
);
assert.equal(
  calculateChestTrapSignAccuracy({ character: senseReader, lightPower: "lomilwa" }).accuracy,
  0.95,
  "accuracy is capped below certainty"
);

const accurateSign = resolveChestTrapSign({
  trap: "gas bomb",
  character: plainReader,
  rng: () => 0.69
});
assert.deepEqual(
  { sign: accurateSign.sign, accurate: accurateSign.accurate },
  { sign: CHEST_TRAP_SIGNS.DANGER, accurate: true }
);
for (const [trap, roll, expected] of [
  ["gas bomb", 0.70, CHEST_TRAP_SIGNS.NONE],
  ["gas bomb", 0.99, CHEST_TRAP_SIGNS.TRAP],
  ["none", 0.70, CHEST_TRAP_SIGNS.TRAP],
  ["none", 0.99, CHEST_TRAP_SIGNS.DANGER]
]) {
  let draws = 0;
  const misread = resolveChestTrapSign({ trap, character: plainReader, rng: () => { draws++; return roll; } });
  assert.equal(misread.accurate, false);
  assert.equal(misread.sign, expected, `${trap} misread with ${roll}`);
  assert.equal(draws, 1, "the sign consumes exactly one draw");
}

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
