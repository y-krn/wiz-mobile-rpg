import assert from "node:assert/strict";

const {
  GAME_STATES,
  getScreenViewState,
  hasStructurallyUsableCombatParty,
  hasUsableCombatActor,
  isUsableCombatState,
  isUsableMap,
  normalizeMenuContext,
  normalizeMenuHistoryEntry,
} = await import("../../../src/state/view_state.js");

const cell = { type: "floor", walls: [false, false, false, false] };
const map = [[cell]];
const combatState = { phase: "choose_actions", monsters: [{ name: "Biter" }] };
const activeParty = [{ name: "Aster", status: "ok" }];

assert.equal(Object.isFrozen(GAME_STATES), true);
assert.equal(isUsableMap(map), true);
assert.equal(isUsableCombatState(combatState), true);
assert.equal(hasStructurallyUsableCombatParty(activeParty), true);
assert.equal(hasUsableCombatActor(activeParty), true);

const actionable = getScreenViewState({
  gameState: "combat",
  map,
  x: 0,
  y: 0,
  party: activeParty,
  combatState,
  transitioning: false,
}, null);
assert.equal(actionable.gameState, "combat");
assert.equal(actionable.hasMap, true);
assert.equal(actionable.hasCurrentCell, true);
assert.equal(actionable.hasCombat, true);
assert.equal(actionable.hasStructurallyUsableCombatParty, true);
assert.equal(actionable.hasUsableCombatActor, true);
assert.equal(actionable.isActionableCombat, true);
assert.equal(Object.isFrozen(actionable), true);

const allDead = getScreenViewState({
  gameState: "combat",
  party: [{ name: "Aster", status: "dead" }],
  combatState,
  transitioning: false,
}, null);
assert.equal(allDead.hasStructurallyUsableCombatParty, true);
assert.equal(allDead.hasUsableCombatActor, false);
assert.equal(allDead.isActionableCombat, false);

const malformed = getScreenViewState({
  gameState: "unknown",
  map: [[cell], []],
  x: 0,
  y: 0,
  combatState: { phase: "choose_actions", monsters: [null] },
  party: [{ name: "Aster", status: "confused" }],
  transitioning: false,
}, null);
assert.equal(malformed.gameState, "explore");
assert.equal(malformed.hasMap, false);
assert.equal(malformed.hasCurrentCell, false);
assert.equal(malformed.hasCombat, false);
assert.equal(malformed.hasStructurallyUsableCombatParty, false);
assert.equal(malformed.isActionableCombat, false);

assert.deepEqual(normalizeMenuContext({
  type: " combat_target ",
  targetType: "stale",
  actorIdx: -1,
  prevGameState: "stale",
}), {
  type: " combat_target ",
  targetType: "",
  actorIdx: -1,
  spellName: "",
  itemKey: "",
  itemIdx: -1,
  prevGameState: null,
  slot: "",
});
assert.equal(normalizeMenuHistoryEntry({ type: "", title: "stale" }), null);

const invalidOverlay = getScreenViewState({
  gameState: "submenu",
  party: activeParty,
  combatState,
  transitioning: false,
}, {
  type: "combat_target",
  targetType: "enemy",
  spellName: "DUMAPIC",
  prevGameState: "combat",
});
assert.equal(invalidOverlay.isCombatOverlaySubmenu, true);
assert.equal(invalidOverlay.isUsableCombatOverlaySubmenu, false);

console.log("[PASS] TypeScript view-state owner preserves validated snapshot and fail-closed boundaries");
