// balance-impact: none — persisted feat progress contract only (#2007).
//
// Feat progress is a set of counters accumulated across runs plus the record
// of which feats were achieved. The feat definitions and the rules that read
// these counters live in `src/data/feats.js` and `src/systems/feats.js`.

import { STARTING_KIT_IDS, type BaseStartingKitId } from "./starting_kit.js";

export interface FeatCounters {
  /** Deepest floor ever reached. */
  bestDepth: number;
  /** Deepest milestone floor whose guardian was defeated. */
  guardianDepth: number;
  elitesKilled: number;
  disruptorsKilled: number;
  amplifiersKilled: number;
  chestsOpened: number;
  safeReturns: number;
  /** Deepest floor reached from B1F in a run that triggered no trap. */
  traplessDepth: number;
  /** 1 once the foreman has been led out by a safe return. */
  foremanRescued: number;
  /** 1 once the priest has been led out by a safe return (#2018). */
  priestRescued: number;
  /** 1 once the weaver and the scribe have been led out (#2019). */
  weaverRescued: number;
  scribeRescued: number;
  /** 1 once the smith and the chamberlain have been led out (#2021). */
  smithRescued: number;
  chamberlainRescued: number;
  /** Guidebook pages decoded in the town. */
  guidePagesDecoded: number;
  /** Deepest floor reached from B1F with each starting kit. */
  kitDepths: Record<BaseStartingKitId, number>;
}

export interface FeatCompletion {
  runNumber: number;
}

export interface NormalizedFeatsState {
  counters: FeatCounters;
  completed: Record<string, FeatCompletion>;
}

/** What a finished run changed, kept on the run for the result screen. */
export interface RunFeatResult {
  completed: string[];
  rewards: Record<string, number>;
  progress: { id: string; before: number; after: number; target: number }[];
}

export type NormalizedRunFeatResult = RunFeatResult | null;

const SCALAR_COUNTER_KEYS = Object.freeze([
  "bestDepth", "guardianDepth", "elitesKilled", "disruptorsKilled",
  "amplifiersKilled", "chestsOpened", "safeReturns", "traplessDepth", "foremanRescued", "priestRescued",
  "weaverRescued", "scribeRescued", "smithRescued", "chamberlainRescued",
  "guidePagesDecoded"
] as const);

