import { MATERIAL_DROP_BALANCE, MATERIAL_TYPES, createEmptyMaterialBalance } from "../data/materials.js";

export const BANKING_RATES = Object.freeze({ retreat: 1, death: 0.3 });

export function normalizeMaterialBalance(balance = {}) {
  const normalized = createEmptyMaterialBalance();
  MATERIAL_TYPES.forEach(name => {
    normalized[name] = Math.max(0, Math.floor(Number(balance[name]) || 0));
  });
  return normalized;
}

export function addMaterials(balance, additions) {
  const next = normalizeMaterialBalance(balance);
  Object.entries(additions || {}).forEach(([name, quantity]) => {
    if (!MATERIAL_TYPES.includes(name)) return;
    next[name] += Math.max(0, Math.floor(Number(quantity) || 0));
  });
  return next;
}

export function getBankedMaterials(runMaterials, outcome) {
  const rate = outcome === "death" ? BANKING_RATES.death : BANKING_RATES.retreat;
  return Object.fromEntries(MATERIAL_TYPES.map(name => [
    name,
    Math.floor((Number(runMaterials?.[name]) || 0) * rate)
  ]));
}

export function bankRunMaterials(metaMaterials, runMaterials, outcome) {
  const banked = getBankedMaterials(runMaterials, outcome);
  return { banked, balance: addMaterials(metaMaterials, banked) };
}

export function getDepthMaterialExpectedQuantity(depth, { startFloor = 1 } = {}) {
  const floor = Math.max(1, Math.floor(Number(depth) || 1));
  const milestoneTier = Math.floor((floor - 1) / 5);
  const raw = (1 + (floor - 1) * MATERIAL_DROP_BALANCE.depthQuantityPerFloor)
    * (1 + milestoneTier * 0.08);
  return startFloor > 1 ? raw * MATERIAL_DROP_BALANCE.milestoneStartMultiplier : raw;
}

export function getDepthMaterialQuantity(depth, { startFloor = 1 } = {}) {
  return Math.max(1, Math.floor(getDepthMaterialExpectedQuantity(depth, { startFloor })));
}

export function rollDepthMaterialQuantity(depth, rng = Math.random, { startFloor = 1 } = {}) {
  const expected = getDepthMaterialExpectedQuantity(depth, { startFloor });
  const base = Math.max(1, Math.floor(expected));
  return base + (rng() < expected - Math.floor(expected) ? 1 : 0);
}

export function getDepthMaterialDropChance(depth) {
  return Math.min(
    MATERIAL_DROP_BALANCE.maxChance,
    MATERIAL_DROP_BALANCE.baseChance + Math.max(0, depth - 1) * MATERIAL_DROP_BALANCE.depthChancePerFloor
  );
}

export function canAffordMaterials(balance, cost) {
  return Object.entries(cost || {}).every(([name, quantity]) => (balance?.[name] || 0) >= quantity);
}

export function spendMaterials(balance, cost) {
  if (!canAffordMaterials(balance, cost)) return null;
  const next = normalizeMaterialBalance(balance);
  Object.entries(cost || {}).forEach(([name, quantity]) => {
    next[name] -= quantity;
  });
  return next;
}
