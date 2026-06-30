import { state } from "../state.js";
import { ITEMS, getItemData } from "../data.js";
import { goBackSubmenu } from "../navigation.js";
import { shopState } from "./shop_state.js";
import { SHOP_STOCK } from "./shop_stock.js";
import { getItemOwnership, getAppraisalCost } from "./shop_rules.js";
import { renderShopDetail } from "./shop_detail_view.js";

export function renderShop() {
  const overlay = document.getElementById("shop-overlay");
  if (!overlay) return;

  // 0. Save scroll position
  const existingList = document.querySelector(".shop-items-list");
  const savedScrollTop = existingList ? existingList.scrollTop : 0;

  overlay.innerHTML = "";

  // 1. Create header area (Sticky settings UI)
  const header = document.createElement("div");
  header.className = "shop-header-area";
  header.style.display = "flex";
  header.style.flexDirection = "column";
  header.style.gap = "8px";
  header.style.flexShrink = "0";

  // Row 1: Title and Close button
  const titleRow = document.createElement("div");
  titleRow.className = "shop-title-row";
  titleRow.style.display = "flex";
  titleRow.style.justifyContent = "space-between";
  titleRow.style.alignItems = "center";

  const title = document.createElement("span");
  title.className = "shop-title";
  title.textContent = "ボルタック商店";
  titleRow.appendChild(title);

  const btnClose = document.createElement("button");
  btnClose.id = "btn-shop-close";
  btnClose.className = "btn btn-danger";
  btnClose.style.minHeight = "44px";
  btnClose.style.padding = "0 16px";
  btnClose.textContent = "閉じる";
  btnClose.addEventListener("click", () => {
    goBackSubmenu();
  });
  titleRow.appendChild(btnClose);
  header.appendChild(titleRow);

  // Row 2: Status Bar
  const statusBar = document.createElement("div");
  statusBar.className = "shop-status-bar";
  statusBar.innerHTML = `
    <span class="shop-status-gold">💰 ${state.gold}G</span>
    <span class="shop-status-capacity">🎒 バッグ: ${state.inventory.length}/20</span>
  `;
  header.appendChild(statusBar);

  // Row 3: Shop Tabs (Mode Switcher)
  const tabRow = document.createElement("div");
  tabRow.className = "shop-tabs"; // Use existing class for styling
  tabRow.style.display = "flex";
  tabRow.style.gap = "6px";
  tabRow.style.width = "100%";

  const tabBuy = document.createElement("button");
  tabBuy.className = `shop-tab ${shopState.mode === "buy" ? "active" : ""}`;
  tabBuy.textContent = "🛡️ 買う";
  tabBuy.setAttribute("aria-pressed", shopState.mode === "buy" ? "true" : "false");
  tabBuy.addEventListener("click", () => {
    shopState.mode = "buy";
    shopState.filter = "all";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    shopState.lastAppraised = null;
    renderShop();
  });
  tabRow.appendChild(tabBuy);

  const tabSell = document.createElement("button");
  tabSell.className = `shop-tab ${shopState.mode === "sell" ? "active" : ""}`;
  tabSell.textContent = "💰 売る";
  tabSell.setAttribute("aria-pressed", shopState.mode === "sell" ? "true" : "false");
  tabSell.addEventListener("click", () => {
    shopState.mode = "sell";
    shopState.filter = "all";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    shopState.lastAppraised = null;
    renderShop();
  });
  tabRow.appendChild(tabSell);

  const tabAppraise = document.createElement("button");
  tabAppraise.className = `shop-tab ${shopState.mode === "appraise" ? "active" : ""}`;
  tabAppraise.textContent = "🔍 鑑定";
  tabAppraise.setAttribute("aria-pressed", shopState.mode === "appraise" ? "true" : "false");
  tabAppraise.addEventListener("click", () => {
    shopState.mode = "appraise";
    shopState.filter = "all";
    shopState.selectedKey = null;
    shopState.selectedIdx = -1;
    shopState.lastAppraised = null;
    renderShop();
  });
  tabRow.appendChild(tabAppraise);
  header.appendChild(tabRow);

  if (shopState.mode === "buy") {
    const notice = document.createElement("div");
    notice.className = "shop-notice";
    notice.style.fontSize = "11px";
    notice.style.color = "var(--neon-gold)";
    notice.style.textAlign = "center";
    notice.style.margin = "4px 0";
    notice.textContent = "強い装備は迷宮で手に入ります。";
    header.appendChild(notice);
  }

  // Row 4: Filter Row (if buy or sell)
  if (shopState.mode === "buy" || shopState.mode === "sell") {
    const filterRow = document.createElement("div");
    filterRow.className = "shop-filters";
    filterRow.style.display = "flex";
    filterRow.style.gap = "6px";
    filterRow.style.width = "100%";
    
    const categories = [
      { id: "all", label: "すべて" },
      { id: "usable", label: "道具" },
      { id: "weapon", label: "武器" },
      { id: "armor", label: "防具" }
    ];

    categories.forEach(cat => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isActive = shopState.filter === cat.id;
      chip.className = `filter-chip ${isActive ? "active" : ""}`;
      chip.textContent = cat.label;
      chip.style.flex = "1";
      chip.style.minHeight = "44px";
      chip.addEventListener("click", () => {
        shopState.filter = cat.id;
        shopState.selectedKey = null;
        shopState.selectedIdx = -1;
        shopState.lastAppraised = null;
        renderShop();
      });
      filterRow.appendChild(chip);
    });
    header.appendChild(filterRow);
  }

  overlay.appendChild(header);

  // 2. Create body
  const body = document.createElement("div");
  body.className = "shop-body";

  // 2.1 List Container
  const listContainer = document.createElement("div");
  listContainer.className = "shop-list-container";

  // Scrollable Items list
  const itemsList = document.createElement("div");
  itemsList.className = "shop-items-list";

  const TYPE_PRIORITIES = {
    usable: 0,
    weapon: 1,
    armor: 2,
    shield: 2,
    quest: 3
  };

  function getTypeDisplayName(type) {
    if (type === "usable") return "補給品";
    if (type === "weapon") return "予備武器";
    if (type === "armor" || type === "shield") return "予備防具";
    return "その他";
  }

  if (shopState.mode === "buy") {
    const filteredStock = SHOP_STOCK.filter(st => {
      const item = ITEMS[st.key];
      if (shopState.filter === "all") return true;
      if (shopState.filter === "weapon") return item.type === "weapon";
      if (shopState.filter === "armor") return item.type === "armor" || item.type === "shield";
      if (shopState.filter === "usable") return item.type === "usable";
      return true;
    });

    filteredStock.sort((a, b) => {
      const itemA = ITEMS[a.key];
      const itemB = ITEMS[b.key];
      const priA = TYPE_PRIORITIES[itemA.type] ?? 3;
      const priB = TYPE_PRIORITIES[itemB.type] ?? 3;
      return priA - priB;
    });

    let currentCategory = null;
    filteredStock.forEach(st => {
      const item = ITEMS[st.key];
      const itemCat = getTypeDisplayName(item.type);
      if (itemCat !== currentCategory) {
        currentCategory = itemCat;
        const heading = document.createElement("div");
        heading.className = "shop-list-heading";
        heading.textContent = currentCategory;
        itemsList.appendChild(heading);
      }

      const row = document.createElement("button");
      row.type = "button";
      const isSelected = shopState.selectedKey === st.key;
      row.className = `shop-item-row ${isSelected ? "selected" : ""}`;
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      row.style.minHeight = "44px";
      
      const goldCheck = state.gold < st.price;
      const bagCheck = state.inventory.length >= 20;
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "shop-item-name";
      
      const ownership = getItemOwnership(st.key);
      if (ownership.total > 0) {
        const nameText = document.createTextNode(item.name + " ");
        nameSpan.appendChild(nameText);
        
        const badge = document.createElement("span");
        badge.className = "shop-owned-badge";
        badge.textContent = `所持:${ownership.total}`;
        nameSpan.appendChild(badge);
      } else {
        nameSpan.textContent = item.name;
      }
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
        shopState.lastAppraised = null;

        const rows = itemsList.querySelectorAll(".shop-item-row");
        rows.forEach(r => {
          r.classList.remove("selected");
          r.setAttribute("aria-selected", "false");
        });
        row.classList.add("selected");
        row.setAttribute("aria-selected", "true");

        renderShopDetail();
      });

      itemsList.appendChild(row);
    });
  } else if (shopState.mode === "sell") {
    const mappedInventory = state.inventory.map((itemVal, idx) => {
      const item = getItemData(itemVal);
      return { itemVal, idx, item };
    });

    const filteredInventory = mappedInventory.filter(({ item }) => {
      if (!item) return false;
      if (shopState.filter === "all") return true;
      if (shopState.filter === "weapon") return item.type === "weapon";
      if (shopState.filter === "armor") return item.type === "armor" || item.type === "shield";
      if (shopState.filter === "usable") return item.type === "usable";
      return true;
    });

    filteredInventory.sort((a, b) => {
      const priA = TYPE_PRIORITIES[a.item.type] ?? 3;
      const priB = TYPE_PRIORITIES[b.item.type] ?? 3;
      return priA - priB;
    });

    if (filteredInventory.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = "売却できるアイテムがありません。";
      itemsList.appendChild(emptyMsg);
    } else {
      let currentCategory = null;
      filteredInventory.forEach(({ itemVal, idx, item }) => {
        const itemCat = getTypeDisplayName(item.type);
        if (itemCat !== currentCategory) {
          currentCategory = itemCat;
          const heading = document.createElement("div");
          heading.className = "shop-list-heading";
          heading.textContent = currentCategory;
          itemsList.appendChild(heading);
        }

        const value = Math.floor((item.price || 0) * 0.5);
        const row = document.createElement("button");
        row.type = "button";
        const isSelected = shopState.selectedIdx === idx;
        row.className = `shop-item-row ${isSelected ? "selected" : ""}`;
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
        row.style.minHeight = "44px";
        
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
            shopState.selectedKey = itemVal;
            shopState.selectedIdx = idx;
            shopState.lastAppraised = null;

            const rows = itemsList.querySelectorAll(".shop-item-row");
            rows.forEach(r => {
              r.classList.remove("selected");
              r.setAttribute("aria-selected", "false");
            });
            row.classList.add("selected");
            row.setAttribute("aria-selected", "true");

            renderShopDetail();
          }
        });

        itemsList.appendChild(row);
      });
    }
  } else if (shopState.mode === "appraise") {
    const unidentifiedItems = [];
    state.inventory.forEach((itemKey, idx) => {
      const isLastAppraised = shopState.lastAppraised && shopState.lastAppraised.idx === idx;
      if (isLastAppraised || (typeof itemKey === "object" && !itemKey.identified)) {
        unidentifiedItems.push({ itemKey, idx });
      }
    });

    unidentifiedItems.sort((a, b) => {
      const itemA = getItemData(a.itemKey);
      const itemB = getItemData(b.itemKey);
      const priA = TYPE_PRIORITIES[itemA.type] ?? 3;
      const priB = TYPE_PRIORITIES[itemB.type] ?? 3;
      return priA - priB;
    });

    if (unidentifiedItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = "未鑑定のアイテムがありません。";
      itemsList.appendChild(emptyMsg);
    } else {
      const heading = document.createElement("div");
      heading.className = "shop-list-heading";
      heading.textContent = "未鑑定品";
      itemsList.appendChild(heading);

      unidentifiedItems.forEach(({ itemKey, idx }) => {
        const isLastAppraised = shopState.lastAppraised && shopState.lastAppraised.idx === idx;
        const itemData = getItemData(itemKey);
        const cost = getAppraisalCost(itemKey);

        const row = document.createElement("button");
        row.type = "button";
        const isSelected = shopState.selectedIdx === idx;
        row.className = `shop-item-row ${isSelected ? "selected" : ""}`;
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
        row.style.minHeight = "44px";

        const nameSpan = document.createElement("span");
        nameSpan.className = "shop-item-name";
        
        if (isLastAppraised) {
          nameSpan.innerHTML = `${itemData.name} <span class="shop-owned-badge" style="border-color: var(--neon-green); color: var(--neon-green); background-color: rgba(0, 255, 102, 0.08);">鑑定済</span>`;
        } else {
          nameSpan.textContent = itemData.name;
        }
        row.appendChild(nameSpan);

        if (!isLastAppraised && state.gold < cost) {
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
          if (isLastAppraised) {
            shopState.selectedKey = itemKey;
            shopState.selectedIdx = idx;

            const rows = itemsList.querySelectorAll(".shop-item-row");
            rows.forEach(r => {
              r.classList.remove("selected");
              r.setAttribute("aria-selected", "false");
            });
            row.classList.add("selected");
            row.setAttribute("aria-selected", "true");

            renderShopDetail();
          } else {
            shopState.lastAppraised = null;
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

  // 2.2 Detail Panel
  const detailPanel = document.createElement("div");
  detailPanel.className = "shop-detail-panel";
  detailPanel.id = "shop-detail-panel";
  body.appendChild(detailPanel);

  overlay.appendChild(body);

  // Render detail contents
  renderShopDetail();

  // Restore scroll position safely
  requestAnimationFrame(() => {
    if (itemsList) {
      itemsList.scrollTop = savedScrollTop;
    }
  });
}
