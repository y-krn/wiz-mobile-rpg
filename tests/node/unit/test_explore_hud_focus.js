import assert from "node:assert/strict";
import {
  EXPLORE_HUD_MODES,
  EXPLORE_HUD_ROAM_AFTER_ACTIONS,
  isExploreHudGoalExpanded,
  nextExploreHudFocus,
  suspendExploreHudFocus,
  toggleExploreHudGoal
} from "../../../src/ui/explore_hud_focus.js";
import * as facade from "../../../src/ui/explore_hud_focus.js";
import * as owner from "../../../src/ui/explore_hud_focus.ts";
import { exerciseExploreHudFocusTypes } from "../fixtures/typescript/explore_hud_focus_inputs.ts";

const base = { logSignature: "3|入場", goalSignature: "goal", poseSignature: "1,4,4,0", floor: 1 };
const step = (focus, patch) => nextExploreHudFocus(focus, { ...base, ...patch });

// Explore start or reload opens the HUD.
let focus = nextExploreHudFocus(null, base);
assert.equal(focus.mode, EXPLORE_HUD_MODES.NOTICE);
// The goal starts folded to one line even on a notice (#1832).
assert.equal(isExploreHudGoalExpanded(focus), false);
assert.equal("minimapExpanded" in focus, false);

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

// New information does not re-open the folded goal; a manual expansion
// survives it.
let folded = step(focus, { ...roamPose, logSignature: "9|next", goalSignature: "goal|quest:2" });
assert.equal(folded.mode, EXPLORE_HUD_MODES.NOTICE);
assert.equal(isExploreHudGoalExpanded(folded), true);
folded = toggleExploreHudGoal(folded);
assert.equal(isExploreHudGoalExpanded(folded), false);
folded = step(folded, { ...roamPose, logSignature: "10|next" });
assert.equal(isExploreHudGoalExpanded(folded), false);

// The goal toggle survives leaving explore.
const suspended = suspendExploreHudFocus(focus);
assert.equal(suspended.goalExpanded, true);
const resumed = nextExploreHudFocus(suspended, { ...base, ...roamPose, logSignature: "5|x" });
assert.equal(resumed.mode, EXPLORE_HUD_MODES.NOTICE);
assert.equal(resumed.goalExpanded, true);
assert.equal(suspendExploreHudFocus(null), null);

// The legacy JavaScript path remains a seven-export identity facade.
assert.deepEqual(Object.keys(facade), [
  "EXPLORE_HUD_LOG_LINGER_MS",
  "EXPLORE_HUD_MODES",
  "EXPLORE_HUD_ROAM_AFTER_ACTIONS",
  "isExploreHudGoalExpanded",
  "nextExploreHudFocus",
  "suspendExploreHudFocus",
  "toggleExploreHudGoal"
]);
assert.deepEqual(Object.keys(owner), Object.keys(facade));
for (const key of Object.keys(facade)) assert.strictEqual(facade[key], owner[key]);
assert.equal(Object.isFrozen(EXPLORE_HUD_MODES), true);
assert.deepEqual(EXPLORE_HUD_MODES, { NOTICE: "notice", ROAM: "roam" });
assert.equal(EXPLORE_HUD_ROAM_AFTER_ACTIONS, 2);
assert.equal(facade.EXPLORE_HUD_LOG_LINGER_MS, 4000);

// Focus copies stay fresh, keep extensions, and never mutate input.
const extended = { ...focus, custom: { value: 1 } };
const extendedBefore = structuredClone(extended);
const samePose = step(extended, {
  logSignature: extended.logSignature,
  goalSignature: extended.goalSignature,
  poseSignature: extended.poseSignature,
  floor: extended.floor
});
assert.notStrictEqual(samePose, extended);
assert.deepEqual(extended, extendedBefore);
assert.strictEqual(samePose.custom, extended.custom);
assert.deepEqual(Object.keys(samePose), Object.keys(extended));
const toggledExtended = toggleExploreHudGoal(extended);
assert.notStrictEqual(toggledExtended, extended);
assert.deepEqual(extended, extendedBefore);
assert.strictEqual(toggledExtended.custom, extended.custom);
assert.deepEqual(Object.keys(toggledExtended), [
  "goalExpanded", "logSignature", "goalSignature", "poseSignature",
  "floor", "mode", "actionsSinceNotice", "custom"
]);

// Nullish goal values stay folded in every mode; explicit booleans override it.
for (const goalExpanded of [null, undefined]) {
  assert.equal(isExploreHudGoalExpanded({ mode: EXPLORE_HUD_MODES.ROAM, goalExpanded }), false);
  assert.equal(isExploreHudGoalExpanded({ mode: EXPLORE_HUD_MODES.NOTICE, goalExpanded }), false);
}
assert.equal(isExploreHudGoalExpanded({ mode: EXPLORE_HUD_MODES.NOTICE, goalExpanded: true }), true);
assert.equal(isExploreHudGoalExpanded({ mode: EXPLORE_HUD_MODES.ROAM, goalExpanded: false }), false);
assert.equal(isExploreHudGoalExpanded({ mode: EXPLORE_HUD_MODES.ROAM, goalExpanded: true }), true);

// A suspended partial state resumes with a notice and retains its toggles.
const partial = suspendExploreHudFocus({ goalExpanded: false, extra: "kept only before suspend" });
assert.deepEqual(Object.keys(partial), ["goalExpanded"]);
assert.deepEqual(partial, { goalExpanded: false });
const resumedPartial = nextExploreHudFocus(partial, base);
assert.equal(resumedPartial.mode, EXPLORE_HUD_MODES.NOTICE);
assert.equal(resumedPartial.goalExpanded, false);
assert.deepEqual(Object.keys(resumedPartial), [
  "logSignature", "goalSignature", "poseSignature", "floor",
  "goalExpanded", "mode", "actionsSinceNotice"
]);

// Preserve native getter access order and short-circuit behavior.
const reads = [];
const orderedPrev = Object.defineProperties({}, {
  goalExpanded: { get() { reads.push("goalExpanded"); return null; } },
  logSignature: { get() { reads.push("logSignature"); return "changed"; } },
  goalSignature: { get() { reads.push("goalSignature"); return "unused"; } },
  floor: { get() { reads.push("floor"); return -1; } }
});
nextExploreHudFocus(orderedPrev, base);
assert.deepEqual(reads, ["goalExpanded", "logSignature"]);

exerciseExploreHudFocusTypes();

console.log("test_explore_hud_focus: ok");
