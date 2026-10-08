import { generateRandomAccessory, generateRandomEquipment } from "../systems/equipment_generation.js";
import { addCanonicalInventoryItemToState } from "../state/inventory_state.js";
import { recordEquipmentDiscovery, recordMonsterLoot } from "../state/codex_state.js";
import { markMapChanged } from "../state/state_core.js";
import { recordMilestoneVictory } from "../state/run_state.js";
import { applyPhase4cV1PlayerBaseline } from "../rules/phase4c_v1_trial.js";
import { getItemData } from "../data.js";
import { KEY_ITEM_LABELS, MILESTONE_KEY_ITEMS } from "../data/key_items.js";
import { WORKSHOP_CATEGORIES, WORKSHOP_NODES } from "../data/workshop.js";
import { getHunterName, takeTreasure } from "../systems/round_trip.js";
import { getDungeonOpenedByClearing } from "../systems/dungeon_progress.js";
import { isDungeonBottomFloor } from "../rules/dungeons.js";

// The workshop shelf a seal opens, named as the workshop names it. A seal
// with nothing behind it yet promises nothing.
function getSealWorkshopShelf(keyItem) {
  const node = WORKSHOP_NODES.find(candidate => candidate.requiresKeyItem === keyItem);
  return node ? WORKSHOP_CATEGORIES[node.category] : null;
}

function clearOutcomeCell(stateLike, event, { openBossExitFloor = null } = {}) {
  const cell = stateLike.map?.[stateLike.y]?.[stateLike.x];
  if (cell?.event !== event) return;
  cell.event = null;
  // The presence that was sensed from a distance is gone with its source (#1821).
  const sensed = stateLike.currentRun?.eventObservations?.[`aura:${stateLike.floor}:boss:${stateLike.x}:${stateLike.y}`];
  if (sensed) sensed.lifecycle = "resolved";
  // The guardian's cell becomes a short way down, except on a dungeon's
  // bottom floor of a round trip (#2062): nothing lies below, and the way on
  // is back up.
  if (cell.milestoneFloor === openBossExitFloor &&
      !(stateLike.currentRun?.roundTrip && isDungeonBottomFloor(openBossExitFloor))) {
    cell.type = "stairs-down";
    cell.message = "階層守護者を倒した。階段への短絡路が開いた。";
  }
  markMapChanged(stateLike);
}

function applyMilestoneVictoryRewards(stateLike, floor) {
  clearOutcomeCell(stateLike, "boss", { openBossExitFloor: floor });
  const milestone = recordMilestoneVictory(stateLike, floor);
  applyPhase4cV1PlayerBaseline(stateLike);
  // The next dungeon opens when this run comes home, not here (#2060).
  const opens = getDungeonOpenedByClearing(stateLike, floor);
  const messages = opens ? [`生きて帰れば、${opens.name}への道が開く。`] : [];
  const keyItem = MILESTONE_KEY_ITEMS[floor];
  if (milestone.unlocked && keyItem) {
    stateLike.keyItems ||= [];
    if (!stateLike.keyItems.includes(keyItem)) {
      stateLike.keyItems.push(keyItem);
      const shelf = getSealWorkshopShelf(keyItem);
      messages.push(
        `${KEY_ITEM_LABELS[keyItem]}を手に入れた。` +
        (shelf ? `工房に「${shelf}」が並ぶようになった。` : "")
      );
    }
  }
  // The guardian held the treasure, and taking it wakes the dungeon (#2062).
  if (takeTreasure(stateLike)) {
    messages.push("迷宮の至宝を手に入れた！");
    messages.push(`【予兆】迷宮が目を覚ました。${getHunterName(stateLike.floor)}が後を追ってくる。歩いて地上へ戻れ。`);
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
    addCanonicalInventoryItemToState(stateLike, "DRAGON_KEY");
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
    const added = addCanonicalInventoryItemToState(stateLike, rewardEquip, { dungeonLoot: true, source: "combat" });
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
      const added = addCanonicalInventoryItemToState(stateLike, rewardAccessory, { dungeonLoot: true, source: "combat" });
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

  return ["迷宮の守護者を倒した！未鑑定の希少な装備と黒角×2を手に入れた！"];
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
