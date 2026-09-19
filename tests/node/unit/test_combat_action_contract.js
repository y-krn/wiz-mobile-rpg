import assert from "node:assert/strict";
import {
  assignCombatActor,
  isCombatAction,
  isCombatActionDraft,
  normalizeCombatActions
} from "../../../src/combat_logic/combat_action.js";
import { combatSelection, queueCombatAction } from "../../../src/combat_ui/combat_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";

const actions = [
  { type: "fight", actorIdx: 0, targetIdx: 1 },
  { type: "spell", actorIdx: 0, targetIdx: -1, spellName: "HALITO" },
  { type: "item", actorIdx: 0, targetIdx: 0, itemKey: "HEAL_POTION", itemIdx: 2 },
  { type: "defend", actorIdx: 0 },
  { type: "run", actorIdx: 0 }
];

actions.forEach(action => assert.equal(isCombatAction(action), true, action.type));
assert.equal(isCombatAction({ type: "spell", actorIdx: 0, targetIdx: 0 }), false);
assert.equal(isCombatAction({ type: "item", actorIdx: 0, targetIdx: 0, itemKey: "HEAL_POTION" }), false);
assert.equal(isCombatAction({ type: "fight", actorIdx: 0, targetIdx: "1" }), false);
assert.equal(isCombatAction({ type: "defend", actorIdx: 0, spellName: "HALITO" }), false);

const drafts = actions.map(({ actorIdx, ...draft }) => draft);
drafts.forEach(draft => assert.equal(isCombatActionDraft(draft), true, draft.type));
assert.equal(isCombatActionDraft({ type: "fight", actorIdx: 0, targetIdx: 1 }), false);
assert.deepEqual(assignCombatActor(drafts[0], 3), { type: "fight", actorIdx: 3, targetIdx: 1 });
assert.deepEqual(assignCombatActor(drafts[1], 3), {
  type: "spell",
  actorIdx: 3,
  targetIdx: -1,
  spellName: "HALITO"
});
assert.equal(assignCombatActor(drafts[0], -1), null);
assert.equal(assignCombatActor({ type: "spell", targetIdx: 0 }, 0), null);

const normalizedSave = normalizeSavePayload({
  version: 14,
  combatState: {
    monsters: [{ name: "検証敵", hp: 10 }],
    lastActions: [actions[0], { type: "spell", actorIdx: 0, targetIdx: 0 }]
  }
});
assert.deepEqual(normalizedSave.combatState.lastActions, [actions[0]]);

assert.deepEqual(normalizeCombatActions([
  actions[0],
  { type: "spell", actorIdx: 0, targetIdx: 0 },
  { type: "defend", actorIdx: 1 }
]), [actions[0], { type: "defend", actorIdx: 1 }]);

combatSelection.actions = [];
assert.equal(queueCombatAction(actions[0]), true);
assert.equal(queueCombatAction({ type: "fight", actorIdx: 0, targetIdx: "bad" }), false);
assert.deepEqual(combatSelection.actions, [actions[0]]);

console.log("[PASS] canonical combat action variants, drafts, guards, and selection queue");
