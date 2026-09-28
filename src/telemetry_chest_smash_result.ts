import {
  boundedFiniteOrNull,
  normalizeBoundedEnumArray
} from "./telemetry_normalization.js";

export interface ChestSmashResultDetails {
  floor?: unknown;
  trapFired?: unknown;
  partyDied?: unknown;
  rewardCount?: unknown;
  lostRewardCount?: unknown;
  lostRewardRoles?: unknown;
  lostRewardCategories?: unknown;
  remainingRewardCount?: unknown;
  awardedRewardCount?: unknown;
  unawardedRewardCount?: unknown;
}

export interface ChestSmashResultInput {
  runId: string;
  chest: { fromDrop?: unknown } | null | undefined;
  details: ChestSmashResultDetails;
  safeRewardRoles: ReadonlySet<string>;
  safeRewardCategories: ReadonlySet<string>;
}

export interface ChestSmashResultPayload {
  runId: string;
  floor: number | null;
  chestSource: "fromDrop" | "ordinary";
  fromDrop: boolean;
  trapFired: boolean;
  partyDied: boolean;
  rewardCount: number | null;
  lostRewardCount: number | null;
  lostRewardRoles: Array<string | "other">;
  lostRewardCategories: Array<string | "other">;
  remainingRewardCount: number | null;
  awardedRewardCount: number | null;
  unawardedRewardCount: number | null;
}

export function buildChestSmashResultPayload(input: ChestSmashResultInput): ChestSmashResultPayload {
  const runId = input.runId;
  const floor = boundedFiniteOrNull(input.details.floor);
  const chestSource = input.chest?.fromDrop ? "fromDrop" : "ordinary";
  const fromDrop = Boolean(input.chest?.fromDrop);
  const trapFired = Boolean(input.details.trapFired);
  const partyDied = Boolean(input.details.partyDied);
  const rewardCount = boundedFiniteOrNull(input.details.rewardCount);
  const lostRewardCount = boundedFiniteOrNull(input.details.lostRewardCount);
  const lostRewardRoles = normalizeBoundedEnumArray(input.details.lostRewardRoles, input.safeRewardRoles);
  const lostRewardCategories = normalizeBoundedEnumArray(
    input.details.lostRewardCategories,
    input.safeRewardCategories
  );
  const remainingRewardCount = boundedFiniteOrNull(input.details.remainingRewardCount);
  const awardedRewardCount = boundedFiniteOrNull(input.details.awardedRewardCount);
  const unawardedRewardCount = boundedFiniteOrNull(input.details.unawardedRewardCount);

  return {
    runId,
    floor,
    chestSource,
    fromDrop,
    trapFired,
    partyDied,
    rewardCount,
    lostRewardCount,
    lostRewardRoles,
    lostRewardCategories,
    remainingRewardCount,
    awardedRewardCount,
    unawardedRewardCount
  };
}
