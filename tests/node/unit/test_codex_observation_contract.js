import { strict as assert } from "node:assert";
import {
  CODEX_EQUIPMENT_RARITIES,
  CODEX_INSIGHT_LIMIT,
  createDefaultCodexEvents,
  createDefaultCodexStats,
  isNormalizedCodexEvents,
  isNormalizedCodexInsightRecord,
  isNormalizedCodexPayload,
  isNormalizedEquipmentCodexRecord,
  isNormalizedMonsterCodexRecord,
  isNormalizedCodexStats,
  normalizeCodexInsights,
  normalizeCodexEvents,
  normalizeCodexPayload,
  normalizeCodexStats,
  normalizeEquipmentCodexRecord,
  normalizeMonsterCodex,
  recordMonsterAction,
  recordMonsterCondition
} from "../../../src/state/codex_state.js";
import { createDefaultCodex } from "../../../src/state/initial_state.js";
import { normalizeSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";

assert.deepEqual(createDefaultCodex().stats, createDefaultCodexStats());
assert.deepEqual(createDefaultCodex().events, createDefaultCodexEvents());
assert.equal(isNormalizedCodexPayload(createDefaultCodex()), true);
assert.equal(isNormalizedCodexStats(createDefaultCodexStats()), true);
assert.deepEqual(Object.keys(createDefaultCodexStats()), [
  "totalRuns", "totalDeaths", "deepestFloor", "totalKills", "totalChests"
]);
assert.deepEqual(Object.keys(createDefaultCodexEvents().traps).sort(), [
  "flash bomb", "gas bomb", "pitfall", "poison needle", "teleporter"
]);
assert.deepEqual(Object.keys(createDefaultCodexEvents().facilities).sort(), [
  "chest", "merchant", "spring"
]);
assert.deepEqual(normalizeCodexStats(null), createDefaultCodexStats());
assert.deepEqual(normalizeCodexEvents(null), createDefaultCodexEvents());
assert.deepEqual(normalizeCodexStats({
  totalRuns: -1,
  totalDeaths: 1.5,
  deepestFloor: Number.POSITIVE_INFINITY,
  totalKills: 2,
  totalChests: "3",
  extra: true
}), {
  totalRuns: 0,
  totalDeaths: 0,
  deepestFloor: 1,
  totalKills: 2,
  totalChests: 0
});
assert.equal(isNormalizedCodexStats({ ...createDefaultCodexStats(), extra: true }), false);
assert.equal(isNormalizedCodexStats({ ...createDefaultCodexStats(), deepestFloor: 0 }), false);

const malformedEvents = normalizeCodexEvents({
  traps: {
    "poison needle": { triggered: -1, disarmed: 1.5, firstFloor: 2, extra: true },
    unknown: { triggered: 99 }
  },
  facilities: {
    spring: { found: 1, used: Number.NaN, extra: true },
    merchant: { found: 2, purchased: 3 },
    unknown: { found: 99 }
  },
  omens: { retired: true },
  extra: true
});
assert.deepEqual(malformedEvents.traps["poison needle"], { triggered: 0, disarmed: 0, firstFloor: 2 });
assert.deepEqual(malformedEvents.facilities.spring, { found: 1, used: 0 });
assert.equal(Object.hasOwn(malformedEvents.traps, "unknown"), false);
assert.equal(Object.hasOwn(malformedEvents.facilities, "unknown"), false);
assert.equal(isNormalizedCodexEvents(malformedEvents), true);

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
const fractionalMonster = normalizeMonsterCodex({ スライム: {
  ...legacyMonster,
  encounterFloors: { "1": 0.5, "2": 1.5 }
} });
assert.deepEqual(fractionalMonster.スライム.encounterFloors, { "2": 1 });
assert.equal(isNormalizedMonsterCodexRecord(fractionalMonster.スライム), true);

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
const fractionalEquipment = normalizeEquipmentCodexRecord({
  ...equipment,
  foundFloors: { "1": 0.5, "2": 1.5 },
  tagObservations: { blood: 0.5, spirit: 1.5 }
});
assert.deepEqual(fractionalEquipment.foundFloors, { "2": 1 });
assert.deepEqual(fractionalEquipment.tagObservations, { spirit: 1 });
assert.equal(isNormalizedEquipmentCodexRecord(fractionalEquipment), true);

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
}), false);
assert.equal(isNormalizedCodexPayload({ monsters: {}, equipment: [], insights: [], events: {}, stats: {} }), false);

const payloadWithExtras = normalizeCodexPayload({
  monsters: {}, equipment: {}, insights: [],
  legacyCodexField: { preserved: true },
  events: { omens: { retired: true } },
  stats: { deepestFloor: 3 }
});
assert.ok(payloadWithExtras);
assert.equal(isNormalizedCodexPayload(payloadWithExtras), true);
assert.deepEqual(payloadWithExtras.legacyCodexField, { preserved: true });
assert.equal(Object.hasOwn(payloadWithExtras.events, "omens"), false);
assert.deepEqual(payloadWithExtras.stats, { ...createDefaultCodexStats(), deepestFloor: 3 });
assert.deepEqual(
  normalizeCodexPayload(JSON.parse(JSON.stringify(payloadWithExtras))),
  payloadWithExtras
);

const legacySave = normalizeSavePayload({
  version: SAVE_VERSION,
  floor: 2,
  codex: {
    monsters: {},
    equipment: {},
    insights: [],
    stats: { deepestFloor: 3 },
    legacyCodexField: "preserve-me"
  }
});
assert.equal(isNormalizedCodexPayload(legacySave.codex), true);
assert.deepEqual(legacySave.codex.stats, { ...createDefaultCodexStats(), deepestFloor: 3 });
assert.deepEqual(legacySave.codex.events, createDefaultCodexEvents());
assert.equal(legacySave.codex.legacyCodexField, "preserve-me");
assert.deepEqual(legacySave.dungeonMemory.visitedFloors, [1, 2, 3]);

console.log("[PASS] Codex observation contracts preserve legacy shapes and canonical boundaries.");
