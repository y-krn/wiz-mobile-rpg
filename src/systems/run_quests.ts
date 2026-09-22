// balance-impact: none — canonical run-quest production owner; formulas and rewards remain unchanged.

import { RUN_QUEST_TEMPLATES } from "../data/run_quests.js";
import type {
  NormalizedDefeatsByRole,
  NormalizedRunQuest,
  NormalizedRunQuestReward,
  RunQuestType
} from "../state/run_quest.js";

type RunQuestTarget =
  | { kind: "next_milestone" }
  | { kind: "floor_offset"; value: number }
  | { kind: "count"; value: number };

interface RunQuestTemplate {
  id: string;
  type: RunQuestType;
  name: string;
  description: string;
  role?: string | null;
  target: RunQuestTarget;
  reward: NormalizedRunQuestReward;
}

interface RunQuestRun {
  startFloor?: number;
  deepestFloor?: number;
  trapsTriggered?: number;
  elitesKilled?: number;
  bossesKilled?: number;
  defeatsByRole?: NormalizedDefeatsByRole;
  materials?: Record<string, number>;
  quests?: NormalizedRunQuest[] | null;
}

interface RunQuestMonster {
  role?: string | null;
  fled?: unknown;
  hasSplit?: unknown;
}

const QUEST_TEMPLATES: readonly RunQuestTemplate[] = RUN_QUEST_TEMPLATES;

function resolveTargetValue(template: RunQuestTemplate, startFloor: number): number {
  if (template.target.kind === "next_milestone") {
    return Math.max(5, Math.ceil((startFloor + 1) / 5) * 5);
  }
  if (template.target.kind === "floor_offset") return startFloor + template.target.value;
  return template.target.value;
}

function cloneMaterials(materials: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(materials || {}).map(([name, quantity]) => [name, quantity]));
}

export function createRunQuest(template: RunQuestTemplate, startFloor: number): NormalizedRunQuest {
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

export function assignRunQuests(run: RunQuestRun, rng: () => number = Math.random): NormalizedRunQuest[] {
  const count = rng() < 0.5 ? 1 : 2;
  const pool = [...QUEST_TEMPLATES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  run.quests = pool.slice(0, count).map(template => createRunQuest(template, run.startFloor || 1));
  run.defeatsByRole ||= {};
  updateRunQuests(run);
  return run.quests;
}

export function recordRunQuestDefeats(
  run: RunQuestRun | null | undefined,
  monsters: RunQuestMonster[],
  increment = 1
): void {
  if (!run) return;
  const defeatsByRole = run.defeatsByRole ||= {};
  monsters.filter(monster => !monster.fled && !monster.hasSplit).forEach(monster => {
    if (!monster.role) return;
    defeatsByRole[monster.role] = (defeatsByRole[monster.role] || 0) + increment;
  });
}

function getQuestProgress(run: RunQuestRun | null | undefined, quest: NormalizedRunQuest): number {
  if (quest.type === "depth") return run?.deepestFloor || 0;
  if (quest.type === "trapless_depth") {
    return (run?.trapsTriggered || 0) === 0 ? (run?.deepestFloor || 0) : 0;
  }
  if (quest.type === "role_kill") {
    return quest.role == null ? 0 : run?.defeatsByRole?.[quest.role] || 0;
  }
  if (quest.type === "elite_kill") return run?.elitesKilled || 0;
  if (quest.type === "boss_kill") return run?.bossesKilled || 0;
  return 0;
}

export function updateRunQuests(
  run: RunQuestRun | null | undefined,
  rewardBonusPercent = 0
): NormalizedRunQuest[] {
  if (!run) return [];
  const newlyCompleted: NormalizedRunQuest[] = [];
  for (const quest of run.quests || []) {
    if (quest.completed) continue;
    quest.currentValue = Math.min(quest.targetValue, getQuestProgress(run, quest));
    if (quest.currentValue < quest.targetValue) continue;
    quest.completed = true;
    quest.completedAtDepth = run.deepestFloor || 1;
    if (!quest.rewardClaimed) {
      const materials = run.materials ||= {};
      Object.entries(quest.reward.materials || {}).forEach(([name, quantity]) => {
        const awarded = Math.ceil(quantity * (1 + rewardBonusPercent / 100));
        materials[name] = (materials[name] || 0) + awarded;
      });
      quest.rewardClaimed = true;
    }
    newlyCompleted.push(quest);
  }
  return newlyCompleted;
}

export function formatRunQuestProgress(quest: NormalizedRunQuest, run: RunQuestRun | null = null): string {
  if (quest.completed) return "達成";
  const currentValue = run ? Math.min(quest.targetValue, getQuestProgress(run, quest)) : (quest.currentValue || 0);
  if (quest.type === "depth" || quest.type === "trapless_depth") {
    return `B${currentValue}F / B${quest.targetValue}F`;
  }
  return `${currentValue} / ${quest.targetValue}`;
}
