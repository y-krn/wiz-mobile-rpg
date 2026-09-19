import { state } from "../state.js";
import { menuContext } from "../navigation.js";
import { getScreenViewState } from "../state/view_state.js";

// Combat action selection state
export const combatSelection = {
  charIdx: 0,
  actions: [] // array of { type, actorIdx, targetIdx, spellName, itemKey }
};

export const combatCallbacks = {
  activeTargetCallback: null,
  activeSpellCallback: null,
  activeItemCallback: null
};

function isLivingCombatActor(actor) {
  return Boolean(actor) && typeof actor === "object" && !Array.isArray(actor) &&
    typeof actor.name === "string" && ["ok", "poisoned", "blind"].includes(actor.status);
}

// balance-impact: none — combat callback context boundary only
// A callback can outlive its DOM overlay. Keep the originating screen context
// with it so a later direct invocation cannot commit into a different menu.
export function bindCombatCallback(callback, context) {
  const expected = Object.freeze({ ...context });
  return (...args) => {
    const view = getScreenViewState(state, menuContext);
    const actor = Number.isInteger(expected.actorIdx) && expected.actorIdx >= 0
      ? state.party?.[expected.actorIdx]
      : null;
    if (typeof callback !== "function" || !view.isActionableCombat ||
        menuContext.prevGameState !== "combat" ||
        menuContext.type !== expected.type ||
        menuContext.actorIdx !== expected.actorIdx ||
        menuContext.targetType !== expected.targetType ||
        menuContext.spellName !== expected.spellName ||
        !isLivingCombatActor(actor) || actor !== expected.actor || actor.name !== expected.actorName) {
      return;
    }
    return callback(...args);
  };
}
