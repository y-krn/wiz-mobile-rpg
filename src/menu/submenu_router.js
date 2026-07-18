import { openChestMenu } from "../chest.js";
import { setRenderSubmenuCallback } from "../navigation.js";
import { renderSoloStart } from "./solo_start.js";
import { renderCastleMain, renderCastleDeathLogs } from "./town_actions.js";
import { renderWorkshop } from "./workshop_view.js";
import { renderMilestoneMerchant } from "./milestone_merchant.js";
import { renderMilestonePortal } from "./milestone_portal.js";
import { renderItemDirectionSelect, renderItemInventory, renderItemTargetSelect, renderGameOverMain, renderEnterDungeonSelect, renderEventCamp, renderEventSpring, renderEventSpringResult, renderEventTablet, renderEventTabletResult, renderChestDisarmerSelect, renderChestOpenerSelect, renderWardenConfirm } from "./explore_actions.js";
import { updateUI } from "../ui.js";

const SUBMENU_RENDERERS = {
  chest_menu: () => openChestMenu(),
  workshop_main: (optGrid) => renderWorkshop(optGrid),
  milestone_merchant: (optGrid) => renderMilestoneMerchant(optGrid),
  milestone_portal: (optGrid) => renderMilestonePortal(optGrid),
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
  warden_confirm: (optGrid) => renderWardenConfirm(optGrid),
  event_spring: (optGrid) => renderEventSpring(optGrid),
  event_camp: (optGrid) => renderEventCamp(optGrid),
  event_spring_result: (optGrid) => renderEventSpringResult(optGrid),
  event_tablet: (optGrid) => renderEventTablet(optGrid),
  event_tablet_result: (optGrid) => renderEventTabletResult(optGrid)
};

export function renderSubmenu(type) {
  const optGrid = document.getElementById("submenu-options");
  if (!optGrid) return;

  if (type === "spell_caster_select" || type === "spell_select" || type === "spell_target_ally") {
    return;
  }

  const renderer = SUBMENU_RENDERERS[type];
  if (renderer) {
    renderer(optGrid);
  }
  
  updateUI();
}

setRenderSubmenuCallback(renderSubmenu);
