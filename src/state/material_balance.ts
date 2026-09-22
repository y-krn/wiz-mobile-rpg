// balance-impact: none — canonical persistent material balance boundary only.

import { MATERIAL_TYPES } from "../data/materials.js";

export { MATERIAL_TYPES };

export type MaterialName = typeof MATERIAL_TYPES[number];
export type NormalizedMetaMaterialBalance = Record<MaterialName, number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  } catch {
    return false;
  }
}

function isCanonicalMaterialQuantity(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0;
}

function normalizeMaterialQuantity(value: unknown): number {
  let numeric: number;
  try {
    numeric = Number(value);
  } catch {
    return 0;
  }
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric) || 0);
}

export function isNormalizedMetaMaterialBalance(value: unknown): value is NormalizedMetaMaterialBalance {
  if (!isRecord(value)) return false;

  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (keys.length !== MATERIAL_TYPES.length || keys.some(key => typeof key !== "string")) return false;
  if (new Set(keys).size !== MATERIAL_TYPES.length ||
      MATERIAL_TYPES.some(name => !keys.includes(name))) return false;

  return MATERIAL_TYPES.every(name => {
    try {
      return Object.hasOwn(value, name) && isCanonicalMaterialQuantity(value[name]);
    } catch {
      return false;
    }
  });
}

export function normalizeMaterialBalance(value: unknown = {}): NormalizedMetaMaterialBalance {
  const normalized = {} as NormalizedMetaMaterialBalance;
  for (const name of MATERIAL_TYPES) {
    let raw: unknown;
    try {
      raw = isRecord(value) ? value[name] : undefined;
    } catch {
      raw = undefined;
    }
    normalized[name] = normalizeMaterialQuantity(raw);
  }
  return normalized;
}
