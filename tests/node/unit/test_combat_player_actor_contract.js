import assert from "node:assert/strict";
import {
  isCombatPlayerActionableActor,
  isCombatPlayerActor,
  isCombatPlayerParty,
  isCombatPlayerStatus
} from "../../../src/state/character.js";
import { state } from "../../../src/state.js";
import { menuContext } from "../../../src/navigation.js";
import { bindCombatCallback } from "../../../src/combat_ui/combat_state.js";

const actor = {
  name: "Aster",
  hp: 20,
  maxHp: 20,
  mp: 8,
  maxMp: 8,
  status: "ok",
  equipment: { weapon: null },
  combatFirstStrikeActive: false
};

assert.equal(isCombatPlayerActor(actor), true);
assert.equal(isCombatPlayerActionableActor(actor), true);
assert.equal(isCombatPlayerParty([actor]), true);
assert.equal(isCombatPlayerParty([]), true);
assert.equal(isCombatPlayerStatus("paralyzed"), true);
assert.equal(isCombatPlayerStatus("confused"), false);

for (const field of ["name", "hp", "maxHp", "mp", "maxMp", "status"]) {
  const malformed = { ...actor };
  delete malformed[field];
  assert.equal(isCombatPlayerActor(malformed), false, `${field} is required`);
}

for (const [field, value] of [
  ["name", 1],
  ["hp", "20"],
  ["maxHp", Number.NaN],
  ["mp", null],
  ["maxMp", Infinity],
  ["status", "confused"]
]) {
  assert.equal(isCombatPlayerActor({ ...actor, [field]: value }), false, `${field} rejects malformed value`);
}

const dead = { ...actor, status: "dead" };
assert.equal(isCombatPlayerActor(dead), true);
assert.equal(isCombatPlayerActionableActor(dead), false);
assert.equal(isCombatPlayerParty([actor, dead]), true);
assert.equal(isCombatPlayerParty([actor, { ...actor, hp: "20" }]), false);

const previousParty = state.party;
const previousGameState = state.gameState;
const previousCombatState = state.combatState;
const previousTransitioning = state.transitioning;
const previousMenuContext = { ...menuContext };
try {
  state.party = [actor];
  state.gameState = "combat";
  state.combatState = { phase: "choose_actions", monsters: [{ name: "Biter" }] };
  state.transitioning = false;
  Object.assign(menuContext, {
    type: "combat_target",
    targetType: "enemy",
    actorIdx: 0,
    spellName: "",
    prevGameState: "combat"
  });

  let calls = 0;
  const callback = bindCombatCallback(() => { calls++; }, {
    type: "combat_target",
    targetType: "enemy",
    actorIdx: 0,
    spellName: "",
    actor,
    actorName: actor.name
  });
  callback(0);
  assert.equal(calls, 1);

  state.party[0] = { ...actor };
  callback(0);
  assert.equal(calls, 1, "stale callback must preserve actor identity guard");
} finally {
  state.party = previousParty;
  state.gameState = previousGameState;
  state.combatState = previousCombatState;
  state.transitioning = previousTransitioning;
  Object.keys(menuContext).forEach(key => delete menuContext[key]);
  Object.assign(menuContext, previousMenuContext);
}

console.log("[PASS] canonical CombatPlayerActor required fields, runtime guards, and callback identity");
