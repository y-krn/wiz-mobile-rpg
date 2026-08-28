import { state, addLog, saveAutosave } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { trackEquipmentDecision } from "../telemetry.js";

const EQUIPMENT_TYPES = new Set(["weapon", "shield", "armor", "accessory"]);

function isEquipmentItem(item) {
  return item && EQUIPMENT_TYPES.has(item.type);
}

function isItemEquipped(stateLike, itemKey) {
  try {
    return stateLike.party.some((char) => {
      try {
        return Object.values(char.equipment || {}).some((equippedKey) => equippedKey === itemKey);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function getDisplayName(itemKey, item) {
  return `${itemKey && typeof itemKey === "object" && itemKey.identified !== true ? "? " : ""}${item.name}`;
}

export function getDiscardRisk(itemKey) {
  const risks = [];
  if (itemKey && typeof itemKey === "object") {
    if (itemKey.identified !== true) risks.push("未鑑定");
    if (["rare", "epic", "legendary"].includes(itemKey.rarity)) risks.push("Rare以上");
    if ((itemKey.enhanceLevel || 0) > 0) risks.push("強化済み");
    if (Array.isArray(itemKey.affixes) && itemKey.affixes.length > 0) risks.push("Affix付き");
  }
  return risks;
}

function createDiscardConfirmation(entries) {
  const count = entries.length;
  if (count === 1) {
    return `「${getDisplayName(entries[0].itemKey, entries[0].item)}」を破棄しますか？この操作は取り消せません。`;
  }

  const risks = entries.flatMap(({ itemKey }) => getDiscardRisk(itemKey));
  const riskCounts = risks.reduce((counts, risk) => {
    counts[risk] = (counts[risk] || 0) + 1;
    return counts;
  }, {});
  const warning = Object.entries(riskCounts).length > 0
    ? `\n注意: ${Object.entries(riskCounts).map(([risk, riskCount]) => `${risk} ${riskCount}件`).join("、")}が含まれます。`
    : "";
  return `選択した${count}件の装備を破棄しますか？この操作は取り消せません。${warning}`;
}

export function discardEquipmentItems(entries, { stateLike = state, character = null } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return { ok: false, count: 0 };

  const uniqueEntries = [...new Map(entries.map((entry) => [entry.index, entry])).values()];
  const validEntries = uniqueEntries.map((entry) => {
    const itemKey = stateLike.inventory[entry.index];
    const item = getItemData(itemKey);
    return { ...entry, itemKey, item };
  });
  if (validEntries.some(({ itemKey, item, index, expectedItemKey }) => (
    index < 0 || index >= stateLike.inventory.length ||
    (expectedItemKey !== undefined && itemKey !== expectedItemKey) ||
    !isEquipmentItem(item) || isItemEquipped(stateLike, itemKey)
  ))) {
    return { ok: false, count: 0 };
  }

  if (typeof globalThis.confirm !== "function" || !globalThis.confirm(createDiscardConfirmation(validEntries))) {
    return { ok: false, count: 0 };
  }

  validEntries.forEach(({ itemKey, preview }) => {
    try {
      trackEquipmentDecision("discard", {
        state: stateLike,
        character,
        candidateKey: itemKey,
        preview
      });
    } catch {
      // Telemetry must never interrupt a confirmed discard.
    }
  });

  const displayNames = validEntries.map(({ itemKey, item }) => getDisplayName(itemKey, item));
  [...validEntries]
    .sort((a, b) => b.index - a.index)
    .forEach(({ index }) => stateLike.inventory.splice(index, 1));

  if (displayNames.length === 1) {
    addLog(`[破棄] ${displayNames[0]}を破棄した。`);
  } else {
    addLog(`[破棄] ${displayNames.length}件の装備を破棄した。`);
  }
  playSound("move");
  saveAutosave();
  return { ok: true, count: displayNames.length };
}
