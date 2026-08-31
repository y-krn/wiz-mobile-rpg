import { generateRandomAccessory, generateRandomEquipment } from "../systems/equipment_generation.js";
import { addInventoryItemToState } from "../state/inventory_state.js";
import { recordEquipmentDiscovery, recordMonsterLoot } from "../state/codex_state.js";
import { markMapChanged } from "../state/state_core.js";
import { recordMilestoneVictory } from "../state/run_state.js";
import { getItemData } from "../data.js";
import {
  KEY_ITEM_LABELS,
  KEY_ITEM_WORKSHOP_BRANCHES,
  MILESTONE_KEY_ITEMS
} from "../data/key_items.js";

function clearOutcomeCell(stateLike, event, { openBossExitFloor = null } = {}) {
  const cell = stateLike.map?.[stateLike.y]?.[stateLike.x];
  if (cell?.event !== event) return;
  cell.event = null;
  if (cell.milestoneFloor === openBossExitFloor) {
    cell.type = "stairs-down";
    cell.message = "【階層守護者撃破】階段への短絡路が開いた。";
  }
  markMapChanged(stateLike);
}

function applyMilestoneVictoryRewards(stateLike, floor) {
  clearOutcomeCell(stateLike, "boss", { openBossExitFloor: floor });
  const milestone = recordMilestoneVictory(stateLike, floor);
  const messages = [`B${floor}F開始を恒久アンロックした。`];
  const keyItem = MILESTONE_KEY_ITEMS[floor];
  if (milestone.unlocked && keyItem) {
    stateLike.keyItems ||= [];
    if (!stateLike.keyItems.includes(keyItem)) {
      stateLike.keyItems.push(keyItem);
      messages.push(
        `【恒久解放】${KEY_ITEM_LABELS[keyItem]}を手に入れた。` +
        `工房「${KEY_ITEM_WORKSHOP_BRANCHES[keyItem]}」枝を表示解放した。`
      );
    }
  }
  return messages;
}

function getSoleDefeatedMonster(stateLike) {
  const monsters = stateLike.combatState?.monsters?.filter(monster => !monster.fled && monster.hp <= 0) || [];
  return monsters.length === 1 ? monsters[0] : null;
}

function applyGiveKeyRewards(stateLike, rng) {
  clearOutcomeCell(stateLike, "midboss");
  const defeatedMonster = getSoleDefeatedMonster(stateLike);

  const hasKey = stateLike.inventory.some(item => (
    (typeof item === "object" ? item.baseId : item) === "DRAGON_KEY"
  ));
  if (!hasKey) {
    addInventoryItemToState(stateLike, "DRAGON_KEY");
    if (defeatedMonster) recordMonsterLoot(defeatedMonster, "竜の鍵", stateLike);
    if (stateLike.currentRun) {
      stateLike.currentRun.itemsFound.push("DRAGON_KEY");
    }
  }

  // The legacy Demon Guard midboss is placed on B3; its key reward intentionally
  // uses the B4 gear table as the bridge before the locked dragon encounter.
  const rewardEquip = generateRandomEquipment(4, {
    forceRarity: "rare",
    rng,
    party: stateLike.party
  });
  if (rewardEquip) {
    rewardEquip.identified = false;
    const added = addInventoryItemToState(stateLike, rewardEquip, { dungeonLoot: true });
    if (added) {
      recordEquipmentDiscovery(rewardEquip, stateLike);
      if (defeatedMonster) recordMonsterLoot(defeatedMonster, getItemData(rewardEquip)?.name, stateLike);
      if (stateLike.currentRun) {
        stateLike.currentRun.equipmentFound.push(rewardEquip);
      }
    }
  }

  if (rng() < 0.25) {
    const rewardAccessory = generateRandomAccessory(4, {
      forceRarity: "rare",
      rng,
      party: stateLike.party
    });
    if (rewardAccessory) {
      const added = addInventoryItemToState(stateLike, rewardAccessory, { dungeonLoot: true });
      if (added) {
        recordEquipmentDiscovery(rewardAccessory, stateLike);
        if (defeatedMonster) recordMonsterLoot(defeatedMonster, getItemData(rewardAccessory)?.name, stateLike);
        if (stateLike.currentRun) {
          stateLike.currentRun.equipmentFound.push(rewardAccessory);
        }
      }
    }
  }

  if (stateLike.currentRun) {
    stateLike.currentRun.materials ||= {};
    stateLike.currentRun.materials["黒角"] =
      (stateLike.currentRun.materials["黒角"] || 0) + 2;
  }
  if (defeatedMonster) recordMonsterLoot(defeatedMonster, "黒角", stateLike);

  return ["迷宮の守護者を撃破した！お宝: [未鑑定のレア装備] と [黒角 x2] を手に入れた！"];
}

export function applyPendingOutcomeRewards(
  stateLike,
  pendingOutcome,
  rng = Math.random
) {
  if (pendingOutcome.kind === "milestoneVictory") {
    return applyMilestoneVictoryRewards(stateLike, pendingOutcome.floor);
  }
  if (pendingOutcome.kind === "giveKey") {
    return applyGiveKeyRewards(stateLike, rng);
  }
  return [];
}
