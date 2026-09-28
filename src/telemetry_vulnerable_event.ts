import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface VulnerableEventInput {
  event: unknown;
  safeEvents: ReadonlySet<string>;
  safeReasons: ReadonlySet<string>;
  safeSources: ReadonlySet<string>;
  safeHitTypes: ReadonlySet<string>;
  getFloor(): unknown;
  getCharacter(): unknown;
  getBuildSnapshotFields(character: unknown): unknown;
  getEnemyId(): string;
  getIsBoss(): unknown;
  getIsMidboss(): unknown;
  getRemainingTurns(): unknown;
  getMultiplier(): unknown;
  getReason(): unknown;
  getSource(): unknown;
  getBuildKey(): unknown;
  getQualifyingHitType(): unknown;
  getLatencyTurns(): unknown;
  getDamageContribution(): unknown;
  getDirectDamage(): unknown;
}

export interface VulnerableEventPayload {
  floor: number | null;
  buildSnapshot?: unknown;
  enemyId: string;
  isBoss: boolean;
  isMidboss: boolean;
  remainingTurns: number | null;
  multiplier: number | null;
  reason: string | "other" | null;
  source: string | "other" | null;
  buildKey: string;
  qualifyingHitType: string | "other" | null;
  latencyTurns: number | null;
  damageContribution: number | null;
  directDamage: number | null;
}

export interface VulnerableEventTelemetry {
  eventName: string;
  payload: VulnerableEventPayload;
}

export function normalizeVulnerableBuildKey(value: unknown): string {
  return value === "VULNERA" ? value : "other";
}

export function buildVulnerableEventTelemetry(input: VulnerableEventInput): VulnerableEventTelemetry {
  const normalizedEvent = normalizeStableValue(input.event, input.safeEvents);
  const eventName = "vulnerable_" + normalizedEvent;
  const floor = boundedFiniteOrNull(input.getFloor());
  const character = input.getCharacter();
  const buildSnapshot = character ? input.getBuildSnapshotFields(input.getCharacter()) : undefined;
  const enemyId = input.getEnemyId();
  const isBoss = Boolean(input.getIsBoss());
  const isMidboss = Boolean(input.getIsMidboss());
  const remainingTurns = boundedFiniteOrNull(input.getRemainingTurns());
  const multiplier = boundedFiniteOrNull(input.getMultiplier(), 1, 10);
  const reason = normalizeOptionalStableValue(input.getReason(), input.safeReasons);
  const source = normalizeOptionalStableValue(input.getSource(), input.safeSources);
  const buildKey = normalizeVulnerableBuildKey(input.getBuildKey());
  const qualifyingHitType = normalizeOptionalStableValue(input.getQualifyingHitType(), input.safeHitTypes);
  const latencyTurns = boundedFiniteOrNull(input.getLatencyTurns(), 0, 100);
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
      multiplier,
      reason,
      source,
      buildKey,
      qualifyingHitType,
      latencyTurns,
      damageContribution,
      directDamage
    }
  };
}
