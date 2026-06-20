import { state } from "./state.js";

// Submenu navigation tracker
export let menuContext = {
  type: "", // "camp", "spell", "item", "equip", "shop_buy", "shop_sell", "temple", "target_enemy", "target_ally"
  actorIdx: -1,
  spellName: "",
  itemKey: "",
  itemIdx: -1,
  prevGameState: null,
  slot: "" // "weapon", "shield", "armor"
};
export let menuHistory = [];

let uiUpdateCallback = null;
let renderSubmenuCallback = null;

export function setUiUpdateCallback(callback) {
  uiUpdateCallback = callback;
}

export function setRenderSubmenuCallback(callback) {
  renderSubmenuCallback = callback;
}

export function triggerUiUpdate() {
  if (uiUpdateCallback) {
    uiUpdateCallback();
  }
}

export function openSubmenu(type, title, isBack = false) {
  if (!isBack) {
    if (state.gameState !== "submenu") {
      menuContext.prevGameState = state.gameState;
      menuHistory.length = 0; // Reset history when entering submenu from main game
    } else {
      // Save current state to history before transitioning
      menuHistory.push({
        type: menuContext.type,
        title: document.getElementById("submenu-title").textContent,
        actorIdx: menuContext.actorIdx,
        spellName: menuContext.spellName,
        itemKey: menuContext.itemKey,
        itemIdx: menuContext.itemIdx,
        slot: menuContext.slot
      });
    }
  }
  state.gameState = "submenu";
  menuContext.type = type;
  document.getElementById("btn-submenu-back").style.display = "block";
  
  const titleEl = document.getElementById("submenu-title");
  // Dynamic replacement of bag/inventory item counts to prevent historical desync
  let displayTitle = title;
  if (displayTitle.includes("バッグ: ") || displayTitle.includes("共有バッグ (") || displayTitle.includes("売却 (バッグ: ")) {
    displayTitle = displayTitle.replace(/(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(共有バッグ\s*\()\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(売却\s*\(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
  }
  titleEl.textContent = displayTitle;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (renderSubmenuCallback) {
    renderSubmenuCallback(type);
  }

  triggerUiUpdate();
}

export function closeSubmenu() {
  if (state.gameState === "submenu") {
    if (state.combatState && menuContext.type.startsWith("combat")) {
      state.gameState = "combat";
      menuContext.prevGameState = null;
    } else if (menuContext.prevGameState) {
      state.gameState = menuContext.prevGameState;
      menuContext.prevGameState = null;
    } else {
      if (menuContext.type.startsWith("shop") || menuContext.type.startsWith("temple")) {
        state.gameState = "town";
      } else if (menuContext.type.startsWith("combat")) {
        state.gameState = "combat";
      } else {
        state.gameState = "explore";
      }
    }
  }
  triggerUiUpdate();
}

export function goBackSubmenu() {
  if (state.transitioning) return;
  if (state.gameState === "submenu" && menuHistory.length > 0) {
    const prev = menuHistory.pop();
    menuContext.actorIdx = prev.actorIdx;
    menuContext.spellName = prev.spellName;
    menuContext.itemKey = prev.itemKey;
    menuContext.itemIdx = prev.itemIdx;
    menuContext.slot = prev.slot;
    openSubmenu(prev.type, prev.title, true);
  } else {
    closeSubmenu();
  }
}

export function resetSubmenuBackButton() {
  document.getElementById("btn-submenu-back").style.display = "block";
}
