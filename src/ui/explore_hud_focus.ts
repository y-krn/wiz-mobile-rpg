// UI-only, non-persistent focus state for the explore HUD (#1765).
// The runtime contract intentionally preserves the legacy JavaScript behavior.

export const EXPLORE_HUD_MODES = Object.freeze({ NOTICE: "notice", ROAM: "roam" });
export const EXPLORE_HUD_ROAM_AFTER_ACTIONS = 2;

type ExploreHudMode = typeof EXPLORE_HUD_MODES[keyof typeof EXPLORE_HUD_MODES];

export interface ExploreHudFocusState {
  logSignature?: string;
  goalSignature?: string;
  poseSignature?: string;
  floor?: number;
  goalExpanded?: boolean | null;
  minimapExpanded?: boolean;
  mode?: ExploreHudMode;
  actionsSinceNotice?: number;
  [key: string]: unknown;
}

export interface ExploreHudFocusInput {
  logSignature: string;
  goalSignature: string;
  poseSignature: string;
  floor: number;
}

const DEFAULT_TOGGLES = Object.freeze({ goalExpanded: null, minimapExpanded: false });

function getToggles(prev: ExploreHudFocusState | null | undefined): Pick<ExploreHudFocusState, "goalExpanded" | "minimapExpanded"> {
  return {
    goalExpanded: prev?.goalExpanded ?? DEFAULT_TOGGLES.goalExpanded,
    minimapExpanded: prev?.minimapExpanded ?? DEFAULT_TOGGLES.minimapExpanded
  };
}

export function nextExploreHudFocus(
  prev: ExploreHudFocusState | null | undefined,
  { logSignature, goalSignature, poseSignature, floor }: ExploreHudFocusInput
): ExploreHudFocusState {
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
  const actionsSinceNotice = (prev.actionsSinceNotice as number) + 1;
  return {
    ...signatures,
    ...toggles,
    mode: actionsSinceNotice >= EXPLORE_HUD_ROAM_AFTER_ACTIONS ? EXPLORE_HUD_MODES.ROAM : EXPLORE_HUD_MODES.NOTICE,
    actionsSinceNotice
  };
}

/** Leaving explore forgets what was seen but keeps the player's manual toggles. */
export function suspendExploreHudFocus(prev: ExploreHudFocusState | null | undefined): ExploreHudFocusState | null {
  if (!prev) return null;
  return getToggles(prev);
}

export function isExploreHudGoalExpanded(focus: ExploreHudFocusState | null | undefined): boolean {
  return focus?.goalExpanded ?? focus?.mode !== EXPLORE_HUD_MODES.ROAM;
}

export function toggleExploreHudGoal(prev: ExploreHudFocusState | null | undefined): ExploreHudFocusState {
  return { ...getToggles(prev), ...prev, goalExpanded: !isExploreHudGoalExpanded(prev) };
}

export function toggleExploreHudMinimap(prev: ExploreHudFocusState | null | undefined): ExploreHudFocusState {
  return { ...getToggles(prev), ...prev, minimapExpanded: !(prev?.minimapExpanded ?? false) };
}
