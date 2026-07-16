import { state, initNewGame, saveGame, saveAutosave, addLog, EXP_LEVELS, getCharWeaponAtk, getCharDef } from "./state.js";
import { SPELLS, getClassJpName, paySpellCost, getCoreLogText, hasHiddenEquipmentEffects } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "./navigation.js";
import { openEquipOverlay } from "./equip.js";
import { updateUI } from "./ui.js";

let selectedFormationIdx = 0;

export function openCampMenu() {
  selectedFormationIdx = 0;
  openSubmenu("camp_main", "キャンプメニュー:");
}

export function executeUtilitySpell() {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];

  const payment = paySpellCost(caster, spell.cost);
  if (!payment.canCast) return;
  if (payment.resource === "hp") addLog(getCoreLogText("CORE_BLOOD_WAND"));
  playSound("cast_spell");
  
  if (menuContext.spellName === "DUMAPIC") {
    state.dumapicTurns = 30;
  }

  const result = spell.effect(caster, state, state.party);
  addLog(result.log);
  
  saveAutosave();
  closeSubmenu();
}

export function executeAllySpell(targetIdx) {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];

  const payment = paySpellCost(caster, spell.cost);
  if (!payment.canCast) return;
  if (payment.resource === "hp") addLog(getCoreLogText("CORE_BLOOD_WAND"));
  playSound("cast_spell");

  let result;
  if (spell.target === "all_allies") {
    result = spell.effect(caster, state.party, state.party);
  } else {
    const target = state.party[targetIdx];
    result = spell.effect(caster, target, state.party);
  }
  addLog(result.log);
  
  if (result.heal) {
    playSound("heal");
    if (renderer) {
      renderer.addDamageText(`+${result.heal}`, "#00ff66");
    }
  }

  saveAutosave();
  closeSubmenu();
}

