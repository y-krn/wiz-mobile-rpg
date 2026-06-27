import { state, initNewGame, loadGame, saveGame, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem } from "./state.js";
import { DIR_N, START_X, START_Y, ITEMS, SPELLS, canUsePriestSpells, canUseMageSpells, isSpellcaster, getClassJpName, getItemData, getItemBaseId, getCharStr, getCharInt, getCharPie, getCharVit, getCharAgi, getCharLuk, getCharMaxHp, getCharMaxMp, getCharWeaponAtk, getCharDef, EXP_LEVELS } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { updateUI, openArchivesOverlay, openContractsOverlay, openWarehouseOverlay } from "./ui.js";
import { generateContractsList } from "./contracts.js";
import { executeDisarm, openChestMenu } from "./chest.js";
import { triggerGameOver } from "./combat.js";
import { executeEnterDungeon, checkCellEvents } from "./movement.js";
import { menuContext, menuHistory, openSubmenu, closeSubmenu, goBackSubmenu, setRenderSubmenuCallback } from "./navigation.js";
import { CRAFT_RECIPES, getEnhanceCost, executeCraft, executeEnhance } from "./craft.js";

// Re-exports from screen modules
export { renderShop, openShopAppraise, shopState, SHOP_STOCK } from "./shop.js";
export { renderTraining, trainingState } from "./training.js";
export { renderEquip, openEquipOverlay, closeEquipOverlay, equipState } from "./equip.js";
export { renderSpellOverlay } from "./spell_menu.js";
export { renderCampOverlay, openCampMenu, executeUtilitySpell, executeAllySpell } from "./camp.js";
export { triggerRunResult, calculateDangerScore } from "./result.js";

import { renderShop, shopState } from "./shop.js";
import { renderTraining } from "./training.js";
import { renderEquip, openEquipOverlay } from "./equip.js";
import { renderSpellOverlay } from "./spell_menu.js";
import { renderCampOverlay, openCampMenu } from "./camp.js";
import { triggerRunResult } from "./result.js";

