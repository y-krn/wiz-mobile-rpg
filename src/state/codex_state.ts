// balance-impact: none — canonical Codex observation owner only; gameplay,
// equipment generation, drop rates, and affix values remain unchanged.

import { getItemData } from "../data.js";
import { state } from "./state_core.js";

export const CODEX_INSIGHT_LIMIT = 20;

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

export interface NormalizedCodexInsightRecord {
  id: string;
  count: number;
  firstFloor: number;
  lastFloor: number;
}

export type NormalizedCodexInsights = NormalizedCodexInsightRecord[];

export interface NormalizedMonsterCodexRecord {
  encountered: number;
  killed: number;
  firstKilled: boolean;
  magicResistKnown?: boolean;
  physResistKnown?: boolean;
  observedActions?: string[];
  observedConditions?: string[];
  observedLoot?: string[];
  encounterFloors?: Record<string, number>;
  firstEncounterFloor?: number;
  lastEncounterFloor?: number;
}

export type NormalizedMonsterCodex = Record<string, NormalizedMonsterCodexRecord>;

export type NormalizedCodexEquipmentRarity =
  | "common"
  | "magic"
  | "rare"
  | "epic"
  | "legendary";

export const CODEX_EQUIPMENT_RARITIES = Object.freeze([
  "common", "magic", "rare", "epic", "legendary"
] as const);

export interface NormalizedEquipmentCodexRecord {
  discovered: boolean;
  foundCount: number;
  highestRarity: NormalizedCodexEquipmentRarity;
  bestBonus: number;
  affixesSeen: string[];
  foundFloors: Record<string, number>;
  tagObservations: Record<string, number>;
  firstFoundAt: string;
  lastFoundSeed: string;
}

export type NormalizedEquipmentCodex = Record<string, NormalizedEquipmentCodexRecord>;

export interface NormalizedCodexStats {
  totalRuns: number;
  totalDeaths: number;
  deepestFloor: number;
  totalKills: number;
  totalChests: number;
}

export const CODEX_TRAP_IDS = Object.freeze([
  "poison needle", "gas bomb", "teleporter", "flash bomb", "pitfall"
] as const);

export type CodexTrapId = typeof CODEX_TRAP_IDS[number];

export interface NormalizedCodexTrapEvent {
  triggered: number;
  disarmed: number;
  firstFloor: number;
}

export type NormalizedCodexFacilityEvent =
  | { found: number; used: number }
  | { found: number; purchased: number }
  | { found: number; opened: number };

export interface NormalizedCodexEvents {
  traps: Record<CodexTrapId, NormalizedCodexTrapEvent>;
  facilities: {
    spring: { found: number; used: number };
    merchant: { found: number; purchased: number };
    chest: { found: number; opened: number };
  };
}

export interface NormalizedCodexPayload extends Record<string, unknown> {
  monsters: NormalizedMonsterCodex;
  equipment: NormalizedEquipmentCodex;
  insights: NormalizedCodexInsights;
  stats: NormalizedCodexStats;
  events: NormalizedCodexEvents;
}

interface RuntimeCodex extends Record<string, unknown> {
  insights?: unknown;
  monsters?: unknown;
  equipment?: unknown;
  events?: unknown;
  stats?: unknown;
}

interface CodexStateLike extends Record<string, unknown> {
  codex?: RuntimeCodex | null;
  floor?: unknown;
  seed?: unknown;
}

interface MeasurementObservation {
  actionNames?: unknown[];
  conditions?: unknown[];
}

interface MeasurementLike {
  measurementCurrentEnemyAction?: MeasurementObservation;
}

const INSIGHT_FIELDS = ["id", "count", "firstFloor", "lastFloor"] as const;
const MONSTER_FIELDS = [
  "encountered", "killed", "firstKilled", "magicResistKnown", "physResistKnown",
  "observedActions", "observedConditions", "observedLoot", "encounterFloors",
  "firstEncounterFloor", "lastEncounterFloor"
] as const;
const EQUIPMENT_FIELDS = [
  "discovered", "foundCount", "highestRarity", "bestBonus", "affixesSeen",
  "foundFloors", "tagObservations", "firstFoundAt", "lastFoundSeed"
] as const;
const CODEX_STATS_FIELDS = [
  "totalRuns", "totalDeaths", "deepestFloor", "totalKills", "totalChests"
] as const;
const CODEX_TRAP_FIELDS = ["triggered", "disarmed", "firstFloor"] as const;
const CODEX_FACILITY_FIELDS = {
  spring: ["found", "used"],
  merchant: ["found", "purchased"],
  chest: ["found", "opened"]
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).every(key => fields.includes(key));
}

function isDenseStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    Object.keys(value).length === value.length &&
    Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean) &&
    value.every(item => typeof item === "string");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function canonicalIntegerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
    ? value
    : fallback;
}

function nonNegativeIntegerOr(value: unknown, fallback = 0): number {
  return Math.max(0, canonicalIntegerOr(value, fallback));
}

function isPositiveFloorMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.entries(value).every(([floor, count]) =>
    /^\d+$/.test(floor) && Number(floor) > 0 && isPositiveInteger(count)
  );
}

function isObservationCountMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.entries(value).every(([tag, count]) =>
    typeof tag === "string" && isPositiveInteger(count)
  );
}

function isCodexEquipmentRarity(value: unknown): value is NormalizedCodexEquipmentRarity {
  return typeof value === "string" && CODEX_EQUIPMENT_RARITIES.includes(value as NormalizedCodexEquipmentRarity);
}

export function createDefaultCodexStats(): NormalizedCodexStats {
  return {
    totalRuns: 0,
    totalDeaths: 0,
    deepestFloor: 1,
    totalKills: 0,
    totalChests: 0
  };
}

export function isNormalizedCodexStats(value: unknown): value is NormalizedCodexStats {
  return isRecord(value) &&
    hasOnlyFields(value, CODEX_STATS_FIELDS) &&
    Object.hasOwn(value, "totalRuns") &&
    Object.hasOwn(value, "totalDeaths") &&
    Object.hasOwn(value, "deepestFloor") &&
    Object.hasOwn(value, "totalKills") &&
    Object.hasOwn(value, "totalChests") &&
    isNonNegativeInteger(value.totalRuns) &&
    isNonNegativeInteger(value.totalDeaths) &&
    isPositiveInteger(value.deepestFloor) &&
    isNonNegativeInteger(value.totalKills) &&
    isNonNegativeInteger(value.totalChests);
}

export function normalizeCodexStats(value: unknown): NormalizedCodexStats {
  if (!isRecord(value)) return createDefaultCodexStats();
  return {
    totalRuns: nonNegativeIntegerOr(value.totalRuns),
    totalDeaths: nonNegativeIntegerOr(value.totalDeaths),
    deepestFloor: Math.max(1, canonicalIntegerOr(value.deepestFloor, 1)),
    totalKills: nonNegativeIntegerOr(value.totalKills),
    totalChests: nonNegativeIntegerOr(value.totalChests)
  };
}

export function isNormalizedCodexTrapEvent(value: unknown): value is NormalizedCodexTrapEvent {
  return isRecord(value) &&
    hasOnlyFields(value, CODEX_TRAP_FIELDS) &&
    Object.hasOwn(value, "triggered") &&
    Object.hasOwn(value, "disarmed") &&
    Object.hasOwn(value, "firstFloor") &&
    isNonNegativeInteger(value.triggered) &&
    isNonNegativeInteger(value.disarmed) &&
    isNonNegativeInteger(value.firstFloor);
}

export function normalizeCodexTrapEvent(value: unknown): NormalizedCodexTrapEvent {
  const source = isRecord(value) ? value : {};
  return {
    triggered: nonNegativeIntegerOr(source.triggered),
    disarmed: nonNegativeIntegerOr(source.disarmed),
    firstFloor: nonNegativeIntegerOr(source.firstFloor)
  };
}

function isNormalizedCodexFacilityRecord(
  value: unknown,
  fields: readonly string[]
): value is { found: number } & Record<string, number> {
  return isRecord(value) &&
    hasOnlyFields(value, fields) &&
    Object.hasOwn(value, "found") &&
    fields.slice(1).every(field => Object.hasOwn(value, field)) &&
    Object.values(value).every(isNonNegativeInteger);
}

type CodexFacilityField = "used" | "purchased" | "read" | "opened";

