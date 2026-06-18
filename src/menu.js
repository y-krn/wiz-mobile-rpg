import { state, initNewGame, loadGame, saveGame, saveAutosave, getCharWeaponAtk, getCharDef, addLog, EXP_LEVELS } from "./state.js";
import { DIR_N, START_X, START_Y, ITEMS, SPELLS, canUsePriestSpells, canUseMageSpells, isSpellcaster, getClassJpName } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { executeDisarm } from "./chest.js";
import { triggerGameOver } from "./combat.js";
import { executeEnterDungeon } from "./movement.js";

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

const SHOP_STOCK = [
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

let shopState = {
  mode: "buy", // "buy" or "sell"
  filter: "all", // "all", "weapon", "armor", "usable"
  selectedKey: null,
  selectedIdx: -1
};

export function renderShop() {
  const overlay = document.getElementById("shop-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  // 1. Create header
  const header = document.createElement("div");
  header.className = "shop-header";
  header.innerHTML = `
    <span class="shop-title">ボルタック商店</span>
    <span class="shop-capacity">バッグ: ${state.inventory.length}/20</span>
  `;
  overlay.appendChild(header);

  // 2. Create tabs
  const tabs = document.createElement("div");
  tabs.className = "shop-tabs";
  
  const tabBuy = document.createElement("button");
  tabBuy.className = `shop-tab ${shopState.mode === "buy" ? "active" : ""}`;
  tabBuy.textContent = "🛡️ 買う";
  tabBuy.setAttribute("aria-pressed", shopState.mode === "buy" ? "true" : "false");
  tabBuy.addEventListener("click", () => {
    shopState.mode = "buy";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    renderShop();
  });
  tabs.appendChild(tabBuy);

  const tabSell = document.createElement("button");
  tabSell.className = `shop-tab ${shopState.mode === "sell" ? "active" : ""}`;
  tabSell.textContent = "💰 売る";
  tabSell.setAttribute("aria-pressed", shopState.mode === "sell" ? "true" : "false");
  tabSell.addEventListener("click", () => {
    shopState.mode = "sell";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    renderShop();
  });
  tabs.appendChild(tabSell);
  
  overlay.appendChild(tabs);

  // 3. Create body
  const body = document.createElement("div");
  body.className = "shop-body";

  // 3.1 Left Column: List Container
  const listContainer = document.createElement("div");
  listContainer.className = "shop-list-container";

  // If buying, show filters
  if (shopState.mode === "buy") {
    const filters = document.createElement("div");
    filters.className = "shop-filters";
    
    const categories = [
      { id: "all", label: "すべて" },
      { id: "weapon", label: "武器" },
      { id: "armor", label: "防具/盾" },
      { id: "usable", label: "道具" }
    ];

    categories.forEach(cat => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isActive = shopState.filter === cat.id;
      chip.className = `filter-chip ${isActive ? "active" : ""}`;
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
      chip.textContent = cat.label;
      chip.addEventListener("click", () => {
        shopState.filter = cat.id;
        shopState.selectedKey = null;
        shopState.selectedIdx = -1;
        renderShop();
      });
      filters.appendChild(chip);
    });
    listContainer.appendChild(filters);
  }

  // Scrollable Items list
  const itemsList = document.createElement("div");
  itemsList.className = "shop-items-list";

  if (shopState.mode === "buy") {
    // Filter stock
    const filteredStock = SHOP_STOCK.filter(st => {
      const item = ITEMS[st.key];
      if (shopState.filter === "all") return true;
      if (shopState.filter === "weapon") return item.type === "weapon";
      if (shopState.filter === "armor") return item.type === "armor" || item.type === "shield";
      if (shopState.filter === "usable") return item.type === "usable";
      return true;
    });

    filteredStock.forEach(st => {
      const item = ITEMS[st.key];
      const row = document.createElement("button");
      row.type = "button";
      const isSelected = shopState.selectedKey === st.key;
      row.className = `shop-item-row ${isSelected ? "selected" : ""}`;
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      
      const goldCheck = state.gold < st.price;
      const bagCheck = state.inventory.length >= 20;
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "shop-item-name";
      nameSpan.textContent = item.name;
      row.appendChild(nameSpan);

      if (goldCheck || bagCheck) {
        row.classList.add("not-purchasable");
        const badge = document.createElement("span");
        badge.className = "shop-row-badge cant";
        badge.textContent = bagCheck ? "バッグ満杯" : "金不足";
        row.appendChild(badge);
      }

      const priceSpan = document.createElement("span");
      priceSpan.className = "shop-item-price";
      priceSpan.textContent = `${st.price}G`;
      row.appendChild(priceSpan);

      row.addEventListener("click", () => {
        shopState.selectedKey = st.key;
        shopState.selectedIdx = -1;
        renderShop();
      });

      itemsList.appendChild(row);
    });
  } else {
    // Selling Mode: list player inventory
    if (state.inventory.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = "バッグは空っぽです。";
      itemsList.appendChild(emptyMsg);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = ITEMS[itemKey];
        const value = Math.floor((item.price || 0) * 0.5);
        
        const row = document.createElement("button");
        row.type = "button";
        const isSelected = shopState.selectedIdx === idx;
        row.className = `shop-item-row ${isSelected ? "selected" : ""}`;
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "shop-item-name";
        nameSpan.textContent = item.name;
        row.appendChild(nameSpan);

        if (item.price === 0) {
          row.classList.add("not-purchasable");
          const badge = document.createElement("span");
          badge.className = "shop-row-badge cant";
          badge.textContent = "売却不可";
          row.appendChild(badge);
        }

        const priceSpan = document.createElement("span");
        priceSpan.className = "shop-item-price";
        priceSpan.textContent = `${value}G`;
        row.appendChild(priceSpan);

        row.addEventListener("click", () => {
          if (item.price > 0) {
            shopState.selectedKey = itemKey;
            shopState.selectedIdx = idx;
            renderShop();
          }
        });

        itemsList.appendChild(row);
      });
    }
  }

  listContainer.appendChild(itemsList);
  body.appendChild(listContainer);

  // 3.2 Right Column: Detail Panel
  const detailPanel = document.createElement("div");
  detailPanel.className = "shop-detail-panel";
  detailPanel.id = "shop-detail-panel";

  const hasSelected = (shopState.mode === "buy" && shopState.selectedKey) || 
                       (shopState.mode === "sell" && shopState.selectedIdx !== -1);

  if (!hasSelected) {
    detailPanel.innerHTML = `<div class="detail-placeholder">取引するアイテムを<br>選択してください</div>`;
  } else if (hasSelected) {
    const itemKey = shopState.selectedKey;
    const item = ITEMS[itemKey];
    const itemPrice = shopState.mode === "buy" 
      ? SHOP_STOCK.find(st => st.key === itemKey).price 
      : Math.floor((item.price || 0) * 0.5);

    // Create scrollable content container
    const scrollContent = document.createElement("div");
    scrollContent.className = "detail-scroll-content";

    // Detail Header
    const detailHeader = document.createElement("div");
    detailHeader.className = "detail-header";
    detailHeader.innerHTML = `<div class="detail-name">${item.name}</div>`;
    scrollContent.appendChild(detailHeader);

    // Detail Description
    const detailDesc = document.createElement("div");
    detailDesc.className = "detail-desc";
    detailDesc.textContent = item.desc || "特別な効果はありません。";
    scrollContent.appendChild(detailDesc);

    // Detail Stats (if weapon or armor/shield)
    if (item.type === "weapon" || item.type === "armor" || item.type === "shield") {
      const statsDiv = document.createElement("div");
      statsDiv.className = "detail-stats";
      
      let statLabel = "";
      let statVal = 0;
      if (item.type === "weapon") {
        statLabel = "攻撃力";
        statVal = item.atk;
      } else {
        statLabel = "防御力";
        statVal = item.def;
      }

      statsDiv.innerHTML = `
        <div class="detail-stat-row">
          <span>アイテム種別:</span>
          <span>${item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : "鎧"}</span>
        </div>
        <div class="detail-stat-row">
          <span>${statLabel}:</span>
          <span class="detail-stat-val">+${statVal}</span>
        </div>
      `;
      scrollContent.appendChild(statsDiv);

      // Compatibilities and comparisons
      const compatDiv = document.createElement("div");
      compatDiv.className = "detail-compat";
      compatDiv.innerHTML = `<div class="compat-title">装備適合と増減</div>`;

      state.party.forEach(char => {
        const canEquip = item.classes ? item.classes.includes(char.class) : true;
        const row = document.createElement("div");
        row.className = "compat-row";

        if (!canEquip) {
          row.innerHTML = `
            <span class="compat-name">${char.name}</span>
            <span class="compat-result no">🔴 装備不可</span>
          `;
        } else {
          // Compare current slot
          const slot = item.type; // "weapon", "shield", "armor"
          const currentEquipKey = char.equipment[slot];
          const currentEquip = currentEquipKey ? ITEMS[currentEquipKey] : null;
          
          let currentStat = 0;
          if (currentEquip) {
            currentStat = slot === "weapon" ? currentEquip.atk : currentEquip.def;
          }

          const newStat = slot === "weapon" ? item.atk : item.def;
          const diff = newStat - currentStat;

          let diffText = "";
          let resultClass = "ok";
          
          if (diff > 0) {
            diffText = `🔺+${diff} (強化!)`;
            resultClass = "upgrade";
          } else if (diff < 0) {
            diffText = `🔻${diff}`;
            resultClass = "downgrade";
          } else {
            diffText = `±0`;
            resultClass = "ok";
          }

          row.innerHTML = `
            <span class="compat-name">${char.name}</span>
            <span class="compat-result ${resultClass}">🟢 ${diffText}</span>
          `;
        }
        compatDiv.appendChild(row);
      });
      scrollContent.appendChild(compatDiv);
    } else {
      // Usable items
      const statsDiv = document.createElement("div");
      statsDiv.className = "detail-stats";
      statsDiv.innerHTML = `
        <div class="detail-stat-row">
          <span>アイテム種別:</span>
          <span>${item.type === "usable" ? "消費アイテム" : "貴重品"}</span>
        </div>
      `;
      scrollContent.appendChild(statsDiv);
    }

    detailPanel.appendChild(scrollContent);

    // Confirm button
    const actionBtn = document.createElement("button");
    actionBtn.className = `btn btn-block shop-action-btn`;
    
    if (shopState.mode === "buy") {
      actionBtn.classList.add("btn-neon");
      actionBtn.textContent = `購入する (${itemPrice}G)`;
      
      const goldCheck = state.gold < itemPrice;
      const bagCheck = state.inventory.length >= 20;
      if (goldCheck || bagCheck) {
        actionBtn.disabled = true;
        if (bagCheck) {
          actionBtn.textContent = "バッグが満杯です";
        } else {
          actionBtn.textContent = "ゴールド不足";
        }
      }

      actionBtn.addEventListener("click", () => {
        state.gold -= itemPrice;
        state.inventory.push(itemKey);
        playSound("gold");
        addLog(`${item.name}を${itemPrice}ゴールドで購入した。`);
        saveAutosave();
        
        // Keep selection if possible, otherwise reset
        const nextBagCheck = state.inventory.length >= 20;
        if (nextBagCheck) {
          shopState.selectedKey = null;
        }
        
        // Update top gold count label instantly
        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;
        
        renderShop();
        updateUI(); // update party HUD etc.
      });
    } else {
      actionBtn.classList.add("btn-danger");
      actionBtn.textContent = `売却する (+${itemPrice}G)`;

      actionBtn.addEventListener("click", () => {
        state.gold += itemPrice;
        state.inventory.splice(shopState.selectedIdx, 1);
        playSound("gold");
        addLog(`${item.name}を${itemPrice}ゴールドで売却した。`);
        saveAutosave();

        // Reset selection since index changed
        shopState.selectedKey = null;
        shopState.selectedIdx = -1;

        // Update top gold count label instantly
        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

        renderShop();
        updateUI(); // update party HUD etc.
      });
    }
    detailPanel.appendChild(actionBtn);
  }

  body.appendChild(detailPanel);
  overlay.appendChild(body);
}

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

  // 2.1 Left Column: Roster List (available characters not in party)
  const rosterCol = document.createElement("div");
  rosterCol.className = "training-column";
  rosterCol.innerHTML = `<div class="training-col-title">待機メンバー (名簿)</div>`;
  
  const rosterList = document.createElement("div");
  rosterList.className = "training-list";

  const availableChars = state.roster.filter(char => !state.party.some(c => c.name === char.name));

  if (availableChars.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "detail-placeholder";
    emptyMsg.style.marginTop = "20px";
    emptyMsg.textContent = "名簿全員がパーティに入っています。";
    rosterList.appendChild(emptyMsg);
  } else {
    availableChars.forEach(char => {
      const row = document.createElement("div");
      row.className = "char-row";

      const info = document.createElement("div");
      info.className = "char-info";
      info.innerHTML = `
        <span class="char-row-name">${char.name}</span>
        <span class="char-row-meta">${getClassJpName(char.class)} Lv.${char.level} | HP:${char.hp}</span>
      `;
      row.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "char-actions";

      const btnAdd = document.createElement("button");
      btnAdd.className = "btn btn-add-char";
      btnAdd.textContent = "加える";
      if (state.party.length >= 4) {
        btnAdd.disabled = true;
      }
      btnAdd.addEventListener("click", () => {
        if (state.party.length < 4) {
          state.party.push(char);
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });
      actions.appendChild(btnAdd);
      row.appendChild(actions);

      rosterList.appendChild(row);
    });
  }
  rosterCol.appendChild(rosterList);
  body.appendChild(rosterCol);

  // 2.2 Right Column: Current Party (numbered 1-4, support reordering)
  const partyCol = document.createElement("div");
  partyCol.className = "training-column";
  partyCol.innerHTML = `<div class="training-col-title">現在の編成 (最大4人)</div>`;

  const partyList = document.createElement("div");
  partyList.className = "training-list";

  if (state.party.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "detail-placeholder";
    emptyMsg.style.marginTop = "20px";
    emptyMsg.textContent = "パーティが結成されていません。";
    partyList.appendChild(emptyMsg);
  } else {
    state.party.forEach((char, idx) => {
      const row = document.createElement("div");
      row.className = "char-row";

      // Row label (Front/Back)
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
      info.innerHTML = `
        <span class="char-row-name">${char.name}</span>
        <span class="char-row-meta">${getClassJpName(char.class)} Lv.${char.level} | HP:${char.hp}</span>
      `;
      row.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "char-actions";

      // Reorder Up button
      const btnUp = document.createElement("button");
      btnUp.className = "btn btn-neon btn-action-sm";
      btnUp.textContent = "▲";
      if (idx === 0) {
        btnUp.disabled = true;
      }
      btnUp.addEventListener("click", () => {
        if (idx > 0) {
          const temp = state.party[idx];
          state.party[idx] = state.party[idx - 1];
          state.party[idx - 1] = temp;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });
      actions.appendChild(btnUp);

      // Reorder Down button
      const btnDown = document.createElement("button");
      btnDown.className = "btn btn-neon btn-action-sm";
      btnDown.textContent = "▼";
      if (idx === state.party.length - 1) {
        btnDown.disabled = true;
      }
      btnDown.addEventListener("click", () => {
        if (idx < state.party.length - 1) {
          const temp = state.party[idx];
          state.party[idx] = state.party[idx + 1];
          state.party[idx + 1] = temp;
          saveGame();
          saveAutosave();
          renderTraining();
          updateUI();
        }
      });
      actions.appendChild(btnDown);

      // Remove button
      const btnRemove = document.createElement("button");
      btnRemove.className = "btn btn-remove-char";
      btnRemove.textContent = "外す";
      btnRemove.addEventListener("click", () => {
        state.party = state.party.filter(c => c.name !== char.name);
        saveGame();
        saveAutosave();
        renderTraining();
        updateUI();
      });
      actions.appendChild(btnRemove);

      row.appendChild(actions);
      partyList.appendChild(row);
    });
  }

  partyCol.appendChild(partyList);
  body.appendChild(partyCol);
  overlay.appendChild(body);
}

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
    btnB1F.textContent = "地下1階から入る";
    btnB1F.addEventListener("click", () => {
      closeSubmenu();
      executeEnterDungeon(1);
    });
    optGrid.appendChild(btnB1F);

    const btnResume = document.createElement("button");
    btnResume.className = "btn btn-neon btn-block";
    btnResume.textContent = `地下${state.lastReturnedFloor}階から再開`;
    btnResume.addEventListener("click", () => {
      closeSubmenu();
      executeEnterDungeon(state.lastReturnedFloor);
    });
    optGrid.appendChild(btnResume);
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

    // Initialize shop state
    shopState.mode = "buy";
    shopState.filter = "all";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
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
      btn.textContent = `${char.name} (${getClassJpName(char.class)})`;
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
        addLog("[!] 泉の水から神秘的な力を感じた！パーティ全員のMPが3回復した。");
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
      const rand = Math.random();
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
        state.party.forEach(char => {
          if (char.status !== "dead") {
            char.exp += 100;
          }
        });
        playSound("level_up");
        addLog(`石碑の文字を解読した：`);
        addLog(`「${chosenHint}」`);
        addLog(`[!] 古代の叡智に触れ、全員が100の経験値を獲得した！`);
      } else if (rand < 0.70) {
        const aliveChars = state.party.filter(char => char.status !== "dead");
        if (aliveChars.length > 0) {
          const target = aliveChars[Math.floor(Math.random() * aliveChars.length)];
          target.hp = Math.max(0, target.hp - 8);
          if (target.hp === 0) {
            target.status = "dead";
          }
          playSound("hit");
          addLog(`[!] カチッ…罠が作動した！石碑の隙間から矢が飛び出し、${target.name}に8のダメージ！`);
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
      const generated = [];

      // Slot 1: Legendary Item
      const legendaries = [
        { key: "ELIXIR", price: 500, soldOut: false },
        { key: "LEGENDARY_SWORD", price: 3000, soldOut: false },
        { key: "LEGENDARY_SHIELD", price: 2000, soldOut: false }
      ];
      generated.push(legendaries[Math.floor(Math.random() * legendaries.length)]);

      // Slot 2: Premium Discounted Equipment
      const premiums = [
        { key: "KATANA", price: 1200, soldOut: false },
        { key: "PLATE_MAIL", price: 720, soldOut: false },
        { key: "CLAYMORE", price: 600, soldOut: false },
        { key: "PRIEST_ROBE", price: 400, soldOut: false }
      ];
      generated.push(premiums[Math.floor(Math.random() * premiums.length)]);

      // Slot 3 & 4: Usable Items
      const usables = [
        { key: "HEAL_POTION", price: 40, soldOut: false },
        { key: "MANA_POTION", price: 150, soldOut: false },
        { key: "HOLY_WATER", price: 120, soldOut: false },
        { key: "ANTIDOTE", price: 50, soldOut: false },
        { key: "TOWN_PORTAL", price: 70, soldOut: false }
      ];
      const shuffledUsables = usables.sort(() => 0.5 - Math.random());
      generated.push(shuffledUsables[0]);
      generated.push(shuffledUsables[1]);

      state.activeMerchantStock = generated;
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
        const item = ITEMS[stock.key];
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        
        if (stock.soldOut) {
          btn.textContent = `[売り切れ] ${item.name}`;
          btn.disabled = true;
        } else {
          btn.textContent = `${item.name} (${stock.price}G) - ${item.desc.split("[")[0]}`;
          if (state.gold < stock.price) btn.disabled = true;

          btn.addEventListener("click", () => {
            state.gold -= stock.price;
            state.inventory.push(stock.key);
            stock.soldOut = true;
            playSound("gold");
            addLog(`[!] 商人から[${item.name}]を${stock.price}Gで購入した。`);
            saveAutosave();
            openSubmenu("event_merchant_buy", "商人「他に入用なものはあるかね？」", true);
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
  if (state.transitioning) return;
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
    openEquipOverlay(0);
  } else if (option === "training") {
    openSubmenu("party_assemble", "訓練場 - パーティ編成:");
  }
}

export function handleExploreAction(action) {
  if (state.transitioning || state.gameState !== "explore") return;
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
    openEquipOverlay(0);
  }
}

export function clearSaveData() {
  // Let the user start fresh next time
  localStorage.removeItem("mobile_wiz_rpg_save");
  localStorage.removeItem("mobile_wiz_rpg_autosave");
}

export let equipState = {
  actorIdx: 0,
  filter: "all",
  selectedKey: null,
  selectedIdx: -1,
  prevGameState: null
};

export function openEquipOverlay(actorIdx = 0) {
  if (state.gameState !== "equip_overlay") {
    equipState.prevGameState = state.gameState;
  }
  state.gameState = "equip_overlay";
  equipState.actorIdx = actorIdx;
  equipState.filter = "all";
  equipState.selectedKey = null;
  equipState.selectedIdx = -1;
  
  const overlay = document.getElementById("equip-overlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
  renderEquip();
  updateUI();
}

export function closeEquipOverlay() {
  const overlay = document.getElementById("equip-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  if (equipState.prevGameState) {
    state.gameState = equipState.prevGameState;
    equipState.prevGameState = null;
  } else {
    state.gameState = "explore";
  }
  saveAutosave();
  updateUI();
}

export function renderEquip() {
  const overlay = document.getElementById("equip-overlay");
  if (!overlay) return;
  
  // Clear container
  overlay.innerHTML = "";
  
  const char = state.party[equipState.actorIdx];
  if (!char) {
    // Safety guard, if party is empty, close overlay
    closeEquipOverlay();
    return;
  }
  
  // 1. Header
  const header = document.createElement("div");
  header.className = "equip-header";
  
  const title = document.createElement("span");
  title.className = "equip-title";
  title.textContent = "道具・装備";
  header.appendChild(title);
  
  const capacity = document.createElement("span");
  capacity.className = `equip-capacity ${state.inventory.length >= 20 ? "full" : ""}`;
  capacity.textContent = `バッグ: ${state.inventory.length}/20個`;
  header.appendChild(capacity);
  
  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.style.minHeight = "44px";
  btnClose.style.padding = "8px 16px";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", closeEquipOverlay);
  header.appendChild(btnClose);
  
  overlay.appendChild(header);
  
  // 2. Character Selector
  const selector = document.createElement("div");
  selector.className = "equip-char-selector";
  
  const btnPrev = document.createElement("button");
  btnPrev.className = "btn btn-neon";
  btnPrev.style.minHeight = "44px";
  btnPrev.style.padding = "8px 16px";
  btnPrev.textContent = "◀";
  btnPrev.setAttribute("aria-label", "前のキャラクター");
  btnPrev.addEventListener("click", () => {
    equipState.actorIdx = (equipState.actorIdx + state.party.length - 1) % state.party.length;
    equipState.selectedKey = null;
    equipState.selectedIdx = -1;
    renderEquip();
  });
  selector.appendChild(btnPrev);
  
  const charName = document.createElement("span");
  charName.className = "equip-char-name";
  charName.textContent = `${char.name} (${getClassJpName(char.class)} Lv.${char.level})`;
  selector.appendChild(charName);
  
  const btnNext = document.createElement("button");
  btnNext.className = "btn btn-neon";
  btnNext.style.minHeight = "44px";
  btnNext.style.padding = "8px 16px";
  btnNext.textContent = "▶";
  btnNext.setAttribute("aria-label", "次のキャラクター");
  btnNext.addEventListener("click", () => {
    equipState.actorIdx = (equipState.actorIdx + 1) % state.party.length;
    equipState.selectedKey = null;
    equipState.selectedIdx = -1;
    renderEquip();
  });
  selector.appendChild(btnNext);
  
  overlay.appendChild(selector);
  
  // 3. Body (Inventory Upper, Detail Lower via stacked CSS layout)
  const body = document.createElement("div");
  body.className = "equip-body";
  
  // 3.1 Upper part: Inventory List
  const invCol = document.createElement("div");
  invCol.className = "equip-inventory-col";
  
  // Filters
  const filters = document.createElement("div");
  filters.className = "equip-filters";
  
  const cats = [
    { id: "all", label: "すべて" },
    { id: "weapon", label: "武器" },
    { id: "armor", label: "防具" },
    { id: "usable", label: "道具" }
  ];
  
  cats.forEach(cat => {
    const chip = document.createElement("button");
    chip.type = "button";
    const isActive = equipState.filter === cat.id;
    chip.className = `equip-filter-chip ${isActive ? "active" : ""}`;
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
    chip.textContent = cat.label;
    chip.addEventListener("click", () => {
      equipState.filter = cat.id;
      equipState.selectedKey = null;
      equipState.selectedIdx = -1;
      renderEquip();
    });
    filters.appendChild(chip);
  });
  invCol.appendChild(filters);
  
  // Item list container
  const itemList = document.createElement("div");
  itemList.className = "equip-item-list";
  
  // Filter inventory
  const filteredIndices = [];
  state.inventory.forEach((itemKey, idx) => {
    const item = ITEMS[itemKey];
    if (equipState.filter === "all") {
      filteredIndices.push({ itemKey, idx });
    } else if (equipState.filter === "weapon" && item.type === "weapon") {
      filteredIndices.push({ itemKey, idx });
    } else if (equipState.filter === "armor" && (item.type === "armor" || item.type === "shield")) {
      filteredIndices.push({ itemKey, idx });
    } else if (equipState.filter === "usable" && item.type === "usable") {
      filteredIndices.push({ itemKey, idx });
    }
  });
  
  if (filteredIndices.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.textContent = "該当するアイテムがありません。";
    itemList.appendChild(placeholder);
  } else {
    filteredIndices.forEach(({ itemKey, idx }) => {
      const item = ITEMS[itemKey];
      const row = document.createElement("button");
      row.type = "button";
      const isSelected = equipState.selectedIdx === idx;
      row.className = `equip-item-row ${isSelected ? "selected" : ""}`;
      row.setAttribute("aria-pressed", isSelected ? "true" : "false");
      
      const name = document.createElement("span");
      name.className = "equip-item-row-name";
      name.textContent = item.name;
      row.appendChild(name);
      
      // Add visual badges in list for better decision support
      const isEquipableType = item.type === "weapon" || item.type === "shield" || item.type === "armor";
      if (isEquipableType) {
        const canEquip = !item.classes || item.classes.includes(char.class);
        if (!canEquip) {
          row.classList.add("not-equipable");
          const badge = document.createElement("span");
          badge.className = "equip-row-badge cant";
          badge.textContent = "不可";
          row.appendChild(badge);
        } else {
          const slot = item.type;
          const currentEquipKey = char.equipment[slot];
          const currentEquip = currentEquipKey ? ITEMS[currentEquipKey] : null;
          let diff = 0;
          if (slot === "weapon") {
            const currentAtk = currentEquip ? currentEquip.atk : 0;
            diff = item.atk - currentAtk;
          } else {
            const currentDef = currentEquip ? currentEquip.def : 0;
            diff = item.def - currentDef;
          }
          
          if (diff !== 0) {
            const badge = document.createElement("span");
            badge.className = `equip-row-badge ${diff > 0 ? "up" : "down"}`;
            badge.textContent = diff > 0 ? `+${diff}` : `${diff}`;
            row.appendChild(badge);
          }
        }
      }
      
      const tag = document.createElement("span");
      tag.className = "equip-item-row-tag";
      tag.textContent = item.type === "usable" ? "道具" : item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : "鎧";
      row.appendChild(tag);
      
      row.addEventListener("click", () => {
        equipState.selectedKey = itemKey;
        equipState.selectedIdx = idx;
        renderEquip();
      });
      itemList.appendChild(row);
    });
  }
  invCol.appendChild(itemList);
  body.appendChild(invCol);
  
  // 3.2 Lower part: Detail Panel
  const detailCol = document.createElement("div");
  detailCol.className = "equip-detail-col";
  
  if (equipState.selectedIdx === -1 || !equipState.selectedKey) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.innerHTML = "上のバッグからアイテムを選択してください。";
    detailCol.appendChild(placeholder);
  } else {
    const itemKey = equipState.selectedKey;
    const item = ITEMS[itemKey];
    
    const detailContent = document.createElement("div");
    detailContent.className = "equip-detail-content";
    
    const dName = document.createElement("div");
    dName.className = "equip-detail-name";
    dName.textContent = item.name;
    detailContent.appendChild(dName);
    
    const dDesc = document.createElement("div");
    dDesc.className = "equip-detail-desc";
    dDesc.textContent = item.desc || "効果はありません。";
    detailContent.appendChild(dDesc);
    
    // Class Compatibility Check
    const isEquipableType = item.type === "weapon" || item.type === "shield" || item.type === "armor";
    if (isEquipableType) {
      const canEquip = !item.classes || item.classes.includes(char.class);
      const compat = document.createElement("div");
      compat.className = `equip-detail-compat ${canEquip ? "yes" : "no"}`;
      compat.textContent = canEquip ? "🟢 装備可能" : "🔴 装備不可 (職業制限)";
      detailContent.appendChild(compat);
      
      // Stat compare
      const compare = document.createElement("div");
      compare.className = "equip-stat-compare";
      
      const currentEquipKey = char.equipment[item.type];
      const currentEquip = currentEquipKey ? ITEMS[currentEquipKey] : null;
      
      if (item.type === "weapon") {
        const currentAtk = getCharWeaponAtk(char) + char.str;
        const newAtk = item.atk + char.str;
        const diff = newAtk - currentAtk;
        
        const row = document.createElement("div");
        row.className = "equip-stat-compare-row";
        row.innerHTML = `<span>攻撃力:</span>`;
        
        const val = document.createElement("span");
        val.className = `equip-stat-compare-val ${diff > 0 ? "upgrade" : diff < 0 ? "downgrade" : ""}`;
        val.textContent = `${currentAtk} ➡ ${newAtk} (${diff >= 0 ? "+" : ""}${diff})`;
        row.appendChild(val);
        compare.appendChild(row);
      } else {
        const currentDef = getCharDef(char);
        // Calculate new def
        let newDef = currentDef;
        if (item.type === "shield") {
          const currentShieldDef = currentEquip ? currentEquip.def : 0;
          newDef = currentDef - currentShieldDef + item.def;
        } else if (item.type === "armor") {
          const currentArmorDef = currentEquip ? currentEquip.def : 0;
          newDef = currentDef - currentArmorDef + item.def;
        }
        const diff = newDef - currentDef;
        
        const row = document.createElement("div");
        row.className = "equip-stat-compare-row";
        row.innerHTML = `<span>防御力:</span>`;
        
        const val = document.createElement("span");
        val.className = `equip-stat-compare-val ${diff > 0 ? "upgrade" : diff < 0 ? "downgrade" : ""}`;
        val.textContent = `${currentDef} ➡ ${newDef} (${diff >= 0 ? "+" : ""}${diff})`;
        row.appendChild(val);
        compare.appendChild(row);
      }
      detailContent.appendChild(compare);
    }
    
    detailCol.appendChild(detailContent);
    
    // Action button
    const actionBtn = document.createElement("button");
    actionBtn.className = "btn btn-neon btn-block";
    actionBtn.style.minHeight = "44px";
    
    if (item.type === "usable") {
      actionBtn.textContent = "使用する";
      actionBtn.addEventListener("click", () => {
        if (itemKey === "TOWN_PORTAL") {
          closeEquipOverlay();
          state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);
          state.gameState = "town";
          state.x = START_X;
          state.y = START_Y;
          state.dir = DIR_N;
          addLog(`${char.name}は帰還のスクロールを読んだ！パーティ全員が眩い光に包まれ、一瞬でリルガミンの街へ戻った！`);
          playSound("cast_spell");
          state.inventory.splice(equipState.selectedIdx, 1);
          saveAutosave();
          updateUI();
          return;
        }
        
        const log = item.effect(char);
        addLog(log);
        playSound("heal");
        state.inventory.splice(equipState.selectedIdx, 1);
        saveAutosave();
        
        equipState.selectedKey = null;
        equipState.selectedIdx = -1;
        renderEquip();
        updateUI();
      });
    } else {
      const canEquip = !item.classes || item.classes.includes(char.class);
      if (canEquip) {
        actionBtn.textContent = "装備する";
        actionBtn.addEventListener("click", () => {
          const slot = item.type; // weapon, shield, armor
          const oldEq = char.equipment[slot];
          char.equipment[slot] = item.id;
          
          if (oldEq) {
            state.inventory[equipState.selectedIdx] = oldEq;
          } else {
            state.inventory.splice(equipState.selectedIdx, 1);
          }
          
          const newAtk = getCharWeaponAtk(char) + char.str;
          const newDef = getCharDef(char);
          addLog(`${char.name}は${item.name}を装備した。(攻撃:${newAtk}/守備:${newDef})`);
          playSound("move");
          saveAutosave();
          
          equipState.selectedKey = null;
          equipState.selectedIdx = -1;
          renderEquip();
          updateUI();
        });
      } else {
        actionBtn.textContent = "装備不可";
        actionBtn.disabled = true;
        actionBtn.className = "btn btn-block";
      }
    }
    detailCol.appendChild(actionBtn);
  }
  
  body.appendChild(detailCol);
  overlay.appendChild(body);
  
  // 4. Footer Slots
  const footer = document.createElement("div");
  footer.className = "equip-slots-footer";
  
  const slots = [
    { id: "weapon", label: "武器" },
    { id: "shield", label: "盾" },
    { id: "armor", label: "鎧" }
  ];
  
  slots.forEach(slot => {
    const row = document.createElement("div");
    row.className = "equip-slot-row";
    
    const label = document.createElement("span");
    label.className = "equip-slot-label";
    label.textContent = slot.label;
    row.appendChild(label);
    
    const eqKey = char.equipment[slot.id];
    const eqItem = eqKey ? ITEMS[eqKey] : null;
    
    const val = document.createElement("span");
    val.className = "equip-slot-value";
    val.textContent = eqItem ? eqItem.name : "なし";
    row.appendChild(val);
    
    if (eqItem) {
      const btnUnequip = document.createElement("button");
      btnUnequip.className = "btn btn-danger btn-unequip-sm";
      btnUnequip.textContent = "外す";
      
      // Proactively disable unequip button if inventory is full
      if (state.inventory.length >= 20) {
        btnUnequip.disabled = true;
      } else {
        btnUnequip.addEventListener("click", () => {
          char.equipment[slot.id] = null;
          state.inventory.push(eqKey);
          
          const newAtk = getCharWeaponAtk(char) + char.str;
          const newDef = getCharDef(char);
          addLog(`${char.name}は${eqItem.name}を外した。(攻撃:${newAtk}/守備:${newDef})`);
          playSound("move");
          saveAutosave();
          
          equipState.selectedKey = null;
          equipState.selectedIdx = -1;
          renderEquip();
          updateUI();
        });
      }
      row.appendChild(btnUnequip);
    } else {
      const btnDummy = document.createElement("button");
      btnDummy.className = "btn btn-unequip-sm";
      btnDummy.textContent = "外す";
      btnDummy.disabled = true;
      row.appendChild(btnDummy);
    }
    footer.appendChild(row);
  });
  
  // Proactively display warning message if inventory bag is full
  if (state.inventory.length >= 20) {
    const warningText = document.createElement("div");
    warningText.className = "equip-warning-text";
    warningText.textContent = "⚠️ バッグが満杯のため、これ以上装備を外せません。";
    footer.insertBefore(warningText, footer.firstChild);
  }
  
  overlay.appendChild(footer);
}


