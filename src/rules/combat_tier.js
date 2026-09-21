// balance-impact: none — Pure vNext diagnostic helper. Combat Tier is not a current gameplay value.

export const COMBAT_TIER_MIN = 0;
export const COMBAT_TIER_MAX = 5;
export const COMBAT_TIER_MILESTONE_FLOORS = Object.freeze([5, 10, 15, 20, 25]);

export const COMBAT_TIER_START_BANDS = Object.freeze([
  Object.freeze({ minFloor: 1, maxFloor: 4, tier: 0 }),
  Object.freeze({ minFloor: 5, maxFloor: 9, tier: 1 }),
  Object.freeze({ minFloor: 10, maxFloor: 14, tier: 2 }),
  Object.freeze({ minFloor: 15, maxFloor: 19, tier: 3 }),
  Object.freeze({ minFloor: 20, maxFloor: 24, tier: 4 }),
  Object.freeze({ minFloor: 25, maxFloor: Infinity, tier: 5 })
]);

function normalizeFloor(value, fallback = 1) {
  if (typeof value === "string") {
    const match = value.trim().match(/^B?(\d+)(?:F)?$/i);
    if (match) value = match[1];
  }
  const floor = Number(value);
  return Number.isFinite(floor) ? Math.max(1, Math.floor(floor)) : fallback;
}

function getMilestoneFloor(value) {
  if (value && typeof value === "object") {
    return getMilestoneFloor(value.floor ?? value.milestoneFloor ?? value.bandFloor ?? value.id);
  }
  const floor = normalizeFloor(value, 0);
  return COMBAT_TIER_MILESTONE_FLOORS.includes(floor) ? floor : 0;
}

export function getCombatTierForStartFloor(startFloor = 1) {
  const floor = normalizeFloor(startFloor);
  return COMBAT_TIER_START_BANDS.find(band => floor >= band.minFloor && floor <= band.maxFloor)?.tier
    ?? COMBAT_TIER_MAX;
}

export function getCombatTierForDefeatedMilestones(defeatedMilestones = []) {
  const values = Array.isArray(defeatedMilestones) ? defeatedMilestones : [defeatedMilestones];
  const highestMilestone = Math.max(0, ...values.map(getMilestoneFloor));
  return Math.min(COMBAT_TIER_MAX, COMBAT_TIER_MILESTONE_FLOORS.indexOf(highestMilestone) + 1);
}

export function resolveCombatTier({
  startFloor = 1,
  defeatedMilestones = [],
  defeatedMilestone = null,
  milestoneBand = null,
  defeatedMilestoneBand = null
} = {}) {
  const defeated = [
    ...(Array.isArray(defeatedMilestones) ? defeatedMilestones : [defeatedMilestones]),
    defeatedMilestone,
    milestoneBand,
    defeatedMilestoneBand
  ].filter(value => value !== null && value !== undefined);
  return Math.max(
    getCombatTierForStartFloor(startFloor),
    getCombatTierForDefeatedMilestones(defeated)
  );
}
