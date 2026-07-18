import assert from "node:assert/strict";
import { RUN_QUEST_TEMPLATES } from "../src/data/run_quests.js";
import {
  assignRunQuests,
  createRunQuest,
  recordRunQuestDefeats,
  updateRunQuests
} from "../src/systems/run_quests.js";
import { finalizeRunRecords } from "../src/state/records_state.js";

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

check("潜行開始時に重複なしで1〜2件を抽選する", () => {
  const oneRun = { startFloor: 1 };
  const twoRun = { startFloor: 5 };
  assert.equal(assignRunQuests(oneRun, sequenceRng([0.1, 0, 0, 0, 0, 0])).length, 1);
  assert.equal(assignRunQuests(twoRun, sequenceRng([0.9, 0, 0, 0, 0, 0])).length, 2);
  assert.equal(new Set(twoRun.quests.map(quest => quest.templateId)).size, 2);
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

check("撤退と死亡の最深を分離し、死亡ランも総潜行・クラス記録へ確定する", () => {
  const retreat = finalizeRunRecords({}, { deepestFloor: 8 }, "retreat", "Fighter");
  assert.equal(retreat.records.deepestRetreat, 8);
  assert.equal(retreat.records.deepestDeath, 0);
  const death = finalizeRunRecords(retreat.records, { deepestFloor: 11 }, "death", "Mage");
  assert.equal(death.records.deepestRetreat, 8);
  assert.equal(death.records.deepestDeath, 11);
  assert.equal(death.records.deepestByClass.Mage, 11);
  assert.equal(death.records.totalRuns, 2);
  assert.equal(death.updated, true);
});

if (failures > 0) process.exit(1);
