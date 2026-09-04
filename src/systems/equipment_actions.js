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

function getSocketedRuneItemIds(character, slot) {
  if (slot !== "weapon") return [];
  return getActiveRuneSpellKeys(character)
    .map(getRuneItemId)
    .filter(Boolean);
}

function returnSocketedRunes(runeIds) {
  runeIds.forEach(runeId => addInventoryItemToState(state, runeId));
  return runeIds.length > 0;
}

function getPreviewForDiscard(character, itemKey, requestedSlot = null) {
  try {
    const preview = getEquipmentPreview(character, itemKey, requestedSlot, { floor: state.floor });
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

export function equipEquipment({ inventoryIndex, actorIdx, requestedSlot = null } = {}) {
  const character = state.party[actorIdx];
  const itemKey = state.inventory[inventoryIndex];
  const availability = canEquipEquipment(character, itemKey, requestedSlot);
  if (!availability.ok) return availability;

  const slot = availability.slot;
  const oldEq = getEquipmentSlotValue(character.equipment, slot);
  const socketedRuneIds = getSocketedRuneItemIds(character, slot);
  if (!hasInventorySpace(state.inventory, socketedRuneIds.length)) {
    return { ok: false, reason: "inventory_full_for_runes" };
  }
  const lootId = findRunObjectLootEntry(state, itemKey)?.id;
  const telemetryPreview = getEquipmentPreview(character, itemKey, slot, { floor: state.floor });
  trackEquipmentDecision("equip", {
    state,
    character,
    candidateKey: itemKey,
    currentKey: oldEq,
    preview: telemetryPreview
  });

  character.equipment[slot] = itemKey;
  syncMediumState(character);
  clampCurrentMpToMax(character, getCharMaxMp);
  if (oldEq) state.inventory[inventoryIndex] = oldEq;
  else state.inventory.splice(inventoryIndex, 1);
  if (returnSocketedRunes(socketedRuneIds)) {
    addLog(`${character.name}のsocket中Runeがバッグに戻った。`);
  }

  const reveal = revealEquipmentOnEquip(itemKey);
  trackLootLifecycle("adopted", { state, character, itemKey, lootId, source: "dungeon" });
  const item = getItemData(itemKey);
  addLog(`${character.name}は${item.name}を装備した。`);
  if (oldEq) {
    const oldItem = getItemData(oldEq);
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

export function unequipEquipment({ actorIdx, slot } = {}) {
  const character = state.party[actorIdx];
  const itemKey = getEquipmentSlotValue(character?.equipment, slot);
  const item = getItemData(itemKey);
  if (!character || !item || isCurseLocked(itemKey)) {
    return { ok: false, reason: "invalid_unequip" };
  }
  const socketedRuneIds = getSocketedRuneItemIds(character, slot);
  if (!hasInventorySpace(state.inventory, 1 + socketedRuneIds.length)) {
    return { ok: false, reason: "inventory_full" };
  }

  const telemetryPreview = getUnequipPreview(character, slot, { floor: state.floor });
  trackEquipmentDecision("unequip", {
    state,
    character,
    currentKey: itemKey,
    preview: telemetryPreview
  });
  character.equipment[slot] = null;
  syncMediumState(character);
  clampCurrentMpToMax(character, getCharMaxMp);
  addInventoryItemToState(state, itemKey);
  if (returnSocketedRunes(socketedRuneIds)) {
    addLog(`${character.name}のsocket中Runeがバッグに戻った。`);
  }
  addLog(`${character.name}は${item.name}を外した。`);
  playSound("move");
  saveAutosave();
  return { ok: true, itemKey, slot };
}

export function identifyEquipmentAt({ inventoryIndex, actorIdx, requestedSlot = null } = {}) {
  const item = state.inventory[inventoryIndex];
  const character = state.party[actorIdx];
  const lootId = findRunObjectLootEntry(state, item)?.id;
  const telemetryPreview = getEquipmentPreview(character, item, requestedSlot, { floor: state.floor });
  trackEquipmentDecision("identify", {
    state,
    character,
    candidateKey: item,
    preview: telemetryPreview
  });
  const result = identifyEquipment(state, item, character);
  if (!result.ok) return result;

  trackLootLifecycle("identified", { state, character, itemKey: item, lootId, source: "dungeon" });

  const revealedData = getItemData(item);
  addLog(`[鑑定] ${revealedData.name}。${result.cursed ? "呪いを確認した。" : "呪いはない。"}`);
  playSound("level_up");
  saveAutosave();
  return { ...result, itemKey: item };
}

export function enhanceEquipment(target) {
  return executeEnhance(target);
}

export function polishEquipment(target, affixIndex) {
  return executePolish(target, affixIndex);
}

export function discardEquipmentAt(index, expectedItemKey, { actorIdx = 0, requestedSlot = null } = {}) {
  const character = state.party[actorIdx];
  return discardEquipmentItems([{
    index,
    expectedItemKey,
    preview: getPreviewForDiscard(character, expectedItemKey, requestedSlot)
  }], { character });
}

export function discardEquipmentSelection(indices, { actorIdx = 0 } = {}) {
  const character = state.party[actorIdx];
  const entries = [...indices].map((index) => ({
    index,
    expectedItemKey: state.inventory[index],
    preview: getPreviewForDiscard(character, state.inventory[index])
  }));
  return discardEquipmentItems(entries, { character });
}
