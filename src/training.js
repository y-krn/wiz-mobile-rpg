import { state, saveGame, saveAutosave, canRecruitRescueNewcomer, addLog } from "./state.js";
import { getClassJpName } from "./data.js";
import { updateUI } from "./ui.js";
import { goBackSubmenu } from "./navigation.js";

export let trainingState = {
  tab: "roster", // "roster" or "party"
  selectedName: null,
  rescueCandidates: null,
  showRescueSelection: false,
  rescueReplacementCandidate: null
};

export function renderTraining() {
  const overlay = document.getElementById("training-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  if (trainingState.rescueReplacementCandidate) {
    renderRescueReplacement(overlay);
    return;
  }

  if (trainingState.showRescueSelection && trainingState.rescueCandidates) {
    renderRescueSelection(overlay);
    return;
  }

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
      btnRescue.textContent = `⚠️ 志願者を募る (名簿満員) ${aliveCount}/4`;

      const infoMsg = document.createElement("div");
      infoMsg.style.color = "var(--danger-color, #ff3366)";
      infoMsg.style.fontSize = "12px";
      infoMsg.style.textAlign = "center";
      infoMsg.textContent = "死亡・灰化メンバーと入れ替えて迎えられます。";
      rescueRow.appendChild(infoMsg);
    } else {
      btnRescue.textContent = `🆕 志願者を募る (0G) ${aliveCount}/4`;
    }
    btnRescue.addEventListener("click", () => {
      if (!trainingState.rescueCandidates) {
        trainingState.rescueCandidates = createRescueCandidates();
      }
      trainingState.showRescueSelection = true;
      renderTraining();
    });
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
    trainingState.rescueCandidates = null;
    trainingState.showRescueSelection = false;
    trainingState.rescueReplacementCandidate = null;
    goBackSubmenu();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}

function createRescueCandidates() {
  const namePool = ["アレン", "ミナ", "ロウ", "セラ", "ガイ", "リナ", "ノア", "エル", "ダン", "ユリ", "カイ", "レナ"];
  const shuffled = [...namePool].sort(() => Math.random() - 0.5);
  const selectedNames = shuffled.slice(0, 3);

  const finalNames = selectedNames.map(baseName => {
    let name = baseName;
    let count = 2;
    while (state.roster.some(c => c.name === name)) {
      name = `${baseName}${count}`;
      count++;
    }
    return name;
  });

  const candidates = [];

  // 1. 前衛 (Fighter/Samurai)
  const isFighter = Math.random() < 0.5;
  const c1Class = isFighter ? "Fighter" : "Samurai";
  candidates.push({
    name: finalNames[0],
    class: c1Class,
    roleDesc: "前衛向き",
    level: 1,
    exp: 0,
    hp: isFighter ? 20 : 18,
    maxHp: isFighter ? 20 : 18,
    mp: 0,
    maxMp: 0,
    str: isFighter ? 15 : 14,
    int: isFighter ? 7 : 10,
    pie: isFighter ? 8 : 8,
    vit: isFighter ? 14 : 12,
    agi: isFighter ? 10 : 10,
    luk: isFighter ? 9 : 8,
    status: "ok",
    spells: [],
    equipment: { weapon: null, shield: null, armor: null, accessory: null }
  });

  // 2. 回復 (Priest/Bishop)
  const isPriest = Math.random() < 0.5;
  const c2Class = isPriest ? "Priest" : "Bishop";
  candidates.push({
    name: finalNames[1],
    class: c2Class,
    roleDesc: "回復役",
    level: 1,
    exp: 0,
    hp: isPriest ? 12 : 11,
    maxHp: isPriest ? 12 : 11,
    mp: 3,
    maxMp: 3,
    str: 9,
    int: isPriest ? 10 : 12,
    pie: isPriest ? 15 : 12,
    vit: isPriest ? 11 : 10,
    agi: 9,
    luk: isPriest ? 10 : 9,
    status: "ok",
    spells: isPriest ? ["DIOS", "MILWA", "DIURCO", "BADIOS"] : ["DIOS", "HALITO"],
    equipment: { weapon: null, shield: null, armor: null, accessory: null }
  });

  // 3. 探索・魔法 (Thief/Mage)
  const isThief = Math.random() < 0.5;
  const c3Class = isThief ? "Thief" : "Mage";
  candidates.push({
    name: finalNames[2],
    class: c3Class,
    roleDesc: isThief ? "宝箱対策" : "攻撃魔法",
    level: 1,
    exp: 0,
    hp: isThief ? 15 : 9,
    maxHp: isThief ? 15 : 9,
    mp: isThief ? 0 : 4,
    maxMp: isThief ? 0 : 4,
    str: isThief ? 10 : 7,
    int: isThief ? 9 : 16,
    pie: isThief ? 7 : 9,
    vit: isThief ? 10 : 8,
    agi: isThief ? 16 : 11,
    luk: isThief ? 15 : 9,
    status: "ok",
    spells: isThief ? [] : ["HALITO", "DUMAPIC"],
    equipment: { weapon: null, shield: null, armor: null, accessory: null }
  });

  return candidates;
}

