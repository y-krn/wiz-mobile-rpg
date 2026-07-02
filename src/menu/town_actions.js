import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { updateUI, openArchivesOverlay, openContractsOverlay, openWarehouseOverlay } from "../ui.js";
import { openSubmenu } from "../navigation.js";
import { generateContractsList } from "../contracts.js";
import { getCharMaxHp, getCharMaxMp, getItemBaseId, getItemData } from "../data.js";
import { renderMaterialsHUD } from "./materials_hud.js";
import { CRAFT_RECIPES, getEnhanceCost, executeCraft, executeEnhance, executeDismantle, getDismantleResults, executeTagInscription } from "../craft.js";
import { TAGS, MATERIAL_TAGS, TAG_EFFECT_MAP } from "../data/tags.js";

import { openEquipOverlay } from "../equip.js";

let isCastleProcessing = false;

export function handleTownOption(option) {
  if (option === "castle") {
    if (isCastleProcessing) return;
    isCastleProcessing = true;

    const btn = document.getElementById("btn-town-castle");
    if (btn) {
      btn.disabled = true;
    }

    state.party.forEach(char => {
      if (char.status !== "dead") {
        char.hp = getCharMaxHp(char);
        char.mp = getCharMaxMp(char);
      }
    });
    addLog("おしろ：パーティは休息した。HPとMPが全回復した！（ステータス異常は教会で治療してください）");
    
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
      saveGame();
      saveAutosave();
    } else {
      playSound("heal");
      saveGame();
      saveAutosave();
    }
    updateUI();

    setTimeout(() => {
      isCastleProcessing = false;
      if (btn) {
        btn.disabled = false;
      }
    }, 800);
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
  state.party.forEach((char) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    
    let price = 0;
    let text;
    if (char.status === "dead") {
      price = char.level * 50;
      text = `蘇生する (${price}G)`;
    } else if (char.status === "sleep" || char.status === "paralyze" || char.status === "paralyzed" || char.status === "poisoned" || char.status === "blind") {
      price = 20;
      text = `治療する (${price}G)`;
    } else {
      text = "健康";
    }

    btn.textContent = `${char.name} - ${text}`;
    if (price === 0 || state.gold < price) btn.disabled = true;
    btn.addEventListener("click", () => {
      state.gold -= price;
      char.status = "ok";
      if (char.hp === 0) char.hp = 1;
      playSound("heal");
      addLog(`僧侶が祈りを捧げる... ${char.name}は正常な状態に戻った！`);
      saveAutosave();
      openSubmenu("temple_main", "カント寺院 - 蘇生と治療：", true); // refresh
    });
    optGrid.appendChild(btn);
  });
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
