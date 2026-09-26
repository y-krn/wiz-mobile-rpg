import assert from "node:assert/strict";
import {
  getRoundEnemyActions as getFromFacade,
  recordRoundEnemyAction as recordFromFacade,
  resetRoundEnemyActions as resetFromFacade
} from "../../../src/combat_ui/round_enemy_actions.js";
import {
  getRoundEnemyActions,
  recordRoundEnemyAction,
  resetRoundEnemyActions
} from "../../../src/combat_ui/round_enemy_actions.ts";

const owner = {};
const otherOwner = {};

try {
  assert.deepEqual(
    [resetFromFacade, recordFromFacade, getFromFacade],
    [resetRoundEnemyActions, recordRoundEnemyAction, getRoundEnemyActions]
  );
  assert.deepEqual(Object.keys(await import("../../../src/combat_ui/round_enemy_actions.js")).sort(), [
    "getRoundEnemyActions", "recordRoundEnemyAction", "resetRoundEnemyActions"
  ]);

  assert.equal(resetFromFacade(owner), undefined);
  assert.equal(recordRoundEnemyAction(" first ", owner), undefined);
  recordFromFacade("first", owner);
  recordFromFacade(" second ", owner);
  assert.deepEqual(getFromFacade(owner), ["first", "first", "second"]);

  const copy = getRoundEnemyActions(owner);
  assert.notEqual(copy, getFromFacade(owner));
  copy.push("caller mutation");
  copy.length = 0;
  assert.deepEqual(getFromFacade(owner), ["first", "first", "second"]);

  resetRoundEnemyActions(owner);
  assert.deepEqual(getFromFacade(owner), []);
  recordFromFacade("old combat", owner);
  recordRoundEnemyAction("new combat", otherOwner);
  assert.deepEqual(getFromFacade(owner), []);
  assert.deepEqual(getRoundEnemyActions(otherOwner), ["new combat"]);

  for (const resetOwner of [undefined, null, false, 0, ""]) {
    resetRoundEnemyActions(resetOwner);
    assert.deepEqual(getRoundEnemyActions(resetOwner), []);
  }
  resetRoundEnemyActions(owner);
  assert.equal(recordFromFacade("not stored", false), undefined);
  assert.equal(recordFromFacade("not stored", 0), undefined);
  assert.deepEqual(getRoundEnemyActions(owner), []);
  resetRoundEnemyActions();
  assert.deepEqual(getRoundEnemyActions(null), []);

  const convertible = [
    [null, ""], [undefined, ""], ["", ""], ["  \t", ""],
    [0, "0"], [false, "false"], [42, "42"], [Symbol("action"), "Symbol(action)"],
    [{ toString: () => " object " }, "object"]
  ];
  resetRoundEnemyActions(owner);
  for (const [message, expected] of convertible) {
    recordFromFacade(message, owner);
    if (expected) assert.equal(getRoundEnemyActions(owner).at(-1), expected);
  }

  resetRoundEnemyActions(owner);
  assert.throws(() => recordRoundEnemyAction({ toString: () => { throw new Error("convert"); } }, false), /convert/);
  assert.deepEqual(getRoundEnemyActions(owner), []);
  assert.throws(() => recordRoundEnemyAction({ toString: null }, owner), TypeError);
  assert.deepEqual(getRoundEnemyActions(owner), []);
  const throwingProxy = new Proxy({}, { get() { throw new Error("proxy conversion"); } });
  assert.throws(() => recordRoundEnemyAction(throwingProxy, owner), /proxy conversion/);
  assert.deepEqual(getRoundEnemyActions(owner), []);

  resetRoundEnemyActions(owner);
  recordRoundEnemyAction("kept", owner);
  assert.throws(() => recordFromFacade({ toString: () => { throw new Error("convert"); } }, otherOwner), /convert/);
  assert.deepEqual(getRoundEnemyActions(owner), ["kept"]);
  assert.deepEqual(getRoundEnemyActions(otherOwner), []);
} finally {
  resetRoundEnemyActions();
}

console.log("[PASS] round enemy actions preserve shared state and legacy runtime semantics");
