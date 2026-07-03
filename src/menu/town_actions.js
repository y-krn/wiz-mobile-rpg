import { state, saveAutosave, addLog, isSoftlocked } from "../state.js";
import { playSound } from "../audio.js";
import { updateUI, openArchivesOverlay, openContractsOverlay, openWarehouseOverlay } from "../ui.js";
import { openSubmenu } from "../navigation.js";
import { generateContractsList } from "../contracts.js";
import { getCharMaxHp, getCharMaxMp, getItemBaseId, getItemData, getClassJpName } from "../data.js";
import { renderMaterialsHUD } from "./materials_hud.js";
import { CRAFT_RECIPES, getEnhanceCost, executeCraft, executeEnhance, executeDismantle, getDismantleResults, executeTagInscription } from "../craft.js";
import { MATERIAL_TAGS, TAG_EFFECT_MAP } from "../data/tags.js";

import { openEquipOverlay } from "../equip.js";

export function handleTownOption(option) {
  if (option === "castle") {
    openSubmenu("castle_main", "おしろ - 冒険者管理と記録：");
  } else if (option === "shop") {
    openSubmenu("shop_main", "ボルタック商店 - アイテムの売買：");
  } else if (option === "temple") {
    openSubmenu("temple_main", "カント寺院 - 蘇生と治療：");
  } else if (option === "camp") {
    openEquipOverlay(0);
  } else if (option === "craft") {
    openSubmenu("craft_main", "工房 - 製作と装備強化：");
  } else if (option === "training") {
    openSubmenu("party_assemble", "訓練場 - パーティ編成:");
  } else if (option === "archives") {
    openArchivesOverlay();
  } else if (option === "contracts") {
    if (!state.contracts || state.contracts.length === 0) {
      state.contracts = generateContractsList(state);
    }
    openContractsOverlay();
  } else if (option === "warehouse") {
    openWarehouseOverlay();
  }
}

export function renderTempleMain(optGrid) {
  optGrid.innerHTML = "";
  optGrid.classList.add("temple-list-mode");
  
  // ロースター全体から、死亡・状態異常・灰化などのキャラを対象にする
  const targetChars = state.roster.filter(char => {
    return char.status === "dead" || 
           char.status === "ash" || 
           ["sleep", "paralyze", "paralyzed", "poisoned", "blind"].includes(char.status);
  });

  if (targetChars.length === 0) {
    const info = document.createElement("div");
    info.className = "detail-placeholder";
    info.style.textAlign = "center";
    info.style.padding = "20px 0";
    info.textContent = "治療や蘇生が必要な冒険者は名簿にいません。";
    optGrid.appendChild(info);
  } else {
    let hasAffordableAction = false;
    targetChars.forEach((char) => {
      const card = document.createElement("div");
      card.className = "temple-card";
      
      let price = 0;
      let text;
      let actionType;
      let statusClass;
      let statusText;
      
      if (char.status === "dead") {
        price = char.level * 50;
        text = "蘇生";
        actionType = "revive_dead";
        statusClass = "status-dead";
        statusText = "死亡";
      } else if (char.status === "ash") {
        price = char.level * 150;
        text = "灰蘇生";
        actionType = "revive_ash";
        statusClass = "status-ash";
        statusText = "灰";
      } else {
        price = 20;
        text = "治療";
        actionType = "cure";
        statusClass = "status-other";
        if (char.status === "sleep") statusText = "睡眠";
        else if (char.status === "paralyze" || char.status === "paralyzed") statusText = "麻痺";
        else if (char.status === "poisoned") statusText = "毒";
        else if (char.status === "blind") statusText = "暗闇";
        else statusText = char.status;
      }

      const charJpClass = getClassJpName(char.class);

      // キャラクター情報
      const infoDiv = document.createElement("div");
      infoDiv.className = "temple-char-info";
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "temple-char-name";
      nameSpan.textContent = char.name;
      
      const metaSpan = document.createElement("span");
      metaSpan.className = "temple-char-meta";
      metaSpan.textContent = `${charJpClass} Lv.${char.level}`;
      
      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(metaSpan);

      // ステータスと費用
      const statusCostDiv = document.createElement("div");
      statusCostDiv.className = "temple-status-cost";
      
      const statusSpan = document.createElement("span");
      statusSpan.className = `temple-status ${statusClass}`;
      statusSpan.textContent = statusText;
      
      const costSpan = document.createElement("span");
      costSpan.className = "temple-cost";
      costSpan.textContent = `${price}G`;
      
      statusCostDiv.appendChild(statusSpan);
      statusCostDiv.appendChild(costSpan);

      // アクションボタン
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-temple-action";
      btn.textContent = text;
      
      if (price === 0 || state.gold < price) {
        btn.disabled = true;
      } else {
        hasAffordableAction = true;
      }
      
      btn.addEventListener("click", () => {
        state.gold -= price;
        
        // 最新の全滅ログで運命を追記するためのヘルパー
        const updateLatestDeathLog = (outcome) => {
          if (state.deathLogs && state.deathLogs.length > 0) {
            const latestLog = state.deathLogs.find(log => log.outcomes && log.outcomes[char.name] !== undefined);
            if (latestLog) {
              latestLog.outcomes[char.name] = outcome;
            }
          }
        };

        if (actionType === "revive_dead") {
          const successChance = Math.min(95, 70 + char.vit);
          const success = Math.random() * 100 < successChance;
          if (success) {
            char.status = "ok";
            char.hp = 1;
            playSound("heal");
            addLog(`僧侶が祈りを捧げる... ${char.name}は生存へ蘇生成功した！`);
            updateLatestDeathLog("生存へ蘇生成功");
          } else {
            char.status = "ash";
            char.hp = 0;
            playSound("chest_trap"); // 失敗時の不穏な音
            addLog(`僧侶が祈りを捧げるが、力及ばず... ${char.name}は灰になってしまった！`);
            updateLatestDeathLog("灰化");
          }
        } else if (actionType === "revive_ash") {
          const successChance = Math.min(85, 40 + char.vit);
          const success = Math.random() * 100 < successChance;
          if (success) {
            char.status = "ok";
            char.hp = 1;
            playSound("heal");
            addLog(`奇跡が起きた！ ${char.name}は灰から生存へ蘇生成功した！`);
            updateLatestDeathLog("生存へ蘇生成功 (灰から)");
          } else {
            playSound("game_over"); // ロスト時の悲劇的な音
            addLog(`天に祈りは届かなかった... ${char.name}は冷たい灰のまま崩れ去り、完全にロストした。`);
            updateLatestDeathLog("完全ロスト");
            
            // ロースターとパーティーから完全削除
            state.party = state.party.filter(c => c.name !== char.name);
            state.roster = state.roster.filter(c => c.name !== char.name);
          }
        } else if (actionType === "cure") {
          char.status = "ok";
          if (char.hp === 0) char.hp = 1;
          playSound("heal");
          addLog(`僧侶が治癒 of 光を放つ... ${char.name}は正常な状態に戻った！`);
        }
        
        saveAutosave();
        openSubmenu("temple_main", "カント寺院 - 蘇生と治療：", true); // refresh
      });

      card.appendChild(infoDiv);
      card.appendChild(statusCostDiv);
      card.appendChild(btn);
      optGrid.appendChild(card);
    });

    if (!hasAffordableAction) {
      const info = document.createElement("div");
      info.className = "detail-placeholder";
      info.style.textAlign = "center";
      info.style.padding = "10px";
      if (isSoftlocked()) {
        info.textContent = "蘇生・治療に必要な金貨が足りません。訓練場で新人を迎えて編成を立て直してください。";
      } else {
        info.textContent = "蘇生・治療に必要な金貨が足りません。待機メンバーがいる場合は訓練場で編成を立て直せます。";
      }
      optGrid.appendChild(info);

      const btnTraining = document.createElement("button");
      btnTraining.className = "btn btn-neon btn-block";
      btnTraining.style.height = "44px";
      btnTraining.textContent = "👥 訓練場で編成する";
      btnTraining.addEventListener("click", () => {
        openSubmenu("party_assemble", "訓練場 - パーティ編成：");
      });
      optGrid.appendChild(btnTraining);
    }
  }
}

