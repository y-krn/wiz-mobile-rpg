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

// Floor rosters (#2123). Each biome sorts its enemies into three tiers, and
// the local floor decides how often each tier appears: plain attackers on the
// first floors, enemies with a role (guard, heal, rally, status) from the third,
// the biome's own troublemakers from the fourth. Plain attackers thin out deep
// down but never vanish, so they still turn up beside the new faces.
export const ENEMY_TIER_WEIGHTS_BY_LOCAL_FLOOR = Object.freeze({
  early: Object.freeze([1, 1, 0.6, 0.15, 0.1]),
  role: Object.freeze([0, 0, 1, 1, 0.8]),
  late: Object.freeze([0, 0, 0, 1, 1])
});
// Local floors where a new tier first appears, and what the player is told.
const NEW_ROSTER_NOTICES = Object.freeze({
  3: "この階には、別の気配がある。群れを率いる敵が混ざっているようだ。",
  4: "この階には、さらに厄介な気配がある。"
});
const MONSTER_BY_NAME = new Map(MONSTERS.map(monster => [monster.name, monster]));
// Selection slots per unit of weight, so a thinned tier keeps a slot.
const WEIGHT_SLOTS = 10;

function getLocalFloor(floor) {
  return ((Math.max(1, Math.floor(Number(floor) || 1)) - 1) % 5) + 1;
}

export function getEnemyTier(name, floor) {
  const tiers = getBiomeForFloor(floor).enemyTiers;
  return Object.keys(tiers).find(tier => tiers[tier].includes(name)) || null;
}

export function getEncounterWeightForFloor(name, floor, { trial = null } = {}) {
  const monster = MONSTER_BY_NAME.get(name);
  if (!monster) return 1;
  const tier = getEnemyTier(name, floor);
  const baseWeight = tier ? ENEMY_TIER_WEIGHTS_BY_LOCAL_FLOOR[tier][getLocalFloor(floor) - 1] : 1;
  if (baseWeight <= 0) return 0;
  return trial ? baseWeight * getTrialAffinityWeight(monster, trial, getFloorRole(floor)) : baseWeight;
}

/** The line shown on first reaching a floor where new enemies begin to appear. */
export function getNewRosterNotice(floor) {
  return NEW_ROSTER_NOTICES[getLocalFloor(floor)] || null;
}

function getWeightedEncounterPoolForFloor(floor, options = {}) {
  const pool = getBiomeForFloor(floor).enemyPool;
  const trial = options.trial || (options.runSeed
    ? getBandTrialForFloor(options.runSeed, floor, options.storedTrial)
    : null);
  // An enemy whose tier has not started on this floor never appears; a trial
  // only reweights the enemies that can.
  return pool.flatMap(name => {
    const weight = getEncounterWeightForFloor(name, floor, { trial });
    if (weight <= 0) return [];
    return Array.from({ length: Math.max(1, Math.round(weight * WEIGHT_SLOTS)) }, () => name);
  });
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
