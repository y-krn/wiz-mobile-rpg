// balance-impact: none — canonical run-return persistence boundary only.

export type NormalizedRunReturnItemType =
  | "weapon"
  | "shield"
  | "armor"
  | "accessory"
  | "usable"
  | "item";

export type NormalizedRunReturnItemRarity =
  | "common"
  | "magic"
  | "rare"
  | "epic"
  | "legendary";

export type NormalizedRunReturnItemStatus = "returned" | "rescued" | "lost" | "observed";

export interface NormalizedRunReturnItemRecord {
  baseId: string;
  name: string;
  type: NormalizedRunReturnItemType;
  rarity: NormalizedRunReturnItemRarity;
  knowledgeStage: string;
  status: NormalizedRunReturnItemStatus;
  wasEquipped: boolean;
  depth: number;
}

export interface NormalizedRunCodexInsight {
  id: string;
  label: string;
}

export interface NormalizedRunWorkshopUnlock {
  nodeId: string;
  name: string;
  description: string;
  matchedSignals: string[];
}

export interface NormalizedRunReturnProcessing {
  outcome: string;
  returnedObjectCount: number;
  lostObjectCount: number;
  recoveredEquipmentCount: number;
}

const RETURN_ITEM_TYPES = new Set<NormalizedRunReturnItemType>([
  "weapon", "shield", "armor", "accessory", "usable", "item"
]);
const RETURN_ITEM_RARITIES = new Set<NormalizedRunReturnItemRarity>([
  "common", "magic", "rare", "epic", "legendary"
]);
const RETURN_ITEM_STATUSES = new Set<NormalizedRunReturnItemStatus>([
  "returned", "rescued", "lost", "observed"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

export function isNormalizedReturnItemRecord(value: unknown): value is NormalizedRunReturnItemRecord {
  return isRecord(value) &&
    typeof value.baseId === "string" &&
    typeof value.name === "string" &&
    RETURN_ITEM_TYPES.has(value.type as NormalizedRunReturnItemType) &&
    RETURN_ITEM_RARITIES.has(value.rarity as NormalizedRunReturnItemRarity) &&
    typeof value.knowledgeStage === "string" &&
    RETURN_ITEM_STATUSES.has(value.status as NormalizedRunReturnItemStatus) &&
    typeof value.wasEquipped === "boolean" &&
    isPositiveInteger(value.depth);
}

export function normalizeReturnItemRecord(value: unknown): NormalizedRunReturnItemRecord | null {
  if (!isRecord(value) || typeof value.baseId !== "string") return null;
  return {
    baseId: value.baseId,
    name: typeof value.name === "string" ? value.name : value.baseId,
    type: RETURN_ITEM_TYPES.has(value.type as NormalizedRunReturnItemType)
      ? value.type as NormalizedRunReturnItemType
      : "item",
    rarity: RETURN_ITEM_RARITIES.has(value.rarity as NormalizedRunReturnItemRarity)
      ? value.rarity as NormalizedRunReturnItemRarity
      : "common",
    knowledgeStage: typeof value.knowledgeStage === "string" ? value.knowledgeStage : "unknown",
    status: RETURN_ITEM_STATUSES.has(value.status as NormalizedRunReturnItemStatus)
      ? value.status as NormalizedRunReturnItemStatus
      : "observed",
    wasEquipped: value.wasEquipped === true,
    depth: isPositiveInteger(value.depth) ? value.depth : 1
  };
}

export function isNormalizedReturnItemHistory(value: unknown): value is NormalizedRunReturnItemRecord[] {
  return Array.isArray(value) && value.length <= 5 && value.every(isNormalizedReturnItemRecord);
}

export function normalizeReturnItemHistory(value: unknown): NormalizedRunReturnItemRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeReturnItemRecord)
    .filter((record): record is NormalizedRunReturnItemRecord => record !== null)
    .slice(0, 5);
}

export function isNormalizedRunInsight(value: unknown): value is NormalizedRunCodexInsight {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.label === "string";
}

export function isNormalizedRunInsights(value: unknown): value is NormalizedRunCodexInsight[] {
  return Array.isArray(value) && value.length <= 20 && value.every(isNormalizedRunInsight);
}

export function normalizeRunInsights(value: unknown): NormalizedRunCodexInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map(insight => ({
      id: typeof insight.id === "string" ? insight.id : "",
      label: typeof insight.label === "string" ? insight.label : ""
    }))
    .filter(insight => insight.id.length > 0)
    .slice(0, 20);
}

export function isNormalizedWorkshopUnlock(value: unknown): value is NormalizedRunWorkshopUnlock {
  return isRecord(value) &&
    typeof value.nodeId === "string" &&
    value.nodeId.length > 0 &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    Array.isArray(value.matchedSignals) &&
    value.matchedSignals.length <= 6 &&
    value.matchedSignals.every(signal => typeof signal === "string");
}

export function isNormalizedWorkshopUnlocks(value: unknown): value is NormalizedRunWorkshopUnlock[] {
  return Array.isArray(value) && value.every(isNormalizedWorkshopUnlock);
}

export function normalizeWorkshopUnlocks(value: unknown): NormalizedRunWorkshopUnlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map(unlock => ({
      nodeId: typeof unlock.nodeId === "string" ? unlock.nodeId : "",
      name: typeof unlock.name === "string" ? unlock.name : "",
      description: typeof unlock.description === "string" ? unlock.description : "",
      matchedSignals: Array.isArray(unlock.matchedSignals)
        ? unlock.matchedSignals.filter(signal => typeof signal === "string").slice(0, 6)
        : []
    }))
    .filter(unlock => unlock.nodeId.length > 0);
}

export function isNormalizedReturnProcessing(value: unknown): value is NormalizedRunReturnProcessing {
  return isRecord(value) &&
    typeof value.outcome === "string" &&
    isNonNegativeInteger(value.returnedObjectCount) &&
    isNonNegativeInteger(value.lostObjectCount) &&
    isNonNegativeInteger(value.recoveredEquipmentCount);
}

export function normalizeReturnProcessing(value: unknown): NormalizedRunReturnProcessing | null {
  if (!isRecord(value)) return null;
  return {
    outcome: typeof value.outcome === "string" ? value.outcome : "",
    returnedObjectCount: isNonNegativeInteger(value.returnedObjectCount) ? value.returnedObjectCount : 0,
    lostObjectCount: isNonNegativeInteger(value.lostObjectCount) ? value.lostObjectCount : 0,
    recoveredEquipmentCount: isNonNegativeInteger(value.recoveredEquipmentCount)
      ? value.recoveredEquipmentCount
      : 0
  };
}

export const isNormalizedRunReturnItemRecord = isNormalizedReturnItemRecord;
export const normalizeRunReturnItemRecord = normalizeReturnItemRecord;
export const isNormalizedRunReturnItemHistory = isNormalizedReturnItemHistory;
export const normalizeRunReturnItemHistory = normalizeReturnItemHistory;
export const isNormalizedRunCodexInsight = isNormalizedRunInsight;
export const isNormalizedRunCodexInsights = isNormalizedRunInsights;
export const normalizeRunCodexInsights = normalizeRunInsights;
export const isNormalizedRunWorkshopUnlock = isNormalizedWorkshopUnlock;
export const isNormalizedRunWorkshopUnlocks = isNormalizedWorkshopUnlocks;
export const normalizeRunWorkshopUnlocks = normalizeWorkshopUnlocks;
export const isNormalizedRunReturnProcessing = isNormalizedReturnProcessing;
export const normalizeRunReturnProcessing = normalizeReturnProcessing;
