import { getItemBaseId, getItemData } from "./item_rules.js";
import { getAffixDefinition } from "../data/affixes.js";
import { MEDIUMS, RUNE_SUPPLY_BANDS } from "../data/magic.js";
import { getWeaponBehaviorProfile } from "../data/weapon_behavior_profiles.js";
import { getRuneSpellKey } from "./magic_rules.js";
import { INVENTORY_CAPACITY } from "./item_inventory.js";

// This owner mirrors legacy JavaScript operations. These structural casts only
// describe property access; they deliberately perform no runtime validation.
type LegacyRecord = Record<string, unknown>;
type LegacyFlatMap = { flatMap(callback: (value: unknown) => unknown): unknown[] };
type AffixSummary = {
  coreCount: number;
  supportCount: number;
  coreMainAxisCount: number;
  coreAuxiliaryCount: number;
  lootRoles: { reinforce: number; convert: number; pivot: number };
};

const EQUIPMENT_TYPES = new Set(["weapon", "shield", "armor", "accessory"]);
const IDENTIFICATION_STAGES = new Set(["unknown", "discovery", "observation", "trial", "full"]);
const RUNE_SUPPLY_BAND_IDS = Object.freeze([
  ...RUNE_SUPPLY_BANDS.map(band => band.id),
  "other"
]);

function sameItem(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return typeof left !== "object" && typeof right !== "object" && getItemBaseId(left) === getItemBaseId(right);
  }
  const leftItem = left as LegacyRecord;
  const rightItem = right as LegacyRecord;
  return Boolean(leftItem.instanceId && leftItem.instanceId === rightItem.instanceId);
}

function itemBaseId(item: unknown): unknown {
  return getItemBaseId(item) || null;
}

function itemCategory(item: unknown): string {
  const type = (getItemData(item) as LegacyRecord | null | undefined)?.type;
  if (type === "rune" || getRuneSpellKey(item)) return "rune";
  if (EQUIPMENT_TYPES.has(type as string)) return "equipment";
  if (type === "usable") return "consumable";
  return "other";
}

function createLocationUsage(stateLike: unknown) {
  const state = stateLike as LegacyRecord | null | undefined;
  return {
    activeRune: new Set<number>(),
    equipped: new Set<number>(),
    bag: new Set<number>(),
    activeRunes: ((state?.party || []) as LegacyFlatMap).flatMap(character => {
      const member = character as LegacyRecord | null | undefined;
      const mediumState = member?.mediumState as LegacyRecord | null | undefined;
      return mediumState?.socketedRunes || [];
    }),
    equippedItems: ((state?.party || []) as LegacyFlatMap).flatMap(character => {
      const member = character as LegacyRecord | null | undefined;
      const equipment = member?.equipment;
      return Object.entries((equipment || {}) as object)
        .map(([slot, equipped]) => ({ slot, item: equipped }))
        .filter(entry => entry.item);
    }),
    bagItems: (state?.inventory || []) as unknown[]
  };
}

function takeUnusedMatch(collection: unknown, item: unknown, used: Set<number>): unknown | null {
  const candidates = (collection || []) as {
    findIndex(callback: (candidate: unknown, candidateIndex: number) => boolean): number;
    [index: number]: unknown;
  };
  const index = candidates.findIndex((candidate, candidateIndex) => {
    const candidateRecord = candidate as LegacyRecord | null | undefined;
    return !used.has(candidateIndex) && sameItem(candidateRecord?.item ?? candidate, item);
  });
  if (index < 0) return null;
  used.add(index);
  return candidates[index];
}

function getLocation(stateLike: unknown, item: unknown, usage = createLocationUsage(stateLike)) {
  if (takeUnusedMatch(usage.activeRunes, item, usage.activeRune)) {
    return { id: "active_rune", slot: null };
  }

  const equipped = takeUnusedMatch(usage.equippedItems, item, usage.equipped) as LegacyRecord | null;
  if (equipped) return { id: "equipped", slot: equipped.slot };

  if (takeUnusedMatch(usage.bagItems, item, usage.bag)) return { id: "bag", slot: null };
  return { id: "other", slot: null };
}

function getAffixSummary(item: unknown) {
  const affixes = Array.isArray((item as LegacyRecord | null | undefined)?.affixes)
    ? (item as LegacyRecord | null | undefined)?.affixes as unknown[]
    : [];
  return affixes.reduce<AffixSummary>((summary, affix) => {
    const affixRecord = affix as LegacyRecord | null | undefined;
    const definition = getAffixDefinition(affixRecord?.id || affixRecord?.type);
    const typedDefinition = definition as LegacyRecord | null | undefined;
    const kind = typedDefinition?.kind || affixRecord?.kind;
    if (kind === "core") {
      summary.coreCount += 1;
      const axis = typedDefinition?.buildAxis || affixRecord?.buildAxis;
      if (axis === "main") summary.coreMainAxisCount += 1;
      if (axis === "auxiliary") summary.coreAuxiliaryCount += 1;
    }
    if (kind === "support") summary.supportCount += 1;
    const role = typedDefinition?.buildRole || affixRecord?.buildRole;
    if (["reinforce", "convert", "pivot"].includes(role as string)) {
      summary.lootRoles[role as "reinforce" | "convert" | "pivot"] += 1;
    }
    return summary;
  }, {
    coreCount: 0,
    supportCount: 0,
    coreMainAxisCount: 0,
    coreAuxiliaryCount: 0,
    lootRoles: { reinforce: 0, convert: 0, pivot: 0 }
  });
}

