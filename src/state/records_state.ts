// balance-impact: none — canonical persisted run-record domain only.

export const HISTORY_LIMIT = 20;

export interface NormalizedRecordsBase {
  deepestRetreat: number;
  deepestDeath: number;
  totalRuns: number;
}

export interface NormalizedPersonalBests {
  deepestFloor: number;
  kills: number;
  chestsOpened: number;
  lootCount: number;
  goldEarned: number;
}

export interface NormalizedFloorDistribution {
  "B1-B4": number;
  B5: number;
  "B6-B9": number;
  "B10+": number;
}

export interface NormalizedAdventureStats {
  reachedB5: number;
  brokeB5: number;
  reachedB10: number;
  floorDistribution: NormalizedFloorDistribution;
}

export interface NormalizedFirstAchievement {
  id: string;
  label?: string;
  runNumber: number;
  floor: number;
  recordedAt: number;
}

export interface NormalizedDeathCauseRecord {
  floor: number;
  type: string;
  source: string;
  count: number;
}

export interface NormalizedAdventureRecords extends NormalizedRecordsBase {
  personalBests: NormalizedPersonalBests;
  adventureStats: NormalizedAdventureStats;
  firstAchievements: NormalizedFirstAchievement[];
  deathCauses: NormalizedDeathCauseRecord[];
}

export type NormalizedRecords = NormalizedRecordsBase | NormalizedAdventureRecords;

export interface NormalizeRecordsOptions {
  includeAdventure?: boolean;
}

export interface RunRecordDeathLog {
  readonly floor?: unknown;
  readonly type?: unknown;
  readonly source?: unknown;
}

export interface RunRecordFacts {
  readonly deepestFloor?: unknown;
  readonly kills?: unknown;
  readonly chestsOpened?: unknown;
  readonly goldEarned?: unknown;
  readonly gold?: unknown;
  readonly lootCount?: unknown;
  readonly materials?: Readonly<Record<string, unknown>>;
  readonly deathLogs?: readonly RunRecordDeathLog[];
}

export type RunRecordOutcome = "retreat" | "death" | "abandon";

