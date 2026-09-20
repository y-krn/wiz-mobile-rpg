// balance-impact: none — canonical generated equipment contract and runtime boundary only.

import { isItemRef, type ItemRef } from "./item.js";

export type EquipmentRarity = "magic" | "rare" | "epic";
export type EquipmentAffixKind = "core" | "support";
export type EquipmentBuildRole = "reinforce" | "convert" | "pivot";

export interface EquipmentAffix {
  id: string;
  kind: EquipmentAffixKind;
  type: string;
  value: number;
  buildRole: EquipmentBuildRole | null;
}

export interface EquipmentInstance {
  kind: "equipment";
  instanceId: string;
  baseId: string;
  rarity: EquipmentRarity;
  level: number;
  identified: boolean;
  affixes: EquipmentAffix[];
  [key: string]: unknown;
}

export type EquipmentSlotId =
  | "weapon"
  | "shield"
  | "armor"
  | "accessory"
  | "accessory2";

export interface CharacterEquipment {
  weapon: ItemRef | null;
  shield: ItemRef | null;
  armor: ItemRef | null;
  accessory: ItemRef | null;
  accessory2: ItemRef | null;
}

export const EQUIPMENT_SLOT_IDS = Object.freeze([
  "weapon",
  "shield",
  "armor",
  "accessory",
  "accessory2"
] as const satisfies readonly EquipmentSlotId[]);

const EQUIPMENT_SLOT_ID_SET: ReadonlySet<string> = new Set(EQUIPMENT_SLOT_IDS);

const EQUIPMENT_RARITIES: ReadonlySet<string> = new Set(["magic", "rare", "epic"]);
const EQUIPMENT_AFFIX_KINDS: ReadonlySet<string> = new Set(["core", "support"]);
const EQUIPMENT_BUILD_ROLES: ReadonlySet<string> = new Set(["reinforce", "convert", "pivot"]);
const EQUIPMENT_CORE_FIELDS = [
  "kind",
  "instanceId",
  "baseId",
  "rarity",
  "level",
  "identified",
  "affixes"
] as const;
const EQUIPMENT_AFFIX_FIELDS = ["id", "kind", "type", "value", "buildRole"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwnFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every(field => Object.hasOwn(value, field));
}

function isEquipmentRarity(value: unknown): value is EquipmentRarity {
  return typeof value === "string" && EQUIPMENT_RARITIES.has(value);
}

function isEquipmentAffixKind(value: unknown): value is EquipmentAffixKind {
  return typeof value === "string" && EQUIPMENT_AFFIX_KINDS.has(value);
}

function isEquipmentBuildRole(value: unknown): value is EquipmentBuildRole {
  return typeof value === "string" && EQUIPMENT_BUILD_ROLES.has(value);
}

export function isEquipmentAffix(value: unknown): value is EquipmentAffix {
  if (!isRecord(value) || !hasOwnFields(value, EQUIPMENT_AFFIX_FIELDS)) return false;
  return isNonEmptyString(value.id) &&
    isEquipmentAffixKind(value.kind) &&
    isNonEmptyString(value.type) &&
    typeof value.value === "number" && Number.isFinite(value.value) &&
    (value.buildRole === null || isEquipmentBuildRole(value.buildRole));
}

export function isEquipmentInstance(value: unknown): value is EquipmentInstance {
  if (!isRecord(value) || !hasOwnFields(value, EQUIPMENT_CORE_FIELDS)) return false;
  if (value.kind !== "equipment" || !isNonEmptyString(value.instanceId) || !isNonEmptyString(value.baseId)) return false;
  if (!isEquipmentRarity(value.rarity) || typeof value.level !== "number" ||
      !Number.isFinite(value.level) || value.level <= 0 || typeof value.identified !== "boolean" ||
      !Array.isArray(value.affixes)) return false;

  for (let index = 0; index < value.affixes.length; index++) {
    if (!Object.hasOwn(value.affixes, index) || !isEquipmentAffix(value.affixes[index])) return false;
  }
  return true;
}

export function isEquipmentSlotId(value: unknown): value is EquipmentSlotId {
  return typeof value === "string" && EQUIPMENT_SLOT_ID_SET.has(value);
}

function isCharacterEquipmentSlotValue(value: unknown): value is ItemRef | null {
  if (value === null) return true;
  if (!isItemRef(value)) return false;
  return typeof value === "object" ? isEquipmentInstance(value) : true;
}

export function isCharacterEquipment(value: unknown): value is CharacterEquipment {
  if (!isRecord(value)) return false;
  return EQUIPMENT_SLOT_IDS.every(slot =>
    Object.hasOwn(value, slot) && isCharacterEquipmentSlotValue(value[slot])
  );
}