export function renderCraftMain(optGrid) {
  renderMaterialsHUD(optGrid);

  const btnRecipes = document.createElement("button");
  btnRecipes.className = "btn btn-neon btn-block";
  btnRecipes.textContent = "🛡️ 消耗品を製作する";
  btnRecipes.addEventListener("click", () => {
    openSubmenu("craft_recipes", "工房 - 消耗品の製作：");
  });
  optGrid.appendChild(btnRecipes);

  const btnEnhance = document.createElement("button");
  btnEnhance.className = "btn btn-neon btn-block";
  btnEnhance.textContent = "⚔️ 装備を+1強化する";
  btnEnhance.addEventListener("click", () => {
    openSubmenu("craft_enhance", "工房 - 装備の強化(+1)：");
  });
  optGrid.appendChild(btnEnhance);

  const btnInscription = document.createElement("button");
  btnInscription.className = "btn btn-neon btn-block";
  btnInscription.textContent = "✨ 刻印する";
  btnInscription.addEventListener("click", () => {
    openSubmenu("craft_inscription_select_equip", "工房 - 刻印する装備の選択：");
  });
  optGrid.appendChild(btnInscription);

  const btnDismantle = document.createElement("button");
  btnDismantle.className = "btn btn-neon btn-block";
  btnDismantle.textContent = "🔮 不要装備を分解する";
  btnDismantle.addEventListener("click", () => {
    openSubmenu("craft_dismantle", "工房 - 不要装備の分解：");
  });
  optGrid.appendChild(btnDismantle);
}

let selectedInscriptionEquipIdx = -1;

