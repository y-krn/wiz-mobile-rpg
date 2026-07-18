import { IDENTIFICATION_BALANCE, isCurseLocked } from "../rules/identification_rules.js";

export function identifyEquipment(stateLike, item) {
  if (!item || typeof item !== "object" || item.identified) {
    return { ok: false, reason: "already_identified" };
  }
  if ((stateLike.identifyTickets || 0) < IDENTIFICATION_BALANCE.identifyCost) {
    return { ok: false, reason: "insufficient_powder" };
  }
  stateLike.identifyTickets -= IDENTIFICATION_BALANCE.identifyCost;
  item.identified = true;
  item.halfIdentified = true;
  return { ok: true, cursed: Boolean(item.curseEffectId) };
}

export function revealEquipmentOnEquip(item) {
  if (!item || typeof item !== "object") return { revealed: false, cursed: false };
  const revealed = !item.identified;
  item.identified = true;
  item.halfIdentified = true;
  if (item.curseEffectId) item.curseLocked = true;
  return { revealed, cursed: isCurseLocked(item) };
}

export function purifyEquipmentCurse(item) {
  if (!isCurseLocked(item)) return { ok: false, reason: "not_cursed" };
  item.curseEffectId = null;
  item.curseLocked = false;
  item.curseSuspected = false;
  item.tags = (item.tags || []).filter(tag => tag !== "curse");
  return { ok: true };
}
