import assert from "node:assert/strict";

const element = () => ({
  style: {},
  dataset: {},
  appendChild: () => element(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  innerHTML: "",
  textContent: "",
  className: ""
});

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  getElementById: () => element(),
  querySelector: () => element(),
  querySelectorAll: () => [],
  createElement: () => element(),
  body: element()
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
Object.defineProperty(global, "navigator", { value: { userAgent: "node" }, configurable: true });

const { FEATS, FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { MATERIAL_TYPES } = await import("../../../src/data/materials.js");
const {
  addRunToFeatCounters,
  collectFeatAnnouncements,
  formatFeatProgress,
  formatFeatReward,
  getFeatProgress,
  getLiveFeatCounters,
  getNearestFeats,
  listFeats,
  recordRoleDefeats,
  settleRunFeats
} = await import("../../../src/systems/feats.js");
const {
  createDefaultFeatsState,
  deriveFeatCountersFromRecords,
  isNormalizedFeatsState,
  isNormalizedRunFeatResult,
  normalizeFeatsState,
  normalizeRunFeatResult
} = await import("../../../src/state/feats_state.js");
const { finalizeRunRecords } = await import("../../../src/state/records_state.js");
const { state, createDefaultCurrentRun, createStartingKitCharacter, initNewGame } =
  await import("../../../src/state.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { getFeatResultRows } = await import("../../../src/ui/result_screen.js");

// --- The catalog --------------------------------------------------------------

assert.equal(new Set(FEATS.map(feat => feat.id)).size, FEATS.length, "feat ids are unique");
FEATS.forEach(feat => {
  assert.ok(feat.name && feat.condition, `${feat.id} states its name and condition`);
  assert.ok(feat.metric.target > 0, `${feat.id} has a target`);
  const materials = Object.entries(feat.reward.materials);
  assert.ok(materials.length > 0 || feat.reward.unlock, `${feat.id} pays a reward`);
  materials.forEach(([name, quantity]) => {
    assert.ok(MATERIAL_TYPES.includes(name), `${feat.id} pays an existing material`);
    assert.ok(Number.isInteger(quantity) && quantity > 0);
  });
  assert.equal(FEAT_BY_ID.get(feat.id), feat);
});
console.log("[PASS] every feat states a visible condition, a target, and a reward");

// --- Counters ----------------------------------------------------------------

const fresh = createDefaultFeatsState();
assert.equal(isNormalizedFeatsState(fresh), true);

const run = {
  startFloor: 1,
  deepestFloor: 6,
  defeatedMilestones: [5],
  elitesKilled: 2,
  defeatsByRole: { disruptor: 3, amplifier: 1, tank: 9 },
  chestsOpened: 4,
  trapsTriggered: 0,
  startingKit: "scout"
};
const afterDeath = addRunToFeatCounters(fresh.counters, run, "death");
assert.deepEqual(afterDeath, {
  bestDepth: 6,
  guardianDepth: 5,
  elitesKilled: 2,
  disruptorsKilled: 3,
  amplifiersKilled: 1,
  chestsOpened: 4,
  safeReturns: 0,
  traplessDepth: 6,
  foremanRescued: 0,
  priestRescued: 0,
  weaverRescued: 0,
  scribeRescued: 0,
  guidePagesDecoded: 0,
  kitDepths: { vanguard: 0, scout: 6, devotion: 0, arcana: 0 }
}, "a run that ends in death still counts what happened");
assert.equal(fresh.counters.bestDepth, 0, "the stored counters are not mutated");
assert.equal(addRunToFeatCounters(afterDeath, run, "retreat").safeReturns, 1);
assert.equal(addRunToFeatCounters(afterDeath, run, "abandon").safeReturns, 0);
assert.equal(addRunToFeatCounters(afterDeath, run, "retreat").elitesKilled, 4, "cumulative counts add up across runs");
assert.equal(addRunToFeatCounters(afterDeath, { ...run, deepestFloor: 3 }, "death").bestDepth, 6, "bests never go down");

const trapped = addRunToFeatCounters(fresh.counters, { ...run, trapsTriggered: 1 }, "death");
assert.equal(trapped.traplessDepth, 0, "a triggered trap voids the trapless depth");
const deepStart = addRunToFeatCounters(fresh.counters, { ...run, startFloor: 5, deepestFloor: 5 }, "death");
assert.equal(deepStart.traplessDepth, 0, "a milestone start does not hand out the trapless depth");
assert.equal(deepStart.kitDepths.scout, 0, "nor the kit depth");
assert.equal(deepStart.bestDepth, 5);
console.log("[PASS] counters accumulate across outcomes and only B1F descents count for trapless and kit depths");

const roleRun = { defeatsByRole: {} };
recordRoleDefeats(roleRun, [
  { role: "disruptor" }, { role: "disruptor", fled: true }, { role: "disruptor", hasSplit: true },
  { role: "amplifier" }, { name: "no role" }
]);
assert.deepEqual(roleRun.defeatsByRole, { disruptor: 1, amplifier: 1 }, "fled, split, and role-less enemies are not counted");
console.log("[PASS] role defeats exclude fled and split enemies");

// --- Progress, offering, and nearest -----------------------------------------

const depth5 = FEAT_BY_ID.get("depth_5");
assert.deepEqual(getFeatProgress(depth5, { bestDepth: 3 }), { current: 3, target: 5, ratio: 0.6, done: false });
assert.deepEqual(getFeatProgress(depth5, { bestDepth: 9 }), { current: 5, target: 5, ratio: 1, done: true });
assert.equal(formatFeatProgress(depth5, { current: 3, target: 5 }), "B3F / B5F");
assert.equal(formatFeatProgress(depth5, { current: 0, target: 5 }), "未到達 / B5F");
assert.equal(formatFeatProgress(FEAT_BY_ID.get("elite_5"), { current: 2, target: 5 }), "2 / 5");
assert.equal(formatFeatReward(depth5), "鉄片×4");
const kits = FEAT_BY_ID.get("kits_4");
assert.equal(getFeatProgress(kits, { kitDepths: { vanguard: 3, scout: 2, devotion: 7, arcana: 0 } }).current, 2);

const freshList = listFeats(fresh);
assert.equal(freshList.filter(entry => entry.offered && entry.feat.chain === "depth").length, 1,
  "a chain offers one feat at a time");
assert.equal(freshList.find(entry => entry.feat.id === "depth_5").offered, true);
assert.equal(freshList.find(entry => entry.feat.id === "depth_10").offered, false);

assert.deepEqual(getNearestFeats(fresh, null, 3).map(entry => entry.feat.id), ["depth_5", "foreman_rescue", "guardian_5"],
  "with no progress, the authored order leads");
const partial = { ...fresh, counters: { ...fresh.counters, bestDepth: 4, elitesKilled: 4, chestsOpened: 3 } };
assert.deepEqual(getNearestFeats(partial, null, 3).map(entry => entry.feat.id), ["depth_5", "elite_5", "chest_30"],
  "the closest feats come first, one per chain");
// A condition met in the running run moves the chain on before it is settled.
assert.equal(
  getNearestFeats(fresh, getLiveFeatCounters(fresh, { deepestFloor: 6, startFloor: 1 }), 5)
    .some(entry => entry.feat.id === "depth_10"),
  true
);
assert.deepEqual(getLiveFeatCounters(fresh, { deepestFloor: 6, returnReason: "gameover" }), fresh.counters,
  "a settled run is not counted twice");
console.log("[PASS] nearest feats are ordered by progress with one per chain");

// --- Announcements -------------------------------------------------------------

const liveRun = { startFloor: 1, deepestFloor: 5, trapsTriggered: 0, startingKit: "vanguard", featsAnnounced: [] };
assert.deepEqual(collectFeatAnnouncements(fresh, liveRun).map(feat => feat.id), ["depth_5", "trapless_5"]);
assert.deepEqual(liveRun.featsAnnounced, ["depth_5", "trapless_5"]);
assert.deepEqual(collectFeatAnnouncements(fresh, liveRun), [], "a feat is announced once per run");
console.log("[PASS] feats met during a run are announced once");

// --- Settlement ---------------------------------------------------------------

const settled = settleRunFeats(fresh, run, "retreat", 7);
assert.deepEqual(settled.result.completed, ["depth_5", "guardian_5", "trapless_5"]);
assert.deepEqual(settled.result.rewards, { "鉄片": 8, "呪布": 4 }, "rewards of the feats achieved together are summed");
assert.deepEqual(settled.feats.completed.depth_5, { runNumber: 7 });
assert.equal(settled.result.progress.length, 3);
assert.equal(settled.result.progress.every(entry => !settled.result.completed.includes(entry.id)), true);
const depth10Progress = settled.result.progress.find(entry => entry.id === "depth_10");
assert.deepEqual(depth10Progress, { id: "depth_10", before: 0, after: 6, target: 10 });
assert.equal(isNormalizedRunFeatResult(settled.result), true);
assert.equal(isNormalizedFeatsState(settled.feats), true);
assert.deepEqual(fresh.completed, {}, "settlement does not mutate the previous state");
assert.deepEqual(settleRunFeats(fresh, run, "retreat", 7, 10).result.rewards, { "鉄片": 10, "呪布": 5 },
  "the 任務巧者 support raises each feat reward, rounded up");

const again = settleRunFeats(settled.feats, run, "retreat", 8);
assert.deepEqual(again.result.completed, [], "an achieved feat is not achieved again");
assert.deepEqual(again.result.rewards, {});
assert.deepEqual(again.feats.completed.depth_5, { runNumber: 7 });
assert.equal(again.feats.counters.elitesKilled, 4);
console.log("[PASS] settlement achieves each feat once and sums the one-time rewards");

assert.deepEqual(getFeatResultRows(settled.result).slice(0, 1), [
  { id: "depth_5", status: "達成", completed: true, name: "坑道を抜ける", detail: "報酬 鉄片×4" }
]);
const eliteRow = getFeatResultRows({
  completed: [], rewards: {}, progress: [{ id: "elite_5", before: 1, after: 3, target: 5 }]
})[0];
assert.deepEqual(eliteRow, { id: "elite_5", status: "前進", completed: false, name: "強敵狩り", detail: "3 / 5（今回 +2）" });
assert.deepEqual(getFeatResultRows(null), []);
console.log("[PASS] result rows are built from the stored ids and numbers");

// --- Existing saves -----------------------------------------------------------

assert.deepEqual(deriveFeatCountersFromRecords({
  deepestFloor: 12, unlockedMilestones: [5, 10], totalChests: 41, safeReturns: 3
}), {
  ...createDefaultFeatsState().counters,
  bestDepth: 12, guardianDepth: 10, chestsOpened: 41, safeReturns: 3
});
const legacy = normalizeFeatsState(undefined, { deepestFloor: 12, unlockedMilestones: [5, 10], totalChests: 41 });
assert.deepEqual(legacy.completed, {}, "nothing is marked achieved until the next run is settled");
const legacySettled = settleRunFeats(legacy, { startFloor: 1, deepestFloor: 1 }, "death", 30);
assert.deepEqual(legacySettled.result.completed, ["depth_5", "depth_10", "guardian_5", "guardian_10", "chest_30"],
  "progress the old records prove is achieved, and rewarded once, at the next settlement");
assert.deepEqual(normalizeFeatsState({ counters: { bestDepth: "7", kitDepths: { scout: 2.9, ghost: 4 } }, completed: { depth_5: {} } }), {
  counters: { ...createDefaultFeatsState().counters, bestDepth: 7, kitDepths: { vanguard: 0, scout: 2, devotion: 0, arcana: 0 } },
  completed: { depth_5: { runNumber: 0 } }
});
assert.equal(normalizeRunFeatResult({ completed: [], progress: [] }), null);
console.log("[PASS] existing saves seed the counters from their records");

// --- End of run, state, and save round trip -----------------------------------

initNewGame();
state.party = [createStartingKitCharacter("vanguard")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.startFloor = 1;
state.currentRun.startingKit = "vanguard";
state.currentRun.deepestFloor = 5;
state.currentRun.elitesKilled = 1;
state.currentRun.materials = { "獣の牙": 10 };
state.floor = 5;
state.gameState = "explore";
state.metaMaterials = { "鉄片": 1 };
triggerRunResult("gameover");
assert.deepEqual(state.currentRun.featResult.completed, ["depth_5", "trapless_5"]);
assert.equal(state.metaMaterials["鉄片"], 5, "the feat reward is paid in full on a death");
assert.equal(state.metaMaterials["呪布"], 4);
assert.equal(state.metaMaterials["獣の牙"], 3, "the run's own materials still bank at the death rate");
assert.equal(state.feats.counters.elitesKilled, 1);
assert.deepEqual(Object.keys(state.feats.completed), ["depth_5", "trapless_5"]);

const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.feats, state.feats);
assert.deepEqual(reloaded.currentRun.featResult, state.currentRun.featResult);
const legacySave = JSON.parse(JSON.stringify(createSavePayload()));
delete legacySave.feats;
delete legacySave.currentRun.featResult;
delete legacySave.currentRun.featsAnnounced;
legacySave.currentRun.quests = [{ id: "reach_milestone:1:5", templateId: "reach_milestone", name: "次の深みへ" }];
const migrated = normalizeSavePayload(legacySave);
assert.equal(migrated.feats.counters.bestDepth, 5, "a save without feats seeds the counters from its records");
assert.deepEqual(migrated.feats.completed, {});
assert.deepEqual(migrated.currentRun.quests, [], "run quests saved before the change are dropped on load");
assert.equal(migrated.currentRun.featResult, null);
assert.deepEqual(migrated.currentRun.featsAnnounced, []);
console.log("[PASS] the end of a run settles feats, pays the reward in full, and survives a save round trip");

// --- Records (kept from the removed run-quest test) ----------------------------

const retreat = finalizeRunRecords({}, { deepestFloor: 8 }, "retreat");
assert.equal(retreat.records.deepestRetreat, 8);
assert.equal(retreat.records.deepestDeath, 0);
const death = finalizeRunRecords(retreat.records, { deepestFloor: 11 }, "death");
assert.equal(death.records.deepestRetreat, 8);
assert.equal(death.records.deepestDeath, 11);
assert.equal(Object.hasOwn(death.records, "deepestByClass"), false);
assert.equal(death.records.totalRuns, 2);
assert.equal(death.updated, true);
console.log("[PASS] retreat and death depths stay separate and both count as runs");