function getIdentificationStage(item: unknown): string {
  if (!item || typeof item !== "object") return "full";
  const itemRecord = item as LegacyRecord;
  const stage = itemRecord.identified === false ? itemRecord.knowledgeStage : "full";
  return IDENTIFICATION_STAGES.has(stage as string) ? stage as string : "unknown";
}

function getWeaponBehavior(item: unknown): unknown {
  const data = getItemData(item) as LegacyRecord | null | undefined;
  if (data?.type !== "weapon") return null;
  return getWeaponBehaviorProfile({ ...(data as object), equipment: { weapon: item } }).id;
}

function createRuneSupplyBandComposition(): Record<string, number> {
  return Object.fromEntries(RUNE_SUPPLY_BAND_IDS.map(band => [band, 0]));
}

function getRuneSupplyBand(item: unknown): string {
  const supplyBand = (getItemData(item) as LegacyRecord | null | undefined)?.supplyBand;
  return RUNE_SUPPLY_BAND_IDS.includes(supplyBand as string) ? supplyBand as string : "other";
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

/** Classify production unbankedObjectLoot entries without creating another ownership ledger. */
export function buildObjectLootStakeSnapshot(stateLike: unknown) {
  const state = stateLike as LegacyRecord | null | undefined;
  const entries = Array.isArray((state?.currentRun as LegacyRecord | null | undefined)?.unbankedObjectLoot)
    ? (((state as LegacyRecord).currentRun as LegacyRecord).unbankedObjectLoot as unknown[])
      .filter((entry: unknown) => (entry as LegacyRecord | null | undefined)?.item)
    : [];
  const composition = emptyComposition();
  const details: Array<Record<string, unknown>> = [];
  let runeCount = 0;
  let activeRuneCount = 0;
  let mediumCount = 0;
  let shieldCount = 0;
  let armorCount = 0;
  let unknownStageCount = 0;
  let cursedCount = 0;
  const locationUsage = createLocationUsage(stateLike);

  entries.forEach((rawEntry: unknown) => {
    const entry = rawEntry as LegacyRecord;
    const item = entry.item;
    const data = (getItemData(item) || {}) as LegacyRecord;
    const category = itemCategory(item) as keyof typeof composition.category;
    const location = getLocation(stateLike, item, locationUsage);
    const affixes = getAffixSummary(item);
    const itemRecord = item as LegacyRecord | null | undefined;
    const lootRole = ["reinforce", "convert", "pivot"].includes(itemRecord?.lootRole as string)
      ? itemRecord?.lootRole as "reinforce" | "convert" | "pivot"
      : null;
    const slot = EQUIPMENT_TYPES.has(data.type as string) ? data.type as string : null;
    const weaponBehavior = getWeaponBehavior(item) as string | null;
    const identificationStage = getIdentificationStage(item) as keyof typeof composition.identificationStage;
    const isRune = category === "rune";
    const runeSupplyBand = isRune ? getRuneSupplyBand(item) : null;

    composition.category[category] += 1;
    if (runeSupplyBand) composition.runeSupplyBand[runeSupplyBand] += 1;
    composition.location[location.id as keyof typeof composition.location] += 1;
    composition.equipmentSlot[slot as keyof typeof composition.equipmentSlot || "other"] += 1;
    if (weaponBehavior) composition.weaponBehavior[weaponBehavior as keyof typeof composition.weaponBehavior] += 1;
    if (lootRole) composition.lootRole[lootRole] += 1;
    composition.identificationStage[identificationStage] += 1;
    if (isRune) runeCount += 1;
    if (location.id === "active_rune") activeRuneCount += 1;
    if (data.type === "weapon" && (MEDIUMS as Record<PropertyKey, unknown>)[itemBaseId(item) as PropertyKey]) mediumCount += 1;
    if (data.type === "shield") shieldCount += 1;
    if (data.type === "armor") armorCount += 1;
    if (identificationStage === "unknown") unknownStageCount += 1;
    if (itemRecord?.curseEffectId || itemRecord?.curseSuspected) cursedCount += 1;

    details.push({
      lootSequence: entry.id || null,
      itemId: itemBaseId(item),
      category,
      location: location.id,
      equipmentSlot: slot,
      weaponBehavior,
      medium: Boolean(data.type === "weapon" && (MEDIUMS as Record<PropertyKey, unknown>)[itemBaseId(item) as PropertyKey]),
      runeSupplyBand,
      coreCount: affixes.coreCount,
      supportCount: affixes.supportCount,
      coreMainAxisCount: affixes.coreMainAxisCount,
      coreAuxiliaryCount: affixes.coreAuxiliaryCount,
      lootRole,
      affixLootRoles: affixes.lootRoles,
      identificationStage,
      cursed: Boolean(itemRecord?.curseEffectId || itemRecord?.curseSuspected)
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
    coreCount: details.reduce((sum, detail) => sum + (detail.coreCount as number), 0),
    supportCount: details.reduce((sum, detail) => sum + (detail.supportCount as number), 0),
    coreMainAxisCount: details.reduce((sum, detail) => sum + (detail.coreMainAxisCount as number), 0),
    coreAuxiliaryCount: details.reduce((sum, detail) => sum + (detail.coreAuxiliaryCount as number), 0),
    unknownStageCount,
    cursedCount,
    bagOccupancy: Array.isArray(state?.inventory) ? state.inventory.length : 0,
    bagCapacity: INVENTORY_CAPACITY,
    bagFreeSlots: Math.max(0, INVENTORY_CAPACITY - (Array.isArray(state?.inventory) ? state.inventory.length : 0))
  };
}
