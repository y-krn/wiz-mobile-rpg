// Equipment action boundary: validation, game-state mutation, and side effects
// stay here so DOM event handlers only dispatch an action and rerender.
import { state, addLog, saveAutosave } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { trackEquipmentDecision, trackLootLifecycle } from "../telemetry.js";
import { canEquipEquipment } from "../rules/equipment_rules.js";
import { isCurseLocked } from "../rules/identification_rules.js";
import {
  getEquipmentPreview,
  getEquipmentSlotValue,
  getUnequipPreview
} from "../rules/equipment_preview.js";
import { identifyEquipment, revealEquipmentOnEquip } from "./identification.js";
import { executeEnhance, executePolish } from "../craft.js";
import { discardEquipmentItems } from "./equipment_discard.js";
import { addInventoryItemToState } from "../state/inventory_state.js";
import { findRunObjectLootEntry } from "../state/run_loot.js";
import { hasInventorySpace } from "../rules/item_inventory.js";
import {
  clampCurrentMpToMax,
  getActiveRuneSpellKeys,
  getRuneItemId,
  syncMediumState
} from "../rules/magic_rules.js";
import { getCharMaxMp } from "../rules/character_stats.js";

type EquipmentCharacter = {
  name: string;
  equipment: Record<string, unknown>;
  [key: string]: unknown;
};

type EquipmentActionState = {
  party: EquipmentCharacter[];
  inventory: unknown[];
  floor: number;
  [key: string]: unknown;
};

type EquipInput = {
  inventoryIndex?: number;
  actorIdx?: number;
  requestedSlot?: string | null;
};

type UnequipInput = {
  actorIdx?: number;
  slot?: string;
};

type IdentifyInput = {
  inventoryIndex?: number;
  actorIdx?: number;
  requestedSlot?: string | null;
};

type EquipmentItemData = {
  name: string;
  [key: string]: unknown;
};

type EquipmentPreview = {
  slot: string;
  oldEq: unknown;
  primaryDiff: unknown;
  rows: Array<{ key: string; current: unknown; next: unknown; diff: unknown }>;
};

type EquipAvailability =
  | { ok: true; slot: string; [key: string]: unknown }
  | { ok: false; [key: string]: unknown };

type IdentifyResult =
  | { ok: true; cursed: boolean; [key: string]: unknown }
  | { ok: false; [key: string]: unknown };

type DiscardEntry = {
  index: number;
  expectedItemKey?: unknown;
  preview?: unknown;
  [key: string]: unknown;
};

type ActionResult = { ok: boolean; [key: string]: unknown };

type GetItemDataAtBoundary = (itemOrKey: unknown) => EquipmentItemData;
type CanEquipAtBoundary = (
  character: EquipmentCharacter,
  itemKey: unknown,
  requestedSlot: string | null | undefined
) => EquipAvailability;
type GetEquipmentPreviewAtBoundary = (
  character: EquipmentCharacter,
  itemKey: unknown,
  requestedSlot: string | null,
  options: { floor: number }
) => EquipmentPreview | null;
type GetUnequipPreviewAtBoundary = (
  character: EquipmentCharacter,
  slot: string | undefined,
  options: { floor: number }
) => unknown;
type IdentifyEquipmentAtBoundary = (
  stateLike: EquipmentActionState,
  item: unknown,
  character: EquipmentCharacter
) => IdentifyResult;
type RevealEquipmentAtBoundary = (item: unknown) => { revealed: boolean; cursed: boolean };
type DiscardEquipmentItemsAtBoundary = (
  entries: DiscardEntry[],
  options: { character: EquipmentCharacter }
) => ActionResult;
type FindRunObjectLootEntryAtBoundary = (
  stateLike: EquipmentActionState,
  item: unknown
) => { id?: unknown } | null | undefined;
type AddInventoryItemAtBoundary = (stateLike: EquipmentActionState, item: unknown) => unknown;
type HasInventorySpaceAtBoundary = (inventory: unknown[], additionalCount?: number) => boolean;
type GetActiveRuneSpellKeysAtBoundary = (character: EquipmentCharacter) => unknown[];
type GetRuneItemIdAtBoundary = (spellKey: unknown) => unknown;
type SyncMediumStateAtBoundary = (character: EquipmentCharacter) => unknown;
type ClampCurrentMpAtBoundary = (
  character: EquipmentCharacter,
  getMaxMp: (character: EquipmentCharacter) => unknown
) => unknown;
type GetCharMaxMpAtBoundary = (character: EquipmentCharacter) => unknown;
type ExecuteEnhanceAtBoundary = (target: unknown) => unknown;
type ExecutePolishAtBoundary = (target: unknown, affixIndex: unknown) => unknown;

