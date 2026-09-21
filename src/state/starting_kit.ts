// balance-impact: none — canonical starting-kit identity boundary only.

export type StartingKitId =
  | "vanguard"
  | "scout"
  | "devotion"
  | "arcana";

export type NormalizedStartingKitId = StartingKitId | null;

export const STARTING_KIT_IDS = Object.freeze([
  "vanguard",
  "scout",
  "devotion",
  "arcana"
] as const satisfies readonly StartingKitId[]);

export function isStartingKitId(value: unknown): value is StartingKitId {
  return typeof value === "string" && STARTING_KIT_IDS.includes(value as StartingKitId);
}

export function isNormalizedStartingKitId(value: unknown): value is NormalizedStartingKitId {
  return value === null || isStartingKitId(value);
}

export function normalizeStartingKitId(value: unknown): NormalizedStartingKitId {
  return isStartingKitId(value) ? value : null;
}
