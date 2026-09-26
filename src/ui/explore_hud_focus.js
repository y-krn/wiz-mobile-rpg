// UI-only, non-persistent focus state for the explore HUD (#1765).
// The HUD opens ("notice") when something new happens and folds ("roam")
// after the party has acted a few times. Actions are counted from pose
// changes observed at render time, so turn order owns the pace: a wall bump
// changes neither position nor facing and never folds the HUD.

export const EXPLORE_HUD_MODES = Object.freeze({ NOTICE: "notice", ROAM: "roam" });
export const EXPLORE_HUD_ROAM_AFTER_ACTIONS = 2;

// goalExpanded: null follows the mode; true/false is the player's choice.
// A manual collapse yields to the next notice, a manual expansion persists.
const DEFAULT_TOGGLES = Object.freeze({ goalExpanded: null, minimapExpanded: false });

function getToggles(prev) {
  return {
    goalExpanded: prev?.goalExpanded ?? DEFAULT_TOGGLES.goalExpanded,
    minimapExpanded: prev?.minimapExpanded ?? DEFAULT_TOGGLES.minimapExpanded
  };
}

/**
 * @param {object|null} prev previous focus, or null on explore start/reload
 * @param {{ logSignature: string, goalSignature: string, poseSignature: string, floor: number }} input
 */
export function nextExploreHudFocus(prev, { logSignature, goalSignature, poseSignature, floor }) {
  const toggles = getToggles(prev);
  const signatures = { logSignature, goalSignature, poseSignature, floor };
  const isNotice = !prev ||
    prev.logSignature !== logSignature ||
    prev.goalSignature !== goalSignature ||
    prev.floor !== floor;
  if (isNotice) {
    if (toggles.goalExpanded === false) toggles.goalExpanded = null;
    return { ...signatures, ...toggles, mode: EXPLORE_HUD_MODES.NOTICE, actionsSinceNotice: 0 };
  }
  if (prev.poseSignature === poseSignature) return { ...prev, ...toggles };
  const actionsSinceNotice = prev.actionsSinceNotice + 1;
  return {
    ...signatures,
    ...toggles,
    mode: actionsSinceNotice >= EXPLORE_HUD_ROAM_AFTER_ACTIONS ? EXPLORE_HUD_MODES.ROAM : EXPLORE_HUD_MODES.NOTICE,
    actionsSinceNotice
  };
}

/** Leaving explore forgets what was seen but keeps the player's manual toggles. */
export function suspendExploreHudFocus(prev) {
  if (!prev) return null;
  return getToggles(prev);
}

export function isExploreHudGoalExpanded(focus) {
  return focus?.goalExpanded ?? focus?.mode !== EXPLORE_HUD_MODES.ROAM;
}

export function toggleExploreHudGoal(prev) {
  return { ...getToggles(prev), ...prev, goalExpanded: !isExploreHudGoalExpanded(prev) };
}

export function toggleExploreHudMinimap(prev) {
  return { ...getToggles(prev), ...prev, minimapExpanded: !(prev?.minimapExpanded ?? false) };
}
