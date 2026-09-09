// sim-scope: fixture — explicit Build Snapshot personas for canonical runs

import { createStartingKitCharacter } from "../../src/state/initial_state.js";
import { ITEMS } from "../../src/data/items.js";
import { getCharMaxHp, getCharMaxMp } from "../../src/rules/character_stats.js";

export const BUILD_FIXTURE_IDS = Object.freeze([
  "light-shield",
  "heavy-two-hand",
  "medium-shallow-rune",
  "medium-multi-rune",
  "exploration-support",
  "main-core-conversion"
]);

const FIXTURE_DEFINITIONS = Object.freeze({
  "light-shield": {
    label: "Light weapon + shield",
    weapon: "DAGGER",
    shield: "BUCKLER",
    armor: "EXPLORER_CLOAK"
  },
  "heavy-two-hand": {
    label: "Heavy two-hand weapon",
    weapon: "CLAYMORE"
  },
  "medium-shallow-rune": {
    label: "One-hand medium + shallow Rune + shield",
    weapon: "WAND",
    shield: "SMALL_SHIELD",
    runes: ["RUNE_HALITO"]
  },
  "medium-multi-rune": {
    label: "Two-hand medium + multi Rune",
    weapon: "SAGE_STAFF",
    runes: ["RUNE_HALITO", "RUNE_KATINO"]
  },
  "exploration-support": {
    label: "Exploration Support biased",
    weapon: "DAGGER",
    shield: "SMALL_SHIELD",
    accessory: "THIEF_EYE",
    supports: [
      ["trapBonus", 20],
      ["treasureSense", 15],
      ["arcaneSense", 2],
      ["hearRange", 2],
      ["traceRead", 2],
      ["materialFind", 15]
    ]
  },
  "main-core-conversion": {
    label: "Main-axis conversion Core",
    weapon: "WAND",
    runes: ["RUNE_HALITO"],
    core: ["CORE_BLOOD_WAND"],
    supports: [["spellPower", 20]]
  }
});

function createEquipment(fixtureId, slot, baseId, { core = [], supports = [] } = {}) {
  const base = ITEMS[baseId];
  if (!base) throw new Error(`${fixtureId}: unknown item ${baseId}`);
  return {
    kind: "equipment",
    instanceId: `build-snapshot:${fixtureId}:${slot}`,
    baseId,
    rarity: "epic",
    level: 1,
    identified: true,
    halfIdentified: false,
    tags: [...(base.tags || [])],
    affixes: [
      ...core.map(id => ({ id, type: id, kind: "core" })),
      ...supports.map(([id, value]) => ({ id, type: id, kind: "support", value }))
    ]
  };
}

export function getBuildFixtureDefinitions() {
  return BUILD_FIXTURE_IDS.map(id => ({ id, ...structuredClone(FIXTURE_DEFINITIONS[id]) }));
}

export function createBuildFixture(fixtureId) {
  const definition = FIXTURE_DEFINITIONS[fixtureId];
  if (!definition) throw new Error(`unknown build fixture: ${fixtureId}`);
  const character = createStartingKitCharacter("arcana");
  character.equipment = {
    weapon: createEquipment(fixtureId, "weapon", definition.weapon, {
      core: definition.core,
      supports: definition.supports
    }),
    shield: definition.shield
      ? createEquipment(fixtureId, "shield", definition.shield)
      : null,
    armor: createEquipment(fixtureId, "armor", definition.armor || "LEATHER_ARMOR"),
    accessory: definition.accessory
      ? createEquipment(fixtureId, "accessory", definition.accessory)
      : null,
    accessory2: null
  };
  character.mediumState = {
    mediumKey: character.equipment.weapon.instanceId,
    socketedRunes: [...(definition.runes || [])]
  };
  character.buildFixtureId = fixtureId;
  character.hp = getCharMaxHp(character);
  character.mp = getCharMaxMp(character);
  return character;
}
