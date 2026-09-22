import assert from "node:assert/strict";
import { RUN_QUEST_TEMPLATES } from "../../../src/data/run_quests.js";
import {
  assignRunQuests,
  createRunQuest,
  formatRunQuestProgress,
  recordRunQuestDefeats,
  updateRunQuests
} from "../../../src/systems/run_quests.js";
import {
  assignRunQuests as assignRunQuestsOwner,
  createRunQuest as createRunQuestOwner,
  formatRunQuestProgress as formatRunQuestProgressOwner,
  recordRunQuestDefeats as recordRunQuestDefeatsOwner,
  updateRunQuests as updateRunQuestsOwner
} from "../../../src/systems/run_quests.ts";
import { getRunQuestBoardCandidates } from "../../../src/menu/run_quest_board.js";
import { finalizeRunRecords } from "../../../src/state/records_state.js";

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function sequenceRng(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

check("JS facadeはTS production ownerへ同一exportを委譲する", () => {
  assert.strictEqual(assignRunQuests, assignRunQuestsOwner);
  assert.strictEqual(createRunQuest, createRunQuestOwner);
  assert.strictEqual(recordRunQuestDefeats, recordRunQuestDefeatsOwner);
  assert.strictEqual(updateRunQuests, updateRunQuestsOwner);
  assert.strictEqual(formatRunQuestProgress, formatRunQuestProgressOwner);
});

check("目標解決と報酬material cloneはtemplate入力を変更しない", () => {
  const milestone = RUN_QUEST_TEMPLATES.find(template => template.id === "reach_milestone");
  const offset = RUN_QUEST_TEMPLATES.find(template => template.id === "deep_push");
  const count = RUN_QUEST_TEMPLATES.find(template => template.id === "disruptor_hunt");
  const quest = createRunQuest(milestone, 5);
  assert.equal(quest.targetValue, 10);
  assert.equal(createRunQuest(offset, 3).targetValue, 9);
  assert.equal(createRunQuest(count, 1).targetValue, 3);
  quest.reward.materials["鉄片"] = 99;
  assert.equal(milestone.reward.materials["鉄片"], 3);
  assert.equal(quest.role, null);
});

check("assignはthreshold後にFisher-Yatesを固定順・固定回数で呼ぶ", () => {
  const draws = [0.9, 0, 0.2, 0.4, 0.6, 0.8];
  let calls = 0;
  const run = { startFloor: 0 };
  const quests = assignRunQuests(run, () => draws[calls++]);
  assert.equal(calls, 6);
  assert.deepEqual(quests.map(quest => quest.templateId), ["trapless_push", "disruptor_hunt"]);
  assert.match(quests[0].id, /^trapless_push:1:/);
  assert.equal(new Set(quests.map(quest => quest.templateId)).size, quests.length);
  assert.deepEqual(run.defeatsByRole, {});
});

check("潜行開始時に重複なしで1〜2件を抽選する", () => {
  const oneRun = { startFloor: 1 };
  const twoRun = { startFloor: 5 };
  assert.equal(assignRunQuests(oneRun, sequenceRng([0.1, 0, 0, 0, 0, 0])).length, 1);
  assert.equal(assignRunQuests(twoRun, sequenceRng([0.9, 0, 0, 0, 0, 0])).length, 2);
  assert.equal(new Set(twoRun.quests.map(quest => quest.templateId)).size, 2);
});

check("依頼板は深度・討伐・無傷踏破を各1件ずつ提示し、選択を反映する", () => {
  const candidates = getRunQuestBoardCandidates({
    startFloor: 5,
    rng: sequenceRng([0, 0.99, 0.99, 0, 0])
  });
  assert.equal(candidates.length, 3);
  assert.deepEqual(
    candidates.map(candidate => candidate.type),
    ["depth", "role_kill", "trapless_depth"]
  );

  assert.equal(candidates[0].startFloor, 5);
});

check("全テンプレが深度またはリスクへ向け、浅層周回目標を持たない", () => {
  assert.ok(RUN_QUEST_TEMPLATES.length >= 5);
  for (const template of RUN_QUEST_TEMPLATES) {
    assert.doesNotMatch(`${template.name}${template.description}`, /浅層|B1Fで|同じ階/);
    assert.ok(["depth", "role_kill", "elite_kill", "boss_kill", "trapless_depth"].includes(template.type));
  }
});

check("役割討伐は分裂体を除外し、達成報酬を一度だけ付与する", () => {
  const template = RUN_QUEST_TEMPLATES.find(item => item.id === "disruptor_hunt");
  const run = {
    startFloor: 1,
    deepestFloor: 3,
    materials: {},
    defeatsByRole: {},
    quests: [createRunQuest(template, 1)]
  };
  recordRunQuestDefeats(run, [
    { role: "disruptor", fled: false },
    { role: "disruptor", fled: true },
    { role: "disruptor", fled: false, hasSplit: true }
  ], 2);
  updateRunQuests(run);
  assert.equal(run.quests[0].currentValue, 2);
  recordRunQuestDefeats(run, [{ role: "disruptor", fled: false }], 1);
  const completed = updateRunQuests(run);
  assert.equal(completed.length, 1);
  assert.equal(run.materials["毒腺"], 3);
  assert.equal(updateRunQuests(run).length, 0);
  assert.equal(run.materials["毒腺"], 3);
});

check("fled・split・missing-roleを除外し、custom incrementを維持する", () => {
  const run = { defeatsByRole: {} };
  recordRunQuestDefeats(run, [
    { role: "disruptor", fled: false },
    { role: "disruptor", fled: true },
    { role: "disruptor", hasSplit: true },
    { fled: false },
    { role: "amplifier", fled: false }
  ], 3);
  assert.deepEqual(run.defeatsByRole, { disruptor: 3, amplifier: 3 });
  recordRunQuestDefeats(null, [{ role: "disruptor" }]);
});

check("role:nullは旧JS同様にnull property keyで進捗参照する", () => {
  const template = RUN_QUEST_TEMPLATES.find(item => item.id === "disruptor_hunt");
  const quest = createRunQuest(template, 1);
  quest.role = null;
  const run = {
    defeatsByRole: { null: 2 },
    quests: [quest]
  };
  assert.deepEqual(updateRunQuests(run), []);
  assert.equal(quest.currentValue, 2);
});

check("全progress type・trapless invalidation・clamp・completion orderを維持する", () => {
  const bossTemplate = {
    id: "test_boss",
    type: "boss_kill",
    name: "boss",
    description: "boss",
    target: { kind: "count", value: 1 },
    reward: { materials: { reward: 3 } }
  };
  const run = {
    deepestFloor: 7,
    trapsTriggered: 0,
    defeatsByRole: { disruptor: 4 },
    elitesKilled: 4,
    bossesKilled: 1,
    quests: [
      createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "deep_push"), 1),
      createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "disruptor_hunt"), 1),
      createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "elite_hunt"), 1),
      createRunQuest(bossTemplate, 1),
      createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "trapless_push"), 1)
    ]
  };
  const completed = updateRunQuests(run, 50);
  assert.deepEqual(completed.map(quest => quest.type), ["depth", "role_kill", "elite_kill", "boss_kill", "trapless_depth"]);
  assert.equal(run.quests[0].currentValue, 7);
  assert.equal(run.quests[0].completedAtDepth, 7);
  assert.equal(run.materials["魔石片"], 5);
  assert.equal(run.materials.reward, 5);
  assert.equal(updateRunQuests(run).length, 0);

  const traplessRun = {
    deepestFloor: 7,
    trapsTriggered: 1,
    quests: [createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "trapless_push"), 1)]
  };
  assert.deepEqual(updateRunQuests(traplessRun), []);
  assert.equal(traplessRun.quests[0].currentValue, 0);

  const fallbackRun = {
    deepestFloor: 0,
    bossesKilled: 1,
    quests: [createRunQuest(bossTemplate, 1)]
  };
  assert.deepEqual(updateRunQuests(fallbackRun), [fallbackRun.quests[0]]);
  assert.equal(fallbackRun.quests[0].completedAtDepth, 1);
});

