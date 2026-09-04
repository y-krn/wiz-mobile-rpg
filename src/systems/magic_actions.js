import { state, saveAutosave, addLog } from "../state.js";
import { addInventoryItemToState } from "../state/inventory_state.js";
import { hasInventorySpace } from "../rules/item_inventory.js";
import {
  getRuneItemId,
  getRuneSpellKey,
  socketRune,
  unsocketRune
} from "../rules/magic_rules.js";

function getActor(actorIdx) {
  return Number.isInteger(actorIdx) ? state.party?.[actorIdx] : null;
}

export function socketRuneFromInventory({ actorIdx, inventoryIndex } = {}) {
  const character = getActor(actorIdx);
  const rune = state.inventory?.[inventoryIndex];
  const spellKey = getRuneSpellKey(rune);
  if (!character || !spellKey) return { ok: false, reason: "medium_or_rune_missing" };

  const result = socketRune(character, rune);
  if (!result.ok) return result;
  state.inventory.splice(inventoryIndex, 1);
  saveAutosave();
  return result;
}

export function unsocketRuneToInventory({ actorIdx, spellKey } = {}) {
  const character = getActor(actorIdx);
  const runeId = getRuneItemId(spellKey);
  if (!character || !runeId) return { ok: false, reason: "rune_missing" };
  if (!hasInventorySpace(state.inventory)) {
    addLog("バッグが満杯のため、Runeを外せません。");
    return { ok: false, reason: "inventory_full" };
  }

  const result = unsocketRune(character, spellKey);
  if (!result.ok) return result;
  if (!addInventoryItemToState(state, runeId)) {
    socketRune(character, runeId);
    return { ok: false, reason: "inventory_full" };
  }
  saveAutosave();
  return result;
}