const actionState = state as EquipmentActionState;
const getItemDataAtBoundary: GetItemDataAtBoundary = getItemData;
const canEquipAtBoundary: CanEquipAtBoundary = canEquipEquipment as unknown as CanEquipAtBoundary;
const getEquipmentPreviewAtBoundary: GetEquipmentPreviewAtBoundary = getEquipmentPreview as unknown as GetEquipmentPreviewAtBoundary;
const getUnequipPreviewAtBoundary: GetUnequipPreviewAtBoundary = getUnequipPreview as unknown as GetUnequipPreviewAtBoundary;
const identifyEquipmentAtBoundary: IdentifyEquipmentAtBoundary = identifyEquipment;
const revealEquipmentAtBoundary: RevealEquipmentAtBoundary = revealEquipmentOnEquip;
const discardEquipmentItemsAtBoundary: DiscardEquipmentItemsAtBoundary = discardEquipmentItems;
const findRunObjectLootEntryAtBoundary: FindRunObjectLootEntryAtBoundary = findRunObjectLootEntry;
const addInventoryItemAtBoundary: AddInventoryItemAtBoundary = addInventoryItemToState;
const hasInventorySpaceAtBoundary: HasInventorySpaceAtBoundary = hasInventorySpace;
const getActiveRuneSpellKeysAtBoundary: GetActiveRuneSpellKeysAtBoundary = getActiveRuneSpellKeys;
const getRuneItemIdAtBoundary: GetRuneItemIdAtBoundary = getRuneItemId;
const syncMediumStateAtBoundary: SyncMediumStateAtBoundary = syncMediumState;
const clampCurrentMpAtBoundary: ClampCurrentMpAtBoundary = clampCurrentMpToMax;
const getCharMaxMpAtBoundary: GetCharMaxMpAtBoundary = getCharMaxMp;
const executeEnhanceAtBoundary: ExecuteEnhanceAtBoundary = executeEnhance;
const executePolishAtBoundary: ExecutePolishAtBoundary = executePolish;

function getSocketedRuneItemIds(character: EquipmentCharacter, slot: string): unknown[] {
  if (slot !== "weapon") return [];
  return getActiveRuneSpellKeysAtBoundary(character)
    .map(getRuneItemIdAtBoundary)
    .filter(Boolean);
}

function returnSocketedRunes(runeIds: unknown[]): boolean {
  runeIds.forEach(runeId => addInventoryItemAtBoundary(actionState, runeId));
  return runeIds.length > 0;
}

function getPreviewForDiscard(
  character: EquipmentCharacter,
  itemKey: unknown,
  requestedSlot: string | null = null
): EquipmentPreview | null {
  try {
    const preview = getEquipmentPreviewAtBoundary(character, itemKey, requestedSlot, { floor: actionState.floor });
    if (!preview) return null;
    return {
      slot: preview.slot,
      oldEq: preview.oldEq,
      primaryDiff: preview.primaryDiff,
      rows: preview.rows.map(({ key, current, next, diff }) => ({ key, current, next, diff }))
    };
  } catch {
    return null;
  }
}

export function equipEquipment({ inventoryIndex, actorIdx, requestedSlot = null }: EquipInput = {}) {
  const character = actionState.party[actorIdx as number];
  const itemKey = actionState.inventory[inventoryIndex as number];
  const availability = canEquipAtBoundary(character, itemKey, requestedSlot);
  if (!availability.ok) return availability;

  const slot = availability.slot;
  const oldEq = getEquipmentSlotValue(character.equipment, slot);
  const socketedRuneIds = getSocketedRuneItemIds(character, slot);
  if (!hasInventorySpaceAtBoundary(actionState.inventory, socketedRuneIds.length)) {
    return { ok: false, reason: "inventory_full_for_runes" };
  }
  const lootId = findRunObjectLootEntryAtBoundary(actionState, itemKey)?.id;
  const telemetryPreview = getEquipmentPreviewAtBoundary(character, itemKey, slot, { floor: actionState.floor });
  trackEquipmentDecision("equip", {
    state: actionState,
    character,
    candidateKey: itemKey,
    currentKey: oldEq,
    preview: telemetryPreview
  });

  character.equipment[slot] = itemKey;
  syncMediumStateAtBoundary(character);
  clampCurrentMpAtBoundary(character, getCharMaxMpAtBoundary);
  if (oldEq) actionState.inventory[inventoryIndex as number] = oldEq;
  else actionState.inventory.splice(inventoryIndex as number, 1);
  if (returnSocketedRunes(socketedRuneIds)) {
    addLog(`${character.name}の装着中のルーンがバッグに戻った。`);
  }

  const reveal = revealEquipmentAtBoundary(itemKey);
  trackLootLifecycle("adopted", { state: actionState, character, itemKey, lootId, source: "dungeon" });
  const item = getItemDataAtBoundary(itemKey);
  addLog(`${character.name}は${item.name}を装備した。`);
  if (oldEq) {
    const oldItem = getItemDataAtBoundary(oldEq);
    addLog(`${oldItem?.name || "装備品"}はバッグへ戻った。`);
  }
  if (reveal.revealed) {
    addLog(reveal.cursed
      ? `[呪い発動] ${item.name}は外せなくなった！`
      : `[賭け成功] ${item.name}に呪いはなかった。`);
  } else if (reveal.cursed) {
    addLog(`[呪い装備] ${item.name}は外せない。`);
  }
  playSound("move");
  saveAutosave();
  return { ok: true, slot, oldEq, itemKey };
}

