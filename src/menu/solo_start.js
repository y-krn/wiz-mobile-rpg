import { SOLO_CLASSES, addLog, createSoloCharacter, state } from "../state.js";
import { getClassJpName } from "../data.js";
import { executeEnterDungeon } from "../movement.js";

export function renderSoloStart(optGrid) {
  optGrid.innerHTML = "";
  optGrid.classList.add("solo-start-grid");

  SOLO_CLASSES.forEach(className => {
    const character = createSoloCharacter(className);
    const button = document.createElement("button");
    button.className = "btn btn-neon btn-block solo-class-option";
    button.innerHTML = `<strong>${getClassJpName(className)}</strong><span>HP ${character.maxHp} / MP ${character.maxMp}</span>`;
    button.addEventListener("click", () => {
      state.party = [createSoloCharacter(className)];
      addLog(`${state.party[0].name}（${getClassJpName(className)}）が単独で潜行を開始する。`);
      executeEnterDungeon(1);
    });
    optGrid.appendChild(button);
  });
}
