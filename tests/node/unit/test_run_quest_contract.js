import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { state } from "../../../src/state/state_core.js";
import { normalizeSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";
import {
  isNormalizedDefeatsByRole,
  isNormalizedRunQuest,
  isNormalizedRunQuestCollection,
  normalizeDefeatsByRole,
  normalizeRunQuest
} from "../../../src/state/run_quest.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { createSavePayload } from "../../../src/state/save_payload.js";

const canonicalDefeatsByRole = {
  disruptor: 3,
  amplifier: 0,
  "removed-role": 4,
  " role with spaces ": 2
};
assert.equal(isNormalizedDefeatsByRole({}), true, "empty defeats-by-role record accepted");
assert.equal(isNormalizedDefeatsByRole(canonicalDefeatsByRole), true,
  "current, historical, and whitespace role keys accepted");
assert.deepEqual(normalizeDefeatsByRole(canonicalDefeatsByRole), canonicalDefeatsByRole,
  "valid role keys and zero values are preserved exactly");
assert.deepEqual(normalizeDefeatsByRole({
  disruptor: 3,
  "": 2,
  caster: "5",
  tank: -1,
  support: 1.5,
  healer: Number.NaN,
  rogue: Number.POSITIVE_INFINITY,
  nullValue: null,
  objectValue: {}
}), { disruptor: 3 }, "invalid values and empty keys are dropped without coercion");
assert.deepEqual(normalizeDefeatsByRole([]), {}, "non-record defeats-by-role becomes empty");
assert.deepEqual(normalizeDefeatsByRole(JSON.parse(JSON.stringify(canonicalDefeatsByRole))), canonicalDefeatsByRole,
  "role progress remains stable through JSON roundtrip");
assert.deepEqual(normalizeDefeatsByRole(normalizeDefeatsByRole({ disruptor: 3, "": 2 })), { disruptor: 3 },
  "role progress normalization is idempotent");
assert.equal(isNormalizedDefeatsByRole({ disruptor: 1.5 }), false, "fractional role progress rejected by guard");
assert.equal(isNormalizedDefeatsByRole({ disruptor: "1" }), false, "numeric role progress rejected by guard");

// Run quests were replaced by feats (#2007). The quest shape is only kept so
// that a run saved with quests still loads; the quests are dropped on load.
const baseQuest = {
  id: "historical-quest:3:9",
  templateId: "removed-template",
  type: "depth",
  name: "次の深みへ",
  description: "次の階層守護者が待つ階まで到達する。",
  role: null,
  targetValue: 5,
  currentValue: 0,
  completed: false,
  rewardClaimed: false,
  completedAtDepth: null,
  reward: { materials: { "removed-material": 4 } },
  extra: { retained: true }
};
assert.equal(isNormalizedRunQuest(baseQuest), true, "a quest saved before the change is still a valid shape");

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
assert.equal(isNormalizedCurrentRun({ ...createDefaultCurrentRun(), defeatsByRole: { disruptor: "3" } }), false,
  "current-run guard delegates defeats-by-role validation");

state.currentRun = createDefaultCurrentRun();
const payload = createSavePayload();
const normalized = normalizeSavePayload({
  ...payload,
  currentRun: {
    ...createDefaultCurrentRun(),
    deepestFloor: 7,
    defeatsByRole: {
      disruptor: 3,
      "removed-role": 4,
      "": 2,
      amplifier: "5"
    },
    quests: [null, "malformed", { ...baseQuest, id: "ordered-second" }, baseQuest]
  }
});

assert.deepEqual(normalized.currentRun.quests, [], "run quests saved before the change are dropped on load");
assert.equal(normalized.currentRun.deepestFloor, 7, "valid run state is preserved");
assert.deepEqual(normalized.currentRun.defeatsByRole, { disruptor: 3, "removed-role": 4 },
  "save boundary canonicalizes role progress without current-role filtering");
assert.deepEqual(normalized.currentRun.materials, {}, "dropping the quests awards nothing");
assert.equal(isNormalizedCurrentRun(normalized.currentRun), true, "the loaded run satisfies the current-run contract");

assert.equal(SAVE_VERSION, 15, "stone-event reset boundary rejects older save versions");

console.log("[PASS] role progress contract holds and legacy run quests are dropped on load");