function normalizeCodexFacilityRecord<T extends CodexFacilityField>(
  value: unknown,
  field: T
): { found: number } & Record<T, number> {
  const source = isRecord(value) ? value : {};
  return {
    found: nonNegativeIntegerOr(source.found),
    [field]: nonNegativeIntegerOr(source[field])
  } as { found: number } & Record<T, number>;
}

export function isNormalizedCodexEvents(value: unknown): value is NormalizedCodexEvents {
  if (!isRecord(value) || !hasOnlyFields(value, ["traps", "facilities"]) ||
      !isRecord(value.traps) || !isRecord(value.facilities)) return false;
  const traps = value.traps;
  const facilities = value.facilities;
  if (Object.keys(traps).length !== CODEX_TRAP_IDS.length ||
      !CODEX_TRAP_IDS.every(id => Object.hasOwn(traps, id) && isNormalizedCodexTrapEvent(traps[id]))) {
    return false;
  }
  return Object.keys(facilities).length === Object.keys(CODEX_FACILITY_FIELDS).length &&
    isNormalizedCodexFacilityRecord(facilities.spring, CODEX_FACILITY_FIELDS.spring) &&
    isNormalizedCodexFacilityRecord(facilities.merchant, CODEX_FACILITY_FIELDS.merchant) &&
    isNormalizedCodexFacilityRecord(facilities.chest, CODEX_FACILITY_FIELDS.chest);
}

export function createDefaultCodexEvents(): NormalizedCodexEvents {
  return {
    traps: Object.fromEntries(CODEX_TRAP_IDS.map(id => [id, normalizeCodexTrapEvent(null)])) as Record<CodexTrapId, NormalizedCodexTrapEvent>,
    facilities: {
      spring: normalizeCodexFacilityRecord(null, "used"),
      merchant: normalizeCodexFacilityRecord(null, "purchased"),
      chest: normalizeCodexFacilityRecord(null, "opened")
    }
  };
}

export function normalizeCodexEvents(value: unknown): NormalizedCodexEvents {
  const source = isRecord(value) ? value : {};
  const rawTraps = isRecord(source.traps) ? source.traps : {};
  const rawFacilities = isRecord(source.facilities) ? source.facilities : {};
  return {
    traps: Object.fromEntries(CODEX_TRAP_IDS.map(id => [id, normalizeCodexTrapEvent(rawTraps[id])])) as Record<CodexTrapId, NormalizedCodexTrapEvent>,
    facilities: {
      spring: normalizeCodexFacilityRecord(rawFacilities.spring, "used"),
      merchant: normalizeCodexFacilityRecord(rawFacilities.merchant, "purchased"),
      chest: normalizeCodexFacilityRecord(rawFacilities.chest, "opened")
    }
  };
}

export function isNormalizedCodexInsightRecord(value: unknown): value is NormalizedCodexInsightRecord {
  return isRecord(value) &&
    hasOnlyFields(value, INSIGHT_FIELDS) &&
    Object.hasOwn(value, "id") && typeof value.id === "string" &&
    isNonNegativeInteger(value.count) &&
    isPositiveInteger(value.firstFloor) &&
    isPositiveInteger(value.lastFloor);
}

export function normalizeCodexInsightRecord(value: unknown): NormalizedCodexInsightRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    count: Math.max(0, integerOr(value.count, 0)),
    firstFloor: Math.max(1, integerOr(value.firstFloor, 1)),
    lastFloor: Math.max(1, integerOr(value.lastFloor, 1))
  };
}

export function isNormalizedCodexInsights(value: unknown): value is NormalizedCodexInsights {
  return Array.isArray(value) &&
    value.length <= CODEX_INSIGHT_LIMIT &&
    value.every(isNormalizedCodexInsightRecord);
}

export function normalizeCodexInsights(value: unknown): NormalizedCodexInsights {
  if (!Array.isArray(value)) return [];
  return Object.values(Object.fromEntries(
    value
      .map(normalizeCodexInsightRecord)
      .filter((insight): insight is NormalizedCodexInsightRecord => insight !== null)
      .map(insight => [insight.id, insight])
  )).slice(0, CODEX_INSIGHT_LIMIT);
}

