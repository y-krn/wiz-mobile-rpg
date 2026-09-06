import { getItemBaseId, getItemData } from "./item_rules.js";
import { getAffixDefinition } from "../data/affixes.js";
import { MEDIUMS, RUNE_SUPPLY_BANDS } from "../data/magic.js";
import { getWeaponBehaviorProfile } from "../data/weapon_behavior_profiles.js";
import { getRuneSpellKey } from "./magic_rules.js";
import { INVENTORY_CAPACITY } from "./item_inventory.js";

const EQUIPMENT_TYPES = new Set(["weapon", "shield", "armor", "accessory"]);
const IDENTIFICATION_STAGES = new Set(["unknown", "discovery", "observation", "trial", "full"]);
const RUNE_SUPPLY_BAND_IDS = Object.freeze([
  ...RUNE_SUPPLY_BANDS.map(band => band.id),
  "other"
]);

function sameItem(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return typeof left !== "object" && typeof right !== "object" && getItemBaseId(left) === getItemBaseId(right);
  }
  return Boolean(left.instanceId && left.instanceId === right.instanceId);
}

function itemBaseId(item) {
  return getItemBaseId(item) || null;
}

function itemCategory(item) {
  const type = getItemData(item)?.type;
  if (type === "rune" || getRuneSpellKey(item)) return "rune";
  if (EQUIPMENT_TYPES.has(type)) return "equipment";
  if (type === "usable") return "consumable";
  return "other";
}

function createLocationUsage(stateLike) {
  return {
    activeRune: new Set(),
    equipped: new Set(),
    bag: new Set(),
    activeRunes: (stateLike?.party || []).flatMap(character => character?.mediumState?.socketedRunes || []),
    equippedItems: (stateLike?.party || []).flatMap(character => Object.entries(character?.equipment || {})
      .map(([slot, equipped]) => ({ slot, item: equipped }))
      .filter(entry => entry.item)),
    bagItems: stateLike?.inventory || []
  };
}

function takeUnusedMatch(collection, item, used) {
  const index = (collection || []).findIndex((candidate, candidateIndex) => (
    !used.has(candidateIndex) && sameItem(candidate?.item ?? candidate, item)
  ));
  if (index < 0) return null;
  used.add(index);
  return collection[index];
}

function getLocation(stateLike, item, usage = createLocationUsage(stateLike)) {
  if (takeUnusedMatch(usage.activeRunes, item, usage.activeRune)) {
    return { id: "active_rune", slot: null };
  }

  const equipped = takeUnusedMatch(usage.equippedItems, item, usage.equipped);
  if (equipped) return { id: "equipped", slot: equipped.slot };

  if (takeUnusedMatch(usage.bagItems, item, usage.bag)) return { id: "bag", slot: null };
  return { id: "other", slot: null };
}

function getAffixSummary(item) {
  const affixes = Array.isArray(item?.affixes) ? item.affixes : [];
  return affixes.reduce((summary, affix) => {
    const definition = getAffixDefinition(affix?.id || affix?.type);
    const kind = definition?.kind || affix?.kind;
    if (kind === "core") {
      summary.coreCount += 1;
      const axis = definition?.buildAxis || affix?.buildAxis;
      if (axis === "main") summary.coreMainAxisCount += 1;
      if (axis === "auxiliary") summary.coreAuxiliaryCount += 1;
    }
    if (kind === "support") summary.supportCount += 1;
    const role = definition?.buildRole || affix?.buildRole;
    if (["reinforce", "convert", "pivot"].includes(role)) summary.lootRoles[role] += 1;
    return summary;
  }, {
    coreCount: 0,
    supportCount: 0,
    coreMainAxisCount: 0,
    coreAuxiliaryCount: 0,
    lootRoles: { reinforce: 0, convert: 0, pivot: 0 }
  });
}

function getIdentificationStage(item) {
  if (!item || typeof item !== "object") return "full";
  const stage = item.identified === false ? item.knowledgeStage : "full";
  return IDENTIFICATION_STAGES.has(stage) ? stage : "unknown";
}

function getWeaponBehavior(item) {
  const data = getItemData(item);
  if (data?.type !== "weapon") return null;
  return getWeaponBehaviorProfile({ ...data, equipment: { weapon: item } }).id;
}

function createRuneSupplyBandComposition() {
  return Object.fromEntries(RUNE_SUPPLY_BAND_IDS.map(band => [band, 0]));
}

function getRuneSupplyBand(item) {
  const supplyBand = getItemData(item)?.supplyBand;
  return RUNE_SUPPLY_BAND_IDS.includes(supplyBand) ? supplyBand : "other";
}

