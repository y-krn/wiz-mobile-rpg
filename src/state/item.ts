// balance-impact: none — canonical item definition/reference contracts only.

import {
  isEquipmentInstance,
  isLegacyEquipmentRef,
  type EquipmentInstance,
  type LegacyEquipmentRef
} from "./equipment.js";

export type ItemType =
  | "weapon"
  | "shield"
  | "armor"
  | "accessory"
  | "usable"
  | "quest"
  | "rune";

export interface ItemDefinition {
  id: string;
  name: string;
  type: ItemType;
  desc: string;
}

export type ItemRef = string | EquipmentInstance;
export type RuntimeItemRef = ItemRef | LegacyEquipmentRef;

const ITEM_TYPES: ReadonlySet<string> = new Set([
  "weapon",
  "shield",
  "armor",
  "accessory",
  "usable",
  "quest",
  "rune"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && ITEM_TYPES.has(value);
}

export function isItemDefinition(value: unknown): value is ItemDefinition {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isItemType(value.type) &&
    isNonEmptyString(value.desc);
}

export function isItemRef(value: unknown): value is ItemRef {
  if (typeof value === "string") return value.trim().length > 0;
  return isEquipmentInstance(value);
}

export function isRuntimeItemRef(value: unknown): value is RuntimeItemRef {
  return isItemRef(value) || isLegacyEquipmentRef(value);
}

export function resolveItemDefinition(
  value: unknown,
  definitions: Readonly<Record<string, unknown>>
): ItemDefinition | null {
  if (!isItemRef(value)) return null;
  const itemId = typeof value === "string" ? value : value.baseId;
  const definition = definitions[itemId];
  return isItemDefinition(definition) ? definition : null;
}
