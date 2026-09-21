// balance-impact: none — canonical run-material persistence boundary only.

export type NormalizedMaterialRecord = Record<string, number>;
export type NormalizedRunMaterials = NormalizedMaterialRecord;
export type NormalizedBankedMaterials = NormalizedMaterialRecord;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalMaterialQuantity(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0;
}

export function isNormalizedMaterialRecord(value: unknown): value is NormalizedMaterialRecord {
  return isRecord(value) && Object.entries(value).every(([material, quantity]) =>
    material.length > 0 && isCanonicalMaterialQuantity(quantity)
  );
}

export function normalizeMaterialRecord(value: unknown): NormalizedMaterialRecord {
  if (!isRecord(value)) return {};

  const normalized: NormalizedMaterialRecord = {};
  for (const [material, quantity] of Object.entries(value)) {
    if (material.length > 0 && isCanonicalMaterialQuantity(quantity)) {
      Object.defineProperty(normalized, material, {
        configurable: true,
        enumerable: true,
        value: quantity,
        writable: true
      });
    }
  }
  return normalized;
}

export function isNormalizedRunMaterials(value: unknown): value is NormalizedRunMaterials {
  return isNormalizedMaterialRecord(value);
}

export function normalizeRunMaterials(value: unknown): NormalizedRunMaterials {
  return normalizeMaterialRecord(value);
}

export function isNormalizedBankedMaterials(value: unknown): value is NormalizedBankedMaterials {
  return isNormalizedMaterialRecord(value);
}

export function normalizeBankedMaterials(value: unknown): NormalizedBankedMaterials {
  return normalizeMaterialRecord(value);
}
