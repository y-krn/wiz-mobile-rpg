import { SOLO_CLASSES, addLog, createSoloCharacter, state } from "../state.js";
import { getClassJpName } from "../data.js";
import { ELITE_CLASSES } from "../data/classes.js";
import { executeEnterDungeon } from "../movement.js";
import { ITEMS } from "../data/items.js";
import { applyWorkshopToCharacter, getWorkshopGrants } from "../systems/workshop.js";
import { MATERIAL_DROP_BALANCE } from "../data/materials.js";

function startRun(className, startingGear = null, startFloor = 1) {
  const character = applyWorkshopToCharacter(createSoloCharacter(className), state.workshop);
  if (startingGear) {
    const item = ITEMS[startingGear];
    if (item) character.equipment[item.type] = startingGear;
  }
  state.party = [character];
  addLog(`${character.name}（${getClassJpName(className)}）が単独で潜行を開始する。`);
  executeEnterDungeon(startFloor);
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
