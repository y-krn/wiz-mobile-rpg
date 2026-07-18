import { RUN_QUEST_TEMPLATES } from "../data/run_quests.js";

function resolveTargetValue(template, startFloor) {
  if (template.target.kind === "next_milestone") {
    return Math.max(5, Math.ceil((startFloor + 1) / 5) * 5);
  }
  if (template.target.kind === "floor_offset") return startFloor + template.target.value;
  return template.target.value;
}

function cloneMaterials(materials) {
  return Object.fromEntries(Object.entries(materials || {}).map(([name, quantity]) => [name, quantity]));
}

export function createRunQuest(template, startFloor) {
  const targetValue = resolveTargetValue(template, startFloor);
  return {
    id: `${template.id}:${startFloor}:${targetValue}`,
    templateId: template.id,
    type: template.type,
    name: template.name,
    description: template.description,
    role: template.role || null,
    targetValue,
    currentValue: 0,
    completed: false,
    rewardClaimed: false,
    completedAtDepth: null,
    reward: { materials: cloneMaterials(template.reward.materials) }
  };
}

export function assignRunQuests(run, rng = Math.random) {
  const count = rng() < 0.5 ? 1 : 2;
  const pool = [...RUN_QUEST_TEMPLATES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  run.quests = pool.slice(0, count).map(template => createRunQuest(template, run.startFloor || 1));
  run.defeatsByRole ||= {};
  updateRunQuests(run);
  return run.quests;
}

export function recordRunQuestDefeats(run, monsters, increment = 1) {
  if (!run) return;
  run.defeatsByRole ||= {};
  monsters.filter(monster => !monster.fled && !monster.hasSplit).forEach(monster => {
    if (!monster.role) return;
    run.defeatsByRole[monster.role] = (run.defeatsByRole[monster.role] || 0) + increment;
  });
}

function getQuestProgress(run, quest) {
  if (quest.type === "depth") return run.deepestFloor || 0;
  if (quest.type === "trapless_depth") return (run.trapsTriggered || 0) === 0 ? (run.deepestFloor || 0) : 0;
  if (quest.type === "role_kill") return run.defeatsByRole?.[quest.role] || 0;
  if (quest.type === "elite_kill") return run.elitesKilled || 0;
  if (quest.type === "boss_kill") return run.bossesKilled || 0;
  return 0;
}

export function updateRunQuests(run, rewardBonusPercent = 0) {
  const newlyCompleted = [];
  for (const quest of run?.quests || []) {
    if (quest.completed) continue;
    quest.currentValue = Math.min(quest.targetValue, getQuestProgress(run, quest));
    if (quest.currentValue < quest.targetValue) continue;
    quest.completed = true;
    quest.completedAtDepth = run.deepestFloor || 1;
    if (!quest.rewardClaimed) {
      run.materials ||= {};
      Object.entries(quest.reward.materials || {}).forEach(([name, quantity]) => {
        const awarded = Math.ceil(quantity * (1 + rewardBonusPercent / 100));
        run.materials[name] = (run.materials[name] || 0) + awarded;
      });
      quest.rewardClaimed = true;
    }
    newlyCompleted.push(quest);
  }
  return newlyCompleted;
}

export function formatRunQuestProgress(quest, run = null) {
  if (quest.completed) return "達成";
  const currentValue = run ? Math.min(quest.targetValue, getQuestProgress(run, quest)) : (quest.currentValue || 0);
  if (quest.type === "depth" || quest.type === "trapless_depth") {
    return `B${currentValue}F / B${quest.targetValue}F`;
  }
  return `${currentValue} / ${quest.targetValue}`;
}
