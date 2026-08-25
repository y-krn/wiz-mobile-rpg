import { state } from "./state_core.js";
import { getItemData } from "../data.js";

// balance-impact: none — this module records observed equipment knowledge only;
// equipment generation, drop rates, and affix values remain unchanged.

export function getMonsterCodexKey(monsterOrName) {
  const name = typeof monsterOrName === "string" ? monsterOrName : monsterOrName?.name;
  return typeof name === "string" ? name.replace(/\s[A-Z]$/, "") : "";
}

export function createMonsterCodexRecord(overrides = {}) {
  return {
    encountered: 0,
    killed: 0,
    firstKilled: false,
    magicResistKnown: false,
    physResistKnown: false,
    ...overrides
  };
}

export function recordMonsterResistanceDiscovery(monster, type, stateLike = state) {
  const knownField = type === "magic"
    ? "magicResistKnown"
    : type === "physical"
      ? "physResistKnown"
      : null;
  const baseName = getMonsterCodexKey(monster);
  if (!knownField || !baseName || !stateLike?.codex) return;

  stateLike.codex.monsters ||= {};
  stateLike.codex.monsters[baseName] ||= createMonsterCodexRecord();
  stateLike.codex.monsters[baseName][knownField] = true;
}

function appendObservedAffixes(record, equipKey) {
  if (!equipKey?.affixes || !Array.isArray(equipKey.affixes)) return;
  equipKey.affixes.forEach(aff => {
    const affixId = aff?.id || aff?.type;
    if (affixId && !record.affixesSeen.includes(affixId)) {
      record.affixesSeen.push(affixId);
    }
  });
}

export function recordEquipmentDiscovery(equipKey, stateLike = state) {
  if (!stateLike?.codex) return;
  if (!stateLike.codex.equipment) {
    stateLike.codex.equipment = {};
  }
  
  const isRandomEquip = typeof equipKey === "object";
  const baseId = isRandomEquip ? equipKey.baseId : equipKey;
  const item = getItemData(baseId);
  if (!item) return;
  
  if (!["weapon", "armor", "shield", "accessory"].includes(item.type)) return;

  if (!stateLike.codex.equipment[baseId]) {
    stateLike.codex.equipment[baseId] = {
      discovered: true,
      foundCount: 0,
      highestRarity: "common",
      bestBonus: 0,
      affixesSeen: [],
      foundFloors: {},
      tagObservations: {},
      firstFoundAt: `B${stateLike.floor}F`,
      lastFoundSeed: stateLike.seed
    };
  }

  const record = stateLike.codex.equipment[baseId];
  record.affixesSeen = Array.isArray(record.affixesSeen) ? record.affixesSeen : [];
  record.foundFloors = record.foundFloors && typeof record.foundFloors === "object" && !Array.isArray(record.foundFloors)
    ? record.foundFloors
    : {};
  record.tagObservations = record.tagObservations && typeof record.tagObservations === "object" && !Array.isArray(record.tagObservations)
    ? record.tagObservations
    : {};
  record.foundCount++;
  record.lastFoundSeed = stateLike.seed;
  const floorKey = String(Math.max(1, Number(stateLike.floor) || 1));
  record.foundFloors[floorKey] = (Number(record.foundFloors[floorKey]) || 0) + 1;

  // Base tags are authored equipment knowledge. They become research only
  // after the player has observed the same equipment twice.
  (item.tags || []).forEach(tag => {
    record.tagObservations[tag] = (Number(record.tagObservations[tag]) || 0) + 1;
  });

  if (isRandomEquip) {
    const rarities = ["common", "magic", "rare", "epic", "legendary"];
    const currentIdx = rarities.indexOf(record.highestRarity);
    const newIdx = rarities.indexOf(equipKey.rarity || "common");
    if (newIdx > currentIdx) {
      record.highestRarity = equipKey.rarity || "common";
    }

    const newBonus = equipKey.atkBonus || equipKey.defBonus || 0;
    if (newBonus > record.bestBonus) {
      record.bestBonus = newBonus;
    }

    // Generated equipment is unidentified until the player pays to reveal it.
    // Keep the old object-call behavior for legacy callers that have no
    // `identified` field, but never expose a generated item's hidden affixes.
    if (!Object.hasOwn(equipKey, "identified") || equipKey.identified === true) {
      appendObservedAffixes(record, equipKey);
    }
  }
}

export function recordEquipmentAffixDiscovery(equipKey, stateLike = state) {
  if (!equipKey || typeof equipKey !== "object" || equipKey.identified !== true) return;
  const baseId = equipKey.baseId;
  const record = stateLike?.codex?.equipment?.[baseId];
  if (!record) return;
  record.affixesSeen = Array.isArray(record.affixesSeen) ? record.affixesSeen : [];
  appendObservedAffixes(record, equipKey);
}
