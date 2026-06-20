import { state, saveAutosave, addLog, recordEquipmentDiscovery } from "./state.js";
import { ITEMS, getItemData } from "./data.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";
import { openSubmenu, goBackSubmenu, menuContext } from "./menu.js";

export const SHOP_STOCK = [
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

export let shopState = {
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

  // Note: btnClose is no longer in header, we move it to bottom-actions
  overlay.appendChild(header);

  // 2. Create body
  const body = document.createElement("div");
  body.className = "shop-body";

  // 2.1 Left Column: List Container
  const listContainer = document.createElement("div");
  listContainer.className = "shop-list-container";
  listContainer.style.maxHeight = "none"; // allow natural flow in vertical layout
  listContainer.style.flexShrink = "0";

  // Scrollable Items list
  const itemsList = document.createElement("div");
  itemsList.className = "shop-items-list";
  itemsList.style.maxHeight = "160px"; // Constrain height to leave space for details

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
      row.style.minHeight = "44px"; // Ensure 44px
      
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
        row.style.minHeight = "44px"; // Ensure 44px
        
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
  } else if (shopState.mode === "appraise") {
    // Appraise Mode
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
        row.style.minHeight = "44px"; // Ensure 44px

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

  // 2.2 Right/Bottom Column: Detail Panel
  const detailPanel = document.createElement("div");
  detailPanel.className = "shop-detail-panel";
  detailPanel.id = "shop-detail-panel";
  detailPanel.style.minHeight = "100px";

  const hasSelected = (shopState.mode === "buy" && shopState.selectedKey) || 
                       (shopState.mode === "sell" && shopState.selectedIdx !== -1) ||
                       (shopState.mode === "appraise" && shopState.selectedIdx !== -1);

  let actionBtn = null; // Will create if hasSelected

  if (!hasSelected) {
    detailPanel.innerHTML = `<div class="detail-placeholder">取引するアイテムを<br>選択してください</div>`;
  } else {
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
    actionBtn = document.createElement("button");
    actionBtn.className = `btn btn-block shop-action-btn`;
    
    if (shopState.mode === "buy") {
      actionBtn.className = `btn btn-block shop-action-btn btn-neon`;
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
        
        const nextBagCheck = state.inventory.length >= 20;
        if (nextBagCheck) {
          shopState.selectedKey = null;
        }
        
        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;
        
        renderShop();
        updateUI();
      });
    } else if (shopState.mode === "sell") {
      actionBtn.className = `btn btn-block shop-action-btn btn-danger`;
      actionBtn.textContent = `売却する (+${itemPrice}G)`;

      actionBtn.addEventListener("click", () => {
        state.gold += itemPrice;
        state.inventory.splice(shopState.selectedIdx, 1);
        playSound("gold");
        addLog(`${item.name}を${itemPrice}ゴールドで売却した。`);
        saveAutosave();

        shopState.selectedKey = null;
        shopState.selectedIdx = -1;

        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

        renderShop();
        updateUI();
      });
    } else { // appraise
      actionBtn.className = `btn btn-block shop-action-btn btn-neon`;
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

        shopState.selectedKey = null;
        shopState.selectedIdx = -1;

        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

        renderShop();
        updateUI();
      });
    }
  }

  body.appendChild(detailPanel);
  overlay.appendChild(body);

  // 3. Create Bottom Actions Panel (Sticky comfort UI)
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  // 3.1 Tabs row
  const tabRow = document.createElement("div");
  tabRow.className = "bottom-actions-row";
  
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
  tabRow.appendChild(tabBuy);

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
  tabRow.appendChild(tabSell);

  const tabAppraise = document.createElement("button");
  tabAppraise.className = `shop-tab ${shopState.mode === "appraise" ? "active" : ""}`;
  tabAppraise.textContent = "🔍 鑑定";
  tabAppraise.setAttribute("aria-pressed", shopState.mode === "appraise" ? "true" : "false");
  tabAppraise.addEventListener("click", () => {
    shopState.mode = "appraise";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    renderShop();
  });
  tabRow.appendChild(tabAppraise);
  footer.appendChild(tabRow);

  // 3.2 Filters row (only for Buy mode)
  if (shopState.mode === "buy") {
    const filterRow = document.createElement("div");
    filterRow.className = "bottom-actions-row";
    
    const categories = [
      { id: "all", label: "すべて" },
      { id: "weapon", label: "武器" },
      { id: "armor", label: "防具" },
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
      filterRow.appendChild(chip);
    });
    footer.appendChild(filterRow);
  }

  // 3.3 Confirm button row
  if (actionBtn) {
    const actionRow = document.createElement("div");
    actionRow.className = "bottom-actions-row";
    actionRow.appendChild(actionBtn);
    footer.appendChild(actionRow);
  }

  // 3.4 Close button row
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";
  
  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.style.width = "100%";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", () => {
    goBackSubmenu();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}
