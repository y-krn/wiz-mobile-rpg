// balance-impact: none — canonical pending reward persistence contract only.

import { isRuntimeItemRef, type RuntimeItemRef } from "./item.js";

export type PendingRewardDecision = "take" | "leave" | null;

export type NormalizedPendingLoadoutActionType = "" | "equip" | "socket" | "trial";

export interface NormalizedPendingLoadoutAction {
  type: NormalizedPendingLoadoutActionType;
  actorIdx: number;
  requestedSlot: string;
}

export interface NormalizedPendingRewardEntry {
  id: string;
  role: string;
  item: RuntimeItemRef;
  decision: PendingRewardDecision;
  loadoutAction: NormalizedPendingLoadoutAction | null;
}

export interface NormalizedPendingRewardBundle {
  id: string;
  source: string;
  floor: number;
  x: number | null;
  y: number | null;
  entries: NormalizedPendingRewardEntry[];
  discardIndexes: number[];
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

function isPendingRewardDecision(value: unknown): value is PendingRewardDecision {
  return value === null || value === "take" || value === "leave";
}

function isNormalizedPendingLoadoutActionType(value: unknown): value is NormalizedPendingLoadoutActionType {
  return value === "" || value === "equip" || value === "socket" || value === "trial";
}

function isNormalizedPendingLoadoutAction(value: unknown): value is NormalizedPendingLoadoutAction {
  return isRecord(value) &&
    isNormalizedPendingLoadoutActionType(value.type) &&
    Number.isInteger(value.actorIdx) &&
    typeof value.requestedSlot === "string";
}

function isNormalizedPendingRewardEntry(value: unknown): value is NormalizedPendingRewardEntry {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    isRuntimeItemRef(value.item) &&
    isPendingRewardDecision(value.decision) &&
    (value.loadoutAction === null || isNormalizedPendingLoadoutAction(value.loadoutAction));
}

function isIntegerOrNull(value: unknown): value is number | null {
  return value === null || Number.isInteger(value);
}

export function isNormalizedPendingRewardBundle(value: unknown): value is NormalizedPendingRewardBundle {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.source !== "string") return false;
  const floor = value.floor;
  if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 1) return false;
  if (!isIntegerOrNull(value.x) || !isIntegerOrNull(value.y)) return false;
  const entries = value.entries;
  if (!isDenseArray(entries) || entries.length === 0) return false;
  if (!entries.every(isNormalizedPendingRewardEntry)) return false;
  const discardIndexes = value.discardIndexes;
  if (!isDenseArray(discardIndexes)) return false;
  if (!discardIndexes.every(index =>
    typeof index === "number" && Number.isInteger(index) && index >= 0
  )) return false;
  return new Set(discardIndexes).size === discardIndexes.length;
}
