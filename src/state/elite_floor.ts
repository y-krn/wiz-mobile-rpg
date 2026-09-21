// balance-impact: none — canonical normalized roaming-elite floor boundary only.

export interface NormalizedEliteFloorState {
  entryRollResolved: boolean;
  spawned: boolean;
  defeated: boolean;
  warningStage: number;
  prolongedChecks: number;
  greedScore: number;
  stairsFound: boolean;
  actionKeys: string[];
}

export type NormalizedEliteFloors = Record<string, NormalizedEliteFloorState>;

const CANONICAL_POSITIVE_DECIMAL_FLOOR_KEY = /^[1-9]\d*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function isCanonicalEliteFloorKey(value: string): boolean {
  return CANONICAL_POSITIVE_DECIMAL_FLOOR_KEY.test(value);
}

export function createDefaultNormalizedEliteFloorState(): NormalizedEliteFloorState {
  return {
    entryRollResolved: false,
    spawned: false,
    defeated: false,
    warningStage: 0,
    prolongedChecks: 0,
    greedScore: 0,
    stairsFound: false,
    actionKeys: []
  };
}

export function isNormalizedEliteFloorState(value: unknown): value is NormalizedEliteFloorState {
  return isRecord(value) &&
    typeof value.entryRollResolved === "boolean" &&
    typeof value.spawned === "boolean" &&
    typeof value.defeated === "boolean" &&
    typeof value.warningStage === "number" && Number.isInteger(value.warningStage) &&
      value.warningStage >= 0 && value.warningStage <= 3 &&
    typeof value.prolongedChecks === "number" && Number.isInteger(value.prolongedChecks) &&
      value.prolongedChecks >= 0 &&
    typeof value.greedScore === "number" && Number.isFinite(value.greedScore) && value.greedScore >= 0 &&
    typeof value.stairsFound === "boolean" &&
    Array.isArray(value.actionKeys) && value.actionKeys.length <= 100 &&
    value.actionKeys.every(actionKey => typeof actionKey === "string");
}

export function isNormalizedEliteFloors(value: unknown): value is NormalizedEliteFloors {
  return isRecord(value) && Object.entries(value).every(([key, floor]) =>
    isCanonicalEliteFloorKey(key) && isNormalizedEliteFloorState(floor)
  );
}

export function normalizeEliteFloors(value: unknown): NormalizedEliteFloors {
  if (!isRecord(value)) return {};

  const normalized: NormalizedEliteFloors = {};
  for (const [key, floor] of Object.entries(value)) {
    if (!isCanonicalEliteFloorKey(key) || !isRecord(floor)) continue;
    normalized[key] = {
      entryRollResolved: floor.entryRollResolved === true,
      spawned: floor.spawned === true,
      defeated: floor.defeated === true,
      warningStage: Math.min(3, Math.max(0, integerOr(floor.warningStage, 0))),
      prolongedChecks: Math.max(0, integerOr(floor.prolongedChecks, 0)),
      greedScore: Math.max(0, numberOr(floor.greedScore, 0)),
      stairsFound: floor.stairsFound === true,
      actionKeys: (Array.isArray(floor.actionKeys) ? floor.actionKeys : [])
        .filter(actionKey => typeof actionKey === "string")
        .slice(-100)
    };
  }
  return normalized;
}
