export type StableTelemetryValue = string | number;

export const MAX_TELEMETRY_RESOURCE_VALUE = 1_000_000;
export const DEFAULT_TELEMETRY_ENUM_ARRAY_CAP = 24;

export function finiteOrNull(value: unknown): number | null {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function boundedFiniteOrNull(
  value: unknown,
  min = 0,
  max = MAX_TELEMETRY_RESOURCE_VALUE
): number | null {
  const normalized = finiteOrNull(value);
  if (normalized === null) return null;
  return Math.min(max, Math.max(min, normalized));
}

export function normalizeStableValue<T extends StableTelemetryValue>(
  value: unknown,
  allowedValues: ReadonlySet<T>
): T | "other" {
  return allowedValues.has(value as T) ? value as T : "other";
}

export function normalizeOptionalStableValue<T extends StableTelemetryValue>(
  value: unknown,
  allowedValues: ReadonlySet<T>
): T | "other" | null {
  if (value === null || value === undefined || value === "") return null;
  return normalizeStableValue(value, allowedValues);
}

export function normalizeBoundedEnumArray<T extends StableTelemetryValue>(
  value: unknown,
  allowedValues: ReadonlySet<T>,
  cap = DEFAULT_TELEMETRY_ENUM_ARRAY_CAP
): Array<T | "other"> {
  if (!Array.isArray(value)) return [];
  const values: unknown[] = value;
  return values.slice(0, cap).map(item => normalizeStableValue(item, allowedValues));
}
