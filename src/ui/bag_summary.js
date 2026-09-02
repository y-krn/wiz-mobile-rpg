import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";

/** Render the shared 20-slot bag contract for loot-facing screens. */
export function createBagCapacitySummary(
  inventory = [],
  { className = "", note = "", showSlots = true, showNote = true } = {}
) {
  const used = Array.isArray(inventory) ? inventory.length : 0;
  const remaining = Math.max(0, INVENTORY_CAPACITY - used);
  const full = used >= INVENTORY_CAPACITY;

  const summary = document.createElement("section");
  summary.className = `bag-capacity-summary ${className}`.trim();
  if (!summary.dataset) summary.dataset = {};
  summary.setAttribute?.("role", "status");
  summary.dataset.usedSlots = String(used);
  summary.dataset.capacity = String(INVENTORY_CAPACITY);
  summary.setAttribute?.("aria-label", `バッグ ${used}/${INVENTORY_CAPACITY}枠`);

  const heading = document.createElement("div");
  heading.className = "bag-capacity-heading";
  const label = document.createElement("strong");
  label.className = "bag-capacity-label";
  label.textContent = `バッグ ${used}/${INVENTORY_CAPACITY}枠`;
  heading.appendChild(label);

  const space = document.createElement("span");
  space.className = `bag-capacity-space ${full ? "full" : ""}`.trim();
  space.textContent = full ? "空きなし" : `空き${remaining}枠・戦果の余地`;
  heading.appendChild(space);
  summary.appendChild(heading);

  if (showSlots) {
    const slots = document.createElement("div");
    slots.className = "bag-slot-grid";
    slots.setAttribute?.("aria-hidden", "true");
    if (!slots.dataset) slots.dataset = {};
    for (let index = 0; index < INVENTORY_CAPACITY; index += 1) {
      const slot = document.createElement("span");
      slot.className = `bag-slot ${index < used ? "occupied" : "empty"}`;
      if (!slot.dataset) slot.dataset = {};
      slot.dataset.slotIndex = String(index);
      slots.appendChild(slot);
    }
    summary.appendChild(slots);
  }

  if (showNote) {
    const noteElement = document.createElement("div");
    noteElement.className = "bag-capacity-note";
    noteElement.textContent = note || (full
      ? "新しい戦果は自動取得されません。必要なら先にバッグを整理します。"
      : "装備中の品はバッグ枠外。バッグ内の品だけがこの20枠を使います。");
    summary.appendChild(noteElement);
  }
  return summary;
}