export function renderCraftInscriptionSelectEquip(optGrid) {
  renderMaterialsHUD(optGrid);

  let equipCount = 0;

  // 1. 装備中の装備品
  state.party.forEach((char, actorIdx) => {
    ["weapon", "shield", "armor"].forEach(slot => {
      const itemKey = char.equipment[slot];
      if (!itemKey) return;
      const item = getItemData(itemKey);
      if (!item || !["weapon", "shield", "armor"].includes(item.type)) return;

      equipCount++;
      const container = document.createElement("div");
      container.style.gridColumn = "span 2";
      container.style.border = "1px solid #333";
      container.style.padding = "6px 8px";
      container.style.borderRadius = "4px";
      container.style.display = "flex";
      container.style.justifyContent = "space-between";
      container.style.alignItems = "center";
      container.style.background = "rgba(0,0,0,0.2)";
      container.style.marginBottom = "4px";

      const info = document.createElement("div");
      info.style.fontFamily = "var(--font-mono)";
      info.style.fontSize = "11px";
      
      const isUnidentified = typeof itemKey === "object" && itemKey.identified === false;
      const isAlreadyInscribed = typeof itemKey === "object" && !!itemKey.inscription;

      let statusText = " [装備中]";
      if (isUnidentified) {
        statusText = " [装備中/未鑑定]";
      } else if (isAlreadyInscribed) {
        statusText = " [装備中/刻印済み]";
      }

      info.innerHTML = `<strong style="color:#fff">${item.name}</strong><br>
        <span style="color:var(--text-muted)">${item.desc.split("[")[0]}${statusText} (使用者: ${char.name})</span>`;
      container.appendChild(info);

      const btn = document.createElement("button");
      btn.className = "btn btn-neon";
      btn.textContent = "選択";
      btn.style.minHeight = "44px";
      btn.style.width = "80px";

      if (isUnidentified || isAlreadyInscribed) {
        btn.disabled = true;
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => {
          selectedInscriptionEquipIdx = { type: "equipped", actorIdx, slot };
          openSubmenu("craft_inscription_select_engrave", "工房 - 刻印の選択：");
        });
      }
      container.appendChild(btn);
      optGrid.appendChild(container);
    });
  });

  // 2. バッグの装備品
  state.inventory.forEach((itemKey, idx) => {
    const item = getItemData(itemKey);
    if (!item || !["weapon", "shield", "armor"].includes(item.type)) return;

    equipCount++;
    const container = document.createElement("div");
    container.style.gridColumn = "span 2";
    container.style.border = "1px solid #333";
    container.style.padding = "6px 8px";
    container.style.borderRadius = "4px";
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "center";
    container.style.background = "rgba(0,0,0,0.2)";
    container.style.marginBottom = "4px";

    const info = document.createElement("div");
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    
    const isUnidentified = typeof itemKey === "object" && itemKey.identified === false;
    const isAlreadyInscribed = typeof itemKey === "object" && !!itemKey.inscription;

    let statusText = "";
    if (isUnidentified) {
      statusText = " [未鑑定]";
    } else if (isAlreadyInscribed) {
      statusText = " [刻印済み]";
    }

    info.innerHTML = `<strong style="color:#fff">${item.name}</strong><br>
      <span style="color:var(--text-muted)">${item.desc.split("[")[0]}${statusText}</span>`;
    container.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "btn btn-neon";
    btn.textContent = "選択";
    btn.style.minHeight = "44px";
    btn.style.width = "80px";

    if (isUnidentified || isAlreadyInscribed) {
      btn.disabled = true;
      btn.classList.add("disabled");
    } else {
      btn.addEventListener("click", () => {
        selectedInscriptionEquipIdx = { type: "inventory", index: idx };
        openSubmenu("craft_inscription_select_engrave", "工房 - 刻印の選択：");
      });
    }
    container.appendChild(btn);
    optGrid.appendChild(container);
  });

  if (equipCount === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.gridColumn = "span 2";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.fontSize = "11px";
    emptyMsg.style.padding = "20px";
    emptyMsg.textContent = "刻印可能な装備品がありません。";
    optGrid.appendChild(emptyMsg);
  }
}

let currentSelectedMat = null;
let currentSelectedTag = null;
let currentOverwriteIdx = -1;
let currentActionType = "add";