export function isNormalizedMonsterCodexRecord(value: unknown): value is NormalizedMonsterCodexRecord {
  if (!isRecord(value) || !hasOnlyFields(value, MONSTER_FIELDS) ||
      !Object.hasOwn(value, "encountered") || !Object.hasOwn(value, "killed") ||
      !Object.hasOwn(value, "firstKilled")) return false;
  if (!isNonNegativeInteger(value.encountered) || !isNonNegativeInteger(value.killed) ||
      typeof value.firstKilled !== "boolean") return false;
  if (Object.hasOwn(value, "magicResistKnown") && typeof value.magicResistKnown !== "boolean") return false;
  if (Object.hasOwn(value, "physResistKnown") && typeof value.physResistKnown !== "boolean") return false;
  if (Object.hasOwn(value, "observedActions") && !isDenseStringArray(value.observedActions)) return false;
  if (Object.hasOwn(value, "observedConditions") && !isDenseStringArray(value.observedConditions)) return false;
  if (Object.hasOwn(value, "observedLoot") && !isDenseStringArray(value.observedLoot)) return false;
  if (Object.hasOwn(value, "encounterFloors") && !isPositiveFloorMap(value.encounterFloors)) return false;
  if (Object.hasOwn(value, "firstEncounterFloor") && !isNonNegativeInteger(value.firstEncounterFloor)) return false;
  if (Object.hasOwn(value, "lastEncounterFloor") && !isNonNegativeInteger(value.lastEncounterFloor)) return false;
  return true;
}

function normalizePositiveCountMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, count]) =>
      /^\d+$/.test(key) && Number(key) > 0 && typeof count === "number" && Number.isFinite(count) && count > 0
    )
    .map(([key, count]) => [key, Math.floor(finiteNumberOr(count, 0))] as const)
    .filter(([, count]) => count > 0));
}

function normalizeTagObservationMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([, count]) => typeof count === "number" && Number.isFinite(count) && count > 0)
    .map(([key, count]) => [key, Math.floor(finiteNumberOr(count, 0))] as const)
    .filter(([, count]) => count > 0));
}

export function normalizeMonsterCodexRecord(value: unknown): NormalizedMonsterCodexRecord | null {
  if (!isRecord(value)) return null;
  const normalized: NormalizedMonsterCodexRecord = {
    encountered: Math.max(0, integerOr(value.encountered, 0)),
    killed: Math.max(0, integerOr(value.killed, 0)),
    firstKilled: value.firstKilled === true
  };
  if (Object.hasOwn(value, "magicResistKnown")) normalized.magicResistKnown = value.magicResistKnown === true;
  if (Object.hasOwn(value, "physResistKnown")) normalized.physResistKnown = value.physResistKnown === true;
  if (Object.hasOwn(value, "observedActions")) {
    normalized.observedActions = Array.isArray(value.observedActions)
      ? value.observedActions.filter((item): item is string => typeof item === "string")
      : [];
  }
  if (Object.hasOwn(value, "observedConditions")) {
    normalized.observedConditions = Array.isArray(value.observedConditions)
      ? value.observedConditions.filter((item): item is string => typeof item === "string")
      : [];
  }
  if (Object.hasOwn(value, "observedLoot")) {
    normalized.observedLoot = Array.isArray(value.observedLoot)
      ? value.observedLoot.filter((item): item is string => typeof item === "string")
      : [];
  }
  if (Object.hasOwn(value, "encounterFloors")) normalized.encounterFloors = normalizePositiveCountMap(value.encounterFloors);
  if (Object.hasOwn(value, "firstEncounterFloor")) {
    normalized.firstEncounterFloor = Math.max(0, integerOr(value.firstEncounterFloor, 0));
  }
  if (Object.hasOwn(value, "lastEncounterFloor")) {
    normalized.lastEncounterFloor = Math.max(0, integerOr(value.lastEncounterFloor, 0));
  }
  return normalized;
}

export function isNormalizedMonsterCodex(value: unknown): value is NormalizedMonsterCodex {
  return isRecord(value) && Object.values(value).every(isNormalizedMonsterCodexRecord);
}

export function normalizeMonsterCodex(value: unknown): NormalizedMonsterCodex {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([name]) => !/の分裂体\d+/.test(name))
    .map(([name, record]) => [name, normalizeMonsterCodexRecord(record)])
    .filter(([, record]) => record !== null)) as NormalizedMonsterCodex;
}