check("formatはcompleted/live-run/保存済みcurrentValueの文字列を維持する", () => {
  const depth = createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "deep_push"), 1);
  depth.currentValue = 2;
  assert.equal(formatRunQuestProgress(depth), "B2F / B7F");
  assert.equal(formatRunQuestProgress(depth, { deepestFloor: 8 }), "B7F / B7F");
  depth.completed = true;
  assert.equal(formatRunQuestProgress(depth), "達成");
  const hunt = createRunQuest(RUN_QUEST_TEMPLATES.find(template => template.id === "disruptor_hunt"), 1);
  hunt.currentValue = 1;
  assert.equal(formatRunQuestProgress(hunt), "1 / 3");
  assert.equal(formatRunQuestProgress(hunt, { defeatsByRole: { disruptor: 2 } }), "2 / 3");
});

check("撤退と死亡の最深を分離し、死亡ランも総潜行へ確定する", () => {
  const retreat = finalizeRunRecords({}, { deepestFloor: 8 }, "retreat");
  assert.equal(retreat.records.deepestRetreat, 8);
  assert.equal(retreat.records.deepestDeath, 0);
  const death = finalizeRunRecords(retreat.records, { deepestFloor: 11 }, "death");
  assert.equal(death.records.deepestRetreat, 8);
  assert.equal(death.records.deepestDeath, 11);
  assert.equal(Object.hasOwn(death.records, "deepestByClass"), false);
  assert.equal(death.records.totalRuns, 2);
  assert.equal(death.updated, true);
});

if (failures > 0) process.exit(1);
