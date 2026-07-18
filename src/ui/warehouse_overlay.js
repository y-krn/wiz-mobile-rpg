import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";

export const warehouseState = {
  selectedSource: null, // "bag" or "storage"
  selectedIndex: null   // index in the array
};

export function openWarehouseOverlay() {
  const overlay = document.getElementById("warehouse-overlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
  // Reset selection state when opening warehouse
  warehouseState.selectedSource = null;
  warehouseState.selectedIndex = null;
  renderWarehouse();
}

export function renderWarehouse() {
  const overlay = document.getElementById("warehouse-overlay");
  if (!overlay) return;

  if (!state.storage) state.storage = [];
  if (!state.storageMax) state.storageMax = 30;

  overlay.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "archives-header";
  
  const title = document.createElement("div");
  title.className = "archives-title";
  title.textContent = `共有倉庫 (容量: ${state.storage.length} / ${state.storageMax})`;
  header.appendChild(title);
  
  overlay.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "archives-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "15px";

  // Section 1: Bag (Inventory)
  const bagSection = document.createElement("div");
  bagSection.innerHTML = `<div class="archives-section-title">🎒 共有バッグ内のアイテム (${state.inventory.length} / 20)</div>`;
  
  const bagList = document.createElement("div");
  bagList.className = "codex-grid";
  bagList.style.maxHeight = "180px";
  bagList.style.overflowY = "auto";

  if (state.inventory.length === 0) {
    bagList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px; font-size: 11px;">バッグは空です</div>`;
  } else {
    state.inventory.forEach((itemKey, idx) => {
      const item = getItemData(itemKey);
      if (!item) return;
      
      const row = document.createElement("div");
      const isSelected = warehouseState.selectedSource === "bag" && warehouseState.selectedIndex === idx;
      row.className = `codex-row ${isSelected ? "active" : ""}`;
      row.style.padding = "8px 10px";
      row.style.cursor = "pointer";
      row.style.minHeight = "44px"; // Ensure touch target size
      row.style.display = "flex";
      row.style.alignItems = "center";
      
      const isUnidentified = typeof itemKey === "object" && !itemKey.identified;
      const unidTag = isUnidentified ? `<span style="color: var(--neon-red); font-size: 9px; border: 1px solid var(--neon-red); padding: 0 2px; margin-right: 4px; border-radius: 2px;">未鑑定</span>` : "";
      
      row.innerHTML = `
        <div style="display: flex; align-items: center; width: 100%;">
          ${unidTag}
          <span class="codex-name">${item.name}</span>
        </div>
      `;

      row.addEventListener("click", () => {
        warehouseState.selectedSource = "bag";
        warehouseState.selectedIndex = idx;
        renderWarehouse();
      });

      bagList.appendChild(row);
    });
  }
  bagSection.appendChild(bagList);
  body.appendChild(bagSection);

  // Section 2: Storage (Warehouse)
  const storageSection = document.createElement("div");
  storageSection.innerHTML = `<div class="archives-section-title">🏢 倉庫内の保管アイテム (${state.storage.length} / ${state.storageMax})</div>`;

  const storageList = document.createElement("div");
  storageList.className = "codex-grid";
  storageList.style.maxHeight = "180px";
  storageList.style.overflowY = "auto";

  if (state.storage.length === 0) {
    storageList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px; font-size: 11px;">倉庫に保管されているアイテムはありません</div>`;
  } else {
    state.storage.forEach((itemKey, idx) => {
      const item = getItemData(itemKey);
      if (!item) return;

      const row = document.createElement("div");
      const isSelected = warehouseState.selectedSource === "storage" && warehouseState.selectedIndex === idx;
      row.className = `codex-row ${isSelected ? "active" : ""}`;
      row.style.padding = "8px 10px";
      row.style.cursor = "pointer";
      row.style.minHeight = "44px"; // Ensure touch target size
      row.style.display = "flex";
      row.style.alignItems = "center";

      const isUnidentified = typeof itemKey === "object" && !itemKey.identified;
      const unidTag = isUnidentified ? `<span style="color: var(--neon-red); font-size: 9px; border: 1px solid var(--neon-red); padding: 0 2px; margin-right: 4px; border-radius: 2px;">未鑑定</span>` : "";

      row.innerHTML = `
        <div style="display: flex; align-items: center; width: 100%;">
          ${unidTag}
          <span class="codex-name">${item.name}</span>
        </div>
      `;

      row.addEventListener("click", () => {
        warehouseState.selectedSource = "storage";
        warehouseState.selectedIndex = idx;
        renderWarehouse();
      });

      storageList.appendChild(row);
    });
  }
  storageSection.appendChild(storageList);
  body.appendChild(storageSection);

  overlay.appendChild(body);

  // Footer with actions
  const footer = document.createElement("div");
  footer.className = "archives-footer";
  footer.style.display = "flex";
  footer.style.flexDirection = "column";
  footer.style.gap = "8px";

  // Selection info and main execute button
  const selectionPanel = document.createElement("div");
  selectionPanel.style.display = "flex";
  selectionPanel.style.flexDirection = "column";
  selectionPanel.style.gap = "6px";
  selectionPanel.style.border = "1px solid var(--border-color)";
  selectionPanel.style.padding = "8px";
  selectionPanel.style.backgroundColor = "rgba(10, 10, 15, 0.95)";
  selectionPanel.style.borderRadius = "4px";

  const infoLabel = document.createElement("div");
  infoLabel.style.fontSize = "12px";
  infoLabel.style.fontWeight = "bold";
  infoLabel.style.textAlign = "center";
  infoLabel.style.minHeight = "18px";

  const btnExecute = document.createElement("button");
  btnExecute.type = "button";
  btnExecute.className = "btn btn-neon";
  btnExecute.style.width = "100%";
  btnExecute.style.minHeight = "44px";

  let selectedItemName = "なし";
  if (warehouseState.selectedSource === "bag" && warehouseState.selectedIndex !== null) {
    const itemKey = state.inventory[warehouseState.selectedIndex];
    if (itemKey) {
      const item = getItemData(itemKey);
      if (item) selectedItemName = item.name;
    }
  } else if (warehouseState.selectedSource === "storage" && warehouseState.selectedIndex !== null) {
    const itemKey = state.storage[warehouseState.selectedIndex];
    if (itemKey) {
      const item = getItemData(itemKey);
      if (item) selectedItemName = item.name;
    }
  }

  infoLabel.textContent = `選択中: ${selectedItemName}`;

  if (warehouseState.selectedSource === "bag" && warehouseState.selectedIndex !== null) {
    btnExecute.textContent = "🏢 倉庫に預ける";
    btnExecute.addEventListener("click", () => {
      const idx = warehouseState.selectedIndex;
      if (state.storage.length >= state.storageMax) {
        alert("倉庫がいっぱいでこれ以上預けられません！");
        return;
      }
      const removed = state.inventory.splice(idx, 1)[0];
      state.storage.push(removed);
      playSound("gold");
      saveAutosave();
      
      // Clear selection
      warehouseState.selectedSource = null;
      warehouseState.selectedIndex = null;
      renderWarehouse();
    });
  } else if (warehouseState.selectedSource === "storage" && warehouseState.selectedIndex !== null) {
    btnExecute.textContent = "🎒 バッグに引き出す";
    btnExecute.addEventListener("click", () => {
      const idx = warehouseState.selectedIndex;
      if (state.inventory.length >= 20) {
        alert("バッグがいっぱいで引き出せません！");
        return;
      }
      const removed = state.storage.splice(idx, 1)[0];
      state.inventory.push(removed);
      playSound("gold");
      saveAutosave();
      
      // Clear selection
      warehouseState.selectedSource = null;
      warehouseState.selectedIndex = null;
      renderWarehouse();
    });
  } else {
    btnExecute.textContent = "アイテムを選択してください";
    btnExecute.disabled = true;
    btnExecute.classList.add("disabled");
  }

  selectionPanel.appendChild(infoLabel);
  selectionPanel.appendChild(btnExecute);
  footer.appendChild(selectionPanel);

  const actionRow1 = document.createElement("div");
  actionRow1.className = "bottom-actions-row";
  actionRow1.style.gap = "6px";

  // 一括預入ボタン
  const btnBatchDeposit = document.createElement("button");
  btnBatchDeposit.type = "button";
  btnBatchDeposit.className = "btn btn-neon";
  btnBatchDeposit.style.flex = "1";
  btnBatchDeposit.style.minHeight = "44px";
  btnBatchDeposit.textContent = "📦 未鑑定品一括預入";
  btnBatchDeposit.addEventListener("click", () => {
    const unids = state.inventory.filter(item => typeof item === "object" && !item.identified);
    if (unids.length === 0) {
      alert("バッグ内に未鑑定の装備がありません。");
      return;
    }
    
    let count = 0;
    for (let i = state.inventory.length - 1; i >= 0; i--) {
      const itemKey = state.inventory[i];
      if (typeof itemKey === "object" && !itemKey.identified) {
        if (state.storage.length >= state.storageMax) {
          alert("倉庫がいっぱいになりました！一部の未鑑定品は預けられませんでした。");
          break;
        }
        const removed = state.inventory.splice(i, 1)[0];
        state.storage.push(removed);
        count++;
      }
    }
    
    if (count > 0) {
      addLog(`未鑑定品を ${count} 個、倉庫に預けました。`);
      playSound("gold");
      saveAutosave();
      
      // Reset selection just in case
      warehouseState.selectedSource = null;
      warehouseState.selectedIndex = null;
      renderWarehouse();
    }
  });

  // 倉庫拡張ボタン
  const btnExpand = document.createElement("button");
  btnExpand.type = "button";
  btnExpand.className = "btn btn-neon";
  btnExpand.style.flex = "1";
  btnExpand.style.minHeight = "44px";
  btnExpand.style.borderColor = "var(--neon-cyan)";
  btnExpand.style.color = "var(--neon-cyan)";
  btnExpand.textContent = `🏢 倉庫拡張 (+5/500G)`;
  if (state.gold < 500) {
    btnExpand.disabled = true;
    btnExpand.classList.add("disabled");
  }
  btnExpand.addEventListener("click", () => {
    if (state.gold < 500) return;
    state.gold -= 500;
    state.storageMax += 5;
    addLog(`倉庫枠を拡張しました！最大枠数：${state.storageMax}`);
    playSound("level_up");
    
    const goldLabel = document.getElementById("gold-counter");
    if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

    saveGame();
    saveAutosave();
    renderWarehouse();
  });

  actionRow1.appendChild(btnBatchDeposit);
  actionRow1.appendChild(btnExpand);
  footer.appendChild(actionRow1);

  // 閉じる行
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.className = "btn btn-danger btn-overlay-close";
  btnClose.textContent = "❌ 街に戻る";
  btnClose.style.width = "100%";
  btnClose.style.minHeight = "44px";
  btnClose.addEventListener("click", () => {
    overlay.style.display = "none";
    state.gameState = "town";
    updateUI();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}
