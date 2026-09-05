import { state } from "./state.js";
import { armControlsGuard } from "./controls_guard.js";
import {
  applyMenuContext,
  createMenuHistoryEntry,
  getScreenViewState,
  normalizeMenuHistoryEntry,
  normalizeSubmenuType
} from "./state/view_state.js";

// Submenu navigation tracker
export let menuContext = {
  type: "", // "spell", "item", "equip", "workshop_main", "target_enemy", "target_ally"
  actorIdx: -1,
  targetType: "",
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
  const submenuType = normalizeSubmenuType(type);
  if (!submenuType) return false;

  const view = getScreenViewState(state, menuContext);
  if (!isBack) {
    if (!view.isSubmenu) {
      menuContext.prevGameState = view.gameState;
      menuHistory.length = 0; // Reset history when entering submenu from main game
    } else {
      // Save current state to history before transitioning
      const titleEl = document.getElementById("submenu-title");
      menuHistory.push(createMenuHistoryEntry(
        menuContext,
        titleEl?.textContent || ""
      ));
    }
  }
  state.gameState = "submenu";
  applyMenuContext(menuContext, {
    ...menuContext,
    type: submenuType
  });
  document.getElementById("btn-submenu-back").style.display = "block";
  
  const titleEl = document.getElementById("submenu-title");
  // Dynamic replacement of bag/inventory item counts to prevent historical desync
  let displayTitle = title;
  if (displayTitle.includes("バッグ: ") || displayTitle.includes("共有バッグ (")) {
    displayTitle = displayTitle.replace(/(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(共有バッグ\s*\()\d+(個)/g, `$1${state.inventory.length}$2`);
  }
  titleEl.textContent = displayTitle;

  const optGrid = document.getElementById("submenu-options");
  optGrid.className = "submenu-grid";
  optGrid.innerHTML = "";

  if (renderSubmenuCallback) {
    renderSubmenuCallback(type);
  }

  triggerUiUpdate();
  return true;
}

export function openGuardedSubmenu(type, title) {
  armControlsGuard();
  openSubmenu(type, title);
}

function restorePreviousGameState(view) {
  if (view.previousGameState === "combat" && (!view.hasCombat ||
      (view.isCombatOverlaySubmenu && !view.isUsableCombatOverlaySubmenu))) {
    return view.hasMap ? "explore" : "town";
  }
  return view.previousGameState;
}

export function closeSubmenu() {
  const view = getScreenViewState(state, menuContext);
  if (view.menuType === "pending_rewards") return false;
  if (view.isSubmenu) {
    if (view.isCombatOverlaySubmenu && view.isUsableCombatOverlaySubmenu) {
      state.gameState = "combat";
      menuContext.prevGameState = null;
    } else if (view.previousGameState) {
      state.gameState = restorePreviousGameState(view);
      menuContext.prevGameState = null;
    } else {
      if (view.menuType.startsWith("castle") ||
          view.menuType.startsWith("solo_start") ||
          view.menuType.startsWith("workshop") ||
          view.menuType.startsWith("run_quest")) {
        state.gameState = "town";
      } else if (view.menuType.startsWith("combat")) {
        state.gameState = view.hasMap ? "explore" : "town";
      } else {
        state.gameState = "explore";
      }
    }
  }
  triggerUiUpdate();
}

export function goBackSubmenu() {
  if (state.transitioning) return;
  const view = getScreenViewState(state, menuContext);
  if (view.menuType === "pending_rewards") return;
  if (view.isSubmenu && menuHistory.length > 0) {
    const prev = normalizeMenuHistoryEntry(menuHistory.pop());
    if (!prev) {
      closeSubmenu();
      return;
    }
    const previousView = getScreenViewState(state, { ...menuContext, ...prev });
    if (previousView.isCombatOverlaySubmenu && !previousView.isUsableCombatOverlaySubmenu) {
      closeSubmenu();
      return;
    }
    applyMenuContext(menuContext, prev);
    openSubmenu(prev.type, prev.title, true);
  } else {
    closeSubmenu();
  }
}

export function resetSubmenuBackButton() {
  document.getElementById("btn-submenu-back").style.display = "block";
}
