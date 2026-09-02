import assert from "node:assert/strict";
import { createSoloCharacter, state } from "../../../src/state.js";
import { combatSelection, getRepeatActionStatus, repeatLastCombatAction } from "../../../src/combat.js";

state.party = [createSoloCharacter("Fighter")];
state.gameState = "combat";
state.transitioning = false;
state.combatState = {
  phase: "choose_actions",
  monsters: [{ name: "検証敵", hp: 10, maxHp: 10 }],
  lastActions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
};
combatSelection.charIdx = 0;
combatSelection.actions = [];

assert.equal(getRepeatActionStatus().available, true);
state.combatState.monsters[0].hp = 0;
assert.equal(getRepeatActionStatus().available, false);
assert.equal(repeatLastCombatAction(), false);
assert.deepEqual(combatSelection.actions, []);

state.combatState.monsters[0].hp = 10;
state.combatState.lastActions = [{ type: "defend", actorIdx: 0 }];
assert.equal(getRepeatActionStatus().available, true);

state.inventory = ["MANA_POTION"];
state.combatState.lastActions = [{ type: "item", actorIdx: 0, targetIdx: 0, itemKey: "HEAL_POTION", itemIdx: 0 }];
assert.equal(getRepeatActionStatus().available, false);

console.log("[PASS] combat repeat action validates live targets and never falls back");
