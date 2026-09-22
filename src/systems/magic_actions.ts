import { state, saveAutosave, addLog } from "../state.js";
import { addCanonicalInventoryItemToState } from "../state/inventory_state.js";
import { hasInventorySpace } from "../rules/item_inventory.js";
import {
  getRuneItemId,
  getRuneSpellKey,
  socketRune,
  unsocketRune
} from "../rules/magic_rules.js";

export interface SocketRuneFromInventoryInput {
  actorIdx?: number;
  inventoryIndex?: number;
}

export interface UnsocketRuneToInventoryInput {
  actorIdx?: number;
  spellKey?: string;
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

type MagicActionCharacter = Record<string, unknown>;

function getActor(actorIdx: number | undefined): MagicActionCharacter | null {
  return isInteger(actorIdx) ? state.party?.[actorIdx] ?? null : null;
}

export function socketRuneFromInventory(
  { actorIdx, inventoryIndex }: SocketRuneFromInventoryInput = {}
) {
  const character = getActor(actorIdx);
  const rune = state.inventory?.[inventoryIndex as number];
  const spellKey = getRuneSpellKey(rune);
  if (!character || !spellKey) return { ok: false, reason: "medium_or_rune_missing" };

  const result = socketRune(character, rune);
  if (!result.ok) return result;
  state.inventory.splice(inventoryIndex as number, 1);
  saveAutosave();
  return result;
}

export function unsocketRuneToInventory(
  { actorIdx, spellKey }: UnsocketRuneToInventoryInput = {}
) {
  const character = getActor(actorIdx);
  const runeId = getRuneItemId(spellKey);
  if (!character || !runeId) return { ok: false, reason: "rune_missing" };
  if (!hasInventorySpace(state.inventory)) {
    addLog("バッグが満杯のため、ルーンを外せません。");
    return { ok: false, reason: "inventory_full" };
  }

  const result = unsocketRune(character, spellKey);
  if (!result.ok) return result;
  if (!addCanonicalInventoryItemToState(state, runeId)) {
    socketRune(character, runeId);
    return { ok: false, reason: "inventory_full" };
  }
  saveAutosave();
  return result;
}
