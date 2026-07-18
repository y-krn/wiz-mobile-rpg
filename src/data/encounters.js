import { BIOMES, getBiomeForFloor } from "./biomes.js";
import { ENEMY_ROLES } from "./monsters.js";

export const ENCOUNTER_COMPOSITION_RULES = Object.freeze({
  minSize: 1,
  maxSize: 3,
  maxCopiesPerMonster: 2,
  maxRoleCounts: Object.freeze({
    [ENEMY_ROLES.AGGRESSOR]: 3,
    [ENEMY_ROLES.DISRUPTOR]: 1,
    [ENEMY_ROLES.AMPLIFIER]: 1
  }),
  forbiddenSoloRoles: Object.freeze([ENEMY_ROLES.AMPLIFIER])
});

export const ENCOUNTER_SIZE_WEIGHTS = Object.freeze({
  1: Object.freeze([0.55, 0.42, 0.03]),
  2: Object.freeze([0.40, 0.55, 0.05]),
  3: Object.freeze([0.30, 0.65, 0.05]),
  4: Object.freeze([0.25, 0.70, 0.05]),
  5: Object.freeze([0.20, 0.75, 0.05]),
  6: Object.freeze([0.20, 0.75, 0.05])
});

export const BIOME_ENCOUNTER_POOLS = Object.freeze(Object.fromEntries(
  BIOMES.map(biome => [biome.id, biome.enemyPool])
));

// Compatibility surface: keys now identify six biomes, not fixed dungeon floors.
export const ENCOUNTER_POOLS = Object.freeze(Object.fromEntries(
  BIOMES.map((biome, index) => [index + 1, biome.enemyPool])
));

export function getEncounterPoolForFloor(floor) {
  return getBiomeForFloor(floor).enemyPool;
}

export function getEncounterSizeWeightsForFloor(floor) {
  const localFloor = ((Math.max(1, floor) - 1) % 5) + 1;
  return ENCOUNTER_SIZE_WEIGHTS[localFloor];
}
