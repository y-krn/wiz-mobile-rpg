import { generateRandomAccessory, generateRandomEquipment } from "../data.js";
import { addInventoryItemToState } from "../state/inventory_state.js";
import { markMapChanged } from "../state/state_core.js";
import { recordMilestoneVictory } from "../state/run_state.js";

function clearOutcomeCell(stateLike, event) {
  if (stateLike.map?.[stateLike.y]?.[stateLike.x]?.event !== event) return;
  stateLike.map[stateLike.y][stateLike.x].event = null;
  markMapChanged(stateLike);
}

function applyMilestoneVictoryRewards(stateLike, floor) {
  clearOutcomeCell(stateLike, "boss");
  recordMilestoneVictory(stateLike, floor);
  return [`B${floor}F開始を恒久アンロックした。`];
}

function applyGiveKeyRewards(stateLike, rng) {
  clearOutcomeCell(stateLike, "midboss");

  const hasKey = stateLike.inventory.some(item => (
    (typeof item === "object" ? item.baseId : item) === "DRAGON_KEY"
  ));
  if (!hasKey) {
    addInventoryItemToState(stateLike, "DRAGON_KEY");
    if (stateLike.currentRun) {
      stateLike.currentRun.itemsFound.push("DRAGON_KEY");
    }
  }

  const rewardEquip = generateRandomEquipment(4, "rare", rng, stateLike.party);
  if (rewardEquip) {
    rewardEquip.identified = false;
    const added = addInventoryItemToState(stateLike, rewardEquip);
    if (added && stateLike.currentRun) {
      stateLike.currentRun.equipmentFound.push(rewardEquip);
    }
  }

  if (rng() < 0.25) {
    const rewardAccessory = generateRandomAccessory(4, "rare", rng, stateLike.party);
    if (rewardAccessory) {
      const added = addInventoryItemToState(stateLike, rewardAccessory);
      if (added && stateLike.currentRun) {
        stateLike.currentRun.equipmentFound.push(rewardAccessory);
      }
    }
  }

  if (stateLike.currentRun) {
    stateLike.currentRun.materials ||= {};
    stateLike.currentRun.materials["黒角"] =
      (stateLike.currentRun.materials["黒角"] || 0) + 2;
  }

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
