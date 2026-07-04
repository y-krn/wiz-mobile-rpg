import { state, saveGame, saveAutosave, canRecruitRescueNewcomer, addLog } from "./state.js";
import { getClassJpName } from "./data.js";
import { updateUI } from "./ui.js";
import { goBackSubmenu } from "./navigation.js";

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
      const replaceIdx = state.party.findIndex(c => c.status === "dead" || c.status === "ash");
      const canJoin = selectedChar.status !== "dead" && selectedChar.status !== "ash";
      const canReplaceDead = state.party.length >= 4 && replaceIdx !== -1 && canJoin;

      btnAdd.textContent = canReplaceDead
        ? `↔ ${state.party[replaceIdx].name}と入れ替える`
        : `➕ ${selectedChar.name}を編成に加える`;
      if (!canJoin) {
        btnAdd.disabled = true;
        btnAdd.textContent = "死亡・灰化メンバーは編成不可";
      } else if (state.party.length >= 4 && !canReplaceDead) {
        btnAdd.disabled = true;
        btnAdd.textContent = "パーティ満員 (最大4人)";
      }
      btnAdd.addEventListener("click", () => {
        if (!canJoin) return;
        if (canReplaceDead) {
          state.party[replaceIdx] = selectedChar;
          trainingState.selectedName = null;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        } else if (state.party.length < 4) {
          state.party.push(selectedChar);
          trainingState.selectedName = null;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });

      if (!canJoin) {
        const btnDismiss = document.createElement("button");
        btnDismiss.className = "btn btn-danger btn-block";
        btnDismiss.style.marginTop = "8px";
        btnDismiss.style.height = "44px";
        btnDismiss.textContent = `❌ ${selectedChar.name}を諦める (削除)`;
        btnDismiss.addEventListener("click", () => {
          if (confirm(`${selectedChar.name}を諦めて名簿から完全に削除しますか？`)) {
            state.party = state.party.filter(c => c.name !== selectedChar.name);
            state.roster = state.roster.filter(c => c.name !== selectedChar.name);
            trainingState.selectedName = null;
            saveGame();
            saveAutosave();
            renderTraining();
            updateUI();
          }
        });
        actionRow.style.flexDirection = "column";
        actionRow.style.gap = "8px";
        actionRow.appendChild(btnAdd);
        actionRow.appendChild(btnDismiss);
      } else {
        actionRow.appendChild(btnAdd);
      }
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
  if (canRecruitRescueNewcomer()) {
    const rescueRow = document.createElement("div");
    rescueRow.className = "bottom-actions-row";
    rescueRow.style.flexDirection = "column";
    rescueRow.style.gap = "8px";
    rescueRow.style.marginTop = "8px";

    const btnRescue = document.createElement("button");
    btnRescue.type = "button";
    btnRescue.className = "btn btn-neon btn-block";
    btnRescue.style.height = "44px";
    btnRescue.style.backgroundColor = "var(--danger-color, #ff3366)";
    btnRescue.style.borderColor = "var(--danger-color, #ff3366)";

    const aliveCount = state.roster.filter(char => char.status !== "dead" && char.status !== "ash").length;
    const isFull = state.roster.length >= 8;
    if (isFull) {
      btnRescue.textContent = `⚠️ 新人を迎える (名簿満員) ${aliveCount}/2`;
      btnRescue.disabled = true;

      const infoMsg = document.createElement("div");
      infoMsg.style.color = "var(--danger-color, #ff3366)";
      infoMsg.style.fontSize = "12px";
      infoMsg.style.textAlign = "center";
      infoMsg.textContent = "名簿が満員です。死亡したメンバーを諦めて空き枠を作ってください。";
      rescueRow.appendChild(infoMsg);
    } else {
      btnRescue.textContent = `🆕 新人を迎える (0G) ${aliveCount}/2`;
      btnRescue.addEventListener("click", () => {
        addNewbieToRoster();
      });
    }
    rescueRow.appendChild(btnRescue);
    footer.appendChild(rescueRow);
  }

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

function addNewbieToRoster() {
  let baseName = "Trainee";
  let name = baseName;
  let count = 1;
  while (state.roster.some(c => c.name === name)) {
    name = `${baseName}${count}`;
    count++;
  }

  const newChar = {
    name: name,
    class: "Fighter",
    level: 1,
    exp: 0,
    hp: 20,
    maxHp: 20,
    mp: 0,
    maxMp: 0,
    str: 15,
    int: 7,
    pie: 8,
    vit: 14,
    agi: 10,
    luk: 9,
    status: "ok",
    equipment: {
      weapon: null,
      shield: null,
      armor: null
    }
  };

  state.roster.push(newChar);
  addLog(`新しい冒険者 ${name} が訓練場にやってきた！`);

  if (state.party.length < 4) {
    state.party.push(newChar);
    addLog(`${name} をパーティに編成した！`);
  }

  saveGame();
  saveAutosave();
  renderTraining();
  updateUI();
}
