import assert from "node:assert/strict";
import { ITEMS } from "../../../src/data/items.js";
import {
  EQUIPMENT_LOAD_CLASSES,
  EQUIPMENT_LOAD_DESCRIPTIONS,
  EQUIPMENT_LOAD_INITIATIVE_MODIFIERS,
  getCharacterEquipmentLoad,
  getEquipmentLoadClass,
  getEquipmentLoadPlayerCopy
} from "../../../src/rules/equipment_load.js";
import { createStartingKitCharacter, getStartingKit } from "../../../src/state/initial_state.js";
import { getEquipmentPreview } from "../../../src/rules/equipment_preview.js";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

const equipment = Object.values(ITEMS).filter(item => ["weapon", "shield", "armor"].includes(item.type));
assert.ok(equipment.length > 0);
assert.ok(equipment.every(item => EQUIPMENT_LOAD_CLASSES.includes(item.loadClass)));
assert.deepEqual(EQUIPMENT_LOAD_INITIATIVE_MODIFIERS, { light: 2, standard: 0, heavy: -2 });
assert.deepEqual(EQUIPMENT_LOAD_DESCRIPTIONS, {
  light: "先に動きやすい",
  standard: "行動順の基準",
  heavy: "後手になりやすい"
});

function character(equipment = {}) {
  return { equipment: { weapon: null, shield: null, armor: null, accessory: null, accessory2: null, ...equipment } };
}

assert.equal(getEquipmentLoadClass("DAGGER"), "light");
assert.equal(getEquipmentLoadClass("SHORT_SWORD"), "standard");
assert.equal(getEquipmentLoadClass("PLATE_MAIL"), "heavy");
assert.equal(getEquipmentLoadClass({ baseId: "DAGGER", identified: false }), "light");
assert.equal(getEquipmentLoadClass({ baseId: "PLATE_MAIL", identified: false }), "heavy");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "DAGGER", shield: "BUCKLER", armor: "EXPLORER_CLOAK" })).class, "light");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "DAGGER", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" })).class, "standard");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" })).class, "standard");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "CLAYMORE", armor: "LEATHER_ARMOR" })).class, "heavy");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "SHORT_SWORD", shield: "LARGE_SHIELD", armor: "PLATE_MAIL" })).class, "heavy");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "DAGGER", shield: "BUCKLER", armor: "PLATE_MAIL" })).class, "heavy");
assert.equal(getCharacterEquipmentLoad(character({ armor: { baseId: "PLATE_MAIL", identified: false } })).class, "heavy");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "CLAYMORE", armor: "EXPLORER_CLOAK" })).class, "heavy");
assert.equal(getCharacterEquipmentLoad(character({ weapon: "SHORT_SWORD", armor: "LEATHER_ARMOR" })).initiativeModifier, 0);

const startingKitLoads = [
  ["vanguard", "standard"],
  ["scout", "light"],
  ["devotion", "standard"],
  ["arcana", "standard"]
];
assert.deepEqual(getStartingKit("scout").gear, ["DAGGER", "BUCKLER", "EXPLORER_CLOAK"]);
assert.notDeepEqual(getStartingKit("vanguard").gear, getStartingKit("scout").gear);
for (const [kitId, expectedClass] of startingKitLoads) {
  const load = getEquipmentLoadPlayerCopy(createStartingKitCharacter(kitId));
  assert.equal(load.class, expectedClass, `${kitId} starting kit load`);
  assert.equal(load.label, expectedClass === "light" ? "速い" : "標準");
  assert.equal(load.description, EQUIPMENT_LOAD_DESCRIPTIONS[expectedClass]);
}

const lightPreview = getEquipmentPreview(
  character({ weapon: "SHORT_SWORD", shield: null, armor: null }),
  "DAGGER"
);
const lightPreviewRow = lightPreview.rows.find(row => row.key === "initiativeLoad");
assert.deepEqual(
  { current: lightPreviewRow.current, next: lightPreviewRow.next, diff: lightPreviewRow.diff },
  { current: "標準", next: "速い", diff: 1 }
);

const heavyPreview = getEquipmentPreview(
  character({ weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" }),
  "PLATE_MAIL"
);
const heavyPreviewRow = heavyPreview.rows.find(row => row.key === "initiativeLoad");
assert.deepEqual(
  { current: heavyPreviewRow.current, next: heavyPreviewRow.next, diff: heavyPreviewRow.diff },
  { current: "標準", next: "遅い", diff: -1 }
);

const bagOnlyHeavy = character({ weapon: "SHORT_SWORD", armor: "LEATHER_ARMOR" });
bagOnlyHeavy.inventory = ["PLATE_MAIL"];
assert.equal(getCharacterEquipmentLoad(bagOnlyHeavy).class, "standard");

const accessoryOnly = character({ accessory: "SWIFT_BAND" });
assert.equal(getCharacterEquipmentLoad(accessoryOnly).class, "standard");

function combatState() {
  return {
    party: [
      {
        name: "tie tester",
        level: 1,
        hp: 100,
        maxHp: 100,
        mp: 0,
        maxMp: 0,
        status: "ok",
        buffs: [],
        spells: [],
        equipment: { weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" }
      }
    ],
    combatState: {
      monsters: [{ name: "tie target", hp: 100, maxHp: 100, atk: 1, def: 0, status: "ok" }],
      roundNumber: 1,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 1
  };
}

function measurementCombatState() {
  return {
    ...combatState(),
    simPolicy: {
      measurementInitiative: {
        rollSize: 20,
        playerLoadModifier: 0,
        playerFirstStrikeModifier: 0,
        enemySpeedModifier: 0
      }
    }
  };
}

const originalRandom = Math.random;
try {
  // Both actors land in initiative bucket 0; the fractional part decides the tie.
  let values = [0.01, 0.04];
  Math.random = () => values.shift() ?? 0;
  const enemyFirst = runCombatRoundCalculation(combatState(), {
    actions: [{ type: "defend", actorIdx: 0 }]
  });
  assert.equal(enemyFirst.actionObservations[0].actor, "monster");

  values = [0.04, 0.01];
  const playerFirst = runCombatRoundCalculation(combatState(), {
    actions: [{ type: "defend", actorIdx: 0 }]
  });
  assert.equal(playerFirst.actionObservations[0].actor, "char");

  // The measurement-only initiative hook must preserve production's random
  // fractional tie-break instead of falling back to party insertion order.
  values = [0.01, 0.04];
  const measurementEnemyFirst = runCombatRoundCalculation(measurementCombatState(), {
    actions: [{ type: "defend", actorIdx: 0 }]
  });
  assert.equal(measurementEnemyFirst.actionObservations[0].actor, "monster");

  values = [0.04, 0.01];
  const measurementPlayerFirst = runCombatRoundCalculation(measurementCombatState(), {
    actions: [{ type: "defend", actorIdx: 0 }]
  });
  assert.equal(measurementPlayerFirst.actionObservations[0].actor, "char");
} finally {
  Math.random = originalRandom;
}

console.log("[PASS] equipment load metadata, aggregation, and bag boundary");
