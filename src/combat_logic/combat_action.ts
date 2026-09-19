// balance-impact: none — canonical combat action contract and runtime boundary validation only.
import { SPELLS } from "../data/spells.js";
import type { SpellKey } from "../state/view_state.js";

export const COMBAT_ACTION_TYPES = Object.freeze([
  "fight",
  "spell",
  "item",
  "defend",
  "run"
] as const);

export type CombatActionType = typeof COMBAT_ACTION_TYPES[number];

export interface FightCombatAction {
  type: "fight";
  actorIdx: number;
  targetIdx: number;
}

export interface SpellCombatAction {
  type: "spell";
  actorIdx: number;
  targetIdx: number;
  spellName: SpellKey;
}

export interface ItemCombatAction {
  type: "item";
  actorIdx: number;
  targetIdx: number;
  itemKey: string;
  itemIdx: number;
}

export interface DefendCombatAction {
  type: "defend";
  actorIdx: number;
}

export interface RunCombatAction {
  type: "run";
  actorIdx: number;
}

export type CombatAction =
  | FightCombatAction
  | SpellCombatAction
  | ItemCombatAction
  | DefendCombatAction
  | RunCombatAction;

export type FightCombatActionDraft = Omit<FightCombatAction, "actorIdx">;
export type SpellCombatActionDraft = Omit<SpellCombatAction, "actorIdx">;
export type ItemCombatActionDraft = Omit<ItemCombatAction, "actorIdx">;
export type DefendCombatActionDraft = Omit<DefendCombatAction, "actorIdx">;
export type RunCombatActionDraft = Omit<RunCombatAction, "actorIdx">;

export type CombatActionDraft =
  | FightCombatActionDraft
  | SpellCombatActionDraft
  | ItemCombatActionDraft
  | DefendCombatActionDraft
  | RunCombatActionDraft;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTargetIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= -1;
}

function isSpellKey(value: unknown): value is SpellKey {
  return typeof value === "string" && Object.hasOwn(SPELLS, value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

export function isCombatActionType(value: unknown): value is CombatActionType {
  return typeof value === "string" && COMBAT_ACTION_TYPES.includes(value as CombatActionType);
}

export function isCombatAction(value: unknown): value is CombatAction {
  if (!isRecord(value) || !isCombatActionType(value.type) || !isNonNegativeInteger(value.actorIdx)) return false;

  switch (value.type) {
    case "fight":
      return hasOnlyKeys(value, ["type", "actorIdx", "targetIdx"]) && isNonNegativeInteger(value.targetIdx);
    case "spell":
      return hasOnlyKeys(value, ["type", "actorIdx", "targetIdx", "spellName"]) &&
        isTargetIndex(value.targetIdx) && isSpellKey(value.spellName);
    case "item":
      return hasOnlyKeys(value, ["type", "actorIdx", "targetIdx", "itemKey", "itemIdx"]) &&
        isNonNegativeInteger(value.targetIdx) &&
        typeof value.itemKey === "string" && value.itemKey.length > 0 &&
        isNonNegativeInteger(value.itemIdx);
    case "defend":
    case "run":
      return hasOnlyKeys(value, ["type", "actorIdx"]);
  }
}

export function isCombatActionDraft(value: unknown): value is CombatActionDraft {
  if (!isRecord(value) || Object.hasOwn(value, "actorIdx") || !isCombatActionType(value.type)) return false;

  switch (value.type) {
    case "fight":
      return hasOnlyKeys(value, ["type", "targetIdx"]) && isNonNegativeInteger(value.targetIdx);
    case "spell":
      return hasOnlyKeys(value, ["type", "targetIdx", "spellName"]) &&
        isTargetIndex(value.targetIdx) && isSpellKey(value.spellName);
    case "item":
      return hasOnlyKeys(value, ["type", "targetIdx", "itemKey", "itemIdx"]) &&
        isNonNegativeInteger(value.targetIdx) &&
        typeof value.itemKey === "string" && value.itemKey.length > 0 &&
        isNonNegativeInteger(value.itemIdx);
    case "defend":
    case "run":
      return hasOnlyKeys(value, ["type"]);
  }
}

export function assignCombatActor(draft: unknown, actorIdx: unknown): CombatAction | null {
  if (!isNonNegativeInteger(actorIdx) || !isCombatActionDraft(draft)) return null;

  switch (draft.type) {
    case "fight":
      return { type: "fight", actorIdx, targetIdx: draft.targetIdx };
    case "spell":
      return { type: "spell", actorIdx, targetIdx: draft.targetIdx, spellName: draft.spellName };
    case "item":
      return {
        type: "item",
        actorIdx,
        targetIdx: draft.targetIdx,
        itemKey: draft.itemKey,
        itemIdx: draft.itemIdx
      };
    case "defend":
      return { type: "defend", actorIdx };
    case "run":
      return { type: "run", actorIdx };
  }
}

export function normalizeCombatActions(value: unknown): CombatAction[] {
  return Array.isArray(value) ? value.filter(isCombatAction) : [];
}
