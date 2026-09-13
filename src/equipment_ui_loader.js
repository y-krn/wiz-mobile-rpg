import { bindEquipmentUiState } from "./equipment_ui_state.js";

let equipmentUiModule = null;
let equipmentUiPromise = null;

export function loadEquipmentUi() {
  if (equipmentUiModule) return Promise.resolve(equipmentUiModule);
  if (!equipmentUiPromise) {
    equipmentUiPromise = import("./equip_ui.js").then((module) => {
      bindEquipmentUiState(module.equipState);
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
  return loadEquipmentUi().then((module) => module.openEquipOverlay(actorIdx));
}

export function closeEquipOverlay() {
  if (equipmentUiModule) return equipmentUiModule.closeEquipOverlay();
  return loadEquipmentUi().then((module) => module.closeEquipOverlay());
}

export function renderEquip() {
  if (equipmentUiModule) return equipmentUiModule.renderEquip();
  return loadEquipmentUi().then((module) => module.renderEquip());
}
