import { getItemData } from "./item_rules.js";
import { isCurseLocked } from "./identification_rules.js";
import { getEquipmentSlot } from "./equipment_slots.js";
import { getTargetSlot, isEquipmentItem } from "./equipment_preview.js";
import { getEquipmentHands, getCharacterEquipmentHands, MAX_EQUIPMENT_HANDS } from "./equipment_hands.js";
import {
  getActiveRuneSpellKeys,
  getEquippedMedium,
  getRuneItemId,
  getRuneSpellKey,
  socketRune,
  syncMediumState,
  unsocketRune
} from "./magic_rules.js";
import { getCharMaxMp } from "./character_stats.js";

const LOADOUT_SLOTS = Object.freeze(["weapon", "shield", "armor", "accessory", "accessory2"]);

function cloneCharacter(character) {
  if (!character || typeof character !== "object") return character;
  const equipment = Object.fromEntries(
    LOADOUT_SLOTS.map(slot => [slot, character.equipment?.[slot] || null])
  );
  return {
    ...character,
    equipment,
    mediumState: character.mediumState && typeof character.mediumState === "object"
      ? { ...character.mediumState, socketedRunes: [...(character.mediumState.socketedRunes || [])] }
      : character.mediumState,
    spells: Array.isArray(character.spells) ? [...character.spells] : character.spells
  };
}

function cloneParty(party) {
  return (Array.isArray(party) ? party : []).map(cloneCharacter);
}

function itemIdentity(item) {
  if (item && typeof item === "object") {
    return item.instanceId ? `instance:${item.instanceId}` : `object:${JSON.stringify(item)}`;
  }
  return `value:${String(item ?? "")}`;
}

function sameItem(left, right) {
  if (left === right) return true;
  if (left && right && typeof left === "object" && typeof right === "object") {
    return Boolean(left.instanceId && right.instanceId && left.instanceId === right.instanceId);
  }
  return false;
}