export function isNormalizedEquipmentCodexRecord(value: unknown): value is NormalizedEquipmentCodexRecord {
  return isRecord(value) &&
    hasOnlyFields(value, EQUIPMENT_FIELDS) &&
    typeof value.discovered === "boolean" &&
    isNonNegativeInteger(value.foundCount) &&
    isCodexEquipmentRarity(value.highestRarity) &&
    typeof value.bestBonus === "number" && Number.isFinite(value.bestBonus) && value.bestBonus >= 0 &&
    isDenseStringArray(value.affixesSeen) &&
    isPositiveFloorMap(value.foundFloors) &&
    isObservationCountMap(value.tagObservations) &&
    typeof value.firstFoundAt === "string" &&
    typeof value.lastFoundSeed === "string";
}

export function normalizeEquipmentCodexRecord(value: unknown): NormalizedEquipmentCodexRecord | null {
  if (!isRecord(value)) return null;
  return {
    discovered: value.discovered !== false,
    foundCount: Math.max(0, integerOr(value.foundCount, 0)),
    highestRarity: isCodexEquipmentRarity(value.highestRarity) ? value.highestRarity : "common",
    bestBonus: Math.max(0, typeof value.bestBonus === "number" && Number.isFinite(value.bestBonus) ? value.bestBonus : 0),
    affixesSeen: Array.isArray(value.affixesSeen)
      ? value.affixesSeen.filter((item): item is string => typeof item === "string")
      : [],
    foundFloors: normalizePositiveCountMap(value.foundFloors),
    tagObservations: normalizeTagObservationMap(value.tagObservations),
    firstFoundAt: typeof value.firstFoundAt === "string" ? value.firstFoundAt : "",
    lastFoundSeed: typeof value.lastFoundSeed === "string" ? value.lastFoundSeed : ""
  };
}

export function isNormalizedEquipmentCodex(value: unknown): value is NormalizedEquipmentCodex {
  return isRecord(value) && Object.values(value).every(isNormalizedEquipmentCodexRecord);
}

export function normalizeEquipmentCodex(value: unknown): NormalizedEquipmentCodex {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, record]) => [key, normalizeEquipmentCodexRecord(record)])
    .filter(([, record]) => record !== null)) as NormalizedEquipmentCodex;
}

export function isNormalizedCodexPayload(value: unknown): value is NormalizedCodexPayload {
  return isRecord(value) &&
    Object.hasOwn(value, "monsters") && isNormalizedMonsterCodex(value.monsters) &&
    Object.hasOwn(value, "equipment") && isNormalizedEquipmentCodex(value.equipment) &&
    Object.hasOwn(value, "insights") && isNormalizedCodexInsights(value.insights) &&
    Object.hasOwn(value, "stats") && isNormalizedCodexStats(value.stats) &&
    Object.hasOwn(value, "events") && isNormalizedCodexEvents(value.events);
}

export function normalizeCodexPayload(value: unknown): NormalizedCodexPayload | null {
  if (!isRecord(value)) return null;
  return {
    ...value,
    monsters: normalizeMonsterCodex(value.monsters),
    equipment: normalizeEquipmentCodex(value.equipment),
    insights: normalizeCodexInsights(value.insights),
    stats: normalizeCodexStats(value.stats),
    events: normalizeCodexEvents(value.events)
  };
}

export function recordRunInsights(stateLike: CodexStateLike = state, items: unknown[] = [], floor = stateLike?.floor): NormalizedCodexInsightRecord[] {
  if (!stateLike?.codex) return [];
  stateLike.codex.insights = Array.isArray(stateLike.codex.insights) ? stateLike.codex.insights : [];
  const itemList = Array.isArray(items) ? items : [];
  const tags = new Set(itemList.flatMap(item => {
    const runtimeItem = isRecord(item) ? item : null;
    return Array.isArray(runtimeItem?.tags) ? runtimeItem.tags : getItemData(item)?.tags || [];
  }));
  const keys = Object.entries(INSIGHT_TAGS)
    .filter(([, matchingTags]) => [...matchingTags].some(tag => tags.has(tag)))
    .map(([key]) => key);
  if (itemList.some(item => {
    const type = getItemData(item)?.type;
    return type && ["weapon", "shield", "armor", "accessory"].includes(type);
  })) keys.push("variantEquipment");

  const newInsights: NormalizedCodexInsightRecord[] = [];
  [...new Set(keys)].forEach(key => {
    const existing = (stateLike.codex?.insights as unknown[]).find(insight =>
      isRecord(insight) && insight.id === key
    );
    if (isRecord(existing)) {
      existing.count = Math.max(0, Number(existing.count) || 0) + 1;
      existing.lastFloor = Math.max(1, Number(floor) || 1);
      return;
    }
    const normalizedFloor = Math.max(1, Number(floor) || 1);
    const insight = { id: key, count: 1, firstFloor: normalizedFloor, lastFloor: normalizedFloor };
    (stateLike.codex?.insights as unknown[]).push(insight);
    newInsights.push(insight);
  });
  stateLike.codex.insights = (stateLike.codex.insights as unknown[]).slice(0, CODEX_INSIGHT_LIMIT);
  return newInsights;
}