function renderRescueSelection(overlay) {
  const header = document.createElement("div");
  header.className = "training-header";
  header.innerHTML = `
    <span class="training-title">訓練場 - 志願者募集</span>
    <span class="training-subtitle">仲間に加える志願者を1人選んでください</span>
  `;
  overlay.appendChild(header);

  const body = document.createElement("div");
  body.className = "training-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "12px";
  body.style.flexGrow = "1";
  body.style.justifyContent = "center";

  const listContainer = document.createElement("div");
  listContainer.className = "rescue-candidates-list";
  listContainer.style.display = "flex";
  listContainer.style.flexDirection = "column";
  listContainer.style.gap = "12px";

  trainingState.rescueCandidates.forEach(cand => {
    const card = document.createElement("div");
    card.className = "rescue-candidate-card";

    const info = document.createElement("div");
    info.className = "rescue-candidate-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "rescue-candidate-name";
    nameSpan.textContent = cand.name;

    const metaSpan = document.createElement("span");
    metaSpan.className = "rescue-candidate-meta";
    metaSpan.textContent = `${getClassJpName(cand.class)} (HP: ${cand.hp})`;

    const descSpan = document.createElement("span");
    descSpan.className = "rescue-candidate-desc";
    descSpan.textContent = `役割: ${cand.roleDesc}`;

    info.appendChild(nameSpan);
    info.appendChild(metaSpan);
    info.appendChild(descSpan);
    card.appendChild(info);

    const btnSelect = document.createElement("button");
    btnSelect.type = "button";
    btnSelect.className = "btn btn-neon btn-rescue-select";
    btnSelect.style.height = "44px";
    btnSelect.textContent = "🤝 仲間に加える";
    btnSelect.addEventListener("click", () => {
      const selectedCandidate = { ...cand };
      delete selectedCandidate.roleDesc;

      if (state.roster.length >= 8) {
        trainingState.rescueReplacementCandidate = selectedCandidate;
        renderTraining();
        return;
      }

      trainingState.rescueCandidates = null;
      trainingState.showRescueSelection = false;

      addNewbieToRoster(selectedCandidate);
    });

    card.appendChild(btnSelect);
    listContainer.appendChild(card);
  });

  body.appendChild(listContainer);
  overlay.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnCancel = document.createElement("button");
  btnCancel.className = "btn btn-danger";
  btnCancel.style.width = "100%";
  btnCancel.style.height = "44px";
  btnCancel.textContent = "❌ キャンセル";
  btnCancel.addEventListener("click", () => {
    trainingState.showRescueSelection = false;
    renderTraining();
  });

  closeRow.appendChild(btnCancel);
  footer.appendChild(closeRow);
  overlay.appendChild(footer);
}

function renderRescueReplacement(overlay) {
  const candidate = trainingState.rescueReplacementCandidate;
  const replaceableChars = state.roster.filter(char => char.status === "dead" || char.status === "ash");

  const header = document.createElement("div");
  header.className = "training-header";
  header.innerHTML = `
    <span class="training-title">訓練場 - 名簿入れ替え</span>
    <span class="training-subtitle">${candidate.name}と入れ替えるメンバーを選択</span>
  `;
  overlay.appendChild(header);

  const body = document.createElement("div");
  body.className = "training-body";

  const listContainer = document.createElement("div");
  listContainer.className = "rescue-candidates-list training-list";

  replaceableChars.forEach(char => {
    const card = document.createElement("div");
    card.className = "rescue-candidate-card";

    const info = document.createElement("div");
    info.className = "rescue-candidate-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "rescue-candidate-name";
    nameSpan.textContent = char.name;

    const metaSpan = document.createElement("span");
    metaSpan.className = "rescue-candidate-meta";
    const statusText = char.status === "ash" ? "灰" : "死亡";
    const partyText = state.party.some(member => member.name === char.name) ? " / 編成中" : "";
    metaSpan.textContent = `${getClassJpName(char.class)} Lv.${char.level} / ${statusText}${partyText}`;

    info.appendChild(nameSpan);
    info.appendChild(metaSpan);
    card.appendChild(info);

    const btnReplace = document.createElement("button");
    btnReplace.type = "button";
    btnReplace.className = "btn btn-neon btn-rescue-select";
    btnReplace.textContent = `↔ ${candidate.name}と入れ替える`;
    btnReplace.addEventListener("click", () => {
      if (!confirm(`${char.name}を名簿から完全に削除し、${candidate.name}を迎えますか？`)) return;

      state.party = state.party.filter(member => member.name !== char.name);
      state.roster = state.roster.filter(member => member.name !== char.name);
      trainingState.rescueCandidates = null;
      trainingState.showRescueSelection = false;
      trainingState.rescueReplacementCandidate = null;
      addNewbieToRoster(candidate);
    });

    card.appendChild(btnReplace);
    listContainer.appendChild(card);
  });

  body.appendChild(listContainer);
  overlay.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnCancel = document.createElement("button");
  btnCancel.className = "btn btn-danger";
  btnCancel.style.width = "100%";
  btnCancel.textContent = "❌ 志願者選択へ戻る";
  btnCancel.addEventListener("click", () => {
    trainingState.rescueReplacementCandidate = null;
    renderTraining();
  });

  closeRow.appendChild(btnCancel);
  footer.appendChild(closeRow);
  overlay.appendChild(footer);
}

function addNewbieToRoster(candidate) {
  state.roster.push(candidate);
  addLog(`新しい冒険者 ${candidate.name} が訓練場にやってきた！`);

  if (state.party.length < 4) {
    state.party.push(candidate);
    addLog(`${candidate.name} をパーティに編成した！`);
  } else {
    const replaceIdx = state.party.findIndex(char => char.status === "dead" || char.status === "ash");
    if (replaceIdx !== -1) {
      state.party[replaceIdx] = candidate;
      addLog(`${candidate.name} をパーティに編成した！`);
    }
  }

  saveGame();
  saveAutosave();
  renderTraining();
  updateUI();
}
