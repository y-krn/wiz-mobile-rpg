import assert from "node:assert/strict";
import { buildCombatDecisionPayload } from "../../../src/telemetry_combat_decision.ts";

const normalizeEnemyId = name => name === "Dragon A" ? "Dragon" : "other";
const base = {
  runId: "run-1",
  combatId: "combat-1",
  actorIdx: 0,
  targetIdx: 0,
  partySize: 3,
  monsters: [{ name: "Dragon A" }, { name: "Goblin" }],
  context: { floor: 2 },
  spellId: null,
  spellTarget: null,
  itemId: null,
  itemCategory: "other",
  normalizeEnemyId
};

const attack = buildCombatDecisionPayload({ ...base, action: "attack", targetIdx: 1 });
assert.equal(attack.targetIndex, 1);
assert.equal(attack.targetEnemyId, "other");

for (const spellTarget of ["single_enemy", "all_enemies"]) {
  const payload = buildCombatDecisionPayload({
    ...base,
    action: "spell",
    spellTarget,
    targetIdx: 0
  });
  assert.equal(payload.targetIndex, 0);
  assert.equal(payload.targetEnemyId, "Dragon");
}

const rawIndexLookup = buildCombatDecisionPayload({
  ...base,
  action: "attack",
  targetIdx: 8,
  monsters: [...base.monsters, ...Array(6).fill({ name: "Dragon A" }), { name: "Dragon A" }]
});
assert.equal(rawIndexLookup.targetIndex, null);
assert.equal(rawIndexLookup.targetEnemyId, "Dragon");

for (const [action, spellTarget, targetIdx, expectedIndex] of [
  ["item", null, 2, 2],
  ["spell", "single_ally", 2, 2],
  ["spell", "all_allies", -1, -1],
  ["spell", "all_enemies", -1, -1]
]) {
  const payload = buildCombatDecisionPayload({
    ...base,
    action,
    spellTarget,
    targetIdx
  });
  assert.equal(payload.targetIndex, expectedIndex);
  assert.equal(payload.targetEnemyId, null);
}

for (const action of ["defend", "flee", "unrecognized"]) {
  const payload = buildCombatDecisionPayload({ ...base, action, targetIdx: 0 });
  assert.equal(payload.targetIndex, null);
  assert.equal(payload.targetEnemyId, null);
}

const properties = buildCombatDecisionPayload({
  ...base,
  action: "fight",
  context: { runId: "context-run", combatId: "context-combat", action: "bad", marker: true }
});
assert.equal(properties.runId, "context-run");
assert.equal(properties.combatId, "context-combat");
assert.equal(properties.action, "attack");
assert.deepEqual(Object.keys(properties), [
  "runId", "combatId", "action", "marker", "actorIndex", "targetIndex",
  "targetEnemyId", "spellId", "itemId", "itemCategory"
]);

console.log("[PASS] TypeScript combat decision owner preserves targeting and payload semantics");
