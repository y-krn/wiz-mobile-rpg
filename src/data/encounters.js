import { BIOMES, getBiomeForFloor } from "./biomes.js";
import { ENEMY_ROLES, MONSTERS } from "./monsters.js";
import {
  getBandTrialForFloor,
  getFloorRole,
  getTrialAffinityWeight,
  getTrialEncounterSizeWeights
} from "../rules/floor_trials.js";

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
  1: Object.freeze([0.70, 0.30, 0.00]),
  2: Object.freeze([0.55, 0.45, 0.00]),
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

// The biome remains the source of enemy identity. Local floor weights reveal
// that theme gradually, while only status threats that are too punishing for
// the opening floor are hard-gated until local floor 2.
const STATUS_THREAT_WEIGHTS_BY_LOCAL_FLOOR = Object.freeze({
  1: 0,
  2: 1,
  3: 1,
  4: 1,
  5: 1
});
const EARLY_STATUS_THREAT_UNLOCK_LOCAL_FLOOR = 2;
const MONSTER_BY_NAME = new Map(MONSTERS.map(monster => [monster.name, monster]));

function getLocalFloor(floor) {
  return ((Math.max(1, Math.floor(Number(floor) || 1)) - 1) % 5) + 1;
}

export function getEncounterWeightForFloor(name, floor, { trial = null } = {}) {
  const localFloor = getLocalFloor(floor);
  const monster = MONSTER_BY_NAME.get(name);
  if (!monster) return 1;
  const isStatusThreat = monster.isBlinding || monster.isSleepInflicting;
  if (isStatusThreat) {
    if (localFloor < EARLY_STATUS_THREAT_UNLOCK_LOCAL_FLOOR) return 0;
    const baseWeight = STATUS_THREAT_WEIGHTS_BY_LOCAL_FLOOR[localFloor];
    return trial ? baseWeight * getTrialAffinityWeight(monster, trial, getFloorRole(floor)) : baseWeight;
  }
  return trial ? getTrialAffinityWeight(monster, trial, getFloorRole(floor)) : 1;
}

function getWeightedEncounterPoolForFloor(floor, options = {}) {
  const pool = getBiomeForFloor(floor).enemyPool;
  const trial = options.trial || (options.runSeed
    ? getBandTrialForFloor(options.runSeed, floor, options.storedTrial)
    : null);
  return pool.flatMap(name => Array.from(
    { length: Math.max(0, Math.round(getEncounterWeightForFloor(name, floor, { trial }) * (trial ? 10 : 1))) },
    () => name
  ));
}

export function getEncounterPoolForFloor(floor, options = {}) {
  return getWeightedEncounterPoolForFloor(floor, options);
}

export function getEncounterSizeWeightsForFloor(floor, options = {}) {
  const localFloor = ((Math.max(1, floor) - 1) % 5) + 1;
  const baseWeights = ENCOUNTER_SIZE_WEIGHTS[localFloor];
  if (!options.trial && !options.runSeed) return baseWeights;
  const trial = options.trial || getBandTrialForFloor(options.runSeed, floor, options.storedTrial);
  return getTrialEncounterSizeWeights(trial, getFloorRole(floor), baseWeights);
}
