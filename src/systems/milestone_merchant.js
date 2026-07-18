import { MILESTONE_MERCHANT_STOCK, MILESTONE_UNCURSE_COST } from "../data/milestone_merchant.js";
import { canAffordMaterials, spendMaterials } from "../rules/material_rules.js";
import { isCurseLocked } from "../rules/identification_rules.js";
import { purifyEquipmentCurse } from "./identification.js";

export function purchaseMilestoneStock(stateLike, stockId) {
  const entry = MILESTONE_MERCHANT_STOCK.find(item => item.id === stockId);
  if (!entry) return { ok: false, reason: "unknown_stock" };
  const materials = stateLike.currentRun?.materials;
  if (!materials || !canAffordMaterials(materials, entry.cost)) return { ok: false, reason: "insufficient_materials" };
  if (entry.kind === "item" && (stateLike.inventory?.length || 0) >= 20) return { ok: false, reason: "inventory_full" };
  stateLike.currentRun.materials = spendMaterials(materials, entry.cost);
  if (entry.kind === "identify") stateLike.identifyTickets = (stateLike.identifyTickets || 0) + 1;
  else stateLike.inventory.push(entry.itemId);
  return { ok: true, entry };
}

export function getCursedEquipment(character) {
  return Object.entries(character?.equipment || {})
    .filter(([, item]) => isCurseLocked(item))
    .map(([slot, item]) => ({ slot, item }));
}

export function purchaseMilestoneUncurse(stateLike, slot) {
  const item = stateLike.party?.[0]?.equipment?.[slot];
  if (!isCurseLocked(item)) return { ok: false, reason: "not_cursed" };
  const materials = stateLike.currentRun?.materials;
  if (!materials || !canAffordMaterials(materials, MILESTONE_UNCURSE_COST)) return { ok: false, reason: "insufficient_materials" };
  stateLike.currentRun.materials = spendMaterials(materials, MILESTONE_UNCURSE_COST);
  purifyEquipmentCurse(item);
  return { ok: true, item };
}
