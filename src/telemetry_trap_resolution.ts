import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface TrapResolutionDetails {
  action?: unknown;
  successRate?: unknown;
  trap?: unknown;
  trapDifficulty?: unknown;
  partialSuccess?: unknown;
  identified?: unknown;
  toolId?: unknown;
  toolUsed?: unknown;
}

export interface TrapBuildSnapshot {
  trapBonus: unknown;
  trapGuard: unknown;
  detectionSupport: unknown;
  treasureSense: unknown;
  hearRange: unknown;
  traceRead: unknown;
  trapKitCount: unknown;
  availableToolIds: unknown;
  coreIds: unknown;
  coreTrapEater: unknown;
  coreTombRaider: unknown;
}

export interface TrapResolutionPayloadInput {
  runId: string;
  context: Record<string, unknown>;
  floor: number | null;
  source: string;
  trapType: string;
  outcome: string;
  x: number | null;
  y: number | null;
  details: TrapResolutionDetails;
  safeActions: ReadonlySet<string>;
  safeToolIds: ReadonlySet<string>;
  build: TrapBuildSnapshot;
}

function optionalTrapDifficulty(trap: unknown): unknown {
  if (trap === null || trap === undefined) return undefined;
  return (Object(trap) as { difficulty?: unknown }).difficulty;
}

export function buildTrapResolutionPayload(input: TrapResolutionPayloadInput): Record<string, unknown> {
  const { details, build } = input;
  return {
    runId: input.runId,
    ...input.context,
    floor: input.floor,
    source: input.source,
    trapType: input.trapType,
    outcome: input.outcome,
    action: normalizeStableValue(details.action, input.safeActions),
    successRate: boundedFiniteOrNull(details.successRate, 0, 100),
    trapDifficulty: boundedFiniteOrNull(optionalTrapDifficulty(details.trap) ?? details.trapDifficulty, 0, 1000),
    partialSuccess: details.partialSuccess === undefined ? undefined : Boolean(details.partialSuccess),
    identified: details.identified === undefined ? undefined : Boolean(details.identified),
    x: input.x,
    y: input.y,
    toolId: normalizeOptionalStableValue(details.toolId, input.safeToolIds),
    toolUsed: Boolean(details.toolUsed),
    trapBonus: build.trapBonus,
    trapGuard: build.trapGuard,
    detectionSupport: build.detectionSupport,
    treasureSense: build.treasureSense,
    hearRange: build.hearRange,
    traceRead: build.traceRead,
    trapKitCount: build.trapKitCount,
    availableToolIds: build.availableToolIds,
    coreIds: build.coreIds,
    coreTrapEater: build.coreTrapEater,
    coreTombRaider: build.coreTombRaider
  };
}
