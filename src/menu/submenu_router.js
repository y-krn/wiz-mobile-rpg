import { openChestMenu } from "../chest.js";
import { setRenderSubmenuCallback } from "../navigation.js";
import { renderSoloStart } from "./solo_start.js";
import { renderCastleMain, renderCastleDeathLogs } from "./town_actions.js";
import { renderWorkshop } from "./workshop_view.js";
import { renderRunQuestBoard } from "./run_quest_board.js";
import { renderMilestoneMerchant } from "./milestone_merchant.js";
import { renderMilestonePortal } from "./milestone_portal.js";
import { renderStairsDown } from "./stairs_down.js";
import { renderItemDirectionSelect, renderItemInventory, renderItemTargetSelect, renderGameOverMain, renderEnterDungeonSelect, renderEventCamp, renderEventSpring, renderEventSpringResult, renderEventTablet, renderEventTabletResult, renderChestDisarmerSelect, renderChestOpenerSelect, renderExploreManagement } from "./explore_actions.js";
import { updateUI } from "../ui.js";
import { normalizeSubmenuType } from "../state/view_state.js";

const SUBMENU_RENDERERS = {
  chest_menu: () => openChestMenu(),
  workshop_main: (optGrid) => renderWorkshop(optGrid),
  run_quest_board: (optGrid) => renderRunQuestBoard(optGrid),
  milestone_merchant: (optGrid) => renderMilestoneMerchant(optGrid),
  milestone_portal: (optGrid) => renderMilestonePortal(optGrid),
  stairs_down: (optGrid) => renderStairsDown(optGrid),
  item_inventory: (optGrid) => renderItemInventory(optGrid),
  item_target_select: (optGrid) => renderItemTargetSelect(optGrid),
  item_direction_select: (optGrid) => renderItemDirectionSelect(optGrid),
  gameover_main: (optGrid) => renderGameOverMain(optGrid),
  enter_dungeon_select: (optGrid) => renderEnterDungeonSelect(optGrid),
  solo_start: (optGrid) => renderSoloStart(optGrid),
  castle_main: (optGrid) => renderCastleMain(optGrid),
  castle_death_logs: (optGrid) => renderCastleDeathLogs(optGrid),
  chest_disarmer_select: (optGrid) => renderChestDisarmerSelect(optGrid),
  chest_opener_select: (optGrid) => renderChestOpenerSelect(optGrid),
  explore_management: (optGrid) => renderExploreManagement(optGrid),
  event_spring: (optGrid) => renderEventSpring(optGrid),
  event_camp: (optGrid) => renderEventCamp(optGrid),
  event_spring_result: (optGrid) => renderEventSpringResult(optGrid),
  event_tablet: (optGrid) => renderEventTablet(optGrid),
  event_tablet_result: (optGrid) => renderEventTabletResult(optGrid)
};

export function renderSubmenu(type) {
  const optGrid = document.getElementById("submenu-options");
  if (!optGrid) return;

  const submenuType = normalizeSubmenuType(type);
  if (!submenuType) return;

  if (submenuType === "spell_caster_select" || submenuType === "spell_select" || submenuType === "spell_target_ally") {
    return;
  }

  const renderer = SUBMENU_RENDERERS[submenuType];
  if (renderer) {
    renderer(optGrid);
  }
  
  updateUI();
}

setRenderSubmenuCallback(renderSubmenu);