export function getMonsterCodexKey(monsterOrName: unknown): string {
  const name = typeof monsterOrName === "string"
    ? monsterOrName
    : isRecord(monsterOrName) ? monsterOrName.name : undefined;
  return typeof name === "string" ? name.replace(/\s[A-Z]$/, "") : "";
}

export function createMonsterCodexRecord(overrides: Partial<NormalizedMonsterCodexRecord> = {}): NormalizedMonsterCodexRecord {
  return normalizeMonsterCodexRecord({
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
  })!;
}

function getOrCreateMonsterRecord(monster: unknown, stateLike: CodexStateLike = state): Record<string, unknown> | null {
  const baseName = getMonsterCodexKey(monster);
  if (!baseName || !stateLike?.codex) return null;
  const monsters = isRecord(stateLike.codex.monsters) ? stateLike.codex.monsters : {};
  stateLike.codex.monsters = monsters;
  if (!isRecord(monsters[baseName])) monsters[baseName] = createMonsterCodexRecord();
  const record = monsters[baseName];
  if (!isRecord(record)) return null;
  record.observedActions = Array.isArray(record.observedActions) ? record.observedActions : [];
  record.observedConditions = Array.isArray(record.observedConditions) ? record.observedConditions : [];
  record.observedLoot = Array.isArray(record.observedLoot) ? record.observedLoot : [];
  record.encounterFloors = isRecord(record.encounterFloors) ? record.encounterFloors : {};
  record.firstEncounterFloor = Number.isInteger(record.firstEncounterFloor) ? record.firstEncounterFloor : 0;
  record.lastEncounterFloor = Number.isInteger(record.lastEncounterFloor) ? record.lastEncounterFloor : 0;
  return record;
}

export function recordMonsterEncounter(monster: unknown, stateLike: CodexStateLike = state): void {
  const record = getOrCreateMonsterRecord(monster, stateLike);
  if (!record) return;
  record.encountered = Math.max(0, Number(record.encountered) || 0) + 1;
  const floor = Math.max(1, Number(stateLike.floor) || 1);
  const floorKey = String(floor);
  const encounterFloors = record.encounterFloors as Record<string, unknown>;
  encounterFloors[floorKey] = (Number(encounterFloors[floorKey]) || 0) + 1;
  if (!record.firstEncounterFloor) record.firstEncounterFloor = floor;
  record.lastEncounterFloor = floor;
}

function appendMonsterObservation(monster: unknown, field: "observedActions" | "observedConditions" | "observedLoot", value: unknown, stateLike: CodexStateLike): void {
  if (typeof value !== "string" || !value) return;
  const record = getOrCreateMonsterRecord(monster, stateLike);
  if (!record) return;
  const observations = record[field] as unknown[];
  if (!observations.includes(value)) observations.push(value);
}

export function recordMonsterAction(monster: unknown, action: unknown, stateLike: CodexStateLike = state, measurement: MeasurementLike | null = null): void {
  appendMonsterObservation(monster, "observedActions", action, stateLike);
  const measurementObservation = measurement?.measurementCurrentEnemyAction;
  if (measurementObservation && Array.isArray(measurementObservation.actionNames)) measurementObservation.actionNames.push(action);
}

export function recordMonsterCondition(monster: unknown, condition: unknown, stateLike: CodexStateLike = state, measurement: MeasurementLike | null = null): void {
  appendMonsterObservation(monster, "observedConditions", condition, stateLike);
  const measurementObservation = measurement?.measurementCurrentEnemyAction;
  if (measurementObservation && Array.isArray(measurementObservation.conditions)) measurementObservation.conditions.push(condition);
}

