import { state } from "./state.js";

let equipmentUiModule = null;
let equipmentUiPromise = null;
let equipmentUiImporter = () => import("./equip_ui.js");
let pendingOpenRequest = null;
let rejectedPreviousGameState = "explore";

function getOverlay() {
  return document.getElementById("equip-overlay");
}

function focusPendingStatus(overlay) {
  const status = overlay?.querySelector(".equip-loading-state");
  if (status && typeof status.focus === "function") status.focus({ preventScroll: true });
}

function renderLoadingState({ state: loadState, actorIdx = 0 } = {}) {
  const overlay = getOverlay();
  if (!overlay) return;

  overlay.style.display = "flex";
  overlay.dataset.loadState = loadState;
  overlay.setAttribute("aria-busy", loadState === "pending" ? "true" : "false");
  overlay.replaceChildren();

  const status = document.createElement("div");
  status.className = `equip-loading-state equip-loading-state--${loadState}`;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.tabIndex = -1;

  const title = document.createElement("strong");
  title.className = "equip-loading-title";
  title.textContent = loadState === "pending"
    ? "装備画面を準備しています"
    : "装備画面を開けませんでした";
  const message = document.createElement("p");
  message.textContent = loadState === "pending"
    ? "入力は受理済みです。少しお待ちください。"
    : "もう一度試すか、前の画面へ戻ってください。";
  status.append(title, message);

  if (loadState === "rejected") {
    const actions = document.createElement("div");
    actions.className = "equip-loading-actions";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-neon equip-loading-retry";
    retry.textContent = "もう一度試す";
    retry.addEventListener("click", () => openEquipOverlay(actorIdx));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-secondary equip-loading-close";
    close.textContent = "閉じる";
    close.addEventListener("click", () => {
      overlay.style.display = "none";
      overlay.removeAttribute("aria-busy");
      delete overlay.dataset.loadState;
      state.gameState = rejectedPreviousGameState;
      pendingOpenRequest = null;
    });
    actions.append(retry, close);
    status.appendChild(actions);
  }

  overlay.appendChild(status);
  if (loadState === "pending") focusPendingStatus(overlay);
}

export function loadEquipmentUi() {
  if (equipmentUiModule) return Promise.resolve(equipmentUiModule);
  if (!equipmentUiPromise) {
    equipmentUiPromise = Promise.resolve().then(() => equipmentUiImporter()).then((module) => {
      equipmentUiModule = module;
      return module;
    }).catch((error) => {
      equipmentUiPromise = null;
      throw error;
    });
  }
  return equipmentUiPromise;
}

export function openEquipOverlay(actorIdx = 0) {
  if (equipmentUiModule) return equipmentUiModule.openEquipOverlay(actorIdx);
  if (pendingOpenRequest) return pendingOpenRequest.promise;

  const request = {
    actorIdx,
    previousGameState: state.gameState,
    promise: null
  };
  pendingOpenRequest = request;
  state.gameState = "equip_overlay";
  renderLoadingState({ state: "pending", actorIdx });

  request.promise = loadEquipmentUi().then((module) => {
    if (pendingOpenRequest !== request) return false;
    pendingOpenRequest = null;
    state.gameState = request.previousGameState;
    const overlay = getOverlay();
    if (overlay) {
      overlay.removeAttribute("aria-busy");
      delete overlay.dataset.loadState;
      overlay.replaceChildren();
    }
    return module.openEquipOverlay(actorIdx);
  }).catch(() => {
    if (pendingOpenRequest !== request) return false;
    rejectedPreviousGameState = request.previousGameState;
    pendingOpenRequest = null;
    state.gameState = request.previousGameState;
    renderLoadingState({ state: "rejected", actorIdx });
    return false;
  });
  return request.promise;
}

export function closeEquipOverlay() {
  if (equipmentUiModule) return equipmentUiModule.closeEquipOverlay();
  return loadEquipmentUi().then((module) => module.closeEquipOverlay());
}

export function renderEquip() {
  if (equipmentUiModule) return equipmentUiModule.renderEquip();
  if (pendingOpenRequest) {
    renderLoadingState({ state: "pending", actorIdx: pendingOpenRequest.actorIdx });
    return Promise.resolve(false);
  }
  return loadEquipmentUi().then((module) => module.renderEquip());
}

// Test-only injection point for deterministic cold/delayed/failure paths.
// Production keeps the native dynamic import as the default importer.
export function __setEquipmentUiLoaderForTests(importer = null) {
  if (importer !== null && typeof importer !== "function") {
    throw new TypeError("equipment UI importer must be a function or null");
  }
  equipmentUiModule = null;
  equipmentUiPromise = null;
  equipmentUiImporter = importer || (() => import("./equip_ui.js"));
}
