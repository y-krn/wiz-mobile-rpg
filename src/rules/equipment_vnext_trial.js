import {
  VNEXT_BASE_ITEM_AUDIT,
  VNEXT_CORE_AUDIT,
  VNEXT_SUPPORT_AUDIT
} from "../data/equipment_vnext.js";
import { ITEMS } from "../data/items.js";
import { MEDIUM_IDS } from "../data/magic.js";

export const VNEXT_UNAVAILABLE_ITEM_IDS = Object.freeze([
  "WAKE_POWDER",
  "PARALYZE_CURE",
  "RUNE_DIALKO"
]);

const VNEXT_DEVOTION_WEAPON_IDS = Object.freeze(["WAND", "SAGE_STAFF"]);

export function isVNextMediumWeapon(baseId) {
  return MEDIUM_IDS.includes(baseId);
}

export function isVNextDevotionWeapon(baseId) {
  return VNEXT_DEVOTION_WEAPON_IDS.includes(baseId);
}

export const VNEXT_CANONICAL_BASE_REPRESENTATIVES = Object.freeze({
  dagger: "DAGGER",
  sword: "SHORT_SWORD",
  mace: "MACE",
  greatsword: "CLAYMORE",
  wand: "WAND",
  staff: "SAGE_STAFF",
  lightArmor: "ROBE",
  mediumArmor: "LEATHER_ARMOR",
  heavyArmor: "PLATE_MAIL",
  smallShield: "BUCKLER",
  largeShield: "LARGE_SHIELD",
  magicShield: "MAGIC_SHIELD",
  ring: "VNEXT_RING",
  amulet: "VNEXT_AMULET"
});

export function getVNextTrialBaseId(productionId) {
  const audit = VNEXT_BASE_ITEM_AUDIT[productionId];
  if (!audit || !["keep", "merge"].includes(audit.disposition)) return null;
  if (!audit.targetBaseId || !VNEXT_CANONICAL_BASE_REPRESENTATIVES[audit.targetBaseId]) return null;
  return VNEXT_CANONICAL_BASE_REPRESENTATIVES[audit.targetBaseId];
}

export function getVNextTrialCanonicalBaseId(productionId) {
  if (productionId === "VNEXT_RING") return "ring";
  if (productionId === "VNEXT_AMULET") return "amulet";
  const audit = VNEXT_BASE_ITEM_AUDIT[productionId];
  return audit && ["keep", "merge"].includes(audit.disposition) ? audit.targetBaseId || null : null;
}

export function getVNextTrialCandidates(productionIds) {
  return [...new Set(productionIds.map(getVNextTrialBaseId).filter(Boolean))];
}

export function getVNextTrialChestCandidates(itemIds) {
  return [...new Set(itemIds.filter(itemId => !VNEXT_UNAVAILABLE_ITEM_IDS.includes(itemId)).map(itemId => {
    const type = ITEMS[itemId]?.type;
    return ["weapon", "armor", "shield", "accessory"].includes(type)
      ? getVNextTrialBaseId(itemId)
      : itemId;
  }).filter(Boolean))];
}

export function isVNextTrialSupport(id, { slot = null, baseId = null } = {}) {
  if (VNEXT_SUPPORT_AUDIT[id]?.disposition !== "keep") return false;
  if (id === "followUpMp") return slot === "weapon" && isVNextMediumWeapon(baseId);
  return true;
}

export function isVNextTrialCore(id) {
  return VNEXT_CORE_AUDIT[id]?.disposition === "keep";
}