export function renderCraftInscriptionSelectEngrave(optGrid) {
  renderMaterialsHUD(optGrid);

  let eqItem;
  if (selectedInscriptionEquipIdx && typeof selectedInscriptionEquipIdx === "object") {
    if (selectedInscriptionEquipIdx.type === "equipped") {
      const actor = state.party[selectedInscriptionEquipIdx.actorIdx];
      eqItem = actor.equipment[selectedInscriptionEquipIdx.slot];
    } else {
      eqItem = state.inventory[selectedInscriptionEquipIdx.index];
    }
  } else {
    eqItem = state.inventory[selectedInscriptionEquipIdx];
  }

  const item = getItemData(eqItem);
  if (!item) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.gridColumn = "span 2";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.fontSize = "11px";
    emptyMsg.style.padding = "20px";
    emptyMsg.textContent = "選択された装備が見つかりません。";
    optGrid.appendChild(emptyMsg);
    return;
  }

  if (!eqItem.tags) eqItem.tags = [];

  const wrapper = document.createElement("div");
  wrapper.style.gridColumn = "span 2";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "10px";
  wrapper.style.fontFamily = "var(--font-mono)";
  wrapper.style.fontSize = "11px";
  wrapper.style.color = "#fff";

  const infoCard = document.createElement("div");
  infoCard.style.border = "1px solid var(--neon-blue)";
  infoCard.style.padding = "8px";
  infoCard.style.borderRadius = "4px";
  infoCard.style.background = "rgba(0,170,255,0.05)";
  
  const tagLabels = eqItem.tags.map(t => {
    const info = TAG_EFFECT_MAP[t] || { name: t };
    return `<span class="unidentified-tag" style="background:rgba(0,170,255,0.2); padding:2px 4px; border-radius:3px; margin-right:4px;">${info.name || t}</span>`;
  }).join(" ") || '<span style="color:var(--text-muted)">なし</span>';
  
  infoCard.innerHTML = `
    対象: <strong style="color:var(--neon-blue); font-size:12px;">${item.name}</strong><br>
    <div style="margin-top:6px;">現在のタグ: ${tagLabels}</div>
  `;
  wrapper.appendChild(infoCard);

  const matTitle = document.createElement("div");
  matTitle.style.fontWeight = "bold";
  matTitle.style.color = "var(--neon-green)";
  matTitle.textContent = "1. 素材の選択 (必要数: 3)";
  wrapper.appendChild(matTitle);

  const matRow = document.createElement("div");
  matRow.style.display = "flex";
  matRow.style.flexWrap = "wrap";
  matRow.style.gap = "6px";

  const mats = ["霊粉", "毒腺", "鉄片", "竜鱗", "黒角"];
  mats.forEach(matName => {
    const curQty = state.materials[matName] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn ${currentSelectedMat === matName ? "btn-neon" : "btn-secondary"}`;
    btn.style.flex = "1 1 80px";
    btn.style.minHeight = "36px";
    btn.style.padding = "4px";
    btn.style.fontSize = "10px";
    btn.innerHTML = `${matName}<br><small>${curQty}/3</small>`;
    
    if (curQty < 3) {
      btn.disabled = true;
      btn.classList.add("disabled");
      btn.style.opacity = "0.4";
    } else {
      btn.addEventListener("click", () => {
        currentSelectedMat = matName;
        currentSelectedTag = null;
        currentOverwriteIdx = -1;
        currentActionType = "add";
        optGrid.innerHTML = "";
        renderCraftInscriptionSelectEngrave(optGrid);
      });
    }
    matRow.appendChild(btn);
  });
  wrapper.appendChild(matRow);

  if (currentSelectedMat) {
    const tagTitle = document.createElement("div");
    tagTitle.style.fontWeight = "bold";
    tagTitle.style.color = "var(--neon-green)";
    tagTitle.style.marginTop = "6px";
    tagTitle.textContent = "2. 刻印タグの選択";
    wrapper.appendChild(tagTitle);

    const tagList = document.createElement("div");
    tagList.style.display = "flex";
    tagList.style.flexDirection = "column";
    tagList.style.gap = "4px";

    const possibleTags = MATERIAL_TAGS[currentSelectedMat] || [];
    possibleTags.forEach(tag => {
      const effect = TAG_EFFECT_MAP[tag];
      if (!effect) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${currentSelectedTag === tag && currentActionType === "add" ? "btn-neon" : "btn-secondary"}`;
      btn.style.textAlign = "left";
      btn.style.padding = "6px 8px";
      btn.style.fontSize = "11px";
      btn.style.minHeight = "40px";
      btn.innerHTML = `<strong>${effect.name} (${tag})</strong> - ${effect.desc}`;
      
      btn.addEventListener("click", () => {
        currentSelectedTag = tag;
        currentActionType = "add";
        optGrid.innerHTML = "";
        renderCraftInscriptionSelectEngrave(optGrid);
      });
      tagList.appendChild(btn);
    });

    const hasCurse = eqItem.tags.includes("curse") || eqItem.curseEffectId;
    if (hasCurse && currentSelectedMat === "霊粉") {
      const sealBtn = document.createElement("button");
      sealBtn.type = "button";
      sealBtn.className = `btn ${currentActionType === "seal" ? "btn-neon" : "btn-secondary"}`;
      sealBtn.style.textAlign = "left";
      sealBtn.style.padding = "6px 8px";
      sealBtn.style.fontSize = "11px";
      sealBtn.style.minHeight = "40px";
      sealBtn.style.borderColor = "var(--neon-red)";
      sealBtn.innerHTML = `<strong>封印の儀 (呪い封印)</strong> - デメリット効果を無効化する`;
      
      sealBtn.addEventListener("click", () => {
        currentSelectedTag = null;
        currentActionType = "seal";
        optGrid.innerHTML = "";
        renderCraftInscriptionSelectEngrave(optGrid);
      });
      tagList.appendChild(sealBtn);
    }

    wrapper.appendChild(tagList);
  }

  if (currentSelectedTag && currentActionType === "add" && eqItem.tags.length > 0) {
    const overwriteTitle = document.createElement("div");
    overwriteTitle.style.fontWeight = "bold";
    overwriteTitle.style.color = "var(--neon-green)";
    overwriteTitle.style.marginTop = "6px";
    overwriteTitle.textContent = "3. 上書きするタグの選択";
    wrapper.appendChild(overwriteTitle);

    const overwriteRow = document.createElement("div");
    overwriteRow.style.display = "flex";
    overwriteRow.style.flexWrap = "wrap";
    overwriteRow.style.gap = "6px";

    const btnNew = document.createElement("button");
    btnNew.type = "button";
    btnNew.className = `btn ${currentOverwriteIdx === -1 ? "btn-neon" : "btn-secondary"}`;
    btnNew.style.flex = "1 1 80px";
    btnNew.style.minHeight = "36px";
    btnNew.style.fontSize = "10px";
    btnNew.textContent = eqItem.tags.length >= 3 ? "新規追加 (最古タグ上書き)" : "新規追加 (枠追加)";
    btnNew.addEventListener("click", () => {
      currentOverwriteIdx = -1;
      optGrid.innerHTML = "";
      renderCraftInscriptionSelectEngrave(optGrid);
    });
    overwriteRow.appendChild(btnNew);

    eqItem.tags.forEach((tag, idx) => {
      const tagInfo = TAG_EFFECT_MAP[tag] || { name: tag };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${currentOverwriteIdx === idx ? "btn-neon" : "btn-secondary"}`;
      btn.style.flex = "1 1 80px";
      btn.style.minHeight = "36px";
      btn.style.fontSize = "10px";
      btn.textContent = `[${tagInfo.name || tag}] を上書き`;
      btn.addEventListener("click", () => {
        currentOverwriteIdx = idx;
        optGrid.innerHTML = "";
        renderCraftInscriptionSelectEngrave(optGrid);
      });
      overwriteRow.appendChild(btn);
    });

    wrapper.appendChild(overwriteRow);
  }

  const actionRow = document.createElement("div");
  actionRow.style.marginTop = "12px";
  
  const submitBtn = document.createElement("button");
  submitBtn.className = "btn btn-block btn-neon";
  submitBtn.style.minHeight = "44px";
  
  const hasEnoughGold = state.gold >= 150;
  let canSubmit = false;

  if (currentActionType === "seal") {
    submitBtn.textContent = "封印の儀を実行 (150G)";
    canSubmit = hasEnoughGold && currentSelectedMat === "霊粉";
  } else if (currentSelectedTag) {
    const effect = TAG_EFFECT_MAP[currentSelectedTag];
    submitBtn.textContent = `${effect.name}を刻印する (150G)`;
    canSubmit = hasEnoughGold;
  } else {
    submitBtn.textContent = "刻印の方向性を選択してください";
    submitBtn.disabled = true;
    submitBtn.classList.add("disabled");
  }

  if (canSubmit) {
    submitBtn.addEventListener("click", () => {
      const idx = selectedInscriptionEquipIdx;
      const mat = currentSelectedMat;
      const tag = currentSelectedTag;
      const owIdx = currentOverwriteIdx >= 0 ? currentOverwriteIdx : undefined;
      const type = currentActionType;
      
      if (executeTagInscription(idx, mat, tag, owIdx, type)) {
        currentSelectedMat = null;
        currentSelectedTag = null;
        currentOverwriteIdx = -1;
        currentActionType = "add";
        selectedInscriptionEquipIdx = -1;
        openSubmenu("craft_inscription_select_equip", "工房 - 刻印する装備の選択：", true);
      }
    });
  } else if (submitBtn.disabled === false) {
    submitBtn.disabled = true;
    submitBtn.classList.add("disabled");
    if (!hasEnoughGold) {
      submitBtn.textContent = "ゴールド不足 (150G必要)";
    }
  }

  actionRow.appendChild(submitBtn);
  wrapper.appendChild(actionRow);

  optGrid.appendChild(wrapper);
}

export function renderCraftRecipes(optGrid) {
  renderMaterialsHUD(optGrid);

  CRAFT_RECIPES.forEach(recipe => {
    const container = document.createElement("div");
    container.style.gridColumn = "span 2";
    container.style.border = "1px solid #333";
    container.style.padding = "6px 8px";
    container.style.borderRadius = "4px";
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "center";
    container.style.background = "rgba(0,0,0,0.2)";
    container.style.marginBottom = "4px";

    const info = document.createElement("div");
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    
    const matsReq = Object.entries(recipe.mats).map(([m, reqQty]) => {
      const curQty = state.materials[m] || 0;
      const color = curQty >= reqQty ? "var(--neon-green)" : "var(--neon-red)";
      return `<span style="color:${color}">${m} ${curQty}/${reqQty}</span>`;
    }).join(", ");
    const goldColor = state.gold >= recipe.gold ? "#fff" : "var(--neon-red)";

    info.innerHTML = `<strong style="color:#fff">${recipe.name}</strong><br>
      <span style="color:var(--text-muted)">必要: ${matsReq} / <span style="color:${goldColor}">${recipe.gold}G</span></span>`;
    container.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "btn btn-neon";
    btn.textContent = "製作";
    btn.style.minHeight = "44px";
    btn.style.width = "80px";

    let canCraft = state.gold >= recipe.gold && state.inventory.length < 20;
    for (const [m, reqQty] of Object.entries(recipe.mats)) {
      if ((state.materials[m] || 0) < reqQty) canCraft = false;
    }
    if (!canCraft) {
      btn.disabled = true;
      btn.classList.add("disabled");
    }

    btn.addEventListener("click", () => {
      if (executeCraft(recipe.resultId)) {
        openSubmenu("craft_recipes", "工房 - 消耗品の製作：", true); // リフレッシュ
      }
    });
    container.appendChild(btn);
    optGrid.appendChild(container);
  });
}

export function renderCraftEnhance(optGrid) {
  renderMaterialsHUD(optGrid);

  let enhanceableCount = 0;

  // 1. 装備中の装備品
  state.party.forEach((char, actorIdx) => {
    ["weapon", "shield", "armor"].forEach(slot => {
      const itemKey = char.equipment[slot];
      if (!itemKey) return;
      const item = getItemData(itemKey);
      if (!item || !["weapon", "shield", "armor"].includes(item.type)) return;

      const currentEnhance = (typeof itemKey === "object" ? itemKey.enhanceLevel : 0) || 0;
      if (currentEnhance >= 1) return; // +1が上限

      const cost = getEnhanceCost(itemKey);
      if (!cost) return;

      enhanceableCount++;
      const container = document.createElement("div");
      container.style.gridColumn = "span 2";
      container.style.border = "1px solid #333";
      container.style.padding = "6px 8px";
      container.style.borderRadius = "4px";
      container.style.display = "flex";
      container.style.justifyContent = "space-between";
      container.style.alignItems = "center";
      container.style.background = "rgba(0,0,0,0.2)";
      container.style.marginBottom = "4px";

      const info = document.createElement("div");
      info.style.fontFamily = "var(--font-mono)";
      info.style.fontSize = "11px";
      
      const matsReq = Object.entries(cost.mats).map(([m, reqQty]) => {
        const curQty = state.materials[m] || 0;
        const color = curQty >= reqQty ? "var(--neon-green)" : "var(--neon-red)";
        return `<span style="color:${color}">${m} ${curQty}/${reqQty}</span>`;
      }).join(", ");
      const goldColor = state.gold >= cost.gold ? "#fff" : "var(--neon-red)";

      info.innerHTML = `<strong style="color:#fff">${item.name} ➔ +1</strong> <span style="color:var(--neon-blue)">[装備中] (${char.name})</span><br>
        <span style="color:var(--text-muted)">必要: ${matsReq} / <span style="color:${goldColor}">${cost.gold}G</span></span>`;
      container.appendChild(info);

      const btn = document.createElement("button");
      btn.className = "btn btn-neon";
      btn.textContent = "強化";
      btn.style.minHeight = "44px";
      btn.style.width = "80px";

      let canEnhance = state.gold >= cost.gold;
      for (const [m, reqQty] of Object.entries(cost.mats)) {
        if ((state.materials[m] || 0) < reqQty) canEnhance = false;
      }
      if (!canEnhance) {
        btn.disabled = true;
        btn.classList.add("disabled");
      }

      btn.addEventListener("click", () => {
        if (executeEnhance({ type: "equipped", actorIdx, slot })) {
          openSubmenu("craft_enhance", "工房 - 装備の強化(+1)：", true); // リフレッシュ
        }
      });
      container.appendChild(btn);
      optGrid.appendChild(container);
    });
  });

  // 2. バッグの装備品
  state.inventory.forEach((itemKey, idx) => {
    const item = getItemData(itemKey);
    if (!item || !["weapon", "shield", "armor"].includes(item.type)) return;

    const currentEnhance = (typeof itemKey === "object" ? itemKey.enhanceLevel : 0) || 0;
    if (currentEnhance >= 1) return; // +1が上限

    const cost = getEnhanceCost(itemKey);
    if (!cost) return;

    enhanceableCount++;
    const container = document.createElement("div");
    container.style.gridColumn = "span 2";
    container.style.border = "1px solid #333";
    container.style.padding = "6px 8px";
    container.style.borderRadius = "4px";
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "center";
    container.style.background = "rgba(0,0,0,0.2)";
    container.style.marginBottom = "4px";

    const info = document.createElement("div");
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    
    const matsReq = Object.entries(cost.mats).map(([m, reqQty]) => {
      const curQty = state.materials[m] || 0;
      const color = curQty >= reqQty ? "var(--neon-green)" : "var(--neon-red)";
      return `<span style="color:${color}">${m} ${curQty}/${reqQty}</span>`;
    }).join(", ");
    const goldColor = state.gold >= cost.gold ? "#fff" : "var(--neon-red)";

    info.innerHTML = `<strong style="color:#fff">${item.name} ➔ +1</strong><br>
      <span style="color:var(--text-muted)">必要: ${matsReq} / <span style="color:${goldColor}">${cost.gold}G</span></span>`;
    container.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "btn btn-neon";
    btn.textContent = "強化";
    btn.style.minHeight = "44px";
    btn.style.width = "80px";

    let canEnhance = state.gold >= cost.gold;
    for (const [m, reqQty] of Object.entries(cost.mats)) {
      if ((state.materials[m] || 0) < reqQty) canEnhance = false;
    }
    if (!canEnhance) {
      btn.disabled = true;
      btn.classList.add("disabled");
    }

    btn.addEventListener("click", () => {
      if (executeEnhance({ type: "inventory", index: idx })) {
        openSubmenu("craft_enhance", "工房 - 装備の強化(+1)：", true); // リフレッシュ
      }
    });
    container.appendChild(btn);
    optGrid.appendChild(container);
  });

  if (enhanceableCount === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.gridColumn = "span 2";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.fontSize = "11px";
    emptyMsg.style.padding = "20px";
    emptyMsg.textContent = "強化可能な装備品がありません。";
    optGrid.appendChild(emptyMsg);
  }
}

export function renderCraftDismantle(optGrid) {
  renderMaterialsHUD(optGrid);

  let dismantleableCount = 0;
  state.inventory.forEach((itemKey, idx) => {
    const item = getItemData(itemKey);
    if (!item || !["weapon", "shield", "armor"].includes(item.type)) return;

    const results = getDismantleResults(itemKey);
    if (!results) return;

    dismantleableCount++;
    const container = document.createElement("div");
    container.style.gridColumn = "span 2";
    container.style.border = "1px solid #333";
    container.style.padding = "6px 8px";
    container.style.borderRadius = "4px";
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "center";
    container.style.background = "rgba(0,0,0,0.2)";
    container.style.marginBottom = "4px";

    const info = document.createElement("div");
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    const matsYield = Object.entries(results).map(([m, qty]) => `${m}x${qty}`).join(", ");
    info.innerHTML = `<strong style="color:#fff">${item.name}</strong><br>
      <span style="color:var(--text-muted)">分解報酬: ${matsYield}</span>`;
    container.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "btn btn-danger";
    btn.textContent = "分解";
    btn.style.minHeight = "44px";
    btn.style.width = "80px";

    btn.addEventListener("click", () => {
      if (executeDismantle(idx)) {
        openSubmenu("craft_dismantle", "工房 - 不要装備の分解：", true); // リフレッシュ
      }
    });
    container.appendChild(btn);
    optGrid.appendChild(container);
  });

  if (dismantleableCount === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.gridColumn = "span 2";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.fontSize = "11px";
    emptyMsg.style.padding = "20px";
    emptyMsg.textContent = "分解可能な装備品がバッグにありません。";
    optGrid.appendChild(emptyMsg);
  }
}

export function renderCastleMain(optGrid) {
  optGrid.innerHTML = "";
  optGrid.style.display = "flex";
  optGrid.style.flexDirection = "column";
  optGrid.style.gap = "8px";
  
  // 🛌 宿泊して休息する
  const btnRest = document.createElement("button");
  btnRest.className = "btn btn-neon btn-block";
  btnRest.style.height = "44px";
  btnRest.textContent = "🛌 宿泊して休息する";
  btnRest.addEventListener("click", () => {
    state.party.forEach(char => {
      if (char.status !== "dead") {
        char.hp = getCharMaxHp(char);
        char.mp = getCharMaxMp(char);
      }
    });
    
    const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");
    if (hasCrystal) {
      playSound("level_up");
      state.cleared = true;
      state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
      addLog("**************************************************");
      addLog("おめでとうございます！浮遊石を持ち帰りました！");
      addLog("王より名誉勲章が授与され、初踏破が記録されました！");
      addLog("以後も、街からさらなる探索を続けられます。");
      addLog("**************************************************");
      saveAutosave();
    } else {
      playSound("heal");
      addLog("おしろ：パーティは休息した。HPとMPが全回復した！（ステータス異常はカント寺院で治療してください）");
      saveAutosave();
    }
    updateUI();
  });
  optGrid.appendChild(btnRest);

  // 👥 メンバー編成 (訓練場)
  const btnAssemble = document.createElement("button");
  btnAssemble.className = "btn btn-neon btn-block";
  btnAssemble.style.height = "44px";
  btnAssemble.textContent = "👥 メンバー編成 (訓練場)";
  btnAssemble.addEventListener("click", () => {
    openSubmenu("party_assemble", "訓練場 - パーティ編成:");
  });
  optGrid.appendChild(btnAssemble);

  // ⛪ 寺院で蘇生・治療
  const btnTemple = document.createElement("button");
  btnTemple.className = "btn btn-neon btn-block";
  btnTemple.style.height = "44px";
  btnTemple.textContent = "⛪ 寺院で蘇生・治療する";
  btnTemple.addEventListener("click", () => {
    openSubmenu("temple_main", "カント寺院 - 蘇生と治療：");
  });
  optGrid.appendChild(btnTemple);

  // 💀 死亡者・ロスト確認
  const btnDeadList = document.createElement("button");
  btnDeadList.className = "btn btn-neon btn-block";
  btnDeadList.style.height = "44px";
  btnDeadList.textContent = "💀 死亡者・完全ロスト名簿";
  btnDeadList.addEventListener("click", () => {
    openSubmenu("castle_dead_list", "おしろ - 死亡者・完全ロスト名簿：");
  });
  optGrid.appendChild(btnDeadList);

  // 📦 遺留品情報確認
  const btnRemains = document.createElement("button");
  btnRemains.className = "btn btn-neon btn-block";
  btnRemains.style.height = "44px";
  btnRemains.textContent = "📦 遺留品情報確認";
  btnRemains.addEventListener("click", () => {
    openSubmenu("castle_remains_list", "おしろ - 遺留品情報：");
  });
  optGrid.appendChild(btnRemains);

  // 📜 全滅ログ確認
  const btnDeathLogs = document.createElement("button");
  btnDeathLogs.className = "btn btn-neon btn-block";
  btnDeathLogs.style.height = "44px";
  btnDeathLogs.textContent = "📜 全滅ログ確認";
  btnDeathLogs.addEventListener("click", () => {
    openSubmenu("castle_death_logs", "おしろ - 全滅ログ履歴：");
  });
  optGrid.appendChild(btnDeathLogs);

  // オートセーブインジケータ
  const info = document.createElement("div");
  info.style.color = "var(--text-muted)";
  info.style.textAlign = "center";
  info.style.marginTop = "6px";
  info.style.fontFamily = "var(--font-mono)";
  info.style.fontSize = "9px";
  info.textContent = "● 記録済み (オートセーブ)";
  optGrid.appendChild(info);
}

export function renderCastleDeadList(optGrid) {
  optGrid.innerHTML = "";
  optGrid.style.display = "flex";
  optGrid.style.flexDirection = "column";
  optGrid.style.gap = "8px";
  
  const deadOrAshChars = state.roster.filter(c => c.status === "dead" || c.status === "ash");
  
  if (deadOrAshChars.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "detail-placeholder";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.padding = "20px 0";
    emptyMsg.textContent = "死亡または灰化している冒険者は名簿にいません。";
    optGrid.appendChild(emptyMsg);
  } else {
    deadOrAshChars.forEach(char => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.style.height = "44px";
      btn.style.borderColor = char.status === "ash" ? "var(--neon-red)" : "var(--neon-gold)";
      btn.style.color = char.status === "ash" ? "var(--neon-red)" : "var(--neon-gold)";
      
      const statusJp = char.status === "ash" ? "灰化" : "死亡";
      btn.textContent = `${char.name} (${getClassJpName(char.class)} Lv.${char.level}) - 状態: ${statusJp} (蘇生へ)`;
      
      btn.addEventListener("click", () => {
        openSubmenu("temple_main", "カント寺院 - 蘇生と治療：");
      });
      optGrid.appendChild(btn);
    });
  }

  const btnBack = document.createElement("button");
  btnBack.className = "btn btn-danger btn-block";
  btnBack.style.height = "44px";
  btnBack.style.marginTop = "10px";
  btnBack.textContent = "❌ 戻る";
  btnBack.addEventListener("click", () => {
    openSubmenu("castle_main", "おしろ - 冒険者管理と記録：");
  });
  optGrid.appendChild(btnBack);
}

export function renderCastleRemainsList(optGrid) {
  optGrid.innerHTML = "";
  optGrid.style.display = "flex";
  optGrid.style.flexDirection = "column";
  optGrid.style.gap = "8px";
  
  if (!state.remains || state.remains.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "detail-placeholder";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.padding = "20px 0";
    emptyMsg.textContent = "迷宮内に回収されていない遺留品はありません。";
    optGrid.appendChild(emptyMsg);
  } else {
    state.remains.forEach((rem, idx) => {
      const div = document.createElement("div");
      div.className = "detail-placeholder";
      div.style.border = "1px solid var(--neon-cyan)";
      div.style.padding = "8px";
      div.style.textAlign = "left";
      
      const dateStr = new Date(rem.timestamp).toLocaleString("ja-JP", { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' });
      div.innerHTML = `
        <div style="font-weight: bold; color: var(--neon-cyan); font-size: 11px;">📍 遺留品 #${idx + 1} (${dateStr})</div>
        <div style="font-size: 10px; margin-top: 4px;">場所: 地下${rem.floor}階 (X:${rem.x} Y:${rem.y})</div>
        <div style="font-size: 10px;">残されたアイテム: ${rem.items.length}個</div>
        <div style="font-size: 8px; color: var(--text-muted); margin-top: 4px; border-top: 1px dashed #333; padding-top: 4px; max-height: 80px; overflow-y: auto;">
          ${rem.items.map(item => `・${getItemData(item)?.name || item}`).join("<br>")}
        </div>
      `;
      optGrid.appendChild(div);
    });
  }

  const btnBack = document.createElement("button");
  btnBack.className = "btn btn-danger btn-block";
  btnBack.style.height = "44px";
  btnBack.style.marginTop = "10px";
  btnBack.textContent = "❌ 戻る";
  btnBack.addEventListener("click", () => {
    openSubmenu("castle_main", "おしろ - 冒険者管理と記録：");
  });
  optGrid.appendChild(btnBack);
}

export function renderCastleDeathLogs(optGrid) {
  optGrid.innerHTML = "";
  optGrid.style.display = "flex";
  optGrid.style.flexDirection = "column";
  optGrid.style.gap = "8px";
  
  if (!state.deathLogs || state.deathLogs.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "detail-placeholder";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.padding = "20px 0";
    emptyMsg.textContent = "全滅の記録はありません。";
    optGrid.appendChild(emptyMsg);
  } else {
    const logsContainer = document.createElement("div");
    logsContainer.style.maxHeight = "260px";
    logsContainer.style.overflowY = "auto";
    logsContainer.style.display = "flex";
    logsContainer.style.flexDirection = "column";
    logsContainer.style.gap = "8px";
    
    state.deathLogs.slice(0, 15).forEach((log, idx) => {
      const div = document.createElement("div");
      div.className = "detail-placeholder";
      div.style.border = "1px solid var(--neon-red)";
      div.style.padding = "8px";
      div.style.textAlign = "left";
      
      const dateStr = new Date(log.endedAt).toLocaleString("ja-JP", { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' });
      
      let outcomesHtml = "";
      if (log.outcomes) {
        outcomesHtml = "<div style='font-size: 9px; color: var(--neon-yellow); margin-top: 4px; border-top: 1px dashed #333; padding-top: 4px;'>【現在のステータス】</div>";
        for (const name in log.outcomes) {
          outcomesHtml += `<div style='font-size: 8px;'>・${name}: ${log.outcomes[name]}</div>`;
        }
      }

      div.innerHTML = `
        <div style="font-weight: bold; color: var(--neon-red); font-size: 11px;">💀 全滅記録 #${idx + 1} (${dateStr})</div>
        <div style="font-size: 10px; margin-top: 4px;">第${log.floor}階層 (X:${log.x} Y:${log.y}) でパーティは全滅した。</div>
        <div style="font-size: 10px; color: var(--text-muted);">原因: ${log.cause || "戦闘"}</div>
        <div style="font-size: 10px; margin-top: 2px;">・銀貨 ${log.lostGold || 0} 枚を失った。</div>
        <div style="font-size: 10px;">・未確定の戦利品 ${log.lostItemsCount || 0} 個を失った。</div>
        ${outcomesHtml}
      `;
      logsContainer.appendChild(div);
    });
    optGrid.appendChild(logsContainer);
  }

  const btnBack = document.createElement("button");
  btnBack.className = "btn btn-danger btn-block";
  btnBack.style.height = "44px";
  btnBack.style.marginTop = "10px";
  btnBack.textContent = "❌ 戻る";
  btnBack.addEventListener("click", () => {
    openSubmenu("castle_main", "おしろ - 冒険者管理と記録：");
  });
  optGrid.appendChild(btnBack);
}
