// balance-impact: none — canonical starting-kit identity boundary only.

/** The four kits every save starts with. */
export type BaseStartingKitId =
  | "vanguard"
  | "scout"
  | "devotion"
  | "arcana";

/** Kits opened by a town facility (#2009). */
export type UnlockableStartingKitId = "miner";

export type StartingKitId = BaseStartingKitId | UnlockableStartingKitId;

export type NormalizedStartingKitId = StartingKitId | null;

export const STARTING_KIT_IDS = Object.freeze([
  "vanguard",
  "scout",
  "devotion",
  "arcana"
] as const satisfies readonly BaseStartingKitId[]);

export const UNLOCKABLE_STARTING_KIT_IDS = Object.freeze([
  "miner"
] as const satisfies readonly UnlockableStartingKitId[]);

export function isBaseStartingKitId(value: unknown): value is BaseStartingKitId {
  return typeof value === "string" && STARTING_KIT_IDS.includes(value as BaseStartingKitId);
}

export function isStartingKitId(value: unknown): value is StartingKitId {
  return isBaseStartingKitId(value) ||
    (typeof value === "string" && UNLOCKABLE_STARTING_KIT_IDS.includes(value as UnlockableStartingKitId));
}

export function isNormalizedStartingKitId(value: unknown): value is NormalizedStartingKitId {
  return value === null || isStartingKitId(value);
}

export function normalizeStartingKitId(value: unknown): NormalizedStartingKitId {
  return isStartingKitId(value) ? value : null;
}
