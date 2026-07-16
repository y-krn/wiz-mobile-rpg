import { openChestMenu } from "../chest.js";
import { openSubmenu, setRenderSubmenuCallback } from "../navigation.js";
import { renderShop } from "../shop/shop_view.js";
import { shopState } from "../shop/shop_state.js";
import { renderTraining } from "../training.js";
import { renderEventMerchant, renderEventMerchantBuy, renderEventMerchantResult } from "./merchant.js";
import { renderTempleMain, renderCraftMain, renderCraftRecipes, renderCraftEnhance, renderCraftPolish, renderCraftDismantle, renderCraftInscriptionSelectEquip, renderCraftInscriptionSelectEngrave, renderCastleMain, renderCastleDeadList, renderCastleRemainsList, renderCastleDeathLogs } from "./town_actions.js";
import { renderItemDirectionSelect, renderItemInventory, renderItemTargetSelect, renderCampMain, renderGameOverMain, renderEnterDungeonSelect, renderCampStatus, renderEventCamp, renderEventSpring, renderEventSpringResult, renderEventTablet, renderEventTabletResult, renderChestDisarmerSelect, renderChestOpenerSelect, renderWardenConfirm } from "./explore_actions.js";
import { updateUI } from "../ui.js";

const SUBMENU_RENDERERS = {
  chest_menu: () => openChestMenu(),
  craft_main: (optGrid) => renderCraftMain(optGrid),
  craft_recipes: (optGrid) => renderCraftRecipes(optGrid),
  craft_enhance: (optGrid) => renderCraftEnhance(optGrid),
  craft_polish: (optGrid) => renderCraftPolish(optGrid),
  craft_dismantle: (optGrid) => renderCraftDismantle(optGrid),
  craft_inscription_select_equip: (optGrid) => renderCraftInscriptionSelectEquip(optGrid),
  craft_inscription_select_engrave: (optGrid) => renderCraftInscriptionSelectEngrave(optGrid),
  item_inventory: (optGrid) => renderItemInventory(optGrid),
  item_target_select: (optGrid) => renderItemTargetSelect(optGrid),
  item_direction_select: (optGrid) => renderItemDirectionSelect(optGrid),
  camp_main: (optGrid) => renderCampMain(optGrid),
  camp: (optGrid) => renderCampMain(optGrid),
  gameover_main: (optGrid) => renderGameOverMain(optGrid),
  enter_dungeon_select: (optGrid) => renderEnterDungeonSelect(optGrid),
  camp_status: (optGrid) => renderCampStatus(optGrid),
  shop_main: (optGrid) => {
    optGrid.innerHTML = "";
    const info = document.createElement("div");
    info.style.color = "var(--text-muted)";
    info.style.textAlign = "center";
    info.style.marginTop = "20px";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    info.textContent = "ボルタック商店で取引中...";
    optGrid.appendChild(info);

    if (shopState.mode !== "appraise") {
      shopState.mode = "buy";
    }
    shopState.filter = "all";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    shopState.lastAppraised = null;
    renderShop();
  },
  shop_buy: () => {
    openSubmenu("shop_main", "ボルタック商店");
  },
  shop_sell: () => {
    openSubmenu("shop_main", "ボルタック商店");
  },
  temple_main: (optGrid) => renderTempleMain(optGrid),
  castle_main: (optGrid) => renderCastleMain(optGrid),
  castle_dead_list: (optGrid) => renderCastleDeadList(optGrid),
  castle_remains_list: (optGrid) => renderCastleRemainsList(optGrid),
  castle_death_logs: (optGrid) => renderCastleDeathLogs(optGrid),
  chest_disarmer_select: (optGrid) => renderChestDisarmerSelect(optGrid),
  chest_opener_select: (optGrid) => renderChestOpenerSelect(optGrid),
  warden_confirm: (optGrid) => renderWardenConfirm(optGrid),
  party_assemble: (optGrid) => {
    optGrid.innerHTML = "";
    const info = document.createElement("div");
    info.style.color = "var(--text-muted)";
    info.style.textAlign = "center";
    info.style.marginTop = "20px";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    info.textContent = "訓練場でパーティ編成中...";
    optGrid.appendChild(info);

    renderTraining();
  },
  event_spring: (optGrid) => renderEventSpring(optGrid),
  event_camp: (optGrid) => renderEventCamp(optGrid),
  event_spring_result: (optGrid) => renderEventSpringResult(optGrid),
  event_tablet: (optGrid) => renderEventTablet(optGrid),
  event_tablet_result: (optGrid) => renderEventTabletResult(optGrid),
  event_merchant: (optGrid) => renderEventMerchant(optGrid),
  event_merchant_buy: (optGrid) => renderEventMerchantBuy(optGrid),
  event_merchant_result: (optGrid) => renderEventMerchantResult(optGrid)
};

export function renderSubmenu(type) {
  const optGrid = document.getElementById("submenu-options");
  if (!optGrid) return;

  if (type === "spell_caster_select" || type === "spell_select" || type === "spell_target_ally" || type === "camp_main" || type === "camp" || type === "camp_status" || type === "camp_formation") {
    return;
  }

  const renderer = SUBMENU_RENDERERS[type];
  if (renderer) {
    renderer(optGrid);
  }
  
  updateUI();
}

setRenderSubmenuCallback(renderSubmenu);
