import assert from "node:assert/strict";
import {
  EXPLORE_HUD_MODES,
  isExploreHudGoalExpanded,
  nextExploreHudFocus,
  suspendExploreHudFocus,
  toggleExploreHudGoal,
  toggleExploreHudMinimap
} from "../../../src/ui/explore_hud_focus.js";

const base = { logSignature: "3|入場", goalSignature: "goal", poseSignature: "1,4,4,0", floor: 1 };
const step = (focus, patch) => nextExploreHudFocus(focus, { ...base, ...patch });

// Explore start or reload opens the HUD.
let focus = nextExploreHudFocus(null, base);
assert.equal(focus.mode, EXPLORE_HUD_MODES.NOTICE);
assert.equal(isExploreHudGoalExpanded(focus), true);
assert.equal(focus.minimapExpanded, false);

// Re-rendering without a pose change (wall bump, menu refresh) is not an action.
focus = step(focus, {});
focus = step(focus, {});
assert.equal(focus.mode, EXPLORE_HUD_MODES.NOTICE);
assert.equal(focus.actionsSinceNotice, 0);

// Two actions (position or facing change) fold the HUD.
focus = step(focus, { poseSignature: "1,4,4,1" });
assert.equal(focus.mode, EXPLORE_HUD_MODES.NOTICE);
focus = step(focus, { poseSignature: "1,4,3,1" });
assert.equal(focus.mode, EXPLORE_HUD_MODES.ROAM);
assert.equal(isExploreHudGoalExpanded(focus), false);
const roamPose = { poseSignature: "1,4,3,1" };

// New log, goal/quest progress, or floor change re-opens it.
for (const patch of [
  { logSignature: "4|新しいログ" },
  { logSignature: "3|入場 ×2" },
  { goalSignature: "goal|quest:1" },
  { floor: 2, poseSignature: "2,1,1,0" }
]) {
  const noticed = step(focus, { ...roamPose, ...patch });
  assert.equal(noticed.mode, EXPLORE_HUD_MODES.NOTICE, JSON.stringify(patch));
  assert.equal(noticed.actionsSinceNotice, 0);
}

// A manual goal expansion persists through roam.
focus = toggleExploreHudGoal(focus);
assert.equal(isExploreHudGoalExpanded(focus), true);
assert.equal(focus.mode, EXPLORE_HUD_MODES.ROAM);
focus = step(focus, roamPose);
assert.equal(focus.mode, EXPLORE_HUD_MODES.ROAM);
assert.equal(isExploreHudGoalExpanded(focus), true);
focus = step(focus, { logSignature: "5|x", ...roamPose });
focus = step(focus, { logSignature: "5|x", poseSignature: "1,4,2,1" });
focus = step(focus, { logSignature: "5|x", poseSignature: "1,4,1,1" });
assert.equal(focus.mode, EXPLORE_HUD_MODES.ROAM);
assert.equal(isExploreHudGoalExpanded(focus), true);

// A manual collapse during notice yields to the next notice.
let collapsed = toggleExploreHudGoal(nextExploreHudFocus(null, base));
assert.equal(isExploreHudGoalExpanded(collapsed), false);
assert.equal(collapsed.mode, EXPLORE_HUD_MODES.NOTICE);
collapsed = step(collapsed, {});
assert.equal(isExploreHudGoalExpanded(collapsed), false);
collapsed = step(collapsed, { logSignature: "9|next" });
assert.equal(isExploreHudGoalExpanded(collapsed), true);

// The minimap toggle is independent of the mode and survives leaving explore.
focus = toggleExploreHudMinimap(focus);
assert.equal(focus.minimapExpanded, true);
assert.equal(focus.mode, EXPLORE_HUD_MODES.ROAM);
const suspended = suspendExploreHudFocus(focus);
assert.equal(suspended.minimapExpanded, true);
const resumed = nextExploreHudFocus(suspended, { ...base, ...roamPose, logSignature: "5|x" });
assert.equal(resumed.mode, EXPLORE_HUD_MODES.NOTICE);
assert.equal(resumed.minimapExpanded, true);
assert.equal(suspendExploreHudFocus(null), null);
assert.equal(toggleExploreHudMinimap(null).minimapExpanded, true);

console.log("test_explore_hud_focus: ok");
