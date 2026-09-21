import assert from "node:assert/strict";

const {
  isNormalizedDeathHistory,
  isNormalizedDeathHistoryEntry,
  isNormalizedRunDeathLog,
  isNormalizedRunDeathLogs,
  normalizeDeathHistory,
  normalizeDeathHistoryEntry,
  normalizeRunDeathLogs,
  summarizeDeathLogs
} = await import("../../../src/state/death_logs.ts");
const { createDefaultCurrentRun } = await import("../../../src/state/initial_state.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");

const runLogs = normalizeRunDeathLogs([
  {
    charName: 7,
    cause: null,
    floor: 1.5,
    turn: -1,
    type: "historical-future",
    source: 7,
    extra: "drop"
  },
  null,
  { charName: "未分類", cause: "過去の死因", floor: 3, turn: null },
  { charName: "重複", cause: "同じ記録", floor: 3, turn: 2 },
  { charName: "重複", cause: "同じ記録", floor: 3, turn: 2 }
]);

assert.deepEqual(runLogs, [
  { charName: "", cause: "", floor: 1, turn: null, type: "historical-future" },
  { charName: "未分類", cause: "過去の死因", floor: 3, turn: null },
  { charName: "重複", cause: "同じ記録", floor: 3, turn: 2 },
  { charName: "重複", cause: "同じ記録", floor: 3, turn: 2 }
]);
assert.equal(isNormalizedRunDeathLogs(runLogs), true);
assert.equal(isNormalizedRunDeathLog({ ...runLogs[0], extra: true }), false);
assert.deepEqual(normalizeRunDeathLogs("invalid"), []);

const requiredRun = createDefaultCurrentRun();
assert.equal(isNormalizedCurrentRun(requiredRun), true);
const missingRunDeathLogs = { ...requiredRun };
delete missingRunDeathLogs.deathLogs;
assert.equal(isNormalizedCurrentRun(missingRunDeathLogs), false);
assert.equal(isNormalizedCurrentRun({ ...requiredRun, deathLogs: [{ charName: "raw" }] }), false);

const historicalEntry = normalizeDeathHistoryEntry({
  endedAt: 2.5,
  floor: 0,
  x: 1.25,
  y: -2,
  cause: "過去の死因",
  type: "historical-future",
  source: "過去の出典",
  character: { level: 3, extra: "drop" },
  lostItems: ["牙x1", 7, "", "牙x1"],
  deepestFloor: -1,
  kills: -2,
  chestsOpened: 1.5,
  extra: "drop"
});
assert.deepEqual(historicalEntry, {
  id: "",
  endedAt: 0,
  floor: 1,
  x: 0,
  y: -2,
  seed: "",
  cause: "過去の死因",
  type: "historical-future",
  source: "過去の出典",
  character: { name: "", level: 3 },
  lostItems: ["牙x1", "", "牙x1"],
  deepestFloor: 1,
  kills: 0,
  chestsOpened: 0
});
assert.equal(isNormalizedDeathHistoryEntry(historicalEntry), true);
assert.equal(isNormalizedDeathHistoryEntry({ ...historicalEntry, extra: true }), false);

const normalizedHistory = normalizeDeathHistory([
  historicalEntry,
  null,
  { id: "complete", endedAt: 9, floor: 2, x: 0, y: 1, seed: "S", cause: "C", type: null,
    source: null, character: null, lostItems: [], deepestFloor: 2, kills: 1, chestsOpened: 2 }
]);
assert.equal(normalizedHistory.length, 2);
assert.equal(isNormalizedDeathHistory(normalizedHistory), true);
assert.deepEqual(
  normalizeDeathHistory(JSON.parse(JSON.stringify(normalizedHistory))),
  normalizedHistory
);
assert.deepEqual(normalizeDeathHistory(normalizedHistory), normalizedHistory);
assert.equal(normalizeDeathHistory(new Array(21).fill(normalizedHistory[1])).length, 21);

assert.deepEqual(summarizeDeathLogs([
  { floor: 5, type: "historical-future", source: "未知 A", cause: "未知死因" },
  { floor: 5, type: "historical-future", source: "罠 B", cause: "別死因" },
  { floor: 5, type: "historical-future", source: "未知 A", cause: "未知死因" },
  { floor: 1, cause: "未分類" }
]), [
  { floor: 5, type: "historical-future", source: "未知", cause: "未知死因", count: 2 },
  { floor: 5, type: "historical-future", source: "罠", cause: "別死因", count: 1 }
]);

console.log("[PASS] #1532 canonical run/global death-log contracts, historical compatibility, and summary semantics verified.");