export function recordMonsterLoot(monster: unknown, loot: unknown, stateLike: CodexStateLike = state): void {
  appendMonsterObservation(monster, "observedLoot", loot, stateLike);
}

export function recordMonsterResistanceDiscovery(monster: unknown, type: unknown, stateLike: CodexStateLike = state): void {
  const knownField = type === "magic" ? "magicResistKnown" : type === "physical" ? "physResistKnown" : null;
  const baseName = getMonsterCodexKey(monster);
  if (!knownField || !baseName || !stateLike?.codex) return;
  const record = getOrCreateMonsterRecord(monster, stateLike);
  if (record) record[knownField] = true;
}

function appendObservedAffixes(record: NormalizedEquipmentCodexRecord, equipKey: Record<string, unknown>): void {
  if (!Array.isArray(equipKey.affixes)) return;
  equipKey.affixes.forEach(affix => {
    if (!isRecord(affix)) return;
    const affixId = affix.id || affix.type;
    if (typeof affixId === "string" && affixId && !record.affixesSeen.includes(affixId)) record.affixesSeen.push(affixId);
  });
}

export function recordEquipmentDiscovery(equipKey: unknown, stateLike: CodexStateLike = state): void {
  if (!stateLike?.codex) return;
  const equipment = isRecord(stateLike.codex.equipment) ? stateLike.codex.equipment : {};
  stateLike.codex.equipment = equipment;
  const isRandomEquip = isRecord(equipKey);
  const baseId = isRandomEquip ? equipKey.baseId : equipKey;
  const item = getItemData(baseId);
  if (!isRecord(item) || typeof baseId !== "string" || !["weapon", "armor", "shield", "accessory"].includes(item.type as string)) return;
  if (!isNormalizedEquipmentCodexRecord(equipment[baseId])) {
    equipment[baseId] = normalizeEquipmentCodexRecord(equipment[baseId]) || {
      discovered: true,
      foundCount: 0,
      highestRarity: "common",
      bestBonus: 0,
      affixesSeen: [],
      foundFloors: {},
      tagObservations: {},
      firstFoundAt: `B${stateLike.floor}F`,
      lastFoundSeed: typeof stateLike.seed === "string" ? stateLike.seed : ""
    };
  }
  const record = equipment[baseId] as NormalizedEquipmentCodexRecord;
  record.foundCount++;
  record.lastFoundSeed = typeof stateLike.seed === "string" ? stateLike.seed : "";
  const floorKey = String(Math.max(1, Number(stateLike.floor) || 1));
  record.foundFloors[floorKey] = (Number(record.foundFloors[floorKey]) || 0) + 1;
  (Array.isArray(item.tags) ? item.tags : []).forEach(tag => {
    if (typeof tag === "string") record.tagObservations[tag] = (Number(record.tagObservations[tag]) || 0) + 1;
  });
  if (isRandomEquip) {
    const currentIdx = CODEX_EQUIPMENT_RARITIES.indexOf(record.highestRarity);
    const rarity = isCodexEquipmentRarity(equipKey.rarity) ? equipKey.rarity : "common";
    if (CODEX_EQUIPMENT_RARITIES.indexOf(rarity) > currentIdx) record.highestRarity = rarity;
    const newBonus = equipKey.atkBonus || equipKey.defBonus || 0;
    if (typeof newBonus === "number" && newBonus > record.bestBonus) record.bestBonus = newBonus;
    if (!Object.hasOwn(equipKey, "identified") || equipKey.identified === true) appendObservedAffixes(record, equipKey);
  }
}

export function recordEquipmentAffixDiscovery(equipKey: unknown, stateLike: CodexStateLike = state): void {
  if (!isRecord(equipKey) || equipKey.identified !== true) return;
  const equipment = isRecord(stateLike?.codex?.equipment) ? stateLike.codex.equipment : null;
  const baseId = equipKey.baseId;
  const record = equipment && typeof baseId === "string" && isNormalizedEquipmentCodexRecord(equipment[baseId])
    ? equipment[baseId]
    : null;
  if (record) appendObservedAffixes(record, equipKey);
}
