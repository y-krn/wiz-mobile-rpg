import { state, initNewGame, loadGame, saveGame, saveAutosave, getCharWeaponAtk, getCharDef, addLog, EXP_LEVELS } from "./state.js";
import { DIR_N, START_X, START_Y, ITEMS, SPELLS, canUsePriestSpells, canUseMageSpells, isSpellcaster, getClassJpName } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { executeDisarm } from "./chest.js";

// Submenu navigation tracker
export let menuContext = {
  type: "", // "camp", "spell", "item", "equip", "shop_buy", "shop_sell", "temple", "target_enemy", "target_ally"
  actorIdx: -1,
  spellName: "",
  itemKey: "",
  itemIdx: -1,
  prevGameState: null,
  slot: "" // "weapon", "shield", "armor"
};
export let menuHistory = [];

export function openSubmenu(type, title, isBack = false) {
  if (!isBack) {
    if (state.gameState !== "submenu") {
      menuContext.prevGameState = state.gameState;
      menuHistory.length = 0; // Reset history when entering submenu from main game
    } else {
      // Save current state to history before transitioning
      menuHistory.push({
        type: menuContext.type,
        title: document.getElementById("submenu-title").textContent,
        actorIdx: menuContext.actorIdx,
        spellName: menuContext.spellName,
        itemKey: menuContext.itemKey,
        itemIdx: menuContext.itemIdx,
        slot: menuContext.slot
      });
    }
  }
  state.gameState = "submenu";
  menuContext.type = type;
  document.getElementById("btn-submenu-back").style.display = "block";
  
  const titleEl = document.getElementById("submenu-title");
  // Dynamic replacement of bag/inventory item counts to prevent historical desync
  let displayTitle = title;
  if (displayTitle.includes("バッグ: ") || displayTitle.includes("共有バッグ (") || displayTitle.includes("売却 (バッグ: ")) {
    displayTitle = displayTitle.replace(/(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(共有バッグ\s*\()\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(売却\s*\(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
  }
  titleEl.textContent = displayTitle;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (type === "spell_caster_select") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (${getClassJpName(char.class)}) - MP:${char.mp}/${char.maxMp}`;
      if (char.status === "dead" || char.maxMp === 0 || !isSpellcaster(char)) btn.disabled = true;
      btn.addEventListener("click", () => {
        menuContext.actorIdx = idx;
        openSubmenu("spell_select", `呪文選択 - ${char.name}:`);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "spell_select") {
    const caster = state.party[menuContext.actorIdx];
    const casterSpells = caster.spells || [];
    if (casterSpells.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn btn-block";
      btn.textContent = "修得している呪文がありません";
      btn.disabled = true;
      optGrid.appendChild(btn);
    } else {
      casterSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        btn.textContent = `${spell.name} (MP:${spell.cost}) - ${spell.desc}`;
        if (caster.mp < spell.cost) btn.disabled = true;
        btn.addEventListener("click", () => {
          menuContext.spellName = spKey;
          // Determine spell targeting
          if (spell.target === "single_ally") {
            openSubmenu("spell_target_ally", `${spell.name}の対象を選択:`);
          } else if (spell.target === "utility") {
            executeUtilitySpell();
          } else {
            addLog("この呪文は戦闘中のみ使用可能です！");
            closeSubmenu();
          }
        });
        optGrid.appendChild(btn);
      });
    }
  } else if (type === "spell_target_ally") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (HP:${char.hp}/${char.maxHp})`;
      if (char.status === "dead") btn.disabled = true;
      btn.addEventListener("click", () => {
        executeAllySpell(idx);
      });
      optGrid.appendChild(btn);
    });
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
    
    const wName = char.equipment.weapon ? ITEMS[char.equipment.weapon].name : "なし";
    const sName = char.equipment.shield ? ITEMS[char.equipment.shield].name : "なし";
    const aName = char.equipment.armor ? ITEMS[char.equipment.armor].name : "なし";
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
        const item = ITEMS[itemKey];
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
    const item = ITEMS[menuContext.itemKey];
    
    if (item.type === "usable") {
      const btnUse = document.createElement("button");
      btnUse.className = "btn btn-neon btn-block";
      btnUse.textContent = "使用する";
      btnUse.addEventListener("click", () => {
        const char = state.party[menuContext.actorIdx];
        if (menuContext.itemKey === "TOWN_PORTAL") {
          state.gameState = "town";
          state.x = START_X;
          state.y = START_Y;
          state.dir = DIR_N;
          addLog("帰還のスクロールを読んだ！パーティ全員が眩い光に包まれ、一瞬でリルガミンの街へ戻った！");
          playSound("cast_spell");
          state.inventory.splice(menuContext.itemIdx, 1);
          saveAutosave();
          closeSubmenu();
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
      openSubmenu("item_user_select", `道具を使用/装備するキャラクターを選択 (バッグ: ${state.inventory.length}個) ：`);
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
    const btnBuy = document.createElement("button");
    btnBuy.className = "btn btn-neon btn-block";
    btnBuy.textContent = "武器・防具を買う";
    btnBuy.addEventListener("click", () => {
      openSubmenu("shop_buy", "装備の購入:");
    });
    optGrid.appendChild(btnBuy);

    const btnSell = document.createElement("button");
    btnSell.className = "btn btn-neon btn-block";
    btnSell.textContent = "道具を売る";
    btnSell.addEventListener("click", () => {
      openSubmenu("shop_sell", `売却 (バッグ: ${state.inventory.length}個) - 半値での引き取り:`);
    });
    optGrid.appendChild(btnSell);
  } else if (type === "shop_buy") {
    // List shop stock
    const stock = [
      { key: "HEAL_POTION", price: 60 },
      { key: "ANTIDOTE", price: 80 },
      { key: "HOLY_WATER", price: 180 },
      { key: "MANA_POTION", price: 200 },
      { key: "TOWN_PORTAL", price: 100 },
      { key: "DAGGER", price: 50 },
      { key: "WAND", price: 120 },
      { key: "SHORT_SWORD", price: 150 },
      { key: "MACE", price: 100 },
      { key: "NINJA_DAGGER", price: 300 },
      { key: "LONG_SWORD", price: 400 },
      { key: "CLAYMORE", price: 750 },
      { key: "KATANA", price: 1500 },
      { key: "SMALL_SHIELD", price: 80 },
      { key: "LARGE_SHIELD", price: 250 },
      { key: "KNIGHT_SHIELD", price: 450 },
      { key: "ROBE", price: 30 },
      { key: "MAGE_CLOAK", price: 380 },
      { key: "LEATHER_ARMOR", price: 120 },
      { key: "NINJA_SUIT", price: 250 },
      { key: "SCALE_MAIL", price: 220 },
      { key: "CHAIN_MAIL", price: 350 },
      { key: "PRIEST_ROBE", price: 500 },
      { key: "PLATE_MAIL", price: 900 }
    ];

    stock.forEach(st => {
      const item = ITEMS[st.key];
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${item.name} (${st.price}G)`;
      if (state.gold < st.price || state.inventory.length >= 20) btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gold -= st.price;
        state.inventory.push(st.key);
        playSound("gold");
        addLog(`${item.name}を${st.price}ゴールドで購入した。`);
        saveAutosave();
        openSubmenu("shop_buy", "装備の購入:", true); // refresh (isBack=true to skip history push)
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "shop_sell") {
    if (state.inventory.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn btn-block";
      btn.textContent = "バッグは空っぽです";
      btn.disabled = true;
      optGrid.appendChild(btn);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = ITEMS[itemKey];
        // 50% price
        const value = Math.floor((item.price || 0) * 0.5);
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        btn.textContent = `${item.name} (+${value}G)`;
        if (item.price === 0) btn.disabled = true; // quest items
        btn.addEventListener("click", () => {
          state.gold += value;
          state.inventory.splice(idx, 1);
          playSound("gold");
          addLog(`${item.name}を${value}ゴールドで売却した。`);
          saveAutosave();
          openSubmenu("shop_sell", `売却 (バッグ: ${state.inventory.length}個) - 半値での引き取り:`, true); // refresh (isBack=true to skip history push)
        });
        optGrid.appendChild(btn);
      });
    }
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
      btn.textContent = `${char.name} (${getClassJpName(char.class)})`;
      if (!["ok", "poisoned", "blind"].includes(char.status)) btn.disabled = true;
      btn.addEventListener("click", () => {
        executeDisarm(char);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "training_main") {
    const btnAssemble = document.createElement("button");
    btnAssemble.className = "btn btn-neon btn-block";
    btnAssemble.textContent = "パーティ編成 (名簿から選ぶ)";
    btnAssemble.addEventListener("click", () => {
      openSubmenu("party_assemble", "訓練場 - パーティ編成:");
    });
    optGrid.appendChild(btnAssemble);

    const btnCreate = document.createElement("button");
    btnCreate.className = "btn btn-neon btn-block";
    btnCreate.textContent = "キャラクター新規作成";
    btnCreate.addEventListener("click", () => {
      openSubmenu("char_create_name", "キャラクター作成 - 名前入力:");
    });
    optGrid.appendChild(btnCreate);

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn btn-danger btn-block";
    btnDelete.textContent = "キャラクター削除";
    btnDelete.addEventListener("click", () => {
      openSubmenu("char_delete", "訓練場 - キャラクター削除:");
    });
    optGrid.appendChild(btnDelete);
  } else if (type === "party_assemble") {
    if (state.roster.length === 0) {
      const info = document.createElement("div");
      info.textContent = "名簿が空です。";
      info.style.color = "var(--neon-gold)";
      optGrid.appendChild(info);
    } else {
      state.roster.forEach((char, idx) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "6px";
        row.style.border = "1px solid var(--border-color)";
        row.style.marginBottom = "4px";
        row.style.fontFamily = "var(--font-mono)";
        row.style.fontSize = "12px";

        const inParty = state.party.some(c => c.name === char.name);
        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${char.name} (${getClassJpName(char.class)} Lv.${char.level})`;
        nameSpan.style.color = inParty ? "var(--neon-cyan)" : "#aaa";
        row.appendChild(nameSpan);

        const btn = document.createElement("button");
        btn.style.width = "100px";
        if (inParty) {
          btn.className = "btn btn-danger btn-sm";
          btn.textContent = "外す";
          btn.addEventListener("click", () => {
            state.party = state.party.filter(c => c.name !== char.name);
            saveGame();
            saveAutosave();
            openSubmenu("party_assemble", "訓練場 - パーティ編成:", true);
          });
        } else {
          btn.className = "btn btn-neon btn-sm";
          btn.textContent = "加える";
          if (state.party.length >= 4) {
            btn.disabled = true;
            btn.className = "btn btn-sm";
          }
          btn.addEventListener("click", () => {
            if (state.party.length < 4) {
              state.party.push(char);
              saveGame();
              saveAutosave();
              openSubmenu("party_assemble", "訓練場 - パーティ編成:", true);
            }
          });
        }
        row.appendChild(btn);
        optGrid.appendChild(row);
      });
    }
  } else if (type === "char_create_name") {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "12px";
    wrapper.style.width = "100%";
    
    const input = document.createElement("input");
    input.type = "text";
    input.id = "new-char-name";
    input.placeholder = "名前 (英数字 10文字以内)";
    input.style.padding = "8px";
    input.style.border = "1px solid var(--border-color)";
    input.style.background = "#111";
    input.style.color = "#fff";
    input.style.borderRadius = "4px";
    input.style.textAlign = "center";
    input.maxLength = 10;
    
    const btnOk = document.createElement("button");
    btnOk.className = "btn btn-neon btn-block";
    btnOk.textContent = "ステータス決定へ";
    btnOk.addEventListener("click", () => {
      const name = input.value.trim();
      if (!name) {
        alert("名前を入力してください。");
        return;
      }
      if (!/^[a-zA-Z0-9\sぁ-んァ-ヶ一-龠々]+$/.test(name)) {
        alert("使用できない文字が含まれています。");
        return;
      }
      if (state.roster.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        alert("同じ名前のキャラクターが既に存在します。");
        return;
      }
      menuContext.newCharName = name;
      menuContext.bonusPoints = Math.floor(Math.random() * 16) + 5;
      menuContext.newCharStats = { str: 8, int: 8, pie: 8, vit: 8, agi: 8, luk: 8 };
      openSubmenu("char_create_class", `ステータス決定 (${name})`);
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(btnOk);
    optGrid.appendChild(wrapper);
  } else if (type === "char_create_class") {
    const name = menuContext.newCharName;
    const stats = menuContext.newCharStats;
    const bonus = menuContext.bonusPoints;

    const header = document.createElement("div");
    header.style.textAlign = "center";
    header.style.color = "var(--neon-cyan)";
    header.style.marginBottom = "8px";
    header.style.fontFamily = "var(--font-mono)";
    header.textContent = `残りボーナスポイント: ${bonus} P`;
    optGrid.appendChild(header);

    const statKeys = [
      { key: "str", label: "力" },
      { key: "int", label: "知恵" },
      { key: "pie", label: "信仰心" },
      { key: "vit", label: "生命力" },
      { key: "agi", label: "素早さ" },
      { key: "luk", label: "運" }
    ];

    statKeys.forEach(s => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";
      row.style.fontFamily = "var(--font-mono)";

      const label = document.createElement("span");
      label.textContent = `${s.label}: ${stats[s.key]}`;
      row.appendChild(label);

      const btnGroup = document.createElement("div");
      btnGroup.style.display = "flex";
      btnGroup.style.gap = "4px";

      const btnMinus = document.createElement("button");
      btnMinus.className = "btn btn-neon btn-sm";
      btnMinus.textContent = "-";
      btnMinus.style.width = "32px";
      if (stats[s.key] <= 8) btnMinus.disabled = true;
      btnMinus.addEventListener("click", () => {
        if (stats[s.key] > 8) {
          stats[s.key]--;
          menuContext.bonusPoints++;
          openSubmenu("char_create_class", `ステータス決定 (${name})`, true);
        }
      });

      const btnPlus = document.createElement("button");
      btnPlus.className = "btn btn-neon btn-sm";
      btnPlus.textContent = "+";
      btnPlus.style.width = "32px";
      if (bonus <= 0) btnPlus.disabled = true;
      btnPlus.addEventListener("click", () => {
        if (bonus > 0) {
          stats[s.key]++;
          menuContext.bonusPoints--;
          openSubmenu("char_create_class", `ステータス決定 (${name})`, true);
        }
      });

      btnGroup.appendChild(btnMinus);
      btnGroup.appendChild(btnPlus);
      row.appendChild(btnGroup);
      optGrid.appendChild(row);
    });

    const btnReRoll = document.createElement("button");
    btnReRoll.className = "btn btn-neon btn-block";
    btnReRoll.style.margin = "8px 0";
    btnReRoll.textContent = "ボーナス再ロール";
    btnReRoll.addEventListener("click", () => {
      menuContext.bonusPoints = Math.floor(Math.random() * 16) + 5;
      menuContext.newCharStats = { str: 8, int: 8, pie: 8, vit: 8, agi: 8, luk: 8 };
      openSubmenu("char_create_class", `ステータス決定 (${name})`, true);
    });
    optGrid.appendChild(btnReRoll);

    const classesInfo = [
      { id: "Fighter", name: "戦士 (Fighter)", cond: stats.str >= 11 },
      { id: "Thief", name: "盗賊 (Thief)", cond: stats.agi >= 11 },
      { id: "Priest", name: "僧侶 (Priest)", cond: stats.pie >= 11 },
      { id: "Mage", name: "魔術師 (Mage)", cond: stats.int >= 11 },
      { id: "Samurai", name: "侍 (Samurai)", cond: stats.str >= 12 && stats.int >= 11 && stats.vit >= 12 && stats.agi >= 10 },
      { id: "Bishop", name: "司祭 (Bishop)", cond: stats.int >= 12 && stats.pie >= 12 },
      { id: "Ranger", name: "野伏 (Ranger)", cond: stats.str >= 11 && stats.pie >= 11 && stats.agi >= 11 },
      { id: "Ninja", name: "忍者 (Ninja)", cond: stats.str >= 12 && stats.vit >= 12 && stats.agi >= 12 && stats.luk >= 12 }
    ];

    const classHeader = document.createElement("div");
    classHeader.style.color = "var(--neon-gold)";
    classHeader.style.marginTop = "12px";
    classHeader.style.marginBottom = "4px";
    classHeader.style.fontSize = "11px";
    classHeader.style.textAlign = "center";
    classHeader.textContent = "--- 選択可能職業 ---";
    optGrid.appendChild(classHeader);

    classesInfo.forEach(c => {
      const btn = document.createElement("button");
      btn.className = c.cond ? "btn btn-neon btn-block" : "btn btn-block";
      btn.textContent = c.name;
      btn.style.fontSize = "12px";
      btn.style.padding = "6px";
      if (!c.cond) btn.disabled = true;
      btn.addEventListener("click", () => {
        const newChar = createCharacterData(name, c.id, stats);
        state.roster.push(newChar);
        saveGame();
        saveAutosave();
        addLog(`【訓練場】新規キャラクター「${name}」(${getClassJpName(c.id)})を登録しました。`);
        openSubmenu("training_main", "訓練場 - キャラクターの登録/削除とパーティ編成:");
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "char_delete") {
    if (state.roster.length === 0) {
      const info = document.createElement("div");
      info.textContent = "削除できるキャラクターがいません。";
      optGrid.appendChild(info);
    } else {
      state.roster.forEach(char => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "6px";
        row.style.border = "1px solid var(--border-color)";
        row.style.marginBottom = "4px";
        row.style.fontFamily = "var(--font-mono)";
        row.style.fontSize = "12px";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${char.name} (${getClassJpName(char.class)} Lv.${char.level})`;
        row.appendChild(nameSpan);

        const btn = document.createElement("button");
        btn.className = "btn btn-danger btn-sm";
        btn.style.width = "80px";
        btn.textContent = "削除";

        const inParty = state.party.some(c => c.name === char.name);
        if (inParty) btn.disabled = true;

        btn.addEventListener("click", () => {
          if (confirm(`本当にキャラクター「${char.name}」を名簿から削除しますか？\n（この操作は取り消せません）`)) {
            state.roster = state.roster.filter(c => c.name !== char.name);
            saveGame();
            saveAutosave();
            addLog(`【訓練場】キャラクター「${char.name}」を削除しました。`);
            openSubmenu("char_delete", "訓練場 - キャラクター削除:", true);
          }
        });

        row.appendChild(btn);
        optGrid.appendChild(row);
      });
    }
  }

  updateUI();
}

export function closeSubmenu() {
  // Return to appropriate state
  if (state.gameState === "submenu") {
    if (state.combatState && menuContext.type.startsWith("combat")) {
      state.gameState = "combat";
      menuContext.prevGameState = null;
    } else if (menuContext.prevGameState) {
      state.gameState = menuContext.prevGameState;
      menuContext.prevGameState = null;
    } else {
      // Fallback
      if (menuContext.type.startsWith("shop") || menuContext.type.startsWith("temple")) {
        state.gameState = "town";
      } else if (menuContext.type.startsWith("combat")) {
        state.gameState = "combat";
      } else {
        state.gameState = "explore";
      }
    }
  }
  updateUI();
}

export function goBackSubmenu() {
  if (state.gameState === "submenu" && menuHistory.length > 0) {
    const prev = menuHistory.pop();
    menuContext.actorIdx = prev.actorIdx;
    menuContext.spellName = prev.spellName;
    menuContext.itemKey = prev.itemKey;
    menuContext.itemIdx = prev.itemIdx;
    menuContext.slot = prev.slot;
    openSubmenu(prev.type, prev.title, true);
  } else {
    closeSubmenu();
  }
}

export function openCampMenu() {
  openSubmenu("camp_main", "キャンプメニュー:");
}

export function executeUtilitySpell() {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];

  caster.mp -= spell.cost;
  playSound("cast_spell");
  
  const result = spell.effect(caster, state);
  addLog(result.log);
  
  saveAutosave();
  closeSubmenu();
}

export function executeAllySpell(targetIdx) {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];
  const target = state.party[targetIdx];

  caster.mp -= spell.cost;
  playSound("cast_spell");

  const result = spell.effect(caster, target);
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

export function handleTownOption(option) {
  if (option === "castle") {
    // Heal living characters HP and MP (status anomalies persist)
    state.party.forEach(char => {
      if (char.status !== "dead") {
        char.hp = char.maxHp;
        char.mp = char.maxMp;
      }
    });
    addLog("おしろ：パーティは休息した。HPとMPが全回復した！（ステータス異常は教会で治療してください）");
    
    // Check Victory item
    const hasCrystal = state.inventory.includes("ANTIGRAVITY_CRYSTAL");
    if (hasCrystal) {
      playSound("level_up");
      state.gameState = "victory";
      addLog("**************************************************");
      addLog("おめでとうございます！浮遊石を持ち帰りました！");
      addLog("王より名誉勲章が授与されました。ゲームクリアです！");
      addLog("**************************************************");
      clearSaveData();
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
    openSubmenu("item_user_select", `道具を使用/装備するキャラクターを選択 (バッグ: ${state.inventory.length}個)：`);
  } else if (option === "training") {
    openSubmenu("training_main", "訓練場 - キャラクターの登録/削除とパーティ編成:");
  }
}

export function handleExploreAction(action) {
  if (action === "search") {
    // Manual search (could reveal chest if cell has it, but cell event does it automatically)
    addLog("周囲を調べたが、特に何も見つからなかった。");
    updateUI();
  } else if (action === "camp") {
    openCampMenu();
  } else if (action === "spell") {
    // Select caster
    openSubmenu("spell_caster_select", "呪文を唱えるキャラクターを選択：");
  } else if (action === "item") {
    // Select character to use item
    openSubmenu("item_user_select", `道具を使用/装備するキャラクターを選択 (バッグ: ${state.inventory.length}個)：`);
  }
}

export function clearSaveData() {
  // Let the user start fresh next time
  localStorage.removeItem("mobile_wiz_rpg_save");
  localStorage.removeItem("mobile_wiz_rpg_autosave");
}

function createCharacterData(name, cls, stats) {
  let hp = 10;
  let mp = 0;
  let spells = [];
  let equipment = { weapon: null, shield: null, armor: null };

  if (cls === "Fighter") {
    hp = 20;
    equipment = { weapon: "LONG_SWORD", shield: "LARGE_SHIELD", armor: "CHAIN_MAIL" };
  } else if (cls === "Thief") {
    hp = 15;
    equipment = { weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" };
  } else if (cls === "Priest") {
    hp = 12;
    mp = 3;
    spells = ["DIOS", "MILWA", "DIURCO", "BADIOS"];
    equipment = { weapon: "DAGGER", shield: "SMALL_SHIELD", armor: "ROBE" };
  } else if (cls === "Mage") {
    hp = 9;
    mp = 4;
    spells = ["HALITO", "DUMAPIC"];
    equipment = { weapon: "DAGGER", shield: null, armor: "ROBE" };
  } else if (cls === "Samurai") {
    hp = 18;
    equipment = { weapon: "KATANA", shield: "SMALL_SHIELD", armor: "CHAIN_MAIL" };
  } else if (cls === "Bishop") {
    hp = 11;
    mp = 3;
    spells = ["DIOS", "HALITO"];
    equipment = { weapon: "WAND", shield: null, armor: "ROBE" };
  } else if (cls === "Ranger") {
    hp = 16;
    equipment = { weapon: "SHORT_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" };
  } else if (cls === "Ninja") {
    hp = 15;
    equipment = { weapon: null, shield: null, armor: "ROBE" };
  }

  return {
    name,
    class: cls,
    level: 1,
    exp: 0,
    hp: hp,
    maxHp: hp,
    mp: mp,
    maxMp: mp,
    str: stats.str,
    int: stats.int,
    pie: stats.pie,
    vit: stats.vit,
    agi: stats.agi,
    luk: stats.luk,
    status: "ok",
    spells,
    equipment
  };
}
