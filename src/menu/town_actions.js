import { state, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { openArchivesOverlay, openContractsOverlay, openWarehouseOverlay } from "../ui.js";
import { openSubmenu } from "../navigation.js";
import { generateContractsList } from "../contracts.js";
import { getItemBaseId, getItemData, formatAffixText, getAffixDefinition } from "../data.js";
import { renderMaterialsHUD } from "./materials_hud.js";
import { renderCraftRecipesView } from "./craft_recipes_view.js";
import { CRAFT_RECIPES, getEnhanceCost, executeCraft, executeEnhance, getPolishCost, executePolish, executeDismantle, getDismantleResults, executeTagInscription } from "../craft.js";
import { MATERIAL_TAGS, TAG_EFFECT_MAP } from "../data/tags.js";

export function handleTownOption(option) {
  if (option === "castle") {
    openSubmenu("castle_main", "おしろ - 記録：");
  } else if (option === "shop") {
    openSubmenu("shop_main", "ボルタック商店 - アイテムの売買：");
  } else if (option === "craft") {
    openSubmenu("craft_main", "工房 - 製作と装備強化：");
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

  const btnPolish = document.createElement("button");
  btnPolish.className = "btn btn-neon btn-block";
  btnPolish.textContent = "💎 サポートを研磨する";
  btnPolish.addEventListener("click", () => {
    openSubmenu("craft_polish", "工房 - サポートアフィックスの研磨：");
  });
  optGrid.appendChild(btnPolish);

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
  matTitle.textContent = "1. 素材の選択";
  wrapper.appendChild(matTitle);

  const matRow = document.createElement("div");
  matRow.style.display = "flex";
  matRow.style.flexWrap = "wrap";
  matRow.style.gap = "6px";

  const mats = ["霊粉", "毒腺", "鉄片", "竜鱗", "黒角"];
  mats.forEach(matName => {
    const curQty = state.materials[matName] || 0;
    
    // 素材に紐づく可能なタグの必要素材数
    const possibleTags = MATERIAL_TAGS[matName] || [];
    const reqCosts = possibleTags.map(tag => TAG_EFFECT_MAP[tag]?.matCost || 3);
    if (matName === "霊粉") {
      reqCosts.push(3); // 呪い封印のコスト
    }
    const minCost = reqCosts.length > 0 ? Math.min(...reqCosts) : 3;
    const maxCost = reqCosts.length > 0 ? Math.max(...reqCosts) : 3;
    const costRangeStr = minCost === maxCost ? `${minCost}` : `${minCost}-${maxCost}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn ${currentSelectedMat === matName ? "btn-neon" : "btn-secondary"}`;
    btn.style.flex = "1 1 80px";
    btn.style.minHeight = "36px";
    btn.style.padding = "4px";
    btn.style.fontSize = "10px";
    btn.innerHTML = `${matName}<br><small>${curQty}/${costRangeStr}</small>`;
    
    if (curQty < minCost) {
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

      const goldCost = effect.gold || 150;
      const matCost = effect.matCost || 3;
      const curQty = state.materials[currentSelectedMat] || 0;
      const hasEnough = curQty >= matCost;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${currentSelectedTag === tag && currentActionType === "add" ? "btn-neon" : "btn-secondary"}`;
      btn.style.textAlign = "left";
      btn.style.padding = "6px 8px";
      btn.style.fontSize = "11px";
      btn.style.minHeight = "40px";
      
      const matColor = hasEnough ? "var(--neon-green)" : "var(--neon-red)";
      btn.innerHTML = `<strong>${effect.name} (${tag})</strong> - ${effect.desc}<br>` +
                      `<small style="color:var(--text-muted)">コスト: ${goldCost}G / ` +
                      `<span style="color:${matColor}">${currentSelectedMat} ${curQty}/${matCost}個</span></small>`;
      
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
      const sealGold = 150;
      const sealMat = 3;
      const curQty = state.materials["霊粉"] || 0;
      const hasEnough = curQty >= sealMat;
      const sealBtn = document.createElement("button");
      sealBtn.type = "button";
      sealBtn.className = `btn ${currentActionType === "seal" ? "btn-neon" : "btn-secondary"}`;
      sealBtn.style.textAlign = "left";
      sealBtn.style.padding = "6px 8px";
      sealBtn.style.fontSize = "11px";
      sealBtn.style.minHeight = "40px";
      sealBtn.style.borderColor = "var(--neon-red)";
      
      const matColor = hasEnough ? "var(--neon-green)" : "var(--neon-red)";
      sealBtn.innerHTML = `<strong>封印の儀 (呪い封印)</strong> - 呪いを無効化し、コアの力も弱める<br>` +
                          `<small style="color:var(--text-muted)">コスト: ${sealGold}G / ` +
                          `<span style="color:${matColor}">霊粉 ${curQty}/${sealMat}個</span></small>`;
      
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
  
  const goldCost = currentActionType === "seal" ? 150 : (TAG_EFFECT_MAP[currentSelectedTag]?.gold || 150);
  const matCost = currentActionType === "seal" ? 3 : (TAG_EFFECT_MAP[currentSelectedTag]?.matCost || 3);
  const hasEnoughGold = state.gold >= goldCost;
  const hasEnoughMat = (state.materials[currentSelectedMat] || 0) >= matCost;
  let canSubmit = false;

  if (currentActionType === "seal") {
    submitBtn.textContent = `封印の儀を実行・コア効果半減 (${goldCost}G / 霊粉 ${matCost}個)`;
    canSubmit = hasEnoughGold && hasEnoughMat && currentSelectedMat === "霊粉";
  } else if (currentSelectedTag) {
    const effect = TAG_EFFECT_MAP[currentSelectedTag];
    submitBtn.textContent = `${effect.name}を刻印する (${goldCost}G / ${currentSelectedMat} ${matCost}個)`;
    canSubmit = hasEnoughGold && hasEnoughMat;
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
      submitBtn.textContent = `ゴールド不足 (${goldCost}G必要)`;
    } else if (!hasEnoughMat) {
      submitBtn.textContent = `素材不足 (${currentSelectedMat} ${matCost}個必要)`;
    }
  }

  actionRow.appendChild(submitBtn);
  wrapper.appendChild(actionRow);

  optGrid.appendChild(wrapper);
}

export function renderCraftRecipes(optGrid) {
  renderMaterialsHUD(optGrid);

  const recipes = CRAFT_RECIPES.map((recipe) => {
    const materials = Object.entries(recipe.mats).map(([name, required]) => {
      const current = state.materials[name] || 0;
      return { name, current, required, affordable: current >= required };
    });
    const goldAffordable = state.gold >= recipe.gold;

    return {
      name: recipe.name,
      gold: recipe.gold,
      materials,
      goldAffordable,
      canCraft: goldAffordable && state.inventory.length < 20 && materials.every((material) => material.affordable),
      onCraft: () => {
        if (executeCraft(recipe.resultId)) {
          openSubmenu("craft_recipes", "工房 - 消耗品の製作：", true); // リフレッシュ
        }
      },
    };
  });

  renderCraftRecipesView(optGrid, recipes);
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

export function renderCraftPolish(optGrid) {
  renderMaterialsHUD(optGrid);
  let polishableCount = 0;

  const appendItem = (itemKey, itemRef, ownerName = "") => {
    const item = getItemData(itemKey);
    const cost = getPolishCost(itemKey);
    if (!item || !cost || !["weapon", "shield", "armor", "accessory"].includes(item.type)) return;

    const supportAffixes = itemKey.affixes
      .map((affix, index) => ({ affix, index, definition: getAffixDefinition(affix) }))
      .filter(({ affix, definition }) => (affix.kind || definition?.kind || "support") === "support" && definition?.enabled);
    if (supportAffixes.length === 0) return;
    polishableCount++;

    const container = document.createElement("div");
    container.style.gridColumn = "span 2";
    container.style.border = "1px solid #333";
    container.style.padding = "8px";
    container.style.borderRadius = "4px";
    container.style.background = "rgba(0,0,0,0.2)";
    container.style.marginBottom = "4px";

    const title = document.createElement("div");
    title.style.fontFamily = "var(--font-mono)";
    title.style.fontSize = "11px";
    title.style.marginBottom = "6px";
    const itemName = document.createElement("strong");
    itemName.style.color = "#fff";
    itemName.textContent = item.name;
    title.appendChild(itemName);
    if (ownerName) {
      const owner = document.createElement("span");
      owner.style.color = "var(--neon-blue)";
      owner.textContent = ` [装備中] (${ownerName})`;
      title.appendChild(owner);
    }
    title.appendChild(document.createElement("br"));
    const matsReq = Object.entries(cost.mats).map(([mat, qty]) => `${mat} ${state.materials[mat] || 0}/${qty}`).join(", ");
    const costText = document.createElement("span");
    costText.style.color = "var(--text-muted)";
    costText.textContent = `1つ選択して1.5倍（切り上げ） / ${cost.gold}G・${matsReq}`;
    title.appendChild(costText);
    container.appendChild(title);

    const canAfford = state.gold >= cost.gold && Object.entries(cost.mats)
      .every(([mat, qty]) => (state.materials[mat] || 0) >= qty);
    supportAffixes.forEach(({ affix, index }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-secondary btn-block";
      button.style.minHeight = "44px";
      button.style.marginTop = "4px";
      button.textContent = `${formatAffixText(affix)} → ${formatAffixText({ ...affix, value: Math.ceil(affix.value * 1.5) })}`;
      button.disabled = !canAfford;
      if (!canAfford) button.classList.add("disabled");
      button.addEventListener("click", () => {
        if (executePolish(itemRef, index)) {
          openSubmenu("craft_polish", "工房 - サポートアフィックスの研磨：", true);
        }
      });
      container.appendChild(button);
    });
    optGrid.appendChild(container);
  };

  state.party.forEach((char, actorIdx) => {
    Object.entries(char.equipment || {}).forEach(([slot, itemKey]) => {
      if (itemKey) appendItem(itemKey, { type: "equipped", actorIdx, slot }, char.name);
    });
  });
  state.inventory.forEach((itemKey, index) => appendItem(itemKey, { type: "inventory", index }));

  if (polishableCount === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.gridColumn = "span 2";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.fontSize = "11px";
    emptyMsg.style.padding = "20px";
    emptyMsg.textContent = "研磨可能なサポートアフィックスがありません。";
    optGrid.appendChild(emptyMsg);
  }
}

export function renderCraftDismantle(optGrid) {
  renderMaterialsHUD(optGrid);

  let dismantleableCount = 0;
  state.inventory.forEach((itemKey, idx) => {
    const item = getItemData(itemKey);
    if (!item || !["weapon", "shield", "armor", "accessory"].includes(item.type)) return;

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
  
  const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");

  if (hasCrystal) {
    const btnCrystal = document.createElement("button");
    btnCrystal.className = "btn btn-neon btn-block";
    btnCrystal.style.height = "44px";
    btnCrystal.textContent = "浮遊石を王へ献上する";
    btnCrystal.addEventListener("click", () => {
      playSound("level_up");
      state.cleared = true;
      state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
      addLog("**************************************************");
      addLog("おめでとうございます！浮遊石を持ち帰りました！");
      addLog("王より名誉勲章が授与され、初踏破が記録されました！");
      addLog("以後も、街からさらなる探索を続けられます。");
      addLog("**************************************************");
      saveAutosave();
      renderCastleMain(optGrid);
    });
    optGrid.appendChild(btnCrystal);
  }

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
        <div style="font-size: 10px; margin-top: 4px;">第${log.floor}階層 (X:${log.x} Y:${log.y}) で冒険者は倒れた。</div>
        <div style="font-size: 10px; color: var(--text-muted);">原因: ${log.cause || "戦闘"}</div>
        <div style="font-size: 10px; margin-top: 2px;">・銀貨 ${log.lostGold || 0} 枚を失った。</div>
        <div style="font-size: 10px;">・未確定の戦利品 ${log.lostItemsCount || 0} 個を失った。</div>
        ${outcomesHtml}
      `;
      logsContainer.appendChild(div);
    });
    optGrid.appendChild(logsContainer);
  }

}
