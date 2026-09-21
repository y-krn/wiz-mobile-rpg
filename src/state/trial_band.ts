// balance-impact: none — canonical persisted trial-band contract only.

import { FLOOR_TRIALS } from "../data/floor_trials.js";

export interface NormalizedStoredBandTrial {
  bandIndex: number;
  mainId: string;
  subId: string;
  [key: string]: unknown;
}

export type NormalizedTrialBands = Record<string, NormalizedStoredBandTrial>;

const TRIAL_IDS: ReadonlySet<string> = new Set<string>(FLOOR_TRIALS.map(trial => trial.id));
const CANONICAL_BAND_KEY = /^(0|[1-9]\d*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isKnownTrialId(value: unknown): value is string {
  return typeof value === "string" && TRIAL_IDS.has(value);
}

function isCanonicalBandKey(value: string): boolean {
  return CANONICAL_BAND_KEY.test(value);
}

export function isNormalizedStoredBandTrial(value: unknown): value is NormalizedStoredBandTrial {
  return isRecord(value) &&
    isNonNegativeInteger(value.bandIndex) &&
    isKnownTrialId(value.mainId) &&
    isKnownTrialId(value.subId) &&
    value.mainId !== value.subId;
}

function isNormalizedTrialBandEntry(key: string, value: unknown): value is NormalizedStoredBandTrial {
  return isCanonicalBandKey(key) &&
    isNormalizedStoredBandTrial(value) &&
    value.bandIndex === Number(key);
}

export function isNormalizedTrialBands(value: unknown): value is NormalizedTrialBands {
  return isRecord(value) && Object.entries(value).every(([key, trial]) => isNormalizedTrialBandEntry(key, trial));
}

export function normalizeTrialBands(value: unknown): NormalizedTrialBands {
  if (!isRecord(value)) return {};
  const normalized: NormalizedTrialBands = {};
  for (const [key, trial] of Object.entries(value)) {
    if (isNormalizedTrialBandEntry(key, trial)) normalized[key] = trial;
  }
  return normalized;
}
