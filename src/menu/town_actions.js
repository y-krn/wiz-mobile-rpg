import { state, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { openArchivesOverlay } from "../ui.js";
import { openSubmenu } from "../navigation.js";
import { getItemBaseId } from "../data.js";

export function handleTownOption(option) {
  if (option === "castle") {
    openSubmenu("castle_main", "おしろ - 記録");
  } else if (option === "workshop") {
    openSubmenu("workshop_main", "工房 - 恒久アンロック");
  } else if (option === "archives") {
    openArchivesOverlay();
  }
}

export function renderCastleMain(optGrid) {
  optGrid.innerHTML = "";
  optGrid.style.display = "flex";
  optGrid.style.flexDirection = "column";
  optGrid.style.gap = "8px";
  const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");
  if (hasCrystal) {
    const button = document.createElement("button");
    button.className = "btn btn-neon btn-block";
    button.textContent = "浮遊石を王へ献上する";
    button.addEventListener("click", () => {
      state.cleared = true;
      state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
      addLog("浮遊石を持ち帰り、初踏破が記録された！");
      playSound("level_up");
      saveAutosave();
      renderCastleMain(optGrid);
    });
    optGrid.appendChild(button);
  }
  const deathLogs = document.createElement("button");
  deathLogs.className = "btn btn-neon btn-block";
  deathLogs.textContent = "全滅ログ確認";
  deathLogs.addEventListener("click", () => openSubmenu("castle_death_logs", "おしろ - 全滅ログ"));
  optGrid.appendChild(deathLogs);
}

export function renderCastleDeathLogs(optGrid) {
  optGrid.innerHTML = "";
  const logs = state.deathLogs || [];
  if (logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "detail-placeholder";
    empty.textContent = "全滅の記録はありません。";
    optGrid.appendChild(empty);
    return;
  }
  logs.slice(0, 15).forEach(log => {
    const entry = document.createElement("div");
    entry.className = "detail-placeholder";
    entry.textContent = `B${log.floor}F / ${log.cause || "戦闘"}`;
    optGrid.appendChild(entry);
  });
}