function sameItemList(left, right) {
  if (left.length !== right.length) return false;
  const remaining = [...right];
  return left.every(item => {
    const index = remaining.findIndex(candidate => sameItem(item, candidate));
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

function getDraftActor(draft, actorIdx) {
  return Number.isInteger(actorIdx) ? draft?.party?.[actorIdx] || null : null;
}

function normalizeDraftActor(character) {
  if (!character?.startingKit) return character;
  syncMediumState(character);
  const maxMp = Math.max(0, getCharMaxMp(character));
  if (Number.isFinite(character.mp)) character.mp = Math.min(character.mp, maxMp);
  return character;
}

function copyDraft(draft) {
  return {
    ...draft,
    party: cloneParty(draft.party),
    inventory: [...draft.inventory],
    discardedItems: [...(draft.discardedItems || [])]
  };
}

function getRuneIds(character) {
  return getActiveRuneSpellKeys(character).map(getRuneItemId).filter(Boolean);
}

function addInventory(draft, item) {
  draft.inventory.push(item);
}

function removeInventoryAt(draft, inventoryIndex, expectedItem = undefined) {
  if (!Number.isInteger(inventoryIndex) || inventoryIndex < 0 || inventoryIndex >= draft.inventory.length) {
    return null;
  }
  if (expectedItem !== undefined && !sameItem(draft.inventory[inventoryIndex], expectedItem)) return null;
  return draft.inventory.splice(inventoryIndex, 1)[0] ?? null;
}

function getSlotItem(character, slot) {
  return character?.equipment?.[slot] || null;
}

function getEquipmentChanges(before, after) {
  const changes = [];
  const partySize = Math.max(before.party.length, after.party.length);
  for (let actorIdx = 0; actorIdx < partySize; actorIdx++) {
    LOADOUT_SLOTS.forEach(slot => {
      const from = getSlotItem(before.party[actorIdx], slot);
      const to = getSlotItem(after.party[actorIdx], slot);
      if (!sameItem(from, to)) changes.push({ actorIdx, slot, from, to });
    });
  }
  return changes;
}

function getRuneChanges(before, after) {
  const changes = [];
  const partySize = Math.max(before.party.length, after.party.length);
  for (let actorIdx = 0; actorIdx < partySize; actorIdx++) {
    const from = getRuneIds(before.party[actorIdx] || {});
    const to = getRuneIds(after.party[actorIdx] || {});
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ actorIdx, from, to });
  }
  return changes;
}

function getPlacedItems(draft) {
  return [
    ...(draft.inventory || []),
    ...(draft.party || []).flatMap(character => Object.values(character?.equipment || {}))
  ].filter(Boolean);
}

export function createLoadoutDraft(stateLike) {
  const draft = {
    party: cloneParty(stateLike?.party),
    inventory: Array.isArray(stateLike?.inventory) ? [...stateLike.inventory] : [],
    baseParty: cloneParty(stateLike?.party),
    baseInventory: Array.isArray(stateLike?.inventory) ? [...stateLike.inventory] : [],
    discardedItems: []
  };
  draft.party.forEach(normalizeDraftActor);
  return draft;
}

export function isLoadoutDraftDirty(draft) {
  if (!draft) return false;
  const changes = getLoadoutDraftChanges(draft);
  return changes.equipment.length > 0
    || changes.runes.length > 0
    || changes.discarded.length > 0
    || !sameItemList(draft.inventory, draft.baseInventory);
}

export function getLoadoutDraftChanges(draft) {
  if (!draft) return { equipment: [], runes: [], discarded: [] };
  const equipment = getEquipmentChanges({ party: draft.baseParty }, draft);
  const runes = getRuneChanges({ party: draft.baseParty }, draft);
  const currentItems = new Map();
  getPlacedItems(draft).forEach(item => {
    const key = itemIdentity(item);
    currentItems.set(key, (currentItems.get(key) || 0) + 1);
  });
  const discardedFromBase = draft.baseInventory.filter(item => {
    const key = itemIdentity(item);
    const count = currentItems.get(key) || 0;
    if (count <= 0) return true;
    currentItems.set(key, count - 1);
    return false;
  });
  const discarded = [];
  const discardedKeys = new Set();
  [...discardedFromBase, ...(draft.discardedItems || [])].forEach(item => {
    const key = itemIdentity(item);
    if (discardedKeys.has(key)) return;
    discardedKeys.add(key);
    discarded.push(item);
  });
  return { equipment, runes, discarded };
}

export function getLoadoutEquipAvailability(draft, { actorIdx, item, requestedSlot = null } = {}) {
  const character = getDraftActor(draft, actorIdx);
  const itemData = getItemData(item);
  if (!character) return { ok: false, reason: "装備対象がありません" };
  if (!isEquipmentItem(itemData)) return { ok: false, reason: "装備品ではありません" };
  const slot = getTargetSlot(character, itemData.type, requestedSlot);
  if (!slot) return { ok: false, reason: "装備先がありません" };
  const oldItem = getSlotItem(character, slot);
  if (isCurseLocked(oldItem)) return { ok: false, reason: "現在の呪い装備を外せません", slot };

  if (itemData.type === "shield" && getEquipmentHands(character.equipment.weapon) === 2) {
    return { ok: false, reason: "両手武器を先に外すか交換してください。", slot };
  }
  if (itemData.type === "weapon" && getEquipmentHands(item) === 2) {
    const shield = getSlotItem(character, "shield");
    if (shield && isCurseLocked(shield)) {
      return { ok: false, reason: "呪いの盾が固定されているため、両手武器に交換できません。", slot };
    }
  }
  return { ok: true, reason: "", slot, oldItem };
}

export function stageEquip(draft, { actorIdx, inventoryIndex, requestedSlot = null } = {}) {
  const candidate = draft?.inventory?.[inventoryIndex];
  const availability = getLoadoutEquipAvailability(draft, { actorIdx, item: candidate, requestedSlot });
  if (!availability.ok) return availability;
  const next = copyDraft(draft);
  const character = getDraftActor(next, actorIdx);
  const item = removeInventoryAt(next, inventoryIndex, candidate);
  if (!item) return { ok: false, reason: "装備品が見つかりません" };
  const oldItem = getSlotItem(character, availability.slot);
  const oldRuneIds = availability.slot === "weapon" ? getRuneIds(character) : [];
  character.equipment[availability.slot] = item;
  if (oldItem) addInventory(next, oldItem);
  if (availability.slot === "weapon") {
    oldRuneIds.forEach(runeId => addInventory(next, runeId));
  }

  if (availability.slot === "weapon" && getEquipmentHands(item) === 2 && character.equipment.shield) {
    const shield = character.equipment.shield;
    character.equipment.shield = null;
    addInventory(next, shield);
  }
  normalizeDraftActor(character);
  return { ok: true, draft: next, slot: availability.slot, item, oldItem };
}

export function stageUnequip(draft, { actorIdx, slot } = {}) {
  const equipmentSlot = getEquipmentSlot(slot);
  const character = getDraftActor(draft, actorIdx);
  const item = getSlotItem(character, equipmentSlot?.id);
  if (!equipmentSlot || !character || !item) return { ok: false, reason: "装備がありません" };
  if (isCurseLocked(item)) return { ok: false, reason: "呪い装備は外せません" };
  const next = copyDraft(draft);
  const nextCharacter = getDraftActor(next, actorIdx);
  nextCharacter.equipment[equipmentSlot.id] = null;
  addInventory(next, item);
  if (equipmentSlot.id === "weapon") {
    getRuneIds(character).forEach(runeId => addInventory(next, runeId));
    nextCharacter.mediumState = { mediumKey: null, socketedRunes: [] };
  }
  normalizeDraftActor(nextCharacter);
  return { ok: true, draft: next, slot: equipmentSlot.id, item };
}

export function stageSocketRune(draft, { actorIdx, inventoryIndex } = {}) {
  const character = getDraftActor(draft, actorIdx);
  const rune = draft?.inventory?.[inventoryIndex];
  if (!character || !getRuneSpellKey(rune)) return { ok: false, reason: "媒体またはRuneがありません" };
  const next = copyDraft(draft);
  const nextCharacter = getDraftActor(next, actorIdx);
  const result = socketRune(nextCharacter, rune);
  if (!result.ok) return result;
  removeInventoryAt(next, inventoryIndex, rune);
  return { ok: true, draft: next, spellKey: result.spellKey };
}

export function stageUnsocketRune(draft, { actorIdx, spellKey } = {}) {
  const character = getDraftActor(draft, actorIdx);
  const runeId = getRuneItemId(spellKey);
  if (!character || !runeId) return { ok: false, reason: "Runeがありません" };
  const next = copyDraft(draft);
  const nextCharacter = getDraftActor(next, actorIdx);
  const result = unsocketRune(nextCharacter, spellKey);
  if (!result.ok) return result;
  addInventory(next, runeId);
  return { ok: true, draft: next, spellKey };
}

export function stageDiscardInventoryItem(draft, inventoryIndex) {
  const item = draft?.inventory?.[inventoryIndex];
  if (!item) return { ok: false, reason: "装備品が見つかりません" };
  const next = copyDraft(draft);
  removeInventoryAt(next, inventoryIndex, item);
  next.discardedItems.push(item);
  return { ok: true, draft: next, item };
}

export function validateLoadoutDraft(draft) {
  if (!draft || !Array.isArray(draft.party) || !Array.isArray(draft.inventory)) {
    return { ok: false, errors: ["装備変更を読み込めません。"] };
  }
  const errors = [];
  draft.party.forEach((character, actorIdx) => {
    const hands = getCharacterEquipmentHands(character);
    if (hands > MAX_EQUIPMENT_HANDS) errors.push(`キャラクター${actorIdx + 1}の手数が上限を超えています。`);
    LOADOUT_SLOTS.forEach(slot => {
      const item = getSlotItem(character, slot);
      const itemData = getItemData(item);
      if (item && !itemData) errors.push(`不明な装備が${slot}にあります。`);
      if (item && itemData && itemData.type !== getEquipmentSlot(slot)?.itemType) {
        errors.push(`${slot}に装備種別が合っていません。`);
      }
    });
    if (character.startingKit) {
      const medium = getEquippedMedium(character);
      const runes = Array.isArray(character.mediumState?.socketedRunes)
        ? character.mediumState.socketedRunes.map(getRuneSpellKey).filter(Boolean)
        : [];
      if (runes.length > (medium?.runeSlots || 0)) errors.push(`キャラクター${actorIdx + 1}のRune容量を超えています。`);
      if (new Set(runes).size !== runes.length) errors.push(`キャラクター${actorIdx + 1}に重複したRuneがあります。`);
      if (getActiveRuneSpellKeys(character).length !== runes.length) errors.push(`キャラクター${actorIdx + 1}のRune状態が媒体と一致しません。`);
    }
  });

  if (draft.inventory.length > 20) errors.push(`バッグが満杯です（${draft.inventory.length}/20）。返却先を整理してください。`);
  const baseParty = { party: draft.baseParty };
  getEquipmentChanges(baseParty, draft).forEach(({ from, to }) => {
    if (from && !sameItem(from, to) && isCurseLocked(from)) errors.push("呪いで固定された装備は外せません。");
  });
  return { ok: errors.length === 0, errors };
}

export function getLoadoutValidationSummary(draft) {
  const validation = validateLoadoutDraft(draft);
  return { ...validation, message: validation.ok ? "変更を確定できます。" : validation.errors.join(" ") };
}
