import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { updateUI, openArchivesOverlay, openContractsOverlay, openWarehouseOverlay } from "../ui.js";
import { openSubmenu } from "../navigation.js";
import { generateContractsList } from "../contracts.js";
import { getCharMaxHp, getCharMaxMp, getItemBaseId, getItemData } from "../data.js";
import { renderMaterialsHUD } from "./materials_hud.js";
import { CRAFT_RECIPES, getEnhanceCost, executeCraft, executeEnhance, executeDismantle, getDismantleResults, INSCRIPTION_RECIPES, executeInscription } from "../craft.js";

import { openEquipOverlay } from "../equip.js";

export function handleTownOption(option) {
  if (option === "castle") {
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
    
    // 未鑑定は刻印不可、刻印済みも1つまでなので不可
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
        selectedInscriptionEquipIdx = idx;
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
    emptyMsg.textContent = "刻印可能な装備品がバッグにありません。";
    optGrid.appendChild(emptyMsg);
  }
}

export function renderCraftInscriptionSelectEngrave(optGrid) {
  renderMaterialsHUD(optGrid);

  const eqItem = state.inventory[selectedInscriptionEquipIdx];
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

  // 選択中の装備情報を一番上に表示する
  const header = document.createElement("div");
  header.style.gridColumn = "span 2";
  header.style.border = "1px solid var(--neon-blue)";
  header.style.padding = "6px 8px";
  header.style.borderRadius = "4px";
  header.style.background = "rgba(0,170,255,0.05)";
  header.style.marginBottom = "8px";
  header.style.fontFamily = "var(--font-mono)";
  header.style.fontSize = "11px";
  header.innerHTML = `対象: <strong style="color:var(--neon-blue)">${item.name}</strong>`;
  optGrid.appendChild(header);

  INSCRIPTION_RECIPES.forEach(recipe => {
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

    info.innerHTML = `<strong style="color:#fff">${recipe.name} (${recipe.desc})</strong><br>
      <span style="color:var(--text-muted)">必要: ${matsReq} / <span style="color:${goldColor}">${recipe.gold}G</span></span>`;
    container.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "btn btn-neon";
    btn.textContent = "刻印";
    btn.style.minHeight = "44px";
    btn.style.width = "80px";

    let canEngrave = state.gold >= recipe.gold;
    for (const [m, reqQty] of Object.entries(recipe.mats)) {
      if ((state.materials[m] || 0) < reqQty) canEngrave = false;
    }

    if (!canEngrave) {
      btn.disabled = true;
      btn.classList.add("disabled");
    } else {
      btn.addEventListener("click", () => {
        if (executeInscription(selectedInscriptionEquipIdx, recipe.id)) {
          openSubmenu("craft_inscription_select_equip", "工房 - 刻印する装備の選択：", true);
        }
      });
    }

    container.appendChild(btn);
    optGrid.appendChild(container);
  });
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
      if (executeEnhance(idx)) {
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
    emptyMsg.textContent = "強化可能な装備品がバッグにありません。";
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
