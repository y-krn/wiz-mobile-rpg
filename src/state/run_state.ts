// balance-impact: none — canonical normalized current-run boundary only.

import { isRuntimeItemCollection, isRuntimeItemRef, type RuntimeItemCollection, type RuntimeItemRef } from "./item.js";
import { isNormalizedPendingRewardBundle, type NormalizedPendingRewardBundle } from "./pending_reward.js";
import { isNormalizedRunQuestCollection, type NormalizedRunQuest } from "./run_quest.js";
import { isNormalizedTrialBands, type NormalizedTrialBands } from "./trial_band.js";
import {
  isNormalizedEliteDefeatedFloors,
  isNormalizedEliteFloors,
  type NormalizedEliteDefeatedFloors,
  type NormalizedEliteFloors
} from "./elite_floor.js";
import { isNormalizedRunSeed, type NormalizedRunSeed } from "./run_seed.js";
import {
  isNormalizedDefeatedMilestones,
  type NormalizedDefeatedMilestones
} from "./milestone_state.js";

export type RunOutcome = "" | "retreat" | "death" | "abandon";

export interface NormalizedRunObjectLootEntry {
  id: string;
  item: RuntimeItemRef;
  [key: string]: unknown;
}

export interface NormalizedCurrentRun {
  startedAt: number;
  startFloor: number;
  startingKit: unknown;
  deepestFloor: number;
  steps: number;
  floorSteps: Record<string, unknown>;
  battles: number;
  kills: number;
  elitesKilled: number;
  bossesKilled: number;
  chestsOpened: number;
  goldEarned: number;
  lootCount: number;
  trapsTriggered: number;
  trapsDisarmed: number;
  expGained: number;
  materials: Record<string, unknown>;
  bankedMaterials: Record<string, unknown>;
  townInventory: RuntimeItemCollection;
  unbankedObjectLoot: NormalizedRunObjectLootEntry[];
  pendingRewardBundle: NormalizedPendingRewardBundle | null;
  bankedObjectLoot: RuntimeItemCollection;
  lostObjectLoot: RuntimeItemCollection;
  eventObservations: Record<string, unknown>;
  returnedTownItems: RuntimeItemCollection;
  representativeItem: Record<string, unknown> | null;
  meaningfulItemHistory: unknown[];
  codexInsights: unknown[];
  workshopUnlocks: unknown[];
  returnProcessing: Record<string, unknown> | null;
  lootSequence: number;
  itemsFound: RuntimeItemCollection;
  equipmentFound: RuntimeItemCollection;
  firstKills: unknown[];
  floorsVisited: unknown[];
  dangerScore: number;
  returnReason: string;
  outcome: RunOutcome;
  deathLogs: unknown[];
  campRested: Record<string, unknown>;
  pendingCampEntryFloor: unknown;
  completedCampEntryFloors: unknown[];
  trialBands: NormalizedTrialBands;
  eliteFloors: NormalizedEliteFloors;
  eliteOmenSteps: Record<string, unknown>;
  eliteDefeatedFloors: NormalizedEliteDefeatedFloors;
  defeatedMilestones: NormalizedDefeatedMilestones;
  visitedMilestoneMerchants: unknown[];
  quests: NormalizedRunQuest[];
  defeatsByRole: Record<string, unknown>;
  codexRewards: Record<string, unknown>;
  departureItems: RuntimeItemCollection;
  departureEquipment: Record<string, unknown>;
  firstKillsBefore: unknown[];
  keyItemsBefore: unknown[];
  codexDiscoveries: unknown[];
  workshopDiscoveries: unknown[];
  recordResult: unknown;
  runSeed?: NormalizedRunSeed;
  [key: string]: unknown;
}

const NUMBER_FIELDS = [
  "startedAt", "startFloor", "deepestFloor", "steps", "battles", "kills",
  "elitesKilled", "bossesKilled", "chestsOpened", "goldEarned", "lootCount",
  "trapsTriggered", "trapsDisarmed", "expGained", "dangerScore"
] as const;

const RECORD_FIELDS = [
  "floorSteps", "materials", "bankedMaterials", "eventObservations", "campRested",
  "eliteOmenSteps", "defeatsByRole", "codexRewards",
  "departureEquipment"
] as const;

