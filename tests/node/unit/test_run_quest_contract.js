import assert from "node:assert/strict";

import { RUN_QUEST_TEMPLATES } from "../../../src/data/run_quests.js";
import { createRunQuest, updateRunQuests } from "../../../src/systems/run_quests.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { state } from "../../../src/state/state_core.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import {
  isNormalizedRunQuest,
  isNormalizedRunQuestCollection,
  normalizeRunQuest
} from "../../../src/state/run_quest.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { createSavePayload } from "../../../src/state/save_payload.js";

const generatedQuests = RUN_QUEST_TEMPLATES.map(template => createRunQuest(template, 3));
assert.ok(generatedQuests.every(isNormalizedRunQuest), "every authored template creates a canonical quest");

const baseQuest = {
  ...generatedQuests[0],
  id: "historical-quest:3:9",
  templateId: "removed-template",
  reward: { materials: { "removed-material": 4 } },
  extra: { retained: true }
};

assert.equal(isNormalizedRunQuestCollection([baseQuest]), true, "valid collection accepted");
assert.equal(isNormalizedRunQuestCollection([]), true, "empty collection accepted");
assert.equal(isNormalizedRunQuestCollection([, baseQuest]), false, "sparse collection rejected");
assert.equal(isNormalizedRunQuest(JSON.parse(JSON.stringify(baseQuest))), true, "quest survives JSON roundtrip");
assert.equal(normalizeRunQuest(baseQuest), baseQuest, "valid quest identity preserved by narrow normalizer");

for (const malformed of [
  { ...baseQuest, type: "unknown" },
  { ...baseQuest, targetValue: 1.5 },
  { ...baseQuest, currentValue: Number.POSITIVE_INFINITY },
  { ...baseQuest, completed: "false" },
  { ...baseQuest, rewardClaimed: 0 },
  { ...baseQuest, completedAtDepth: 0 },
  { ...baseQuest, reward: { materials: [] } },
  { ...baseQuest, reward: { materials: { "bad-material": -1 } } },
  { ...baseQuest, reward: { materials: { "bad-material": Number.NaN } } }
]) {
  assert.equal(normalizeRunQuest(malformed), null, "malformed quest is dropped");
}

const duplicateQuests = [baseQuest, { ...baseQuest }, { ...baseQuest, id: "another-id" }];
assert.equal(isNormalizedRunQuestCollection(duplicateQuests), true, "duplicate quest identifiers remain valid");
assert.equal(isNormalizedCurrentRun({ ...createDefaultCurrentRun(), quests: [...duplicateQuests, { ...baseQuest, targetValue: -1 }] }), false,
  "current-run guard delegates quest validation");

state.currentRun = createDefaultCurrentRun();
const payload = createSavePayload();
const normalized = normalizeSavePayload({
  ...payload,
  currentRun: {
    ...createDefaultCurrentRun(),
    deepestFloor: 7,
    quests: [null, "malformed", { ...baseQuest, id: "ordered-second" }, baseQuest]
  }
});

assert.deepEqual(normalized.currentRun.quests, [{ ...baseQuest, id: "ordered-second" }, baseQuest],
  "malformed entry drops without changing order or duplicates");
assert.equal(normalized.currentRun.deepestFloor, 7, "valid run state is preserved");
assert.equal(normalized.currentRun.quests.length, 2, "two valid quests are not clamped");
assert.equal(normalized.currentRun.quests[0].templateId, "removed-template", "historical template id accepted");
assert.equal(normalized.currentRun.quests[0].reward.materials["removed-material"], 4,
  "historical material name and saved quantity accepted");
assert.equal(isNormalizedRunQuestCollection(JSON.parse(JSON.stringify(normalized.currentRun.quests))), true,
  "normalized quest collection survives JSON roundtrip");

const sparseQuests = [];
sparseQuests[1] = baseQuest;
const normalizedSparse = normalizeSavePayload({
  ...payload,
  currentRun: { ...createDefaultCurrentRun(), quests: sparseQuests }
}).currentRun;
assert.deepEqual(normalizedSparse.quests, [baseQuest], "sparse persisted collection becomes dense after normalization");

const completed = createRunQuest(RUN_QUEST_TEMPLATES[1], 1);
completed.currentValue = completed.targetValue;
completed.completed = true;
completed.completedAtDepth = 7;
completed.rewardClaimed = true;
const claimedRun = normalizeSavePayload({
  ...payload,
  currentRun: { ...createDefaultCurrentRun(), materials: {}, quests: [completed] }
}).currentRun;
const materialsBeforeReloadUpdate = structuredClone(claimedRun.materials);
assert.deepEqual(updateRunQuests(claimedRun), [], "claimed completed quest is not awarded after load");
assert.deepEqual(claimedRun.materials, materialsBeforeReloadUpdate, "claimed reward is not duplicated");

console.log("[PASS] canonical run quest contract, fail-safe normalization, roundtrip, and claim persistence");