const FEAT_ID_LIMIT = 200;
const RUN_FEAT_PROGRESS_LIMIT = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toCount(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function createDefaultFeatCounters(): FeatCounters {
  return {
    bestDepth: 0,
    guardianDepth: 0,
    elitesKilled: 0,
    disruptorsKilled: 0,
    amplifiersKilled: 0,
    chestsOpened: 0,
    safeReturns: 0,
    traplessDepth: 0,
    foremanRescued: 0,
    priestRescued: 0,
    weaverRescued: 0,
    scribeRescued: 0,
    smithRescued: 0,
    chamberlainRescued: 0,
    guidePagesDecoded: 0,
    kitDepths: Object.fromEntries(STARTING_KIT_IDS.map(kitId => [kitId, 0])) as Record<BaseStartingKitId, number>
  };
}

export function createDefaultFeatsState(): NormalizedFeatsState {
  return { counters: createDefaultFeatCounters(), completed: {} };
}

export function normalizeFeatCounters(value: unknown): FeatCounters {
  const source = isRecord(value) ? value : {};
  const kitSource = isRecord(source.kitDepths) ? source.kitDepths : {};
  const counters = createDefaultFeatCounters();
  SCALAR_COUNTER_KEYS.forEach(key => {
    counters[key] = toCount(source[key]);
  });
  STARTING_KIT_IDS.forEach(kitId => {
    counters.kitDepths[kitId] = toCount(kitSource[kitId]);
  });
  return counters;
}

function isFeatCounters(value: unknown): value is FeatCounters {
  if (!isRecord(value) || !isRecord(value.kitDepths)) return false;
  const kitDepths = value.kitDepths;
  return SCALAR_COUNTER_KEYS.every(key => isCount(value[key])) &&
    Object.keys(kitDepths).length === STARTING_KIT_IDS.length &&
    STARTING_KIT_IDS.every(kitId => isCount(kitDepths[kitId]));
}

export function isNormalizedFeatsState(value: unknown): value is NormalizedFeatsState {
  if (!isRecord(value) || !isFeatCounters(value.counters) || !isRecord(value.completed)) return false;
  const entries = Object.entries(value.completed);
  return entries.length <= FEAT_ID_LIMIT &&
    entries.every(([id, completion]) => id.length > 0 && isRecord(completion) && isCount(completion.runNumber));
}

/**
 * Records that existed before feats were tracked. They seed the counters so
 * an existing save keeps the progress its records can prove.
 */
export interface LegacyFeatFacts {
  deepestFloor?: unknown;
  unlockedMilestones?: unknown;
  totalChests?: unknown;
  safeReturns?: unknown;
}

export function deriveFeatCountersFromRecords(facts: LegacyFeatFacts = {}): FeatCounters {
  const counters = createDefaultFeatCounters();
  counters.bestDepth = toCount(facts.deepestFloor);
  const milestones = Array.isArray(facts.unlockedMilestones) ? facts.unlockedMilestones : [];
  counters.guardianDepth = milestones.reduce<number>((deepest, floor) => Math.max(deepest, toCount(floor)), 0);
  counters.chestsOpened = toCount(facts.totalChests);
  counters.safeReturns = toCount(facts.safeReturns);
  return counters;
}

/**
 * Normalize stored feat progress. A save without the field starts from the
 * counters its older records can prove; nothing is marked achieved, so those
 * feats are settled (and rewarded once) at the end of the next run.
 */
export function normalizeFeatsState(value: unknown, legacyFacts: LegacyFeatFacts = {}): NormalizedFeatsState {
  if (!isRecord(value)) {
    return { counters: deriveFeatCountersFromRecords(legacyFacts), completed: {} };
  }
  const completed: Record<string, FeatCompletion> = {};
  if (isRecord(value.completed)) {
    Object.entries(value.completed).slice(0, FEAT_ID_LIMIT).forEach(([id, completion]) => {
      if (!id) return;
      completed[id] = { runNumber: toCount(isRecord(completion) ? completion.runNumber : 0) };
    });
  }
  return { counters: normalizeFeatCounters(value.counters), completed };
}

function isMaterialCounts(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isCount);
}

export function isNormalizedRunFeatResult(value: unknown): value is NormalizedRunFeatResult {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return Array.isArray(value.completed) &&
    value.completed.every(id => typeof id === "string" && id.length > 0) &&
    isMaterialCounts(value.rewards) &&
    Array.isArray(value.progress) &&
    value.progress.length <= RUN_FEAT_PROGRESS_LIMIT &&
    value.progress.every(entry => isRecord(entry) && typeof entry.id === "string" && entry.id.length > 0 &&
      isCount(entry.before) && isCount(entry.after) && isCount(entry.target));
}

export function normalizeRunFeatResult(value: unknown): NormalizedRunFeatResult {
  if (!isRecord(value)) return null;
  const completed = (Array.isArray(value.completed) ? value.completed : [])
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, FEAT_ID_LIMIT);
  const rewards: Record<string, number> = {};
  if (isRecord(value.rewards)) {
    Object.entries(value.rewards).forEach(([name, quantity]) => {
      const count = toCount(quantity);
      if (name && count > 0) rewards[name] = count;
    });
  }
  const progress = (Array.isArray(value.progress) ? value.progress : [])
    .filter(isRecord)
    .filter(entry => typeof entry.id === "string" && entry.id.length > 0)
    .slice(0, RUN_FEAT_PROGRESS_LIMIT)
    .map(entry => ({
      id: String(entry.id),
      before: toCount(entry.before),
      after: toCount(entry.after),
      target: toCount(entry.target)
    }));
  if (completed.length === 0 && progress.length === 0) return null;
  return { completed, rewards, progress };
}

/** Feat ids already announced in the log during the run. */
export function normalizeAnnouncedFeatIds(value: unknown): string[] {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((id): id is string => typeof id === "string" && id.length > 0))]
    .slice(0, FEAT_ID_LIMIT);
}

export function isAnnouncedFeatIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= FEAT_ID_LIMIT &&
    value.every(id => typeof id === "string" && id.length > 0);
}
