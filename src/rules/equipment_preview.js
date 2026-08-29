// Pure equipment stat/slot calculations used by the overlay and action layer.
// This module never reads or mutates the live game state.
import {
  getCharAgi,
  getCharDerivedStats,
  getCharInt,
  getCharLuk,
  getCharMaxHp,
  getCharMaxMp,
  getCharPie,
  getCharStr,
  getCharVit
} from "./character_stats.js";
import { getCharAffixSum, getItemData } from "./item_rules.js";
import { isCurseLocked } from "./identification_rules.js";
import {
  EQUIPMENT_SLOTS,
  getEquipmentSlot,
  getEquipmentSlotsForType
} from "./equipment_slots.js";

export const EQUIPMENT_PREVIEW_STATS = [
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "maxHp", label: "最大HP" },
  { key: "maxMp", label: "最大MP" },
  { key: "str", label: "力" },
  { key: "int", label: "知恵" },
  { key: "pie", label: "信仰" },
  { key: "vit", label: "生命" },
  { key: "agi", label: "素早さ" },
  { key: "luk", label: "運" },
  { key: "magic", label: "魔力" },
  { key: "healing", label: "回復" },
  { key: "speed", label: "速度" },
  { key: "trap", label: "罠" },
  { key: "treasure", label: "探宝" },
  { key: "spellGuard", label: "魔法耐性" },
  { key: "antiDragon", label: "竜特効" },
  { key: "antiUndead", label: "不死特効" },
  { key: "firstStrike", label: "先制" },
  { key: "poisonWard", label: "毒耐性" },
  { key: "poisonAtk", label: "毒付与" }
];

export function isEquipmentItem(item) {
  return item && ["weapon", "shield", "armor", "accessory"].includes(item.type);
}

export function getEquipmentSlotValue(equipment, slot) {
  try {
    return equipment?.[slot] || null;
  } catch {
    return null;
  }
}

export function getDefaultTargetSlot(char, itemType) {
  const slots = getEquipmentSlotsForType(itemType);
  const emptySlot = slots.find(({ id }) => !getEquipmentSlotValue(char.equipment, id));
  if (emptySlot) return emptySlot.id;
  const replaceableSlot = slots.find(({ id }) => !isCurseLocked(getEquipmentSlotValue(char.equipment, id)));
  return replaceableSlot?.id || slots[0]?.id || null;
}

export function getTargetSlot(char, itemType, requestedSlot = null) {
  const requested = getEquipmentSlot(requestedSlot);
  return requested?.itemType === itemType
    ? requested.id
    : getDefaultTargetSlot(char, itemType);
}

function getDisplayStats(char, floor) {
  const derived = getCharDerivedStats(char, { floor });
  return {
    ...derived,
    maxHp: getCharMaxHp(char),
    maxMp: getCharMaxMp(char),
    str: getCharStr(char),
    int: getCharInt(char),
    pie: getCharPie(char),
    vit: getCharVit(char),
    agi: getCharAgi(char),
    luk: getCharLuk(char),
    spellGuard: getCharAffixSum(char, "spellGuard"),
    antiDragon: getCharAffixSum(char, "antiDragon"),
    antiUndead: getCharAffixSum(char, "antiUndead"),
    firstStrike: getCharAffixSum(char, "firstStrike"),
    poisonWard: getCharAffixSum(char, "poisonWard"),
    poisonAtk: getCharAffixSum(char, "poisonAtk")
  };
}

function getPrimaryDiff(itemType, rows) {
  if (itemType === "weapon") return rows.find((row) => row.key === "attack")?.diff ?? 0;
  if (itemType === "shield" || itemType === "armor") return rows.find((row) => row.key === "defense")?.diff ?? 0;
  return rows.find((row) => row.diff !== 0)?.diff ?? 0;
}

export function createEquipmentPreviewChar(char) {
  const equipment = {};
  EQUIPMENT_SLOTS.forEach(({ id }) => {
    equipment[id] = getEquipmentSlotValue(char?.equipment, id);
  });
  return { ...char, equipment };
}

function createPreviewRows(current, next) {
  return EQUIPMENT_PREVIEW_STATS.map((stat) => ({
    ...stat,
    current: current[stat.key],
    next: next[stat.key],
    diff: next[stat.key] - current[stat.key]
  }));
}

export function getEquipmentPreview(char, itemKey, requestedSlot = null, { floor = 1 } = {}) {
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) return null;

  const previewChar = createEquipmentPreviewChar(char);
  const slot = getTargetSlot(previewChar, item.type, requestedSlot);
  if (!slot) return null;
  const current = getDisplayStats(previewChar, floor);
  const oldEq = getEquipmentSlotValue(previewChar.equipment, slot);
  previewChar.equipment[slot] = itemKey;
  const next = getDisplayStats(previewChar, floor);
  const rows = createPreviewRows(current, next);
  return { item, itemType: item.type, slot, rows, primaryDiff: getPrimaryDiff(item.type, rows), oldEq };
}

export function getUnequipPreview(char, slot, { floor = 1 } = {}) {
  const previewChar = createEquipmentPreviewChar(char);
  const itemKey = getEquipmentSlotValue(previewChar.equipment, slot);
  const item = getItemData(itemKey);
  if (!item) return null;

  const current = getDisplayStats(previewChar, floor);
  previewChar.equipment[slot] = null;
  const next = getDisplayStats(previewChar, floor);
  const rows = createPreviewRows(current, next);
  return { item, itemType: item.type, slot, rows, primaryDiff: getPrimaryDiff(item.type, rows), oldEq: null };
}
