import { state } from "./state_core.js";
import { getItemData } from "../data.js";

// balance-impact: none — this module records observed equipment knowledge only;
// equipment generation, drop rates, and affix values remain unchanged.

export const CODEX_INSIGHT_DEFINITIONS = Object.freeze({
  resourceTradeoff: "回収品には、HPやMPの支払い方を変える性質がある。",
  hazardTradeoff: "状態異常や罠への備えが、別の力と組み合わさることがある。",
  actionTradeoff: "行動順や撃破条件を、戦い方そのものへ変える品がある。",
  curseTradeoff: "大きな力と拘束を併せ持つ品が存在する。",
  variantEquipment: "同じ装備種でも、異なる性質を持つ個体が存在する。"
});

const INSIGHT_TAGS = Object.freeze({
  resourceTradeoff: new Set(["blood", "spirit"]),
  hazardTradeoff: new Set(["poison", "trap", "ward"]),
  actionTradeoff: new Set(["ambush", "evasion", "search"]),
  curseTradeoff: new Set(["curse"])
});

export function recordRunInsights(stateLike = state, items = [], floor = stateLike?.floor) {
  if (!stateLike?.codex) return [];
  stateLike.codex.insights = Array.isArray(stateLike.codex.insights)
    ? stateLike.codex.insights
    : [];
  const tags = new Set((items || []).flatMap(item => (
    Array.isArray(item?.tags) ? item.tags : getItemData(item)?.tags || []
  )));
  const keys = Object.entries(INSIGHT_TAGS)
    .filter(([, matchingTags]) => [...matchingTags].some(tag => tags.has(tag)))
    .map(([key]) => key);
  if (items.some(item => getItemData(item)?.type && ["weapon", "shield", "armor", "accessory"].includes(getItemData(item).type))) {
    keys.push("variantEquipment");
  }

  const newInsights = [];
  [...new Set(keys)].forEach(key => {
    const existing = stateLike.codex.insights.find(insight => insight.id === key);
    if (existing) {
      existing.count = Math.max(0, Number(existing.count) || 0) + 1;
      existing.lastFloor = Math.max(1, Number(floor) || 1);
      return;
    }
    const insight = {
      id: key,
      count: 1,
      firstFloor: Math.max(1, Number(floor) || 1),
      lastFloor: Math.max(1, Number(floor) || 1)
    };
    stateLike.codex.insights.push(insight);
    newInsights.push(insight);
  });
  // Insight is a finite, coarse research record. It is intentionally bounded
  // and never stores rates, candidate totals, or an item-to-build answer.
  stateLike.codex.insights = stateLike.codex.insights.slice(0, 20);
  return newInsights;
}

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
    observedActions: [],
    observedConditions: [],
    observedLoot: [],
    encounterFloors: {},
    firstEncounterFloor: 0,
    lastEncounterFloor: 0,
    ...overrides
  };
}

function getOrCreateMonsterRecord(monster, stateLike = state) {
  const baseName = getMonsterCodexKey(monster);
  if (!baseName || !stateLike?.codex) return null;

  stateLike.codex.monsters ||= {};
  const current = stateLike.codex.monsters[baseName];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    stateLike.codex.monsters[baseName] = createMonsterCodexRecord();
  }

  const record = stateLike.codex.monsters[baseName];
  record.observedActions = Array.isArray(record.observedActions) ? record.observedActions : [];
  record.observedConditions = Array.isArray(record.observedConditions) ? record.observedConditions : [];
  record.observedLoot = Array.isArray(record.observedLoot) ? record.observedLoot : [];
  record.encounterFloors = record.encounterFloors && typeof record.encounterFloors === "object" && !Array.isArray(record.encounterFloors)
    ? record.encounterFloors
    : {};
  record.firstEncounterFloor = Number.isInteger(record.firstEncounterFloor) ? record.firstEncounterFloor : 0;
  record.lastEncounterFloor = Number.isInteger(record.lastEncounterFloor) ? record.lastEncounterFloor : 0;
  return record;
}

export function recordMonsterEncounter(monster, stateLike = state) {
  const record = getOrCreateMonsterRecord(monster, stateLike);
  if (!record) return;

  record.encountered = Math.max(0, Number(record.encountered) || 0) + 1;
  const floor = Math.max(1, Number(stateLike.floor) || 1);
  const floorKey = String(floor);
  record.encounterFloors[floorKey] = (Number(record.encounterFloors[floorKey]) || 0) + 1;
  if (!record.firstEncounterFloor) record.firstEncounterFloor = floor;
  record.lastEncounterFloor = floor;
}

function appendMonsterObservation(monster, field, value, stateLike = state) {
  if (typeof value !== "string" || !value) return;
  const record = getOrCreateMonsterRecord(monster, stateLike);
  if (!record || record[field].includes(value)) return;
  record[field].push(value);
}

export function recordMonsterAction(monster, action, stateLike = state) {
  appendMonsterObservation(monster, "observedActions", action, stateLike);
}

export function recordMonsterCondition(monster, condition, stateLike = state) {
  appendMonsterObservation(monster, "observedConditions", condition, stateLike);
}

export function recordMonsterLoot(monster, loot, stateLike = state) {
  appendMonsterObservation(monster, "observedLoot", loot, stateLike);
}

export function recordMonsterResistanceDiscovery(monster, type, stateLike = state) {
  const knownField = type === "magic"
    ? "magicResistKnown"
    : type === "physical"
      ? "physResistKnown"
      : null;
  const baseName = getMonsterCodexKey(monster);
  if (!knownField || !baseName || !stateLike?.codex) return;

  const record = getOrCreateMonsterRecord(monster, stateLike);
  if (record) record[knownField] = true;
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