export function renderCampOverlay() {
  const overlay = document.getElementById("camp-overlay");
  if (!overlay) return;

  overlay.innerHTML = "";

  // 1. Header
  const header = document.createElement("div");
  header.className = "camp-header";

  const title = document.createElement("span");
  title.className = "camp-title";
  if (menuContext.type === "camp_status") {
    title.textContent = "パーティの強さ";
  } else if (menuContext.type === "camp_formation") {
    title.textContent = "隊列変更";
  } else {
    title.textContent = "キャンプメニュー";
  }
  header.appendChild(title);

  overlay.appendChild(header);

  // 2. Body
  const body = document.createElement("div");
  body.className = "camp-body";

  if (menuContext.type === "camp_main" || menuContext.type === "camp") {
    // Info text at the top of the body
    const infoText = document.createElement("div");
    infoText.className = "camp-info-text";
    infoText.style.textAlign = "center";
    infoText.style.fontSize = "12px";
    infoText.style.color = "var(--text-muted)";
    infoText.style.marginTop = "12px";
    infoText.style.lineHeight = "1.6";
    infoText.innerHTML = "キャンプ中 (探索を一時中断しています)<br>ステータスの確認や装備の変更を行えます。";
    body.appendChild(infoText);

    // Danger Zone at the bottom (isolated in body, away from footer)
    const dangerZone = document.createElement("div");
    dangerZone.className = "camp-danger-zone";
    dangerZone.style.marginTop = "40px";

    const btnDiscard = document.createElement("button");
    btnDiscard.className = "btn btn-danger btn-block camp-btn-danger";
    btnDiscard.textContent = "⚠️ 冒険を最初からやり直す";
    btnDiscard.style.minHeight = "44px";
    btnDiscard.addEventListener("click", () => {
      if (confirm("【警告】現在のセーブデータと進行状況が完全に削除されます。\n本当に最初からやり直しますか？")) {
        if (confirm("本当の本当にやり直しますか？この操作は取り消せません。")) {
          initNewGame();
          closeSubmenu();
        }
      }
    });
    dangerZone.appendChild(btnDiscard);
    body.appendChild(dangerZone);

  } else if (menuContext.type === "camp_status") {
    // Status detail grid
    const statusGrid = document.createElement("div");
    statusGrid.className = "camp-status-grid";

    state.party.forEach((char, idx) => {
      const card = document.createElement("div");
      card.className = "camp-status-card";
      if (menuContext.actorIdx === idx && menuContext.prevGameState === "town") {
        card.classList.add("focused-char");
      }
      
      const classJp = getClassJpName(char.class);
      const nextReq = char.class === "Ninja" ? Math.floor(EXP_LEVELS[char.level + 1] * 1.5) : EXP_LEVELS[char.level + 1];
      const nextText = nextReq ? `${char.exp}/${nextReq}` : `${char.exp}/MAX`;
      const hiddenEquipment = hasHiddenEquipmentEffects(char);
      
      card.innerHTML = `
        <div class="camp-status-card-header">
          <strong class="camp-char-name">${char.name}</strong>
          <span class="camp-char-class">${classJp} Lv.${char.level}</span>
        </div>
        <div class="camp-status-card-hpmp">
          <span>HP: <strong class="camp-val">${char.hp}/${char.maxHp}</strong></span>
          <span>MP: <strong class="camp-val">${char.mp}/${char.maxMp}</strong></span>
        </div>
        <div class="camp-status-card-stats">
          <div>力: ${char.str}</div>
          <div>知恵: ${char.int}</div>
          <div>信仰: ${char.pie}</div>
          <div>生命: ${char.vit}</div>
          <div>素早: ${char.agi}</div>
          <div>運: ${char.luk}</div>
        </div>
        <div class="camp-status-card-combat">
          <span>攻撃力: <strong class="camp-val">${hiddenEquipment ? "???" : `+${getCharWeaponAtk(char)}`}</strong></span>
          <span>防御力(AC): <strong class="camp-val">${hiddenEquipment ? "???" : getCharDef(char)}</strong></span>
        </div>
        <div class="camp-status-card-exp">
          <span>EXP: <span class="exp-val">${nextText}</span></span>
        </div>
      `;
      statusGrid.appendChild(card);
    });

    body.appendChild(statusGrid);
  } else if (menuContext.type === "camp_formation") {
    const formationList = document.createElement("div");
    formationList.className = "camp-formation-list";

    for (let i = 0; i < 4; i++) {
      const char = state.party[i];
      const card = document.createElement("div");
      card.className = `camp-formation-card ${char ? "" : "empty"} ${selectedFormationIdx === i ? "selected" : ""}`;
      
      const posLabel = i < 2 ? "前" : "後";
      const posClass = i < 2 ? "front" : "back";

      if (char) {
        card.addEventListener("click", () => {
          selectedFormationIdx = i;
          renderCampOverlay();
        });

        const leftDiv = document.createElement("div");
        leftDiv.className = "camp-formation-left";

        const posSpan = document.createElement("span");
        posSpan.className = `camp-formation-pos ${posClass}`;
        posSpan.textContent = `${i + 1} ${posLabel}`;
        leftDiv.appendChild(posSpan);

        const nameSpan = document.createElement("span");
        nameSpan.className = "camp-formation-name";
        nameSpan.textContent = char.name;
        leftDiv.appendChild(nameSpan);

        card.appendChild(leftDiv);

        const metaSpan = document.createElement("span");
        metaSpan.className = "camp-formation-meta";
        const classJp = getClassJpName(char.class);
        let statusJp = "健康";
        if (char.status === "dead") statusJp = "死亡";
        else if (char.status === "ash") statusJp = "灰化";
        else if (char.status === "sleep") statusJp = "睡眠";
        else if (char.status === "paralyze" || char.status === "paralyzed") statusJp = "麻痺";
        else if (char.status === "poisoned") statusJp = "毒";
        else if (char.status === "blind") statusJp = "暗闇";

        if (statusJp === "健康") {
          metaSpan.textContent = `Lv.${char.level} ${classJp}`;
        } else {
          metaSpan.textContent = `Lv.${char.level} ${classJp} (${statusJp})`;
        }
        card.appendChild(metaSpan);
      } else {
        const leftDiv = document.createElement("div");
        leftDiv.className = "camp-formation-left";

        const posSpan = document.createElement("span");
        posSpan.className = "camp-formation-pos empty";
        posSpan.style.borderColor = "#444";
        posSpan.style.color = "#888";
        posSpan.textContent = `${i + 1} ${posLabel}`;
        leftDiv.appendChild(posSpan);

        const nameSpan = document.createElement("span");
        nameSpan.className = "camp-formation-name";
        nameSpan.textContent = "(空き)";
        nameSpan.style.color = "#555";
        leftDiv.appendChild(nameSpan);

        card.appendChild(leftDiv);
        card.style.opacity = "0.5";
        card.style.cursor = "default";
      }

      formationList.appendChild(card);
    }

    body.appendChild(formationList);
  }

  overlay.appendChild(body);

  // 3. Bottom Actions Container
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  if (menuContext.type === "camp_main" || menuContext.type === "camp") {
    const mainActionRow = document.createElement("div");
    mainActionRow.className = "bottom-actions-row";

    const btnStatus = document.createElement("button");
    btnStatus.className = "btn btn-neon";
    btnStatus.style.flex = "1";
    btnStatus.textContent = "🛡️ ステータス";
    btnStatus.style.minHeight = "44px";
    btnStatus.addEventListener("click", () => {
      openSubmenu("camp_status", "パーティ詳細ステータス:");
    });
    mainActionRow.appendChild(btnStatus);

    const btnFormation = document.createElement("button");
    btnFormation.className = "btn btn-neon";
    btnFormation.style.flex = "1";
    btnFormation.textContent = "🔄 隊列変更";
    btnFormation.style.minHeight = "44px";
    btnFormation.addEventListener("click", () => {
      selectedFormationIdx = 0;
      openSubmenu("camp_formation", "隊列変更:");
    });
    mainActionRow.appendChild(btnFormation);

    const btnItems = document.createElement("button");
    btnItems.className = "btn btn-neon";
    btnItems.style.flex = "1";
    btnItems.textContent = "⚔️ 装備変更";
    btnItems.style.minHeight = "44px";
    btnItems.addEventListener("click", () => {
      openEquipOverlay(0);
    });
    mainActionRow.appendChild(btnItems);

    footer.appendChild(mainActionRow);
  }

  if (menuContext.type === "camp_formation") {
    const formationActionRow = document.createElement("div");
    formationActionRow.className = "bottom-actions-row";

    const btnUp = document.createElement("button");
    btnUp.className = "btn btn-neon";
    btnUp.style.flex = "1";
    btnUp.textContent = "▲ 上へ";
    btnUp.style.minHeight = "44px";
    
    const isUpDisabled = selectedFormationIdx === 0 || !state.party[selectedFormationIdx];
    if (isUpDisabled) btnUp.disabled = true;
    
    btnUp.addEventListener("click", () => {
      if (selectedFormationIdx > 0 && state.party[selectedFormationIdx]) {
        const temp = state.party[selectedFormationIdx];
        state.party[selectedFormationIdx] = state.party[selectedFormationIdx - 1];
        state.party[selectedFormationIdx - 1] = temp;
        selectedFormationIdx--;
        saveGame();
        saveAutosave();
        renderCampOverlay();
        updateUI();
      }
    });
    formationActionRow.appendChild(btnUp);

    const btnDown = document.createElement("button");
    btnDown.className = "btn btn-neon";
    btnDown.style.flex = "1";
    btnDown.textContent = "▼ 下へ";
    btnDown.style.minHeight = "44px";
    
    const isDownDisabled = selectedFormationIdx >= state.party.length - 1 || !state.party[selectedFormationIdx];
    if (isDownDisabled) btnDown.disabled = true;

    btnDown.addEventListener("click", () => {
      if (selectedFormationIdx < state.party.length - 1 && state.party[selectedFormationIdx]) {
        const temp = state.party[selectedFormationIdx];
        state.party[selectedFormationIdx] = state.party[selectedFormationIdx + 1];
        state.party[selectedFormationIdx + 1] = temp;
        selectedFormationIdx++;
        saveGame();
        saveAutosave();
        renderCampOverlay();
        updateUI();
      }
    });
    formationActionRow.appendChild(btnDown);

    footer.appendChild(formationActionRow);
  }

  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger btn-camp-close";
  btnClose.style.width = "100%";
  btnClose.style.minHeight = "44px";
  
  if (menuContext.type === "camp_status" || menuContext.type === "camp_formation") {
    if (menuContext.prevGameState === "town") {
      btnClose.textContent = "❌ 閉じる";
      btnClose.setAttribute("aria-label", "街に戻る");
      btnClose.addEventListener("click", () => {
        closeSubmenu();
      });
    } else {
      btnClose.textContent = "◀ メニューに戻る";
      btnClose.setAttribute("aria-label", "キャンプメニューに戻る");
      btnClose.addEventListener("click", () => {
        goBackSubmenu();
      });
    }
  } else {
    btnClose.textContent = "❌ 探索に戻る";
    btnClose.setAttribute("aria-label", "キャンプを閉じて探索に戻る");
    btnClose.addEventListener("click", () => {
      closeSubmenu();
    });
  }

  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);
  overlay.appendChild(footer);
}
