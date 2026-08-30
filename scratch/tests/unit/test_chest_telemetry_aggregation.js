import assert from "node:assert/strict";
import {
  aggregateChestTelemetry,
  buildReport,
  parseTelemetryDocument,
  renderMarkdown,
  wilsonInterval
} from "../../measurements/issue816_chest_telemetry.js";

const records = [
  { uuid: "a1", event: "chest_action", properties: {
    runId: "run-ordinary", chestSource: "ordinary", fromDrop: false,
    floor: 5, trap: "teleporter", action: "smash", rewardCategories: ["weapon", "usable"],
    hpRate: 0.18, hasTrapKit: false
  } },
  { uuid: "a2", event: "chest_action", properties: {
    runId: "run-ordinary", chestSource: "ordinary", floor: 5,
    trap: "none", action: "open", rewardCategories: ["usable"], hpRate: 0.70, hasTrapKit: true
  } },
  { uuid: "a3", event: "chest_action", properties: {
    runId: "run-drop", chestSource: "fromDrop", fromDrop: true,
    floor: 3, trap: "gas bomb", action: "smash", rewardCategories: ["armor"],
    hpRate: 0.33, hasTrapKit: false
  } },
  { uuid: "r1", event: "chest_smash_result", properties: {
    runId: "run-ordinary", chestSource: "ordinary", floor: 5,
    trapFired: true, partyDied: false, lostRewardCount: 1,
    lostRewardCategories: ["weapon"], remainingRewardCount: 1,
    awardedRewardCount: 1, unawardedRewardCount: 0
  } },
  { uuid: "r2", event: "chest_smash_result", properties: {
    runId: "run-drop", chestSource: "fromDrop", floor: 3,
    trapFired: true, partyDied: true, lostRewardCount: 0,
    lostRewardCategories: [], remainingRewardCount: 0,
    awardedRewardCount: 0, unawardedRewardCount: 1
  } },
  { uuid: "e1", event: "run_end", properties: { runId: "run-drop", outcome: "retreat" } },
  { uuid: "e1", event: "run_end", properties: { runId: "run-drop", outcome: "retreat" } },
  { uuid: "ignored", event: "combat_end", properties: { runId: "run-drop" } }
];

const aggregate = aggregateChestTelemetry(records);
assert.equal(aggregate.counters.duplicateRecords, 1);
assert.equal(aggregate.counters.ignoredRecords, 1);
assert.equal(aggregate.sources.ordinary.choices, 2);
assert.equal(aggregate.sources.fromDrop.choices, 1);
assert.equal(aggregate.sources.ordinary.actions.smash, 1);
assert.equal(aggregate.sources.fromDrop.actions.smash, 1);
assert.deepEqual(aggregate.sources.ordinary.smashRate, {
  successes: 1, trials: 2, estimate: 0.5, ci95: wilsonInterval(1, 2), confidence: "low-n"
});
assert.equal(aggregate.sources.ordinary.smashResults.rewardLossRate.successes, 1);
assert.equal(aggregate.sources.fromDrop.smashResults.partyDeathRate.successes, 1);
assert.equal(aggregate.sources.fromDrop.smashRunOutcomes.retreat.successes, 1);
assert.equal(aggregate.sources.ordinary.dimensions.rewardCategory.weapon.smash, 1);
assert.equal(aggregate.sources.fromDrop.dimensions.rewardCategory.armor.smash, 1);
assert.equal(aggregate.sources.ordinary.dimensions.hpBand["0-20%"].smash, 1);
assert.equal(aggregate.sources.fromDrop.dimensions.hasTrapKit.false.smash, 1);

const jsonl = records.slice(0, 2).map(record => JSON.stringify(record)).join("\n");
assert.equal(parseTelemetryDocument(jsonl).length, 2);
const report = buildReport({
  records: [],
  provenance: { productionSourceSha: "a".repeat(40), aggregationRunnerSha: "b".repeat(40) },
  inputPath: "fixture.jsonl"
});
assert.equal(report.status.liveTelemetry, "unexecuted");
assert.equal(report.classification.productionTelemetry, "unexecuted");
assert.match(renderMarkdown(report), /needs-more-measurement/);
console.log("[PASS] chest telemetry aggregation keeps ordinary and fromDrop separate");
