import { state, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { generateContractsList } from "../contracts.js";

export const contractsState = {
  selectedId: null
};

function formatContractReward(contract) {
  let text = `${contract.reward.gold} G`;
  if (contract.reward.identifyTickets > 0) text += ` / 鑑定券:${contract.reward.identifyTickets}枚`;
  const materials = Object.entries(contract.reward.materials || {});
  if (materials.length > 0) text += ` / ${materials.map(([name, qty]) => `${name}:${qty}`).join("、")}`;
  if (contract.reward.mapFragmentFloor) text += ` / B${contract.reward.mapFragmentFloor}F 地図の断片`;
  if (contract.reward.item === "rare_equip") text += " / 未鑑定装備(Rare)";
  if (contract.reward.item === "epic_equip") text += " / 未鑑定装備(Epic)";
  return text;
}

export function openContractsOverlay() {
  contractsState.selectedId = null;
  const overlay = document.getElementById("contracts-overlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
  renderContracts();
}

export function renderContracts() {
  const overlay = document.getElementById("contracts-overlay");
  if (!overlay) return;

  overlay.innerHTML = "";
  
  // Header
  const header = document.createElement("div");
  header.className = "archives-header";
  
  const title = document.createElement("div");
  title.className = "archives-title";
  title.textContent = "城の探索契約書";
  header.appendChild(title);
  
  overlay.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "archives-body";
  body.style.flex = "1";
  body.style.overflowY = "auto";

  // Footer / Close Button
  const footer = document.createElement("div");
  footer.className = "archives-footer";
  footer.style.display = "flex";
  footer.style.flexDirection = "column";
  footer.style.gap = "8px";

  if (state.activeContract) {
    // Show active contract details and progress
    const contract = state.activeContract;
    const isKill = contract.type === "kill" || contract.type === "warden";
    const isChest = contract.type === "chest";
    const isRecovery = contract.type === "recovery";
    
    let progressText = "";
    if (isKill) {
      progressText = `討伐数: ${contract.currentValue} / ${contract.targetValue} 体`;
    } else if (isChest) {
      progressText = `宝箱開封数 (探索中): ${state.currentRun ? state.currentRun.chestsOpened : 0} / ${contract.targetValue} 個`;
    } else if (isRecovery) {
      const currentUnid = state.inventory.filter(item => typeof item === "object" && !item.identified).length;
      progressText = `所持未鑑定品: ${currentUnid} / ${contract.targetValue} 個`;
    } else if (contract.type === "reach" || contract.type === "weekly" || contract.type === "limit") {
      progressText = `最高到達階: B${state.currentRun ? state.currentRun.deepestFloor : 1}F (目標: B${contract.targetValue}F)`;
    }

    const detailDiv = document.createElement("div");
    detailDiv.className = "codex-detail";
    
    const rewardText = formatContractReward(contract);

    detailDiv.innerHTML = `
      <div class="codex-detail-header" style="border-bottom: 1px solid var(--neon-glow-gold);">
        <span class="codex-detail-name" style="color: var(--neon-gold);">${contract.name}</span>
        <span class="codex-meta" style="color: var(--neon-gold); border-color: var(--neon-gold);">危険度: ${contract.danger}</span>
      </div>
      <div class="codex-detail-body">
        <p style="font-size: 13px; font-weight: bold; margin-bottom: 10px;">${contract.description}</p>
        <p style="margin-top: 10px; font-size: 13px; color: var(--neon-cyan);"><strong>現在の進捗:</strong> ${progressText}</p>
        <p style="margin-top: 10px;"><strong>報酬:</strong> ${rewardText}</p>
        <p style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">※契約を完了させるには、条件を満たした状態で無事に街へ「帰還」する必要があります。全滅した場合は契約失敗となり、破棄されます。</p>
        <p style="margin-top: 10px; border-top: 1px dashed #333; padding-top: 8px;"><strong>推奨事項:</strong><br>${contract.recommended || "特になし"}</p>
      </div>
    `;

    const btnAbandon = document.createElement("button");
    btnAbandon.type = "button";
    btnAbandon.className = "btn btn-danger btn-block";
    btnAbandon.style.marginTop = "15px";
    btnAbandon.style.minHeight = "44px";
    btnAbandon.textContent = "⚠️ 契約を破棄する";
    btnAbandon.addEventListener("click", () => {
      if (confirm("本当にこの契約を破棄しますか？進捗は完全にリセットされます。")) {
        state.activeContract = null;
        state.contracts = generateContractsList(state);
        saveAutosave();
        renderContracts();
      }
    });

    detailDiv.appendChild(btnAbandon);
    body.appendChild(detailDiv);

    // Footer - Close only
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
    footer.appendChild(btnClose);
  } else {
    // Show details of selected contract OR choices list (NOT BOTH in the scrollable view)
    if (contractsState.selectedId) {
      const selected = state.contracts.find(c => c.id === contractsState.selectedId);
      if (selected) {
        const detailModal = document.createElement("div");
        detailModal.className = "codex-detail";
        detailModal.style.border = "1px solid var(--border-color)";
        detailModal.style.padding = "10px";
        detailModal.style.backgroundColor = "rgba(10, 10, 15, 0.95)";

        const rewardText = formatContractReward(selected);

        detailModal.innerHTML = `
          <div style="font-size: 13px; font-weight: bold; color: var(--neon-gold); margin-bottom: 6px;">📝 契約詳細：${selected.name}</div>
          <p style="font-size: 12px; margin-bottom: 8px;">${selected.description}</p>
          <p style="font-size: 11px;"><strong>報酬:</strong> ${rewardText}</p>
          <p style="font-size: 11px; margin-top: 4px; color: var(--neon-cyan);"><strong>推奨準備:</strong> ${selected.recommended || "特になし"}</p>
        `;
        body.appendChild(detailModal);

        // Footer Actions - Accept on top, Back/Close on bottom row
        const btnAccept = document.createElement("button");
        btnAccept.type = "button";
        btnAccept.className = "btn btn-neon";
        btnAccept.style.width = "100%";
        btnAccept.style.minHeight = "44px";
        btnAccept.textContent = "✍️ 契約を受注する";
        btnAccept.addEventListener("click", () => {
          state.activeContract = selected;
          state.contracts = state.contracts.filter(c => c.id !== selected.id);
          addLog(`探索契約「${selected.name}」を受注しました！`);
          playSound("level_up");
          saveAutosave();
          contractsState.selectedId = null;
          
          const overlay = document.getElementById("contracts-overlay");
          if (overlay) {
            overlay.style.display = "none";
          }
          state.gameState = "town";
          updateUI();
        });
        footer.appendChild(btnAccept);

        const subActionRow = document.createElement("div");
        subActionRow.className = "bottom-actions-row";
        subActionRow.style.gap = "8px";

        const btnCancel = document.createElement("button");
        btnCancel.type = "button";
        btnCancel.className = "btn btn-neon";
        btnCancel.style.flex = "1";
        btnCancel.style.minHeight = "44px";
        btnCancel.style.borderColor = "var(--neon-gold)";
        btnCancel.style.color = "var(--neon-gold)";
        btnCancel.textContent = "◀ 一覧に戻る";
        btnCancel.addEventListener("click", () => {
          contractsState.selectedId = null;
          renderContracts();
        });

        const btnClose = document.createElement("button");
        btnClose.type = "button";
        btnClose.className = "btn btn-danger btn-overlay-close";
        btnClose.textContent = "❌ 街に戻る";
        btnClose.style.flex = "1";
        btnClose.style.minHeight = "44px";
        btnClose.addEventListener("click", () => {
          overlay.style.display = "none";
          state.gameState = "town";
          updateUI();
        });

        subActionRow.appendChild(btnCancel);
        subActionRow.appendChild(btnClose);
        footer.appendChild(subActionRow);
      }
    } else {
      // Show contract choices list
      const listTitle = document.createElement("div");
      listTitle.className = "archives-section-title";
      listTitle.textContent = "受注可能な契約 (1件のみ選択可能)";
      body.appendChild(listTitle);

      const listContainer = document.createElement("div");
      listContainer.className = "codex-grid";

      state.contracts.forEach(c => {
        const row = document.createElement("div");
        row.className = "codex-row";
        row.style.borderLeft = `3px solid ${c.danger === "C" ? "var(--neon-green)" : (c.danger === "B" ? "var(--neon-gold)" : "var(--neon-red)")}`;
        row.style.minHeight = "44px"; // Ensure touch target size
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        
        row.innerHTML = `
          <div style="display: flex; flex-direction: column;">
            <span class="codex-name" style="font-weight: bold;">${c.name}</span>
            <span style="font-size: 10px; color: var(--text-muted);">${c.description}</span>
          </div>
          <span class="codex-meta" style="min-width: 50px; text-align: center;">危険度 ${c.danger}</span>
        `;

        row.addEventListener("click", () => {
          contractsState.selectedId = c.id;
          renderContracts();
        });

        listContainer.appendChild(row);
      });

      body.appendChild(listContainer);

      // Footer - Close only
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
      footer.appendChild(btnClose);
    }
  }

  overlay.appendChild(body);
  overlay.appendChild(footer);
}
