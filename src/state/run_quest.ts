// balance-impact: none — canonical run-quest persistence contract only.

export type RunQuestType =
  | "depth"
  | "trapless_depth"
  | "role_kill"
  | "elite_kill"
  | "boss_kill";

export interface NormalizedRunQuestReward {
  materials: Record<string, number>;
}

export interface NormalizedRunQuest {
  id: string;
  templateId: string;
  type: RunQuestType;
  name: string;
  description: string;
  role: string | null;
  targetValue: number;
  currentValue: number;
  completed: boolean;
  rewardClaimed: boolean;
  completedAtDepth: number | null;
  reward: NormalizedRunQuestReward;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isRunQuestType(value: unknown): value is RunQuestType {
  return value === "depth" || value === "trapless_depth" || value === "role_kill" ||
    value === "elite_kill" || value === "boss_kill";
}

function isNonNegativeFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isNormalizedRunQuestReward(value: unknown): value is NormalizedRunQuestReward {
  if (!isRecord(value) || !isRecord(value.materials)) return false;
  return Object.values(value.materials).every(isNonNegativeFiniteInteger);
}

export function isNormalizedRunQuest(value: unknown): value is NormalizedRunQuest {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.templateId === "string" &&
    isRunQuestType(value.type) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (value.role === null || typeof value.role === "string") &&
    isNonNegativeFiniteInteger(value.targetValue) &&
    isNonNegativeFiniteInteger(value.currentValue) &&
    typeof value.completed === "boolean" &&
    typeof value.rewardClaimed === "boolean" &&
    (value.completedAtDepth === null || isPositiveFiniteInteger(value.completedAtDepth)) &&
    isNormalizedRunQuestReward(value.reward);
}

export function isNormalizedRunQuestCollection(value: unknown): value is NormalizedRunQuest[] {
  return isDenseArray(value) && value.every(isNormalizedRunQuest);
}

export function normalizeRunQuest(value: unknown): NormalizedRunQuest | null {
  return isNormalizedRunQuest(value) ? value : null;
}
