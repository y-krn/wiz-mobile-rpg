import { state, initNewGame, loadGame, saveGame, saveAutosave, getCharWeaponAtk, getCharDef, addLog, EXP_LEVELS, generateRandomSeed, rebuildDungeonMaps, calculateSeedProperties, recordEquipmentDiscovery } from "./state.js";
import { DIR_N, START_X, START_Y, ITEMS, SPELLS, canUsePriestSpells, canUseMageSpells, isSpellcaster, getClassJpName, getItemData, getCharStr, getCharInt, getCharPie, getCharVit, getCharAgi, getCharLuk, getCharMaxHp, getCharMaxMp } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI, openArchivesOverlay } from "./ui.js";
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
  { key: "HOLY_WATER", price: 100 },
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

export function openShopAppraise() {
  shopState.mode = "appraise";
  shopState.selectedKey = null;
  shopState.selectedIdx = -1;
  openSubmenu("shop_main", "ボルタック商店 - 鑑定：");
}

export function renderShop() {
  const overlay = document.getElementById("shop-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  // 1. Create header
  const header = document.createElement("div");
  header.className = "shop-header";
  
  const title = document.createElement("span");
  title.className = "shop-title";
  title.textContent = "ボルタック商店";
  header.appendChild(title);
  
  const capacity = document.createElement("span");
  capacity.className = "shop-capacity";
  capacity.textContent = `バッグ: ${state.inventory.length}/20`;
  header.appendChild(capacity);

  const goldInfo = document.createElement("span");
  goldInfo.className = "shop-gold-info";
  goldInfo.textContent = `ゴールド: ${state.gold}G`;
  header.appendChild(goldInfo);

  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.style.minHeight = "44px";
  btnClose.style.padding = "8px 16px";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", () => {
    goBackSubmenu();
  });
  header.appendChild(btnClose);
  
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

  const tabAppraise = document.createElement("button");
  tabAppraise.className = `shop-tab ${shopState.mode === "appraise" ? "active" : ""}`;
  tabAppraise.textContent = "🔍 鑑定する";
  tabAppraise.setAttribute("aria-pressed", shopState.mode === "appraise" ? "true" : "false");
  tabAppraise.addEventListener("click", () => {
    shopState.mode = "appraise";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    renderShop();
  });
  tabs.appendChild(tabAppraise);
  
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
  } else if (shopState.mode === "sell") {
    // Selling Mode: list player inventory
    if (state.inventory.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = "バッグは空っぽです。";
      itemsList.appendChild(emptyMsg);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = getItemData(itemKey);
        if (!item) return;
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
            shopState.selectedKey = (typeof itemKey === "object" ? itemKey : itemKey);
            shopState.selectedIdx = idx;
            renderShop();
          }
        });

        itemsList.appendChild(row);
      });
    }
  } else if (shopState.mode === "appraise") {
    // Appraise Mode: list unidentified items in player inventory
    const unidentifiedItems = [];
    state.inventory.forEach((itemKey, idx) => {
      if (typeof itemKey === "object" && !itemKey.identified) {
        unidentifiedItems.push({ itemKey, idx });
      }
    });

    if (unidentifiedItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = "未鑑定のアイテムがありません。";
      itemsList.appendChild(emptyMsg);
    } else {
      unidentifiedItems.forEach(({ itemKey, idx }) => {
        const itemData = getItemData(itemKey);
        const rarity = itemKey.rarity || "magic";
        const cost = { magic: 60, rare: 150, epic: 400 }[rarity] || 20;

        const row = document.createElement("button");
        row.type = "button";
        const isSelected = shopState.selectedIdx === idx;
        row.className = `shop-item-row ${isSelected ? "selected" : ""}`;
        row.setAttribute("aria-selected", isSelected ? "true" : "false");

        const nameSpan = document.createElement("span");
        nameSpan.className = "shop-item-name";
        nameSpan.textContent = itemData.name;
        row.appendChild(nameSpan);

        if (state.gold < cost) {
          row.classList.add("not-purchasable");
          const badge = document.createElement("span");
          badge.className = "shop-row-badge cant";
          badge.textContent = "金不足";
          row.appendChild(badge);
        }

        const priceSpan = document.createElement("span");
        priceSpan.className = "shop-item-price";
        priceSpan.textContent = `${cost}G`;
        row.appendChild(priceSpan);

        row.addEventListener("click", () => {
          shopState.selectedKey = itemKey;
          shopState.selectedIdx = idx;
          renderShop();
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
                       (shopState.mode === "sell" && shopState.selectedIdx !== -1) ||
                       (shopState.mode === "appraise" && shopState.selectedIdx !== -1);

  if (!hasSelected) {
    detailPanel.innerHTML = `<div class="detail-placeholder">取引するアイテムを<br>選択してください</div>`;
  } else if (hasSelected) {
    const itemKey = shopState.selectedKey;
    let item;
    let itemPrice;
    if (shopState.mode === "buy") {
      item = ITEMS[itemKey];
      itemPrice = SHOP_STOCK.find(st => st.key === itemKey).price;
    } else if (shopState.mode === "sell") {
      item = getItemData(state.inventory[shopState.selectedIdx]);
      itemPrice = Math.floor((item.price || 0) * 0.5);
    } else { // appraise
      const eqItem = state.inventory[shopState.selectedIdx];
      item = getItemData(eqItem);
      const rarity = eqItem.rarity || "magic";
      itemPrice = { magic: 60, rare: 150, epic: 400 }[rarity] || 20;
    }

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
          const currentEquip = currentEquipKey ? getItemData(currentEquipKey) : null;
          
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
        recordEquipmentDiscovery(itemKey);
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
    } else if (shopState.mode === "sell") {
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
    } else { // appraise
      actionBtn.classList.add("btn-neon");
      actionBtn.textContent = `鑑定する (${itemPrice}G)`;

      const goldCheck = state.gold < itemPrice;
      if (goldCheck) {
        actionBtn.disabled = true;
        actionBtn.textContent = "ゴールド不足";
      }

      actionBtn.addEventListener("click", () => {
        state.gold -= itemPrice;
        
        const eqItem = state.inventory[shopState.selectedIdx];
        eqItem.identified = true;
        const resultItem = getItemData(eqItem);

        playSound("level_up");
        addLog(`鑑定成功！未鑑定のアイテムは [${resultItem.name}] だった！`);
        saveAutosave();

        // Reset selection since index changed
        shopState.selectedKey = null;
        shopState.selectedIdx = -1;

        // Update top gold count label instantly
        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

        renderShop();
        updateUI();
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

  if (type === "spell_caster_select" || type === "spell_select" || type === "spell_target_ally" || type === "camp_main" || type === "camp" || type === "camp_status") {
    updateUI();
    return;
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
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.tablet.read++;
      }
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
        { key: "HOLY_WATER", price: 70, soldOut: false },
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
        const item = getItemData(stock.key);
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
            recordEquipmentDiscovery(stock.key);
            if (state.codex && state.codex.events && state.codex.events.facilities) {
              state.codex.events.facilities.merchant.purchased++;
            }
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
  
  if (menuContext.spellName === "DUMAPIC") {
    state.dumapicTurns = 30;
  }

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
  } else if (option === "archives") {
    openArchivesOverlay();
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
  const isFromCamp = equipState.prevGameState === "submenu";
  btnClose.textContent = isFromCamp ? "◀ キャンプに戻る" : "❌ 探索に戻る";
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
    const item = getItemData(itemKey);
    if (!item) return;
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
      const item = getItemData(itemKey);
      if (!item) return;
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
        const isIdentified = typeof itemKey !== "object" || itemKey.identified;
        const canEquip = (!item.classes || item.classes.includes(char.class)) && isIdentified;
        if (!isIdentified) {
          row.classList.add("not-equipable");
          const badge = document.createElement("span");
          badge.className = "equip-row-badge cant";
          badge.textContent = "未鑑定";
          row.appendChild(badge);
        } else if (!canEquip) {
          row.classList.add("not-equipable");
          const badge = document.createElement("span");
          badge.className = "equip-row-badge cant";
          badge.textContent = "不可";
          row.appendChild(badge);
        } else {
          const slot = item.type;
          const currentEquipKey = char.equipment[slot];
          const currentEquip = currentEquipKey ? getItemData(currentEquipKey) : null;
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
    const item = getItemData(itemKey);
    if (!item) return;
    
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
    
    // Class Compatibility and Identification Check
    const isEquipableType = item.type === "weapon" || item.type === "shield" || item.type === "armor";
    if (isEquipableType) {
      const isIdentified = typeof itemKey !== "object" || itemKey.identified;
      const canEquip = (!item.classes || item.classes.includes(char.class)) && isIdentified;
      const compat = document.createElement("div");
      compat.className = `equip-detail-compat ${canEquip ? "yes" : "no"}`;
      if (!isIdentified) {
        compat.textContent = "🔴 装備不可 (未鑑定アイテム)";
      } else {
        compat.textContent = canEquip ? "🟢 装備可能" : "🔴 装備不可 (職業制限)";
      }
      detailContent.appendChild(compat);
      
      // Stat compare
      const compare = document.createElement("div");
      compare.className = "equip-stat-compare";
      
      const currentEquipKey = char.equipment[item.type];
      const currentEquip = currentEquipKey ? getItemData(currentEquipKey) : null;
      
      const statsToCompare = [
        { label: "攻撃力", getValue: (eq) => eq?.type === "weapon" ? eq.atk : 0 },
        { label: "防御力", getValue: (eq) => eq?.type !== "weapon" ? (eq?.def || 0) : 0 },
        { label: "HP", getValue: (eq) => eq?.hpBonus || 0 },
        { label: "MP", getValue: (eq) => eq?.mpBonus || 0 },
        { label: "力", getValue: (eq) => eq?.statsBonus?.str || 0 },
        { label: "知恵", getValue: (eq) => eq?.statsBonus?.int || 0 },
        { label: "信仰", getValue: (eq) => eq?.statsBonus?.pie || 0 },
        { label: "生命", getValue: (eq) => eq?.statsBonus?.vit || 0 },
        { label: "素早さ", getValue: (eq) => eq?.statsBonus?.agi || 0 },
        { label: "運", getValue: (eq) => eq?.statsBonus?.luk || 0 },
        { label: "罠解除", getValue: (eq) => eq?.trapBonus || 0, isPercent: true }
      ];

      statsToCompare.forEach(st => {
        const curVal = st.getValue(currentEquip);
        const newVal = st.getValue(item);
        const isCoreStat = st.label === "攻撃力" || st.label === "防御力";
        
        if (!isCoreStat && curVal === 0 && newVal === 0) return;

        const row = document.createElement("div");
        row.className = "equip-stat-compare-row";

        let displayCur = curVal;
        let displayNew = newVal;
        if (st.label === "攻撃力") {
          displayCur = getCharWeaponAtk(char) + getCharStr(char);
          displayNew = item.atk + getCharStr(char) - (currentEquip ? currentEquip.atk : 0);
        } else if (st.label === "防御力") {
          displayCur = getCharDef(char);
          displayNew = getCharDef(char) - (currentEquip ? currentEquip.def : 0) + item.def;
        }

        const finalDiff = displayNew - displayCur;
        const sign = finalDiff >= 0 ? "+" : "";
        const unit = st.isPercent ? "%" : "";

        row.innerHTML = `<span>${st.label}:</span>`;
        const val = document.createElement("span");
        val.className = `equip-stat-compare-val ${finalDiff > 0 ? "upgrade" : finalDiff < 0 ? "downgrade" : ""}`;
        val.textContent = `${displayCur}${unit} ➡ ${displayNew}${unit} (${sign}${finalDiff}${unit})`;
        row.appendChild(val);
        compare.appendChild(row);
      });
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

        // Waste prevention confirm
        let checkWarning = "";
        if (itemKey === "HEAL_POTION" && char.hp >= char.maxHp) {
          checkWarning = "HPはすでに満タンです。本当に使用しますか？";
        } else if (itemKey === "ANTIDOTE" && char.status !== "poisoned") {
          checkWarning = "毒状態ではありません。本当に使用しますか？";
        } else if (itemKey === "MANA_POTION") {
          const hasMagic = canUsePriestSpells(char) || canUseMageSpells(char);
          if (!hasMagic) {
            checkWarning = "このキャラクターは魔力（MP）を持ちません。本当に使用しますか？";
          } else if (char.mp >= char.maxMp) {
            checkWarning = "MPはすでに満タンです。本当に使用しますか？";
          }
        } else if (itemKey === "HOLY_WATER" && char.hp >= char.maxHp && char.status !== "poisoned") {
          checkWarning = "HPは満タンで、毒状態でもありません。本当に使用しますか？";
        }

        if (checkWarning && !confirm(checkWarning)) {
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
      const isIdentified = typeof itemKey !== "object" || itemKey.identified;
      const canEquip = (!item.classes || item.classes.includes(char.class)) && isIdentified;
      if (canEquip) {
        actionBtn.textContent = "装備する";
        actionBtn.addEventListener("click", () => {
          const slot = item.type; // weapon, shield, armor
          const oldEq = char.equipment[slot];
          
          // インベントリから装備データを代入（オブジェクトまたはID）
          const eqData = state.inventory[equipState.selectedIdx];
          char.equipment[slot] = eqData;
          
          if (oldEq) {
            state.inventory[equipState.selectedIdx] = oldEq;
          } else {
            state.inventory.splice(equipState.selectedIdx, 1);
          }
          
          const newAtk = getCharWeaponAtk(char) + getCharStr(char);
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
        actionBtn.textContent = !isIdentified ? "未鑑定のため装備不可" : "装備不可";
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
    const eqItem = eqKey ? getItemData(eqKey) : null;
    
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
          // Calculate changes before unequipping using temp unequip
          const slotId = slot.id;
          let confirmMsg = "";
          
          const oldAtk = getCharWeaponAtk(char) + getCharStr(char);
          const oldDef = getCharDef(char);
          
          // Temporary unequip
          char.equipment[slotId] = null;
          const newAtk = getCharWeaponAtk(char) + getCharStr(char);
          const newDef = getCharDef(char);
          // Restore
          char.equipment[slotId] = eqKey;
          
          if (slotId === "weapon") {
            const diff = newAtk - oldAtk;
            confirmMsg = `${eqItem.name}を外しますか？\n（攻撃力: ${oldAtk} ➡ ${newAtk} (${diff >= 0 ? "+" : ""}${diff})）`;
          } else {
            const diff = newDef - oldDef;
            confirmMsg = `${eqItem.name}を外しますか？\n（防御力: ${oldDef} ➡ ${newDef} (${diff >= 0 ? "+" : ""}${diff})）`;
          }

          if (!confirm(confirmMsg)) {
            return;
          }

          char.equipment[slot.id] = null;
          state.inventory.push(eqKey);
          
          const finalAtk = getCharWeaponAtk(char) + getCharStr(char);
          const finalDef = getCharDef(char);
          addLog(`${char.name}は${eqItem.name}を外した。(攻撃:${finalAtk}/守備:${finalDef})`);
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

export function renderSpellOverlay() {
  const overlay = document.getElementById("spell-overlay");
  if (!overlay) return;

  // Clear container
  overlay.innerHTML = "";

  // 1. Header
  const header = document.createElement("div");
  header.className = "spell-header";

  const title = document.createElement("span");
  title.className = "spell-title";
  title.textContent = "呪文（スペル）";
  header.appendChild(title);

  // Close/Back button
  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-spell-close";
  btnClose.setAttribute("aria-label", menuContext.type === "spell_caster_select" ? "閉じる" : "戻る");
  btnClose.textContent = menuContext.type === "spell_caster_select" ? "❌ 閉じる" : "◀ 戻る";
  btnClose.addEventListener("click", () => {
    if (menuContext.type === "spell_caster_select") {
      closeSubmenu();
    } else {
      goBackSubmenu();
    }
  });
  header.appendChild(btnClose);
  overlay.appendChild(header);

  // 2. Character Switching HUD (shown in spell_select and spell_target_ally)
  if (menuContext.type === "spell_select" || menuContext.type === "spell_target_ally") {
    const caster = state.party[menuContext.actorIdx];
    const selector = document.createElement("div");
    selector.className = "spell-char-selector";

    const btnPrev = document.createElement("button");
    btnPrev.className = "btn btn-neon btn-char-switch";
    btnPrev.textContent = "◀";
    btnPrev.setAttribute("aria-label", "前のキャラクター");
    // Find previous spellcaster
    let prevIdx = (menuContext.actorIdx - 1 + state.party.length) % state.party.length;
    while (prevIdx !== menuContext.actorIdx) {
      const c = state.party[prevIdx];
      if (c.status !== "dead" && c.maxMp > 0 && isSpellcaster(c)) break;
      prevIdx = (prevIdx - 1 + state.party.length) % state.party.length;
    }
    if (prevIdx === menuContext.actorIdx) {
      btnPrev.disabled = true;
    }
    btnPrev.addEventListener("click", () => {
      menuContext.actorIdx = prevIdx;
      // If we are in spell_target_ally, go back to spell_select for the new caster
      if (menuContext.type === "spell_target_ally") {
        menuContext.type = "spell_select";
      }
      updateUI();
    });
    selector.appendChild(btnPrev);

    const charInfo = document.createElement("span");
    charInfo.className = "spell-char-name";
    charInfo.textContent = `${caster.name} (${getClassJpName(caster.class)}) | MP: ${caster.mp}/${caster.maxMp}`;
    selector.appendChild(charInfo);

    const btnNext = document.createElement("button");
    btnNext.className = "btn btn-neon btn-char-switch";
    btnNext.textContent = "▶";
    btnNext.setAttribute("aria-label", "次のキャラクター");
    // Find next spellcaster
    let nextIdx = (menuContext.actorIdx + 1) % state.party.length;
    while (nextIdx !== menuContext.actorIdx) {
      const c = state.party[nextIdx];
      if (c.status !== "dead" && c.maxMp > 0 && isSpellcaster(c)) break;
      nextIdx = (nextIdx + 1) % state.party.length;
    }
    if (nextIdx === menuContext.actorIdx) {
      btnNext.disabled = true;
    }
    btnNext.addEventListener("click", () => {
      menuContext.actorIdx = nextIdx;
      if (menuContext.type === "spell_target_ally") {
        menuContext.type = "spell_select";
      }
      updateUI();
    });
    selector.appendChild(btnNext);

    overlay.appendChild(selector);
  }

  // 3. Body
  const body = document.createElement("div");
  body.className = "spell-body";

  const listCol = document.createElement("div");
  listCol.className = "spell-list-col";

  const listContainer = document.createElement("div");
  listContainer.className = "spell-item-list";

  const detailCol = document.createElement("div");
  detailCol.className = "spell-detail-col";
  detailCol.id = "spell-detail-panel";
  // Default text when no spell is selected
  detailCol.innerHTML = `<div class="spell-detail-placeholder">呪文を選択してください</div>`;

  // Render based on type
  if (menuContext.type === "spell_caster_select") {
    // Hide detail column for caster select to give list full width
    detailCol.style.display = "none";
    listCol.style.width = "100%";
    listCol.style.maxWidth = "100%";

    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon spell-item-row";
      
      // Determine if disabled and reason
      let isDisabled = false;
      let reason = "";
      if (char.status === "dead") {
        isDisabled = true;
        reason = "死亡";
      } else if (!isSpellcaster(char)) {
        isDisabled = true;
        reason = "呪文なし";
      } else if (char.maxMp === 0) {
        isDisabled = true;
        reason = "MPなし";
      } else if (char.mp <= 0) {
        isDisabled = true;
        reason = "MP枯渇";
      }

      const reasonBadge = reason ? `<span class="spell-row-tag tag-disabled">${reason}</span>` : `<span class="spell-row-mp">MP:${char.mp}/${char.maxMp}</span>`;
      btn.innerHTML = `
        <span class="spell-row-name">${char.name} <span class="spell-row-class">(${getClassJpName(char.class)})</span></span>
        ${reasonBadge}
      `;

      if (isDisabled) {
        btn.disabled = true;
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => {
          menuContext.actorIdx = idx;
          openSubmenu("spell_select", `呪文選択 - ${char.name}:`);
        });
      }
      listContainer.appendChild(btn);
    });
  } else if (menuContext.type === "spell_select") {
    const caster = state.party[menuContext.actorIdx];
    const casterSpells = caster.spells || [];

    if (casterSpells.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "spell-empty-text";
      emptyDiv.textContent = "修得している呪文がありません";
      listContainer.appendChild(emptyDiv);
      detailCol.style.display = "none";
      listCol.style.width = "100%";
    } else {
      casterSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const btn = document.createElement("button");
        btn.className = "btn btn-neon spell-item-row";

        // Determine spell tag
        let spellTag = "戦闘";
        let tagClass = "tag-combat";
        const healSpells = ["DIOS", "MADIOS", "DIALMA", "DIALKO", "DIURCO", "LATUMOFIS", "KADORTO"];
        const utilitySpells = ["DUMAPIC", "MILWA", "LOMILWA", "MASFEAL"];
        
        if (healSpells.includes(spKey)) {
          spellTag = "回復";
          tagClass = "tag-heal";
        } else if (utilitySpells.includes(spKey)) {
          spellTag = "補助";
          tagClass = "tag-utility";
        }

        // Determine explore usability
        let isCombatOnly = false;
        if (spell.target === "single_enemy" || spell.target === "all_enemies") {
          isCombatOnly = true;
        }

        let isDisabled = false;
        let reason = "";
        if (isCombatOnly) {
          isDisabled = true;
          reason = "戦闘中のみ";
          tagClass = "tag-disabled";
          spellTag = "戦闘のみ";
        } else if (caster.mp < spell.cost) {
          isDisabled = true;
          reason = "MP不足";
        }

        btn.innerHTML = `
          <span class="spell-row-name">${spell.name}</span>
          <span class="spell-row-mp">MP:${spell.cost}</span>
          <span class="spell-row-tag ${tagClass}">${reason || spellTag}</span>
        `;

        btn.addEventListener("click", () => {
          // Deselect others
          listContainer.querySelectorAll(".spell-item-row").forEach(r => r.classList.remove("active"));
          btn.classList.add("active");

          // Show detail panel
          renderSpellDetail(spKey, isDisabled, reason, spellTag, tagClass);
        });

        listContainer.appendChild(btn);
      });
    }
  } else if (menuContext.type === "spell_target_ally") {
    // For target selection
    const spell = SPELLS[menuContext.spellName];
    detailCol.style.display = "none";
    listCol.style.width = "100%";
    listCol.style.maxWidth = "100%";

    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon spell-item-row";

      // Validation logic for target
      let isDisabled = false;
      let reason = "";

      if (char.status === "dead") {
        if (menuContext.spellName !== "KADORTO") {
          isDisabled = true;
          reason = "死亡";
        }
      } else {
        // Living target checks
        if (menuContext.spellName === "KADORTO") {
          isDisabled = true;
          reason = "生存中";
        } else if (["DIOS", "MADIOS", "DIALMA"].includes(menuContext.spellName)) {
          if (char.hp >= char.maxHp) {
            isDisabled = true;
            reason = "HP満タン";
          }
        } else if (menuContext.spellName === "DIURCO") {
          if (char.status !== "blind") {
            isDisabled = true;
            reason = "健康";
          }
        } else if (menuContext.spellName === "DIALKO") {
          if (char.status !== "sleep" && char.status !== "paralyze" && char.status !== "paralyzed") {
            isDisabled = true;
            reason = "健康";
          }
        } else if (menuContext.spellName === "LATUMOFIS") {
          if (char.status !== "poisoned") {
            isDisabled = true;
            reason = "健康";
          }
        }
      }

      const statusText = char.status !== "ok" ? ` [${char.status.toUpperCase()}]` : "";
      const reasonBadge = reason ? `<span class="spell-row-tag tag-disabled">${reason}</span>` : `<span class="spell-row-mp">選択可能</span>`;

      btn.innerHTML = `
        <span class="spell-row-name">${char.name} <span class="spell-row-hp">(HP:${char.hp}/${char.maxHp})${statusText}</span></span>
        ${reasonBadge}
      `;

      if (isDisabled) {
        btn.disabled = true;
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => {
          executeAllySpell(idx);
        });
      }

      listContainer.appendChild(btn);
    });
  }

  listCol.appendChild(listContainer);
  body.appendChild(listCol);
  body.appendChild(detailCol);
  overlay.appendChild(body);

  // Helper to render spell detail
  function renderSpellDetail(spKey, isDisabled, reason, spellTag, tagClass) {
    const spell = SPELLS[spKey];
    const caster = state.party[menuContext.actorIdx];
    const panel = document.getElementById("spell-detail-panel");
    if (!panel) return;

    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "spell-detail-header";
    header.innerHTML = `
      <span class="spell-detail-name">${spell.name}</span>
      <span class="spell-detail-tag ${tagClass}">${spellTag}</span>
    `;
    panel.appendChild(header);

    const stats = document.createElement("div");
    stats.className = "spell-detail-stats";
    
    let targetJp = "単体味方";
    if (spell.target === "all_enemies") targetJp = "敵全体";
    else if (spell.target === "single_enemy") targetJp = "敵単体";
    else if (spell.target === "utility") targetJp = "探索ユーティリティ";

    stats.innerHTML = `
      <div>消費MP: <span class="detail-mp">${spell.cost}</span> (現在MP: ${caster.mp})</div>
      <div>対象: <span>${targetJp}</span></div>
    `;
    panel.appendChild(stats);

    const desc = document.createElement("div");
    desc.className = "spell-detail-desc";
    desc.textContent = spell.desc;
    panel.appendChild(desc);

    // Cast button
    const btnCast = document.createElement("button");
    btnCast.className = "btn btn-neon btn-block btn-cast-action";
    btnCast.textContent = "呪文を唱える";

    if (isDisabled) {
      btnCast.disabled = true;
      btnCast.classList.add("disabled");
      btnCast.textContent = `詠唱不可 (${reason})`;
      
      const warn = document.createElement("div");
      warn.className = "spell-detail-warning";
      warn.textContent = `※${reason}のため探索中には唱えられません。`;
      panel.appendChild(warn);
    } else {
      btnCast.addEventListener("click", () => {
        menuContext.spellName = spKey;
        if (spell.target === "single_ally") {
          openSubmenu("spell_target_ally", `${spell.name}の対象を選択:`);
        } else if (spell.target === "utility") {
          executeUtilitySpell();
        }
      });
    }
    panel.appendChild(btnCast);
  }
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
  title.textContent = menuContext.type === "camp_status" ? "パーティの強さ" : "キャンプメニュー";
  header.appendChild(title);

  // Close/Back button
  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-camp-close";
  btnClose.style.minHeight = "44px";
  
  if (menuContext.type === "camp_status") {
    btnClose.textContent = "◀ メニューに戻る";
    btnClose.setAttribute("aria-label", "キャンプメニューに戻る");
    btnClose.addEventListener("click", () => {
      goBackSubmenu();
    });
  } else {
    btnClose.textContent = "❌ 探索に戻る";
    btnClose.setAttribute("aria-label", "キャンプを閉じて探索に戻る");
    btnClose.addEventListener("click", () => {
      closeSubmenu();
    });
  }
  header.appendChild(btnClose);
  overlay.appendChild(header);

  // 2. Body
  const body = document.createElement("div");
  body.className = "camp-body";

  if (menuContext.type === "camp_main" || menuContext.type === "camp") {
    // Command group
    const cmdGroup = document.createElement("div");
    cmdGroup.className = "camp-command-group";

    const btnStatus = document.createElement("button");
    btnStatus.className = "btn btn-neon btn-block camp-btn";
    btnStatus.textContent = "🛡️ パーティの強さ";
    btnStatus.addEventListener("click", () => {
      openSubmenu("camp_status", "パーティ詳細ステータス:");
    });
    cmdGroup.appendChild(btnStatus);

    const btnItems = document.createElement("button");
    btnItems.className = "btn btn-neon btn-block camp-btn";
    btnItems.textContent = "📦 道具・装備";
    btnItems.addEventListener("click", () => {
      openEquipOverlay(0);
    });
    cmdGroup.appendChild(btnItems);

    body.appendChild(cmdGroup);

    // Danger Zone at the bottom (isolated)
    const dangerZone = document.createElement("div");
    dangerZone.className = "camp-danger-zone";

    const btnDiscard = document.createElement("button");
    btnDiscard.className = "btn btn-danger btn-block camp-btn-danger";
    btnDiscard.textContent = "⚠️ 冒険を最初からやり直す";
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

    state.party.forEach(char => {
      const card = document.createElement("div");
      card.className = "camp-status-card";
      
      const classJp = getClassJpName(char.class);
      const nextReq = char.class === "Ninja" ? Math.floor(EXP_LEVELS[char.level + 1] * 1.5) : EXP_LEVELS[char.level + 1];
      const nextText = nextReq ? `${char.exp}/${nextReq}` : `${char.exp}/MAX`;
      
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
          <span>攻撃力: <strong class="camp-val">+${getCharWeaponAtk(char)}</strong></span>
          <span>防御力(AC): <strong class="camp-val">${getCharDef(char)}</strong></span>
        </div>
        <div class="camp-status-card-exp">
          <span>EXP: <span class="exp-val">${nextText}</span></span>
        </div>
      `;
      statusGrid.appendChild(card);
    });

    body.appendChild(statusGrid);
  }

  overlay.appendChild(body);
}

export function triggerRunResult(reason) {
  if (!state.currentRun) return;
  
  state.currentRun.returnReason = reason;
  const isSuccess = reason !== "gameover";
  
  const danger = calculateDangerScore();
  state.currentRun.dangerScore = danger.score;
  state.currentRun.dangerRank = danger.rank;
  state.currentRun.dangerLabel = danger.label;

  let lostGold = 0;
  let lostUnidentifiedCount = 0;
  const lostItemsNames = [];
  if (!isSuccess) {
    lostGold = state.currentRun.goldGained;
    state.gold = Math.max(0, state.gold - lostGold);
    state.currentRun.goldGained = 0;
    
    const unidEquip = state.inventory.filter(item => typeof item === "object" && !item.identified);
    lostUnidentifiedCount = Math.ceil(unidEquip.length * 0.5);
    for (let i = 0; i < lostUnidentifiedCount; i++) {
      if (unidEquip.length === 0) break;
      const idx = Math.floor(Math.random() * unidEquip.length);
      const lostItem = unidEquip.splice(idx, 1)[0];
      lostItemsNames.push(lostItem.name || "未鑑定装備");
      const invIdx = state.inventory.indexOf(lostItem);
      if (invIdx !== -1) {
        state.inventory.splice(invIdx, 1);
      }
      const runEqIdx = state.currentRun.equipmentFound.indexOf(lostItem);
      if (runEqIdx !== -1) {
        state.currentRun.equipmentFound.splice(runEqIdx, 1);
      }
    }

    state.party.forEach(c => {
      c.status = "ok";
      c.hp = 1;
      c.mp = 0;
    });

    // 死亡履歴登録
    let cause = "不測の罠またはダメージ";
    if (state.combatState && state.combatState.monsters) {
      const activeEnemies = state.combatState.monsters.filter(m => m.hp > 0);
      if (activeEnemies.length > 0) {
        cause = activeEnemies[0].name.replace(/\s[A-Z]$/, "") + "との戦闘";
      }
    }
    const deathEntry = {
      id: "death_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      endedAt: Date.now(),
      floor: state.floor,
      x: state.x,
      y: state.y,
      seed: state.seed,
      cause: cause,
      partyLevelAvg: state.party.length > 0 ? Math.round(state.party.reduce((sum, c) => sum + c.level, 0) / state.party.length) : 1,
      deepestFloor: state.currentRun.deepestFloor,
      kills: state.currentRun.kills,
      chestsOpened: state.currentRun.chestsOpened,
      lostItems: lostItemsNames,
      note: "リルガミンの蘇生費用に注意"
    };
    if (!state.deathLogs) state.deathLogs = [];
    state.deathLogs.unshift(deathEntry);
    if (state.deathLogs.length > 20) {
      state.deathLogs.pop();
    }
  }

  // 図鑑スタッツの更新
  if (state.codex) {
    if (!state.codex.stats) {
      state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    }
    state.codex.stats.totalRuns++;
    if (!isSuccess) {
      state.codex.stats.totalDeaths++;
    }
    state.codex.stats.deepestFloor = Math.max(state.codex.stats.deepestFloor || 1, state.currentRun.deepestFloor);
    state.codex.stats.totalChests += state.currentRun.chestsOpened;
  }

  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.floor = 1;
  state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);

  const runSummary = {
    id: "run_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    endedAt: Date.now(),
    result: isSuccess ? "returned" : "failed",
    deepestFloor: state.currentRun.deepestFloor,
    kills: state.currentRun.kills,
    chestsOpened: state.currentRun.chestsOpened,
    dangerRank: danger.rank,
    goldGained: isSuccess ? state.currentRun.goldGained : 0,
    lostGold: lostGold,
    lostUnidentifiedCount: lostUnidentifiedCount,
    itemCount: state.currentRun.itemsFound.length + state.currentRun.equipmentFound.length,
    returnReason: reason
  };
  
  if (!state.runHistory) state.runHistory = [];
  state.runHistory.unshift(runSummary);
  if (state.runHistory.length > 20) {
    state.runHistory.pop();
  }

  state.gameState = "result";
  
  saveGame();
  saveAutosave();
  updateUI();
}

function calculateDangerScore() {
  if (!state.currentRun) return { score: 0, rank: "E", label: "安全な偵察" };
  let score = 0;
  score += state.currentRun.deepestFloor * 8;
  score += state.currentRun.battles * 2;
  score += state.currentRun.elitesKilled * 5;
  score += state.currentRun.bossesKilled * 15;
  score += state.currentRun.chestsOpened * 3;
  score += state.currentRun.trapsTriggered * 4;
  
  let deadCount = 0;
  let anomalyCount = 0;
  state.party.forEach(c => {
    if (c.status === "dead") deadCount++;
    else if (c.status !== "ok") anomalyCount++;
  });
  score += deadCount * 10;
  score += anomalyCount * 5;

  let rank = "E";
  let label = "安全な偵察";
  if (score >= 80) { rank = "S"; label = "無謀なる踏破"; }
  else if (score >= 55) { rank = "A"; label = "危険な遠征"; }
  else if (score >= 35) { rank = "B"; label = "深部探索"; }
  else if (score >= 20) { rank = "C"; label = "通常探索"; }
  else if (score >= 10) { rank = "D"; label = "小規模探索"; }
  
  return { score, rank, label };
}



