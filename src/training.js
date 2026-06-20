import { state, saveGame, saveAutosave } from "./state.js";
import { getClassJpName } from "./data.js";
import { updateUI } from "./ui.js";
import { goBackSubmenu } from "./menu.js";

export let trainingState = {
  tab: "roster", // "roster" or "party"
  selectedName: null
};

export function renderTraining() {
  const overlay = document.getElementById("training-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  // 1. Create header
  const header = document.createElement("div");
  header.className = "training-header";
  header.innerHTML = `
    <span class="training-title">訓練場 - パーティ編成</span>
    <span class="training-subtitle">メンバー: ${state.party.length}/4人</span>
  `;
  overlay.appendChild(header);

  // 2. Create body
  const body = document.createElement("div");
  body.className = "training-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "8px";
  body.style.flexGrow = "1";

  // Spacer to push the list down to the bottom (thumb-reach zone)
  const spacer = document.createElement("div");
  spacer.style.flexGrow = "1";
  body.appendChild(spacer);

  // Title for active list
  const listTitle = document.createElement("div");
  listTitle.className = "training-col-title";
  listTitle.textContent = trainingState.tab === "roster" ? "待機メンバー (名簿)" : "現在の編成 (最大4人)";
  body.appendChild(listTitle);

  const listContainer = document.createElement("div");
  listContainer.className = "training-list";
  listContainer.style.maxHeight = "240px";
  listContainer.style.overflowY = "auto";

  let selectedChar = null;

  if (trainingState.tab === "roster") {
    const availableChars = state.roster.filter(char => !state.party.some(c => c.name === char.name));

    if (availableChars.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.style.marginTop = "20px";
      emptyMsg.textContent = "名簿全員がパーティに入っています。";
      listContainer.appendChild(emptyMsg);
    } else {
      availableChars.forEach(char => {
        const isSelected = trainingState.selectedName === char.name;
        if (isSelected) selectedChar = char;

        const row = document.createElement("button");
        row.type = "button";
        row.className = `char-row ${isSelected ? "selected" : ""}`;
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
        
        const info = document.createElement("div");
        info.className = "char-info";
        info.innerHTML = `
          <span class="char-row-name">${char.name}</span>
          <span class="char-row-meta">${getClassJpName(char.class)} Lv.${char.level} | HP:${char.hp}</span>
        `;
        row.appendChild(info);

        row.addEventListener("click", () => {
          trainingState.selectedName = isSelected ? null : char.name;
          renderTraining();
        });

        listContainer.appendChild(row);
      });
    }
  } else {
    if (state.party.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.style.marginTop = "20px";
      emptyMsg.textContent = "パーティが結成されていません。";
      listContainer.appendChild(emptyMsg);
    } else {
      state.party.forEach((char, idx) => {
        const isSelected = trainingState.selectedName === char.name;
        if (isSelected) selectedChar = char;

        const row = document.createElement("button");
        row.type = "button";
        row.className = `char-row ${isSelected ? "selected" : ""}`;
        row.setAttribute("aria-selected", isSelected ? "true" : "false");

        const isFront = idx < 2;
        const posClass = isFront ? "front" : "back";
        const posLabel = isFront ? "前" : "後";

        const label = document.createElement("span");
        label.className = `party-pos-label ${posClass}`;
        label.textContent = `${idx + 1}.${posLabel}`;
        row.appendChild(label);

        const info = document.createElement("div");
        info.className = "char-info";
        info.style.flexGrow = "1";
        info.style.textAlign = "left";
        info.innerHTML = `
          <span class="char-row-name">${char.name}</span>
          <span class="char-row-meta">${getClassJpName(char.class)} Lv.${char.level} | HP:${char.hp}</span>
        `;
        row.appendChild(info);

        row.addEventListener("click", () => {
          trainingState.selectedName = isSelected ? null : char.name;
          renderTraining();
        });

        listContainer.appendChild(row);
      });
    }
  }

  body.appendChild(listContainer);
  overlay.appendChild(body);

  // 3. Create Bottom Actions Panel
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  // 3.1 Current party summary
  const partyBar = document.createElement("div");
  partyBar.className = "training-party-bar";

  for (let i = 0; i < 4; i++) {
    const member = state.party[i];
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `training-party-slot ${member ? "filled" : "empty"} ${member && trainingState.selectedName === member.name ? "selected" : ""}`;

    if (member) {
      const isFront = i < 2;
      const posLabel = isFront ? "前" : "後";
      slot.innerHTML = `
        <span class="training-party-pos">${i + 1}.${posLabel}</span>
        <span class="training-party-name">${member.name}</span>
      `;
      slot.addEventListener("click", () => {
        trainingState.tab = "party";
        trainingState.selectedName = member.name;
        renderTraining();
      });
    } else {
      slot.innerHTML = `
        <span class="training-party-pos">${i + 1}</span>
        <span class="training-party-name">空き</span>
      `;
      slot.disabled = true;
    }

    partyBar.appendChild(slot);
  }

  footer.appendChild(partyBar);

  // 3.2 Tabs row
  const tabRow = document.createElement("div");
  tabRow.className = "bottom-actions-row";

  const tabRoster = document.createElement("button");
  tabRoster.className = `shop-tab ${trainingState.tab === "roster" ? "active" : ""}`;
  tabRoster.textContent = "👥 待機メンバー";
  tabRoster.setAttribute("aria-pressed", trainingState.tab === "roster" ? "true" : "false");
  tabRoster.addEventListener("click", () => {
    trainingState.tab = "roster";
    trainingState.selectedName = null;
    renderTraining();
  });
  tabRow.appendChild(tabRoster);

  const tabParty = document.createElement("button");
  tabParty.className = `shop-tab ${trainingState.tab === "party" ? "active" : ""}`;
  tabParty.textContent = "🛡️ 現在の編成";
  tabParty.setAttribute("aria-pressed", trainingState.tab === "party" ? "true" : "false");
  tabParty.addEventListener("click", () => {
    trainingState.tab = "party";
    trainingState.selectedName = null;
    renderTraining();
  });
  tabRow.appendChild(tabParty);
  footer.appendChild(tabRow);

  // 3.3 Action buttons row
  if (selectedChar) {
    const actionRow = document.createElement("div");
    actionRow.className = "bottom-actions-row";

    if (trainingState.tab === "roster") {
      const btnAdd = document.createElement("button");
      btnAdd.className = "btn btn-neon btn-block";
      btnAdd.textContent = `➕ ${selectedChar.name}を編成に加える`;
      if (state.party.length >= 4) {
        btnAdd.disabled = true;
        btnAdd.textContent = "パーティ満員 (最大4人)";
      }
      btnAdd.addEventListener("click", () => {
        if (state.party.length < 4) {
          state.party.push(selectedChar);
          trainingState.selectedName = null;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });
      actionRow.appendChild(btnAdd);
    } else {
      const charIdx = state.party.findIndex(c => c.name === selectedChar.name);

      const btnRemove = document.createElement("button");
      btnRemove.className = "btn btn-danger";
      btnRemove.style.flex = "1.5";
      btnRemove.textContent = "❌ 外す";
      btnRemove.addEventListener("click", () => {
        state.party = state.party.filter(c => c.name !== selectedChar.name);
        trainingState.selectedName = null;
        saveGame();
        saveAutosave();
        renderTraining();
        updateUI();
      });
      actionRow.appendChild(btnRemove);

      const btnUp = document.createElement("button");
      btnUp.className = "btn btn-neon";
      btnUp.style.flex = "1";
      btnUp.textContent = "▲ 上へ";
      if (charIdx === 0) btnUp.disabled = true;
      btnUp.addEventListener("click", () => {
        if (charIdx > 0) {
          const temp = state.party[charIdx];
          state.party[charIdx] = state.party[charIdx - 1];
          state.party[charIdx - 1] = temp;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });
      actionRow.appendChild(btnUp);

      const btnDown = document.createElement("button");
      btnDown.className = "btn btn-neon";
      btnDown.style.flex = "1";
      btnDown.textContent = "▼ 下へ";
      if (charIdx === state.party.length - 1) btnDown.disabled = true;
      btnDown.addEventListener("click", () => {
        if (charIdx < state.party.length - 1) {
          const temp = state.party[charIdx];
          state.party[charIdx] = state.party[charIdx + 1];
          state.party[charIdx + 1] = temp;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });
      actionRow.appendChild(btnDown);
    }
    footer.appendChild(actionRow);
  }

  // 3.4 Back/Close button row
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.style.width = "100%";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", () => {
    goBackSubmenu();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}
