// Exploration formulas are shared by the production actions and the
// production-backed simulation. Build modifiers are supplied explicitly so
// class, level, and raw character stats cannot become hidden permissions.

export const SECRET_DOOR_SEARCH_CALIBRATION = Object.freeze({
  universalBaseChance: 0.35,
  depthPenaltyPerFloor: 0.05,
  minChance: 0.10,
  maxChance: 0.95
});

function normalizeFloor(floor) {
  const numericFloor = Number(floor);
  return Number.isFinite(numericFloor)
    ? Math.max(1, Math.floor(numericFloor))
    : 1;
}

function normalizeArcaneSense(arcaneSense) {
  const numericSense = Number(arcaneSense);
  return Number.isFinite(numericSense) ? Math.max(0, numericSense) : 0;
}

/**
 * Resolve the chance for the universal search verb to reveal a secret door.
 * `arcaneSense` is a run-local build modifier, not a class or level input.
 */
export function calculateSecretDoorSearchChance({ floor = 1, arcaneSense = 0 } = {}) {
  const depth = normalizeFloor(floor);
  const senseModifier = normalizeArcaneSense(arcaneSense) / 100;
  const rawChance = SECRET_DOOR_SEARCH_CALIBRATION.universalBaseChance
    + senseModifier
    - (depth - 1) * SECRET_DOOR_SEARCH_CALIBRATION.depthPenaltyPerFloor;
  return Math.max(
    SECRET_DOOR_SEARCH_CALIBRATION.minChance,
    Math.min(SECRET_DOOR_SEARCH_CALIBRATION.maxChance, rawChance)
  );
}
