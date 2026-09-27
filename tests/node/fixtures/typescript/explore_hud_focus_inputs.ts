import {
  nextExploreHudFocus as nextFromOwner,
  suspendExploreHudFocus as suspendFromOwner,
  toggleExploreHudGoal as toggleGoalFromOwner,
  toggleExploreHudMinimap as toggleMinimapFromOwner,
  type ExploreHudFocusInput,
  type ExploreHudFocusState
} from "../../../../src/ui/explore_hud_focus";
import {
  nextExploreHudFocus as nextFromFacade,
  suspendExploreHudFocus as suspendFromFacade
} from "../../../../src/ui/explore_hud_focus.js";

export function exerciseExploreHudFocusTypes(): void {
  const input: ExploreHudFocusInput = {
    logSignature: "log",
    goalSignature: "goal",
    poseSignature: "pose",
    floor: 1
  };
  const initial: ExploreHudFocusState = nextFromOwner(null, input);
  const suspended: ExploreHudFocusState | null = suspendFromOwner(initial);
  const resumed: ExploreHudFocusState = nextFromFacade(suspended, input);
  const toggledGoal: ExploreHudFocusState = toggleGoalFromOwner(resumed);
  const toggledMinimap: ExploreHudFocusState = toggleMinimapFromOwner(toggledGoal);
  const nullFocus: ExploreHudFocusState = nextFromFacade(null, input);
  void [suspended, toggledMinimap, nullFocus, suspendFromFacade(null)];
}
