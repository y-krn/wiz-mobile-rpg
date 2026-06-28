import { state } from "./state_core.js";
import { getItemData } from "../data.js";

export function recordEquipmentDiscovery(equipKey) {
  if (!state.codex) return;
  if (!state.codex.equipment) {
    state.codex.equipment = {};
  }
  
  const isRandomEquip = typeof equipKey === "object";
  const baseId = isRandomEquip ? equipKey.baseId : equipKey;
  const item = getItemData(baseId);
  if (!item) return;
  
  if (item.type !== "weapon" && item.type !== "armor" && item.type !== "shield") return;

  if (!state.codex.equipment[baseId]) {
    state.codex.equipment[baseId] = {
      discovered: true,
      foundCount: 0,
      highestRarity: "common",
      bestBonus: 0,
      affixesSeen: [],
      firstFoundAt: `B${state.floor}F`,
      lastFoundSeed: state.seed
    };
  }

  const record = state.codex.equipment[baseId];
  record.foundCount++;
  record.lastFoundSeed = state.seed;

  if (isRandomEquip) {
    const rarities = ["common", "magic", "rare", "epic", "legendary"];
    const currentIdx = rarities.indexOf(record.highestRarity);
    const newIdx = rarities.indexOf(equipKey.rarity || "common");
    if (newIdx > currentIdx) {
      record.highestRarity = equipKey.rarity || "common";
    }

    const newBonus = equipKey.atkBonus || equipKey.defBonus || 0;
    if (newBonus > record.bestBonus) {
      record.bestBonus = newBonus;
    }

    if (equipKey.affixes && Array.isArray(equipKey.affixes)) {
      equipKey.affixes.forEach(aff => {
        if (!record.affixesSeen.includes(aff.type)) {
          record.affixesSeen.push(aff.type);
        }
      });
    }
  }
}
