import { state } from "../state.js";

export function renderMaterialsHUD(container) {
  const matsContainer = document.createElement("div");
  matsContainer.className = "materials-hud";
  matsContainer.style.gridColumn = "span 2";
  matsContainer.style.display = "flex";
  matsContainer.style.flexWrap = "wrap";
  matsContainer.style.gap = "4px";
  matsContainer.style.justifyContent = "center";
  matsContainer.style.marginBottom = "8px";
  matsContainer.style.border = "1px solid #333";
  matsContainer.style.padding = "6px 8px";
  matsContainer.style.background = "rgba(0, 255, 102, 0.03)";
  matsContainer.style.borderRadius = "4px";
  matsContainer.style.boxSizing = "border-box";

  const matPool = ["獣の牙", "硬い皮", "毒腺", "骨片", "霊粉", "魔石片", "鉄片", "呪布", "黒角", "竜鱗"];
  const balance = state.currentRun?.materials || state.metaMaterials || {};
  const ownedMats = matPool.filter(m => (balance[m] || 0) > 0);

  if (ownedMats.length === 0) {
    const empty = document.createElement("span");
    empty.style.color = "var(--text-muted)";
    empty.style.fontSize = "10px";
    empty.textContent = "所持素材なし";
    matsContainer.appendChild(empty);
  } else {
    ownedMats.forEach(m => {
      const badge = document.createElement("span");
      badge.style.fontSize = "10px";
      badge.style.fontFamily = "var(--font-mono)";
      badge.style.padding = "2px 6px";
      badge.style.background = "rgba(0, 255, 102, 0.08)";
      badge.style.border = "1px solid rgba(0, 255, 102, 0.2)";
      badge.style.borderRadius = "3px";
      badge.style.color = "var(--neon-green)";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.textContent = `${m}: ${balance[m]}`;
      matsContainer.appendChild(badge);
    });
  }
  container.appendChild(matsContainer);
}