export interface FinalizedRunRecordsResult {
  records: NormalizedAdventureRecords;
  updated: boolean;
  updates: string[];
  milestones: string[];
  runNumber: number;
  depth: number;
  outcome: RunRecordOutcome;
  personalBestUpdates: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const expected = new Set(fields);
  return Object.keys(value).length === expected.size && Object.keys(value).every(field => expected.has(field));
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isFinitePositiveInteger(value: unknown): value is number {
  return isFiniteNonNegativeInteger(value) && value >= 1;
}

const BASE_FIELDS = ["deepestRetreat", "deepestDeath", "totalRuns"] as const;
const PERSONAL_BEST_FIELDS = ["deepestFloor", "kills", "chestsOpened", "lootCount", "goldEarned"] as const;
const FLOOR_DISTRIBUTION_FIELDS = ["B1-B4", "B5", "B6-B9", "B10+"] as const;
const ADVENTURE_STATS_FIELDS = ["reachedB5", "brokeB5", "reachedB10", "floorDistribution"] as const;
const FIRST_ACHIEVEMENT_FIELDS = ["id", "label", "runNumber", "floor", "recordedAt"] as const;
const FIRST_ACHIEVEMENT_FIELDS_WITHOUT_LABEL = ["id", "runNumber", "floor", "recordedAt"] as const;
const DEATH_CAUSE_FIELDS = ["floor", "type", "source", "count"] as const;
const FULL_FIELDS = [
  ...BASE_FIELDS, "personalBests", "adventureStats", "firstAchievements", "deathCauses"
] as const;

function isNormalizedRecordsBaseShape(value: unknown): value is NormalizedRecordsBase {
  return isRecord(value) && hasExactFields(value, BASE_FIELDS) &&
    BASE_FIELDS.every(field => isFiniteNonNegativeInteger(value[field]));
}

function isNormalizedPersonalBests(value: unknown): value is NormalizedPersonalBests {
  return isRecord(value) && hasExactFields(value, PERSONAL_BEST_FIELDS) &&
    PERSONAL_BEST_FIELDS.every(field => isFiniteNonNegativeInteger(value[field]));
}

function isNormalizedFloorDistribution(value: unknown): value is NormalizedFloorDistribution {
  return isRecord(value) && hasExactFields(value, FLOOR_DISTRIBUTION_FIELDS) &&
    FLOOR_DISTRIBUTION_FIELDS.every(field => isFiniteNonNegativeInteger(value[field]));
}

function isNormalizedAdventureStats(value: unknown): value is NormalizedAdventureStats {
  return isRecord(value) && hasExactFields(value, ADVENTURE_STATS_FIELDS) &&
    ADVENTURE_STATS_FIELDS
      .filter((field): field is "reachedB5" | "brokeB5" | "reachedB10" => field !== "floorDistribution")
      .every(field => isFiniteNonNegativeInteger(value[field])) &&
    isNormalizedFloorDistribution(value.floorDistribution);
}

function isNormalizedFirstAchievement(value: unknown): value is NormalizedFirstAchievement {
  if (!isRecord(value)) return false;
  const fields = Object.hasOwn(value, "label")
    ? FIRST_ACHIEVEMENT_FIELDS
    : FIRST_ACHIEVEMENT_FIELDS_WITHOUT_LABEL;
  return hasExactFields(value, fields) &&
    typeof value.id === "string" &&
    (!Object.hasOwn(value, "label") || typeof value.label === "string") &&
    isFiniteNonNegativeInteger(value.runNumber) &&
    isFiniteNonNegativeInteger(value.floor) &&
    isFiniteNonNegativeInteger(value.recordedAt);
}

function isNormalizedDeathCause(value: unknown): value is NormalizedDeathCauseRecord {
  return isRecord(value) && hasExactFields(value, DEATH_CAUSE_FIELDS) &&
    isFinitePositiveInteger(value.floor) &&
    typeof value.type === "string" &&
    typeof value.source === "string" &&
    isFiniteNonNegativeInteger(value.count);
}

export function isNormalizedRecordsBase(value: unknown): value is NormalizedRecordsBase {
  return isNormalizedRecordsBaseShape(value);
}

export function isNormalizedAdventureRecords(value: unknown): value is NormalizedAdventureRecords {
  return isRecord(value) && hasExactFields(value, FULL_FIELDS) &&
    BASE_FIELDS.every(field => isFiniteNonNegativeInteger(value[field])) &&
    isNormalizedPersonalBests(value.personalBests) &&
    isNormalizedAdventureStats(value.adventureStats) &&
    isDenseArray(value.firstAchievements) && value.firstAchievements.every(isNormalizedFirstAchievement) &&
    isDenseArray(value.deathCauses) && value.deathCauses.every(isNormalizedDeathCause);
}

export function isNormalizedRecords(value: unknown): value is NormalizedRecords {
  return isNormalizedRecordsBaseShape(value) || isNormalizedAdventureRecords(value);
}

export function createDefaultRecords(): NormalizedAdventureRecords {
  return {
    deepestRetreat: 0,
    deepestDeath: 0,
    totalRuns: 0,
    personalBests: {
      deepestFloor: 0,
      kills: 0,
      chestsOpened: 0,
      lootCount: 0,
      goldEarned: 0
    },
    adventureStats: {
      reachedB5: 0,
      brokeB5: 0,
      reachedB10: 0,
      floorDistribution: {
        "B1-B4": 0,
        B5: 0,
        "B6-B9": 0,
        "B10+": 0
      }
    },
    firstAchievements: [],
    deathCauses: []
  };
}

function toCount(value: unknown): number {
  let number: number;
  try {
    number = Number(value);
  } catch {
    return 0;
  }
  return Number.isFinite(number) && number
    ? Math.max(0, Math.floor(number))
    : 0;
}

function normalizeFloorDistribution(distribution: unknown): NormalizedFloorDistribution {
  const source = isRecord(distribution) ? distribution : {};
  return {
    "B1-B4": toCount(source["B1-B4"]),
    B5: toCount(source.B5),
    "B6-B9": toCount(source["B6-B9"]),
    "B10+": toCount(source["B10+"])
  };
}

function normalizeAchievement(entry: unknown): NormalizedFirstAchievement | null {
  if (!isRecord(entry) || typeof entry.id !== "string") return null;
  return {
    id: entry.id,
    ...(typeof entry.label === "string" ? { label: entry.label } : {}),
    runNumber: toCount(entry.runNumber),
    floor: toCount(entry.floor),
    recordedAt: toCount(entry.recordedAt)
  };
}

function normalizeDeathCause(entry: unknown): NormalizedDeathCauseRecord | null {
  if (!isRecord(entry) || typeof entry.type !== "string" || typeof entry.source !== "string") return null;
  return {
    floor: Math.max(1, toCount(entry.floor)),
    type: entry.type,
    source: entry.source,
    count: toCount(entry.count)
  };
}

export function normalizeRecords(
  records: unknown = {},
  options: NormalizeRecordsOptions = {}
): NormalizedRecords {
  const source = isRecord(records) ? records : {};
  const base: NormalizedRecordsBase = {
    deepestRetreat: toCount(source.deepestRetreat),
    deepestDeath: toCount(source.deepestDeath),
    totalRuns: toCount(source.totalRuns)
  };
  const includeAdventure = options.includeAdventure === true || [
    "personalBests", "adventureStats", "firstAchievements", "deathCauses"
  ].some(key => Object.hasOwn(source, key));
  if (!includeAdventure) return base;

  const personalBests = isRecord(source.personalBests) ? source.personalBests : {};
  const adventureStats = isRecord(source.adventureStats) ? source.adventureStats : {};
  return {
    ...base,
    personalBests: {
      deepestFloor: toCount(personalBests.deepestFloor),
      kills: toCount(personalBests.kills),
      chestsOpened: toCount(personalBests.chestsOpened),
      lootCount: toCount(personalBests.lootCount),
      goldEarned: toCount(personalBests.goldEarned)
    },
    adventureStats: {
      reachedB5: toCount(adventureStats.reachedB5),
      brokeB5: toCount(adventureStats.brokeB5),
      reachedB10: toCount(adventureStats.reachedB10),
      floorDistribution: normalizeFloorDistribution(adventureStats.floorDistribution)
    },
    firstAchievements: (Array.isArray(source.firstAchievements) ? source.firstAchievements : [])
      .map(normalizeAchievement)
      .filter((entry): entry is NormalizedFirstAchievement => entry !== null),
    deathCauses: (Array.isArray(source.deathCauses) ? source.deathCauses : [])
      .map(normalizeDeathCause)
      .filter((entry): entry is NormalizedDeathCauseRecord => entry !== null)
  };
}

function getFloorBucket(depth: number): keyof NormalizedFloorDistribution {
  if (depth <= 4) return "B1-B4";
  if (depth === 5) return "B5";
  if (depth <= 9) return "B6-B9";
  return "B10+";
}

function addFirstAchievement(
  records: NormalizedAdventureRecords,
  id: string,
  label: string,
  runNumber: number,
  floor: number,
  updates: string[],
  milestones: string[]
): void {
  if (records.firstAchievements.some(entry => entry.id === id)) return;
  records.firstAchievements.push({
    id,
    runNumber,
    floor,
    recordedAt: Date.now()
  });
  updates.push(label);
  milestones.push(id);
}

function updateDeathCause(records: NormalizedAdventureRecords, run: RunRecordFacts): void {
  const death = run.deathLogs?.at(-1);
  if (!death?.type || !death?.source) return;
  const floor = Math.max(1, toCount(death.floor || run.deepestFloor));
  const source = String(death.source);
  const type = String(death.type);
  const existing = records.deathCauses.find(entry => (
    entry.floor === floor && entry.type === type && entry.source === source
  ));
  if (existing) {
    existing.count++;
  } else {
    records.deathCauses.push({ floor, type, source, count: 1 });
  }
}

export function finalizeRunRecords(
  records: unknown,
  run: RunRecordFacts,
  outcome: RunRecordOutcome
): FinalizedRunRecordsResult {
  const next = normalizeRecords(records, { includeAdventure: true });
  if (!isNormalizedAdventureRecords(next)) {
    throw new Error("Normalized adventure records contract validation failed.");
  }
  const depth = Math.max(1, Math.floor(Number(run?.deepestFloor) || 1));
  const runNumber = next.totalRuns + 1;
  const updates: string[] = [];
  const milestones: string[] = [];
  const outcomeKey: "deepestDeath" | "deepestRetreat" | null = outcome === "death"
    ? "deepestDeath"
    : outcome === "abandon"
      ? null
      : "deepestRetreat";

  if (outcomeKey && depth > next[outcomeKey]) {
    next[outcomeKey] = depth;
    updates.push(outcome === "death" ? "死亡最深" : "撤退最深");
  }
  const bests = next.personalBests;
  const runKills = toCount(run?.kills);
  const runChests = toCount(run?.chestsOpened);
  const runGold = toCount(run?.goldEarned ?? run?.gold);
  const runLoot = toCount(run?.lootCount ?? Object.values(run?.materials || {})
    .reduce<number>((sum, quantity) => sum + toCount(quantity), 0));
  const bestUpdates: Array<readonly [keyof NormalizedPersonalBests, number, string]> = [
    ["deepestFloor", depth, "最深到達記録"],
    ["kills", runKills, "最多撃破記録"],
    ["chestsOpened", runChests, "最多宝箱記録"],
    ["lootCount", runLoot, "最大戦利品記録"],
    ["goldEarned", runGold, "最大Gold記録"]
  ];
  bestUpdates.forEach(([key, value, label]) => {
    if (value > bests[key]) {
      bests[key] = value;
      updates.push(label);
    }
  });

  const stats = next.adventureStats;
  if (depth >= 5) stats.reachedB5++;
  if (depth > 5) stats.brokeB5++;
  if (depth >= 10) stats.reachedB10++;
  stats.floorDistribution[getFloorBucket(depth)]++;

  if (depth >= 5) addFirstAchievement(next, "first_b5_reached", "初めてB5Fへ到達", runNumber, depth, updates, milestones);
  if (depth > 5) addFirstAchievement(next, "first_b5_broken", "初めてB5Fを突破", runNumber, depth, updates, milestones);
  if (depth >= 10) addFirstAchievement(next, "first_b10_reached", "初めてB10Fへ到達", runNumber, depth, updates, milestones);
  updateDeathCause(next, run);

  next.totalRuns = runNumber;
  return {
    records: next,
    updated: updates.length > 0 || milestones.length > 0,
    updates,
    milestones,
    runNumber,
    depth,
    outcome,
    personalBestUpdates: bestUpdates
      .filter(([key, value]) => value > 0 && value === bests[key])
      .map(([, , label]) => label)
  };
}
