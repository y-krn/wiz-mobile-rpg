// balance-impact: none — canonical run-discovery persistence boundary only.

export type NormalizedRunDiscoveryStringList = string[];
export type NormalizedRunFirstKillsBefore = NormalizedRunDiscoveryStringList;
export type NormalizedRunKeyItemsBefore = NormalizedRunDiscoveryStringList;
export type NormalizedRunCodexDiscoveries = NormalizedRunDiscoveryStringList;
export type NormalizedRunWorkshopDiscoveries = NormalizedRunDiscoveryStringList;

export function isNormalizedRunDiscoveryStringList(
  value: unknown
): value is NormalizedRunDiscoveryStringList {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

export function normalizeRunDiscoveryStringList(value: unknown): NormalizedRunDiscoveryStringList {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function isNormalizedRunFirstKillsBefore(value: unknown): value is NormalizedRunFirstKillsBefore {
  return isNormalizedRunDiscoveryStringList(value);
}

export function normalizeRunFirstKillsBefore(value: unknown): NormalizedRunFirstKillsBefore {
  return normalizeRunDiscoveryStringList(value);
}

export function isNormalizedRunKeyItemsBefore(value: unknown): value is NormalizedRunKeyItemsBefore {
  return isNormalizedRunDiscoveryStringList(value);
}

export function normalizeRunKeyItemsBefore(value: unknown): NormalizedRunKeyItemsBefore {
  return normalizeRunDiscoveryStringList(value);
}

export function isNormalizedRunCodexDiscoveries(value: unknown): value is NormalizedRunCodexDiscoveries {
  return isNormalizedRunDiscoveryStringList(value);
}

export function normalizeRunCodexDiscoveries(value: unknown): NormalizedRunCodexDiscoveries {
  return normalizeRunDiscoveryStringList(value);
}

export function isNormalizedRunWorkshopDiscoveries(
  value: unknown
): value is NormalizedRunWorkshopDiscoveries {
  return isNormalizedRunDiscoveryStringList(value);
}

export function normalizeRunWorkshopDiscoveries(value: unknown): NormalizedRunWorkshopDiscoveries {
  return normalizeRunDiscoveryStringList(value);
}
