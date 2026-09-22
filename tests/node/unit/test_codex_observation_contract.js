import { strict as assert } from "node:assert";
import {
  CODEX_EQUIPMENT_RARITIES,
  CODEX_INSIGHT_LIMIT,
  isNormalizedCodexInsightRecord,
  isNormalizedCodexPayload,
  isNormalizedEquipmentCodexRecord,
  isNormalizedMonsterCodexRecord,
  normalizeCodexInsights,
  normalizeEquipmentCodexRecord,
  normalizeMonsterCodex,
  recordMonsterAction,
  recordMonsterCondition
} from "../../../src/state/codex_state.js";

const insight = { id: "historical", count: 2, firstFloor: 1, lastFloor: 3 };
assert.equal(isNormalizedCodexInsightRecord(insight), true);
assert.equal(isNormalizedCodexInsightRecord({ ...insight, extra: true }), false);
assert.deepEqual(
  normalizeCodexInsights([{ ...insight, count: 1 }, { ...insight, count: 4 }, { id: 7 }]),
  [{ ...insight, count: 4 }]
);
assert.equal(CODEX_INSIGHT_LIMIT, 20);

const legacyMonster = { encountered: 2, killed: 1, firstKilled: true };
assert.equal(isNormalizedMonsterCodexRecord(legacyMonster), true);
assert.equal(isNormalizedMonsterCodexRecord({ ...legacyMonster, extra: true }), false);
assert.deepEqual(normalizeMonsterCodex({ "スライムの分裂体1": legacyMonster, スライム: legacyMonster }), {
  スライム: legacyMonster
});

const equipment = normalizeEquipmentCodexRecord({
  discovered: true,
  foundCount: 1,
  highestRarity: "rare",
  bestBonus: 1.5,
  affixesSeen: ["atk", "atk"],
  foundFloors: { "2": 1 },
  tagObservations: { blood: 2 },
  firstFoundAt: "B2F",
  lastFoundSeed: "seed",
  extra: true
});
assert.ok(equipment);
assert.equal(isNormalizedEquipmentCodexRecord(equipment), true);
assert.equal(Object.hasOwn(equipment, "extra"), false);
assert.equal(equipment.bestBonus, 1.5);
assert.deepEqual(CODEX_EQUIPMENT_RARITIES, ["common", "magic", "rare", "epic", "legendary"]);

const stateLike = {
  floor: 2,
  codex: { monsters: {}, equipment: {}, insights: [], events: { unchanged: true }, stats: { totalRuns: 4 } }
};
const measurement = { measurementCurrentEnemyAction: { actionNames: [], conditions: [] } };
recordMonsterAction({ name: "スライム" }, "通常攻撃", stateLike, measurement);
recordMonsterAction({ name: "スライム" }, "通常攻撃", stateLike, measurement);
recordMonsterCondition({ name: "スライム" }, "毒を受けた", stateLike, measurement);
assert.deepEqual(stateLike.codex.monsters.スライム.observedActions, ["通常攻撃"]);
assert.deepEqual(measurement.measurementCurrentEnemyAction.actionNames, ["通常攻撃", "通常攻撃"]);
assert.deepEqual(measurement.measurementCurrentEnemyAction.conditions, ["毒を受けた"]);

assert.equal(isNormalizedCodexPayload({
  monsters: {}, equipment: {}, insights: [], events: { opaque: true }, stats: { totalRuns: 4 }
}), true);
assert.equal(isNormalizedCodexPayload({ monsters: {}, equipment: [], insights: [], events: {}, stats: {} }), false);

console.log("[PASS] Codex observation contracts preserve legacy shapes and canonical boundaries.");