function emptyComposition() {
  return {
    category: { equipment: 0, rune: 0, consumable: 0, other: 0 },
    runeSupplyBand: createRuneSupplyBandComposition(),
    location: { bag: 0, equipped: 0, active_rune: 0, other: 0 },
    equipmentSlot: { weapon: 0, shield: 0, armor: 0, accessory: 0, other: 0 },
    weaponBehavior: { light: 0, blade: 0, impact: 0, heavy: 0, medium: 0, other: 0 },
    lootRole: { reinforce: 0, convert: 0, pivot: 0 },
    identificationStage: { unknown: 0, discovery: 0, observation: 0, trial: 0, full: 0 }
  };
}

/**
 * Classify the production unbankedObjectLoot entries without creating a second
 * ownership ledger. The returned object is telemetry input only.
 */
export function buildObjectLootStakeSnapshot(stateLike) {
  const entries = Array.isArray(stateLike?.currentRun?.unbankedObjectLoot)
    ? stateLike.currentRun.unbankedObjectLoot.filter(entry => entry?.item)
    : [];
  const composition = emptyComposition();
  const details = [];
  let runeCount = 0;
  let activeRuneCount = 0;
  let mediumCount = 0;
  let shieldCount = 0;
  let armorCount = 0;
  let unknownStageCount = 0;
  let cursedCount = 0;
  const locationUsage = createLocationUsage(stateLike);

  entries.forEach(entry => {
    const item = entry.item;
    const data = getItemData(item) || {};
    const category = itemCategory(item);
    const location = getLocation(stateLike, item, locationUsage);
    const affixes = getAffixSummary(item);
    const lootRole = ["reinforce", "convert", "pivot"].includes(item?.lootRole)
      ? item.lootRole
      : null;
    const slot = EQUIPMENT_TYPES.has(data.type) ? data.type : null;
    const weaponBehavior = getWeaponBehavior(item);
    const identificationStage = getIdentificationStage(item);
    const isRune = category === "rune";
    const runeSupplyBand = isRune ? getRuneSupplyBand(item) : null;

    composition.category[category] += 1;
    if (runeSupplyBand) composition.runeSupplyBand[runeSupplyBand] += 1;
    composition.location[location.id] += 1;
    composition.equipmentSlot[slot || "other"] += 1;
    if (weaponBehavior) composition.weaponBehavior[weaponBehavior] += 1;
    if (lootRole) composition.lootRole[lootRole] += 1;
    composition.identificationStage[identificationStage] += 1;
    if (isRune) runeCount += 1;
    if (location.id === "active_rune") activeRuneCount += 1;
    if (data.type === "weapon" && MEDIUMS[itemBaseId(item)]) mediumCount += 1;
    if (data.type === "shield") shieldCount += 1;
    if (data.type === "armor") armorCount += 1;
    if (identificationStage === "unknown") unknownStageCount += 1;
    if (item?.curseEffectId || item?.curseSuspected) cursedCount += 1;

    details.push({
      lootSequence: entry.id || null,
      itemId: itemBaseId(item),
      category,
      location: location.id,
      equipmentSlot: slot,
      weaponBehavior,
      medium: Boolean(data.type === "weapon" && MEDIUMS[itemBaseId(item)]),
      runeSupplyBand,
      coreCount: affixes.coreCount,
      supportCount: affixes.supportCount,
      coreMainAxisCount: affixes.coreMainAxisCount,
      coreAuxiliaryCount: affixes.coreAuxiliaryCount,
      lootRole,
      affixLootRoles: affixes.lootRoles,
      identificationStage,
      cursed: Boolean(item?.curseEffectId || item?.curseSuspected)
    });
  });

  return {
    unconfirmedObjectCount: entries.length,
    unconfirmedObjectIds: details.map(detail => detail.lootSequence),
    composition,
    details,
    runeCount,
    activeRuneCount,
    mediumCount,
    shieldCount,
    armorCount,
    runeSupplyBandComposition: composition.runeSupplyBand,
    coreCount: details.reduce((sum, detail) => sum + detail.coreCount, 0),
    supportCount: details.reduce((sum, detail) => sum + detail.supportCount, 0),
    coreMainAxisCount: details.reduce((sum, detail) => sum + detail.coreMainAxisCount, 0),
    coreAuxiliaryCount: details.reduce((sum, detail) => sum + detail.coreAuxiliaryCount, 0),
    unknownStageCount,
    cursedCount,
    bagOccupancy: Array.isArray(stateLike?.inventory) ? stateLike.inventory.length : 0,
    bagCapacity: INVENTORY_CAPACITY,
    bagFreeSlots: Math.max(0, INVENTORY_CAPACITY - (Array.isArray(stateLike?.inventory) ? stateLike.inventory.length : 0))
  };
}