const ARRAY_FIELDS = [
  "meaningfulItemHistory", "codexInsights", "workshopUnlocks", "firstKills",
  "floorsVisited", "deathLogs", "completedCampEntryFloors",
  "visitedMilestoneMerchants", "firstKillsBefore",
  "keyItemsBefore", "codexDiscoveries", "workshopDiscoveries"
] as const;

const ITEM_COLLECTION_FIELDS = [
  "townInventory", "bankedObjectLoot", "lostObjectLoot", "returnedTownItems",
  "itemsFound", "equipmentFound", "departureItems"
] as const;

const REQUIRED_FIELDS = [
  ...NUMBER_FIELDS,
  "startingKit", "unbankedObjectLoot", "pendingRewardBundle", "representativeItem",
  "returnProcessing", "lootSequence", "returnReason", "outcome", "pendingCampEntryFloor",
  "recordResult", "quests", "trialBands", "eliteFloors", "eliteDefeatedFloors",
  "defeatedMilestones",
  ...RECORD_FIELDS,
  ...ARRAY_FIELDS,
  ...ITEM_COLLECTION_FIELDS
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRequiredFields(value: Record<string, unknown>): boolean {
  return REQUIRED_FIELDS.every(field => Object.hasOwn(value, field));
}

function isRunOutcome(value: unknown): value is RunOutcome {
  return value === "" || value === "retreat" || value === "death" || value === "abandon";
}

function isNormalizedRunObjectLootEntry(value: unknown): value is NormalizedRunObjectLootEntry {
  return isRecord(value) && typeof value.id === "string" && isRuntimeItemRef(value.item);
}

export function isNormalizedCurrentRun(value: unknown): value is NormalizedCurrentRun {
  if (!isRecord(value) || !hasRequiredFields(value)) return false;
  if (!NUMBER_FIELDS.every(field => isFiniteNumber(value[field]))) return false;
  if (!isFiniteNumber(value.lootSequence) || !Number.isInteger(value.lootSequence) || value.lootSequence < 0) {
    return false;
  }
  if (typeof value.returnReason !== "string" || !isRunOutcome(value.outcome)) return false;
  if (!RECORD_FIELDS.every(field => isRecord(value[field]))) return false;
  if (!isNormalizedTrialBands(value.trialBands)) return false;
  if (!isNormalizedEliteFloors(value.eliteFloors)) return false;
  if (!isNormalizedEliteDefeatedFloors(value.eliteDefeatedFloors)) return false;
  if (!isNormalizedDefeatedMilestones(value.defeatedMilestones)) return false;
  if (Object.hasOwn(value, "runSeed") && value.runSeed !== undefined && !isNormalizedRunSeed(value.runSeed)) {
    return false;
  }
  if (!ARRAY_FIELDS.every(field => Array.isArray(value[field]))) return false;
  if (!isNormalizedRunQuestCollection(value.quests)) return false;
  if (!ITEM_COLLECTION_FIELDS.every(field => isRuntimeItemCollection(value[field]))) return false;
  if (!Array.isArray(value.unbankedObjectLoot) ||
      !value.unbankedObjectLoot.every(isNormalizedRunObjectLootEntry)) return false;
  if (value.pendingRewardBundle !== null && !isNormalizedPendingRewardBundle(value.pendingRewardBundle)) return false;
  if (value.representativeItem !== null && !isRecord(value.representativeItem)) return false;
  if (value.returnProcessing !== null && !isRecord(value.returnProcessing)) return false;
  return true;
}

interface MilestoneState {
  currentRun?: { defeatedMilestones?: NormalizedDefeatedMilestones } | null;
  unlockedMilestones?: number[];
}

export function recordMilestoneVictory(stateLike: MilestoneState, floor: number) {
  if (!Number.isInteger(floor) || floor < 5 || floor % 5 !== 0) {
    return { ok: false, unlocked: false };
  }
  stateLike.currentRun ||= {};
  stateLike.currentRun.defeatedMilestones ||= [];
  if (!stateLike.currentRun.defeatedMilestones.includes(floor)) {
    stateLike.currentRun.defeatedMilestones.push(floor);
    stateLike.currentRun.defeatedMilestones.sort((a, b) => a - b);
  }
  stateLike.unlockedMilestones ||= [];
  const unlocked = !stateLike.unlockedMilestones.includes(floor);
  if (unlocked) {
    stateLike.unlockedMilestones.push(floor);
    stateLike.unlockedMilestones.sort((a, b) => a - b);
  }
  return { ok: true, unlocked };
}
