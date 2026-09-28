import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface BleedingEventInput {
  event: unknown;
  safeEvents: ReadonlySet<string>;
  safeReasons: ReadonlySet<string>;
  safeSources: ReadonlySet<string>;
  getFloor(): unknown;
  getCharacter(): unknown;
  getBuildSnapshotFields(character: unknown): unknown;
  getEnemyId(): string;
  getIsBoss(): unknown;
  getIsMidboss(): unknown;
  getRemainingTurns(): unknown;
  getPayoffDamage(): unknown;
  getReason(): unknown;
  getSource(): unknown;
  getBuildKey(): unknown;
  getDamageContribution(): unknown;
  getDirectDamage(): unknown;
}

export interface BleedingEventPayload {
  floor: number | null;
  buildSnapshot?: unknown;
  enemyId: string;
  isBoss: boolean;
  isMidboss: boolean;
  remainingTurns: number | null;
  payoffDamage: number | null;
  reason: string | "other" | null;
  source: string | "other" | null;
  buildKey: string;
  damageContribution: number | null;
  directDamage: number | null;
}

export interface BleedingEventTelemetry {
  eventName: string;
  payload: BleedingEventPayload;
}

export function normalizeBleedingBuildKey(value: unknown): string {
  if (typeof value !== "string") return "other";
  const match = value.match(/^bleedingAtk:(-?\d+(?:\.\d+)?)$/);
  if (!match) return "other";
  const affixValue = boundedFiniteOrNull(match[1], 0, 100);
  return affixValue === null ? "other" : "bleedingAtk:" + affixValue;
}

export function buildBleedingEventTelemetry(input: BleedingEventInput): BleedingEventTelemetry {
  const normalizedEvent = normalizeStableValue(input.event, input.safeEvents);
  const eventName = "bleeding_" + normalizedEvent;
  const floor = boundedFiniteOrNull(input.getFloor());
  const character = input.getCharacter();
  const buildSnapshot = character ? input.getBuildSnapshotFields(input.getCharacter()) : undefined;
  const enemyId = input.getEnemyId();
  const isBoss = Boolean(input.getIsBoss());
  const isMidboss = Boolean(input.getIsMidboss());
  const remainingTurns = boundedFiniteOrNull(input.getRemainingTurns());
  const payoffDamage = boundedFiniteOrNull(input.getPayoffDamage());
  const reason = normalizeOptionalStableValue(input.getReason(), input.safeReasons);
  const source = normalizeOptionalStableValue(input.getSource(), input.safeSources);
  const buildKey = normalizeBleedingBuildKey(input.getBuildKey());
  const damageContribution = boundedFiniteOrNull(input.getDamageContribution());
  const directDamage = boundedFiniteOrNull(input.getDirectDamage());

  return {
    eventName,
    payload: {
      floor,
      ...(character ? { buildSnapshot } : {}),
      enemyId,
      isBoss,
      isMidboss,
      remainingTurns,
      payoffDamage,
      reason,
      source,
      buildKey,
      damageContribution,
      directDamage
    }
  };
}
