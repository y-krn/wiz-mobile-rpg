import { SOLO_CLASSES, addLog, createSoloCharacter, state } from "../state.js";
import { getClassJpName } from "../data.js";
import { ELITE_CLASSES } from "../data/classes.js";
import { executeEnterDungeon } from "../movement.js";
import { ITEMS } from "../data/items.js";
import {
  applyWorkshopToCharacter,
  canAffordDepartureKit,
  getWorkshopGrants,
  purchaseDepartureKit
} from "../systems/workshop.js";
import { DEPARTURE_KIT } from "../data/workshop.js";
import { getTotalMaterialCount } from "../rules/material_rules.js";
import { MATERIAL_DROP_BALANCE } from "../data/materials.js";

// 出発準備を持って行くかどうかは階を選ぶまで確定しない。支払いは startRun で1回だけ。
let departureKitSelected = false;

function startRun(className, startingGear = null, startFloor = 1) {
  let departureKit = false;
  if (departureKitSelected) {
    const purchase = purchaseDepartureKit(state.metaMaterials);
    if (purchase.ok) {
      state.metaMaterials = purchase.metaMaterials;
      departureKit = true;
      addLog(`${DEPARTURE_KIT.name}に素材${DEPARTURE_KIT.materialCost}個を支払った。`);
    }
  }
  const character = applyWorkshopToCharacter(createSoloCharacter(className), state.workshop);
  if (startingGear) {
    const item = ITEMS[startingGear];
    if (item) character.equipment[item.type] = startingGear;
  }
  state.party = [character];
  addLog(`${character.name}（${getClassJpName(className)}）が単独で潜行を開始する。`);
  executeEnterDungeon(startFloor, { departureKit });
}

function appendLabelledLines(button, title, detail) {
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  button.append(strong, span);
}

function renderDepartureKitToggle(optGrid, className, startingGear) {
  const stock = getTotalMaterialCount(state.metaMaterials);
  const affordable = canAffordDepartureKit(state.metaMaterials);
  if (!affordable) departureKitSelected = false;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-block solo-start-kit${departureKitSelected ? " is-selected" : ""}`;
  button.disabled = !affordable;
  button.setAttribute("aria-pressed", String(departureKitSelected));
  const status = affordable
    ? (departureKitSelected ? "持って行く" : "持って行かない")
    : "素材不足";
  appendLabelledLines(
    button,
    `${DEPARTURE_KIT.name}：${status}`,
    `帰還の翼1 / 鑑定粉1 ・ 素材${DEPARTURE_KIT.materialCost}（所持 ${stock}）`
  );
  button.addEventListener("click", () => {
    departureKitSelected = !departureKitSelected;
    renderStartFloorChoices(optGrid, className, startingGear);
  });
  optGrid.appendChild(button);
}

function renderStartFloorChoices(optGrid, className, startingGear) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-floor-grid";
  const changeClass = document.createElement("button");
  changeClass.type = "button";
  changeClass.className = "btn btn-block solo-start-change";
  changeClass.textContent = "クラスを選び直す";
  changeClass.addEventListener("click", () => renderSoloStart(optGrid));
  optGrid.appendChild(changeClass);

  renderDepartureKitToggle(optGrid, className, startingGear);

  const floors = [1, ...(state.unlockedMilestones || [])];
  floors.forEach(floor => {
    const multiplier = floor === 1 ? 1 : MATERIAL_DROP_BALANCE.milestoneStartMultiplier;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-neon btn-block solo-start-floor-option";
    button.innerHTML = `<strong>B${floor}Fから開始</strong><span>素材収入 ${Math.round(multiplier * 100)}%</span>`;
    button.addEventListener("click", () => startRun(className, startingGear, floor));
    optGrid.appendChild(button);
  });
}

export function renderSoloStart(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-grid";

  SOLO_CLASSES.filter(className => !ELITE_CLASSES.includes(className)).forEach(className => {
    const character = createSoloCharacter(className);
    const button = document.createElement("button");
    button.className = "btn btn-neon btn-block solo-class-option";
    button.innerHTML = `<strong>${getClassJpName(className)}</strong><span>HP ${character.maxHp} / MP ${character.maxMp}</span>`;
    button.addEventListener("click", () => renderStartFloorChoices(optGrid, className, null));
    optGrid.appendChild(button);

    getWorkshopGrants(state.workshop).startingGear.forEach(itemId => {
      const item = ITEMS[itemId];
      if (!item || (item.classes && !item.classes.includes(className))) return;
      const option = document.createElement("button");
      option.className = "btn btn-neon btn-block solo-class-option";
      option.innerHTML = `<strong>${getClassJpName(className)} + ${item.name}</strong><span>工房アンロック装備</span>`;
      option.addEventListener("click", () => renderStartFloorChoices(optGrid, className, itemId));
      optGrid.appendChild(option);
    });
  });
}