export function unequipEquipment({ actorIdx, slot }: UnequipInput = {}) {
  const character = actionState.party[actorIdx as number];
  const itemKey = getEquipmentSlotValue(character?.equipment, slot);
  const item = getItemDataAtBoundary(itemKey);
  if (!character || !item || isCurseLocked(itemKey)) {
    return { ok: false, reason: "invalid_unequip" };
  }
  const socketedRuneIds = getSocketedRuneItemIds(character, slot as string);
  if (!hasInventorySpaceAtBoundary(actionState.inventory, 1 + socketedRuneIds.length)) {
    return { ok: false, reason: "inventory_full" };
  }

  const telemetryPreview = getUnequipPreviewAtBoundary(character, slot, { floor: actionState.floor });
  trackEquipmentDecision("unequip", {
    state: actionState,
    character,
    currentKey: itemKey,
    preview: telemetryPreview
  });
  character.equipment[slot as string] = null;
  syncMediumStateAtBoundary(character);
  clampCurrentMpAtBoundary(character, getCharMaxMpAtBoundary);
  addInventoryItemAtBoundary(actionState, itemKey);
  if (returnSocketedRunes(socketedRuneIds)) {
    addLog(`${character.name}の装着中のルーンがバッグに戻った。`);
  }
  addLog(`${character.name}は${item.name}を外した。`);
  playSound("move");
  saveAutosave();
  return { ok: true, itemKey, slot };
}

export function identifyEquipmentAt({ inventoryIndex, actorIdx, requestedSlot = null }: IdentifyInput = {}) {
  const item = actionState.inventory[inventoryIndex as number];
  const character = actionState.party[actorIdx as number];
  const lootId = findRunObjectLootEntryAtBoundary(actionState, item)?.id;
  const telemetryPreview = getEquipmentPreviewAtBoundary(character, item, requestedSlot, { floor: actionState.floor });
  trackEquipmentDecision("identify", {
    state: actionState,
    character,
    candidateKey: item,
    preview: telemetryPreview
  });
  const result = identifyEquipmentAtBoundary(actionState, item, character);
  if (!result.ok) return result;

  trackLootLifecycle("identified", { state: actionState, character, itemKey: item, lootId, source: "dungeon" });

  const revealedData = getItemDataAtBoundary(item);
  addLog(`[鑑定] ${revealedData.name}。${result.cursed ? "呪いを確認した。" : "呪いはない。"}`);
  playSound("level_up");
  saveAutosave();
  return { ...result, itemKey: item };
}

export function enhanceEquipment(target: unknown) {
  return executeEnhanceAtBoundary(target);
}

export function polishEquipment(target: unknown, affixIndex: unknown) {
  return executePolishAtBoundary(target, affixIndex);
}

export function discardEquipmentAt(index: number, expectedItemKey: unknown, { actorIdx = 0, requestedSlot = null }: {
  actorIdx?: number;
  requestedSlot?: string | null;
} = {}) {
  const character = actionState.party[actorIdx];
  return discardEquipmentItemsAtBoundary([{
    index,
    expectedItemKey,
    preview: getPreviewForDiscard(character, expectedItemKey, requestedSlot)
  }], { character });
}

export function discardEquipmentSelection(indices: Iterable<number>, { actorIdx = 0 }: { actorIdx?: number } = {}) {
  const character = actionState.party[actorIdx];
  const entries = [...indices].map((index) => ({
    index,
    expectedItemKey: actionState.inventory[index],
    preview: getPreviewForDiscard(character, actionState.inventory[index])
  }));
  return discardEquipmentItemsAtBoundary(entries, { character });
}