export function renderSubmenu(type) {
  const optGrid = document.getElementById("submenu-options");

  if (type === "spell_caster_select" || type === "spell_select" || type === "spell_target_ally" || type === "camp_main" || type === "camp" || type === "camp_status") {
    return;
  } else if (type === "chest_menu") {
    openChestMenu();
  } else if (type === "craft_main") {
    // 素材一覧表示
    const matsDiv = document.createElement("div");
    matsDiv.style.gridColumn = "span 2";
    matsDiv.style.fontFamily = "var(--font-mono)";
    matsDiv.style.fontSize = "11px";
    matsDiv.style.color = "var(--neon-green)";
    matsDiv.style.border = "1px solid #333";
    matsDiv.style.padding = "6px 8px";
    matsDiv.style.background = "rgba(0, 255, 102, 0.03)";
    matsDiv.style.borderRadius = "4px";
    matsDiv.style.marginBottom = "8px";
    
    const matPool = ["獣の牙", "硬い皮", "毒腺", "骨片", "霊粉", "魔石片", "鉄片", "呪布", "黒角", "竜鱗"];
    const matList = matPool.map(m => `${m}:${state.materials[m] || 0}`).join(" / ");
    matsDiv.textContent = `🍀 所持素材: ${matList}`;
    optGrid.appendChild(matsDiv);

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
  } else if (type === "craft_recipes") {
    // 素材HUD
    const matsDiv = document.createElement("div");
    matsDiv.style.gridColumn = "span 2";
    matsDiv.style.fontSize = "11px";
    matsDiv.style.color = "var(--neon-green)";
    matsDiv.style.fontFamily = "var(--font-mono)";
    matsDiv.style.marginBottom = "4px";
    matsDiv.style.textAlign = "center";
    const matPool = ["獣の牙", "硬い皮", "毒腺", "骨片", "霊粉", "魔石片", "鉄片", "呪布", "黒角", "竜鱗"];
    matsDiv.textContent = `🍀 所持: ` + matPool.map(m => `${m}:${state.materials[m] || 0}`).join(" / ");
    optGrid.appendChild(matsDiv);

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
      const matsReq = Object.entries(recipe.mats).map(([m, qty]) => `${m}x${qty}`).join(", ");
      info.innerHTML = `<strong style="color:#fff">${recipe.name}</strong><br>
        <span style="color:var(--text-muted)">必要: ${matsReq} / ${recipe.gold}G</span>`;
      container.appendChild(info);

      const btn = document.createElement("button");
      btn.className = "btn btn-neon";
      btn.textContent = "製作";
      btn.style.minHeight = "44px";
      btn.style.width = "80px";

      // 製作可能かチェック
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
  } else if (type === "craft_enhance") {
    // 素材HUD
    const matsDiv = document.createElement("div");
    matsDiv.style.gridColumn = "span 2";
    matsDiv.style.fontSize = "11px";
    matsDiv.style.color = "var(--neon-green)";
    matsDiv.style.fontFamily = "var(--font-mono)";
    matsDiv.style.marginBottom = "4px";
    matsDiv.style.textAlign = "center";
    const matPool = ["獣の牙", "硬い皮", "毒腺", "骨片", "霊粉", "魔石片", "鉄片", "呪布", "黒角", "竜鱗"];
    matsDiv.textContent = `🍀 所持: ` + matPool.map(m => `${m}:${state.materials[m] || 0}`).join(" / ");
    optGrid.appendChild(matsDiv);

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
      const matsReq = Object.entries(cost.mats).map(([m, qty]) => `${m}x${qty}`).join(", ");
      info.innerHTML = `<strong style="color:#fff">${item.name} ➔ +1</strong><br>
        <span style="color:var(--text-muted)">必要: ${matsReq} / ${cost.gold}G</span>`;
      container.appendChild(info);

      const btn = document.createElement("button");
      btn.className = "btn btn-neon";
      btn.textContent = "強化";
      btn.style.minHeight = "44px";
      btn.style.width = "80px";

      // 強化可能かチェック
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
  } else if (type === "item_user_select") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (Lv.${char.level} ${getClassJpName(char.class)})`;
      btn.addEventListener("click", () => {
        menuContext.actorIdx = idx;
        openSubmenu("item_inventory", `共有バッグ (${state.inventory.length}個) - ${char.name}の使用/装備:`);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "item_inventory") {
    const char = state.party[menuContext.actorIdx];
    
    // Equipment stats show
    const statsDiv = document.createElement("div");
    statsDiv.style.gridColumn = "span 2";
    statsDiv.style.fontFamily = "var(--font-mono)";
    statsDiv.style.fontSize = "11px";
    statsDiv.style.color = "var(--neon-cyan)";
    statsDiv.style.textAlign = "center";
    statsDiv.style.marginBottom = "4px";
    
    const wName = char.equipment.weapon ? getItemData(char.equipment.weapon).name : "なし";
    const sName = char.equipment.shield ? getItemData(char.equipment.shield).name : "なし";
    const aName = char.equipment.armor ? getItemData(char.equipment.armor).name : "なし";
    statsDiv.textContent = `武器: ${wName} | 盾: ${sName} | 鎧: ${aName}`;
    optGrid.appendChild(statsDiv);

    if (state.inventory.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn btn-block";
      btn.textContent = "バッグは空っぽです";
      btn.disabled = true;
      optGrid.appendChild(btn);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = getItemData(itemKey);
        if (!item) return;
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        const typeJp = item.type === "usable" ? "消費" : item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : "鎧";
        btn.textContent = `${item.name} [${typeJp}]`;
        btn.addEventListener("click", () => {
          menuContext.itemKey = itemKey;
          menuContext.itemIdx = idx;
          openSubmenu("item_action", `${item.name}:`);
        });
        optGrid.appendChild(btn);
      });
    }
  } else if (type === "item_action") {
    const item = getItemData(menuContext.itemKey);
    
    if (item.type === "usable") {
      const btnUse = document.createElement("button");
      btnUse.className = "btn btn-neon btn-block";
      btnUse.textContent = "使用する";
      btnUse.addEventListener("click", () => {
        const char = state.party[menuContext.actorIdx];
        if (menuContext.itemKey === "TOWN_PORTAL") {
          addLog("帰還のスクロールを読んだ！パーティ全員が眩い光に包まれ、一瞬でお城へ戻った！");
          playSound("cast_spell");
          state.inventory.splice(menuContext.itemIdx, 1);
          closeSubmenu();
          triggerRunResult("escape_scroll");
          return;
        }
        const log = item.effect(char);
        addLog(log);
        playSound("heal");
        // Remove item from inventory
        state.inventory.splice(menuContext.itemIdx, 1);
        saveAutosave();
        goBackSubmenu();
      });
      optGrid.appendChild(btnUse);
    } else if (item.type === "weapon" || item.type === "shield" || item.type === "armor") {
      const btnEquip = document.createElement("button");
      const char = state.party[menuContext.actorIdx];
      const canEquip = !item.classes || item.classes.includes(char.class);

      if (canEquip) {
        btnEquip.className = "btn btn-neon btn-block";
        btnEquip.textContent = "装備する";
        btnEquip.addEventListener("click", () => {
          const slot = item.type; // weapon, shield, armor
          
          // Return previous equipment to inventory
          const oldEq = char.equipment[slot];
          char.equipment[slot] = item.id;
          
          // Update inventory
          if (oldEq) {
            state.inventory[menuContext.itemIdx] = oldEq;
          } else {
            state.inventory.splice(menuContext.itemIdx, 1);
          }
          
          const newAtk = getCharWeaponAtk(char) + char.str;
          const newDef = getCharDef(char);
          
          addLog(`${char.name}は${item.name}を装備した。(攻撃:${newAtk}/守備:${newDef})`);
          playSound("move");
          saveAutosave();
          goBackSubmenu();
        });
      } else {
        btnEquip.className = "btn btn-block";
        btnEquip.textContent = "この職業は装備不可";
        btnEquip.disabled = true;
      }
      optGrid.appendChild(btnEquip);
    } else {
      // Quest item or unuseable
      const btnInfo = document.createElement("button");
      btnInfo.className = "btn btn-block";
      btnInfo.textContent = "今は使用できません";
      btnInfo.disabled = true;
      optGrid.appendChild(btnInfo);
    }
  } else if (type === "camp_main" || type === "camp") {
    // Camp layout
    const btnRest = document.createElement("button");
    btnRest.className = "btn btn-neon btn-block";
    btnRest.textContent = "パーティの強さ";
    btnRest.addEventListener("click", () => {
      openSubmenu("camp_status", "パーティ詳細ステータス:");
    });
    optGrid.appendChild(btnRest);

    const btnItems = document.createElement("button");
    btnItems.className = "btn btn-neon btn-block";
    btnItems.textContent = "道具・装備";
    btnItems.addEventListener("click", () => {
      openEquipOverlay(0);
    });
    optGrid.appendChild(btnItems);

    const btnDiscard = document.createElement("button");
    btnDiscard.className = "btn btn-danger btn-block";
    btnDiscard.textContent = "冒険を最初からやり直す";
    btnDiscard.addEventListener("click", () => {
      if (confirm("セーブデータを削除して、最初からやり直しますか？")) {
        initNewGame();
        closeSubmenu();
      }
    });
    optGrid.appendChild(btnDiscard);
  } else if (type === "gameover_main") {
    const btnLoad = document.createElement("button");
    btnLoad.className = "btn btn-neon btn-block";
    btnLoad.textContent = "セーブデータから再開（おしろから）";
    
    // セーブデータが存在するか確認
    const hasSave = localStorage.getItem("mobile_wiz_rpg_save") !== null;
    if (!hasSave) {
      btnLoad.disabled = true;
      btnLoad.textContent = "セーブデータがありません";
    }
    
    btnLoad.addEventListener("click", () => {
      loadGame(true);
      closeSubmenu();
    });
    optGrid.appendChild(btnLoad);

    const btnRestart = document.createElement("button");
    btnRestart.className = "btn btn-danger btn-block";
    btnRestart.textContent = "最初からやり直す（新規データ）";
    btnRestart.addEventListener("click", () => {
      if (confirm("本当に最初からやり直しますか？現在のセーブデータは消去されます。")) {
        initNewGame();
        state.gameState = "town";
        closeSubmenu();
      }
    });
    optGrid.appendChild(btnRestart);
  } else if (type === "enter_dungeon_select") {
    const btnB1F = document.createElement("button");
    btnB1F.className = "btn btn-neon btn-block";
    btnB1F.textContent = "地下1階から潜る";
    btnB1F.addEventListener("click", () => {
      closeSubmenu();
      executeEnterDungeon(1);
    });
    optGrid.appendChild(btnB1F);

    if (state.lastReturnedFloor && state.lastReturnedFloor > 1 && state.lastReturnedFloor <= 4) {
      const btnResume = document.createElement("button");
      btnResume.className = "btn btn-neon btn-block";
      btnResume.textContent = `地下${state.lastReturnedFloor}階から再開`;
      btnResume.addEventListener("click", () => {
        closeSubmenu();
        executeEnterDungeon(state.lastReturnedFloor);
      });
      optGrid.appendChild(btnResume);
    }
  } else if (type === "camp_status") {
    state.party.forEach(char => {
      const card = document.createElement("div");
      card.style.fontFamily = "var(--font-mono)";
      card.style.fontSize = "11px";
      card.style.border = "1px solid var(--border-color)";
      card.style.padding = "4px";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      const classJp = getClassJpName(char.class);
      const nextReq = char.class === "Ninja" ? Math.floor(EXP_LEVELS[char.level + 1] * 1.5) : EXP_LEVELS[char.level + 1];
      const nextText = nextReq ? `${char.exp}/${nextReq}` : `${char.exp}/MAX`;
      card.innerHTML = `
        <strong style="color:var(--neon-gold)">${char.name} (${classJp})</strong>
        <span>HP: ${char.hp}/${char.maxHp} | MP: ${char.mp}/${char.maxMp}</span>
        <span>力:${char.str} 知恵:${char.int} 信仰:${char.pie}</span>
        <span>生命:${char.vit} 素早:${char.agi} 運:${char.luk}</span>
        <span>攻撃:+${getCharWeaponAtk(char)} | 守備:${getCharDef(char)}</span>
        <span style="color:var(--neon-cyan)">EXP: ${nextText}</span>
      `;
      optGrid.appendChild(card);
    });
  } else if (type === "shop_main") {
    // Clear submenu grid inside controls panel
    optGrid.innerHTML = "";
    const info = document.createElement("div");
    info.style.color = "var(--text-muted)";
    info.style.textAlign = "center";
    info.style.marginTop = "20px";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    info.textContent = "ボルタック商店で取引中...";
    optGrid.appendChild(info);

    // Initialize shop state (preserve appraise mode if set)
    if (shopState.mode !== "appraise") {
      shopState.mode = "buy";
    }
    shopState.filter = "all";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    shopState.lastAppraised = null;
    renderShop();
  } else if (type === "shop_buy" || type === "shop_sell") {
    // Redirect to main shop flow to avoid legacy states
    openSubmenu("shop_main", "ボルタック商店");
  } else if (type === "temple_main") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      
      let price = 0;
      let text = "";
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
        openSubmenu("temple_main", "カント寺院 - 蘇生と治療：", true); // refresh (isBack=true to skip history push)
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "chest_disarmer_select") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      
      let chance = 0.25;
      if (char.class === "Thief") {
        chance = 0.85;
      } else if (char.class === "Ranger") {
        chance = 0.60;
      }
      if (char.status === "blind") {
        chance = chance / 2.0;
      }
      const pct = Math.floor(chance * 100);
      const blindSuffix = char.status === "blind" ? " / 盲目" : "";
      btn.textContent = `${char.name} (${getClassJpName(char.class)}) 解除 ${pct}%${blindSuffix}`;

      if (!["ok", "poisoned", "blind"].includes(char.status)) btn.disabled = true;
      btn.addEventListener("click", () => {
        if (state.transitioning) return;
        executeDisarm(char);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "party_assemble") {
    // Clear submenu grid inside controls panel
    optGrid.innerHTML = "";
    const info = document.createElement("div");
    info.style.color = "var(--text-muted)";
    info.style.textAlign = "center";
    info.style.marginTop = "20px";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    info.textContent = "訓練場でパーティ編成中...";
    optGrid.appendChild(info);

    renderTraining();
  } else if (type === "event_spring") {
    document.getElementById("btn-submenu-back").style.display = "none";

    const btnDrink = document.createElement("button");
    btnDrink.className = "btn btn-neon btn-block";
    btnDrink.textContent = "泉の水を飲む";
    btnDrink.addEventListener("click", () => {
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.spring.used++;
      }
      const rand = Math.random();
      if (rand < 0.40) {
        state.party.forEach(char => {
          if (char.status !== "dead") {
            char.hp = Math.min(char.maxHp, char.hp + 20);
          }
        });
        playSound("heal");
        addLog("[!] 泉の水は清らかだった！パーティ全員のHPが20回復した。");
      } else if (rand < 0.70) {
        state.party.forEach(char => {
          if (char.status !== "dead" && char.maxMp > 0) {
            char.mp = Math.min(char.maxMp, char.mp + 3);
          }
        });
        playSound("heal");
        addLog("[!] 泉の水から神秘的な力を感じた！パーティ全員 of MPが3回復した。");
      } else if (rand < 0.85) {
        const aliveChars = state.party.filter(char => char.status !== "dead");
        if (aliveChars.length > 0) {
          const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
          target.status = "poisoned";
          playSound("bump");
          addLog(`[!] うわっ、水には毒が混ざっていた！${target.name}は毒状態になった！`);
        }
      } else {
        const aliveChars = state.party.filter(char => char.status !== "dead");
        if (aliveChars.length > 0) {
          const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
          target.status = "paralyzed";
          playSound("bump");
          addLog(`[!] うわっ、水が急に冷たくなり体が動かない！${target.name}は麻痺状態になった！`);
        }
      }
      const currentCell = state.map[state.y][state.x];
      if (currentCell.event === "event_spring") {
        currentCell.event = null;
      }
      saveAutosave();
      closeSubmenu();
    });
    optGrid.appendChild(btnDrink);

    const btnLeave = document.createElement("button");
    btnLeave.className = "btn btn-danger btn-block";
    btnLeave.textContent = "立ち去る";
    btnLeave.addEventListener("click", () => {
      addLog("泉に近づかず、そのまま立ち去った。");
      closeSubmenu();
    });
    optGrid.appendChild(btnLeave);

  } else if (type === "event_tablet") {
    document.getElementById("btn-submenu-back").style.display = "none";

    const btnRead = document.createElement("button");
    btnRead.className = "btn btn-neon btn-block";
    btnRead.textContent = "文字を読む";
    btnRead.addEventListener("click", () => {
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.tablet.read++;
      }
      const rand = Math.random();
      const currentFloor = state.floor || 1;
      if (rand < 0.40) {
        const hints = [
          "『光は闇を照らし、ロミルワは永遠のミニマップをもたらす。』",
          "『いにしえの竜は極大爆裂呪文ティルトウェイトを放つ。十分に対抗せよ。』",
          "『忍者は武器を持たぬとき、その真の力を発揮する。』",
          "『毒針の罠は、解毒薬かラツモフィスの呪文で治療可能である。』",
          "『地下3階の奥にはデーモンガードが「竜の鍵」を守っているという。』",
          "『さまよう商人は迷宮の奥深くで究極の霊薬エリクサーを売っている。』"
        ];
        const chosenHint = hints[Math.floor(Math.random() * hints.length)];
        const expGained = 100 + currentFloor * 100;
        const goldGained = 50 + currentFloor * 50;
        state.party.forEach(char => {
          if (char.status !== "dead") {
            char.exp += expGained;
          }
        });
        state.gold += goldGained;
        playSound("level_up");
        addLog(`石碑の文字を解読した：`);
        addLog(`「${chosenHint}」`);
        addLog(`[!] 古代の叡智に触れ、全員が${expGained}の経験値を獲得し、${goldGained}Gを見つけた！`);
      } else if (rand < 0.70) {
        const aliveChars = state.party.filter(char => char.status !== "dead");
        if (aliveChars.length > 0) {
          const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
          const trapDmg = 6 + currentFloor * 3;
          target.hp = Math.max(0, target.hp - trapDmg);
          if (target.hp === 0) {
            target.status = "dead";
          }
          playSound("hit");
          addLog(`[!] カチッ…罠が作動した！石碑の隙間から矢が飛び出し、${target.name}に${trapDmg}のダメージ！`);
          if (target.hp === 0) {
            addLog(`[!] ${target.name}は力尽きた！`);
          }
        }
      } else {
        addLog("石碑の文字は風化しており、何も読み取れなかった。");
      }
      const currentCell = state.map[state.y][state.x];
      if (currentCell.event === "event_tablet") {
        currentCell.event = null;
      }
      saveAutosave();

      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        triggerGameOver();
      } else {
        closeSubmenu();
      }
    });
    optGrid.appendChild(btnRead);

    const btnLeave = document.createElement("button");
    btnLeave.className = "btn btn-danger btn-block";
    btnLeave.textContent = "立ち去る";
    btnLeave.addEventListener("click", () => {
      addLog("石碑には触れず、そのまま立ち去った。");
      closeSubmenu();
    });
    optGrid.appendChild(btnLeave);

  } else if (type === "event_merchant") {
    document.getElementById("btn-submenu-back").style.display = "none";

    // Generate dynamic stock if empty
    if (!state.activeMerchantStock || state.activeMerchantStock.length === 0) {
      state.activeMerchantStock = generateMerchantStock(state.floor || 1, state.inventory || []);
      saveAutosave();
    }

    const btnTrade = document.createElement("button");
    btnTrade.className = "btn btn-neon btn-block";
    btnTrade.textContent = "取引をする";
    btnTrade.addEventListener("click", () => {
      openSubmenu("event_merchant_buy", "商人「さあ、どれにするかね？」");
    });
    optGrid.appendChild(btnTrade);

    const btnLeave = document.createElement("button");
    btnLeave.className = "btn btn-danger btn-block";
    btnLeave.textContent = "立ち去る";
    btnLeave.addEventListener("click", () => {
      addLog("商人は闇の中へと去っていった。");
      state.activeMerchantStock = [];
      const currentCell = state.map[state.y][state.x];
      if (currentCell.event === "event_merchant") {
        currentCell.event = null;
      }
      saveAutosave();
      closeSubmenu();
    });
    optGrid.appendChild(btnLeave);

  } else if (type === "event_merchant_buy") {
    document.getElementById("btn-submenu-back").style.display = "block";

    if (state.activeMerchantStock && state.activeMerchantStock.length > 0) {
      state.activeMerchantStock.forEach(stock => {
        const item = getItemData(stock.key);
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        
        if (stock.soldOut) {
          btn.textContent = `[売り切れ] ${item.name}`;
          btn.disabled = true;
        } else {
          const isAshes = stock.key === "SACRED_ASHES";
          const hasAshes = state.inventory.some(i => getItemBaseId(i) === "SACRED_ASHES");
          const bagFull = state.inventory.length >= 20;
          
          btn.textContent = `${item.name} (${stock.price}G) - ${item.desc.split("[")[0]}`;
          if (state.gold < stock.price || (isAshes && hasAshes) || bagFull) {
            btn.disabled = true;
            if (isAshes && hasAshes) {
              btn.textContent = `[所持数制限] ${item.name} (${stock.price}G)`;
            } else if (bagFull) {
              btn.textContent = `[バッグ満杯] ${item.name} (${stock.price}G)`;
            }
          }

          btn.addEventListener("click", () => {
            if (addInventoryItem(stock.key)) {
              state.gold -= stock.price;
              recordEquipmentDiscovery(stock.key);
              if (state.codex && state.codex.events && state.codex.events.facilities) {
                state.codex.events.facilities.merchant.purchased++;
              }
              stock.soldOut = true;
              playSound("gold");
              addLog(`[!] 商人から[${item.name}]を${stock.price}Gで購入した。`);
              saveAutosave();
              openSubmenu("event_merchant_buy", "商人「他に入用なものはあるかね？」", true);
            }
          });
        }
        optGrid.appendChild(btn);
      });
    }

    const btnLeave = document.createElement("button");
    btnLeave.className = "btn btn-danger btn-block";
    btnLeave.textContent = "買い物を終える";
    btnLeave.addEventListener("click", () => {
      addLog("商人は丁寧に一礼し、立ち去った。");
      state.activeMerchantStock = [];
      const currentCell = state.map[state.y][state.x];
      if (currentCell.event === "event_merchant") {
        currentCell.event = null;
      }
      saveAutosave();
      closeSubmenu();
    });
    optGrid.appendChild(btnLeave);
  }

  updateUI();
}



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

export function handleExploreAction(action) {
  if (state.transitioning || state.gameState !== "explore") return;
  if (action === "search") {
    const cell = state.map[state.y][state.x];
    if (cell && (cell.type === "stairs-up" || cell.type === "stairs-down")) {
      checkCellEvents(state.x, state.y);
    } else {
      addLog("周囲を調べたが、特に何も見つからなかった。");
      updateUI();
    }
  } else if (action === "camp") {
    openCampMenu();
  } else if (action === "spell") {
    const firstCasterIdx = state.party.findIndex(c => c.status !== "dead" && isSpellcaster(c) && c.maxMp > 0);
    menuContext.actorIdx = firstCasterIdx !== -1 ? firstCasterIdx : 0;
    openSubmenu("spell_select", "呪文選択:");
  } else if (action === "item") {
    openEquipOverlay(0);
  }
}

export function clearSaveData() {
  localStorage.removeItem("mobile_wiz_rpg_save");
  localStorage.removeItem("mobile_wiz_rpg_autosave");
}

setRenderSubmenuCallback(renderSubmenu);

export function generateMerchantStock(floor, inventory) {
  const generated = [];
  const alreadyHasAshes = inventory.some(i => getItemBaseId(i) === "SACRED_ASHES");

  // Slot 1: Rare/Legendary Item (Floor-based)
  let slot1Choices = [];
  if (floor <= 2) {
    // B1-B2: Mid-tier items, no legendaries/dragon/resurrect
    slot1Choices = [
      { key: "LONG_SWORD", price: 320, soldOut: false },
      { key: "CHAIN_MAIL", price: 280, soldOut: false },
      { key: "MAGIC_SHIELD", price: 500, soldOut: false },
      { key: "PRIEST_ROBE", price: 400, soldOut: false },
      { key: "HOLY_WATER", price: 70, soldOut: false },
      { key: "MANA_POTION", price: 150, soldOut: false }
    ];
  } else if (floor === 3) {
    // B3: Low chance (30%) of premium equipment, else mid-tier. No Sacred Ashes. No Katana on B3.
    if (Math.random() < 0.30) {
      slot1Choices = [
        { key: "PLATE_MAIL", price: 720, soldOut: false },
        { key: "CLAYMORE", price: 600, soldOut: false }
      ];
    } else {
      slot1Choices = [
        { key: "LONG_SWORD", price: 320, soldOut: false },
        { key: "CHAIN_MAIL", price: 280, soldOut: false },
        { key: "MAGIC_SHIELD", price: 500, soldOut: false },
        { key: "PRIEST_ROBE", price: 400, soldOut: false }
      ];
    }
  } else if (floor === 4) {
    // B4: Premium items but no legendaries/dragon scale/dragon charm
    slot1Choices = [
      { key: "ELIXIR", price: ITEMS.ELIXIR.price, soldOut: false },
      { key: "SEALED_EXCALIBUR", price: ITEMS.SEALED_EXCALIBUR.price, soldOut: false },
      { key: "EXCALIBUR_FRAGMENT", price: ITEMS.EXCALIBUR_FRAGMENT.price, soldOut: false }
    ];
    if (!alreadyHasAshes) {
      slot1Choices.push({ key: "SACRED_ASHES", price: ITEMS.SACRED_ASHES.price, soldOut: false });
    }
  } else {
    // B5: High cost items but no legendaries/dragon scale/dragon charm
    slot1Choices = [
      { key: "ELIXIR", price: ITEMS.ELIXIR.price, soldOut: false },
      { key: "SEALED_EXCALIBUR", price: ITEMS.SEALED_EXCALIBUR.price, soldOut: false },
      { key: "EXCALIBUR_FRAGMENT", price: ITEMS.EXCALIBUR_FRAGMENT.price, soldOut: false }
    ];
    if (!alreadyHasAshes) {
      slot1Choices.push({ key: "SACRED_ASHES", price: ITEMS.SACRED_ASHES.price, soldOut: false });
    }
  }
  generated.push(slot1Choices[Math.floor(Math.random() * slot1Choices.length)]);

  // Slot 2: Premium Discounted Equipment (Floor-based)
  let slot2Choices = [];
  if (floor <= 2) {
    // B1-B2: Mid-tier equipment only
    slot2Choices = [
      { key: "LONG_SWORD", price: 320, soldOut: false },
      { key: "CHAIN_MAIL", price: 280, soldOut: false },
      { key: "MAGIC_SHIELD", price: 500, soldOut: false },
      { key: "PRIEST_ROBE", price: 400, soldOut: false }
    ];
  } else if (floor === 3) {
    // B3: Low chance (30%) of premium, else mid-tier. Katana omitted on B3.
    if (Math.random() < 0.30) {
      slot2Choices = [
        { key: "PLATE_MAIL", price: 720, soldOut: false },
        { key: "CLAYMORE", price: 600, soldOut: false }
      ];
    } else {
      slot2Choices = [
        { key: "LONG_SWORD", price: 320, soldOut: false },
        { key: "CHAIN_MAIL", price: 280, soldOut: false },
        { key: "MAGIC_SHIELD", price: 500, soldOut: false },
        { key: "PRIEST_ROBE", price: 400, soldOut: false }
      ];
    }
  } else if (floor === 4) {
    // B4: Premium
    slot2Choices = [
      { key: "KATANA", price: 1200, soldOut: false },
      { key: "PLATE_MAIL", price: 720, soldOut: false },
      { key: "CLAYMORE", price: 600, soldOut: false },
      { key: "PRIEST_ROBE", price: 400, soldOut: false }
    ];
  } else {
    // B5: High-end equipment (20% off discounted)
    slot2Choices = [
      { key: "KATANA", price: 1200, soldOut: false },
      { key: "PLATE_MAIL", price: 720, soldOut: false },
      { key: "CLAYMORE", price: 600, soldOut: false },
      { key: "PRIEST_ROBE", price: 400, soldOut: false }
    ];
  }
  generated.push(slot2Choices[Math.floor(Math.random() * slot2Choices.length)]);

  // Slot 3 & 4: Usable Items
  const usables = [
    { key: "HEAL_POTION", price: 40, soldOut: false },
    { key: "MANA_POTION", price: 220, soldOut: false },
    { key: "HOLY_WATER", price: 70, soldOut: false },
    { key: "ANTIDOTE", price: 50, soldOut: false },
    { key: "TOWN_PORTAL", price: 180, soldOut: false }
  ];
  const shuffledUsables = usables.sort(() => 0.5 - Math.random());
  generated.push(shuffledUsables[0]);
  generated.push(shuffledUsables[1]);

  return generated;
}
