// balance-impact: none — canonical selection contract and existing callback boundary only.
import { state } from "../state.js";
import { menuContext } from "../navigation.js";
import { getScreenViewState } from "../state/view_state.js";
import { isCombatAction } from "../combat_logic/combat_action.js";
import type { CombatAction } from "../combat_logic/combat_action.js";

export interface CombatSelection {
  charIdx: number;
  actions: CombatAction[];
}

export const combatSelection: CombatSelection = {
  charIdx: 0,
  actions: []
};

export const combatCallbacks = {
  activeTargetCallback: null,
  activeSpellCallback: null,
  activeItemCallback: null
};

export function queueCombatAction(action: unknown): action is CombatAction {
  if (!isCombatAction(action)) return false;
  combatSelection.actions.push(action);
  return true;
}

function isLivingCombatActor(actor: unknown): actor is { name: string; status: string } {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) return false;
  const candidate = actor as { name?: unknown; status?: unknown };
  return typeof candidate.name === "string" &&
    ["ok", "poisoned", "blind"].includes(candidate.status as string);
}

// balance-impact: none — combat callback context boundary only
// A callback can outlive its DOM overlay. Keep the originating screen context
// with it so a later direct invocation cannot commit into a different menu.
export function bindCombatCallback(callback: unknown, context: Record<string, unknown>) {
  const expected = Object.freeze({ ...context });
  return (...args: unknown[]) => {
    const view = getScreenViewState(state, menuContext);
    const party = state.party as unknown[];
    const actor = typeof expected.actorIdx === "number" && Number.isInteger(expected.actorIdx) && expected.actorIdx >= 0
      ? party[expected.actorIdx]
      : null;
    const livingActor = isLivingCombatActor(actor);
    const actorName = livingActor ? actor.name : null;
    if (typeof callback !== "function" || !view.isActionableCombat ||
        menuContext.prevGameState !== "combat" ||
        menuContext.type !== expected.type ||
        menuContext.actorIdx !== expected.actorIdx ||
        menuContext.targetType !== expected.targetType ||
        menuContext.spellName !== expected.spellName ||
        !livingActor || actor !== expected.actor || actorName !== expected.actorName) {
      return;
    }
    return callback(...args);
  };
}
