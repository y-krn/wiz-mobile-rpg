import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem } from "./state.js";
import { ITEMS, getItemData, getItemBaseId, getCharAffixSum, getCharDerivedStats, getClassPassive } from "./data.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";
import { openSubmenu, goBackSubmenu, menuContext } from "./navigation.js";

export const SHOP_STOCK = [
  { key: "HEAL_POTION", price: 60 },
  { key: "ANTIDOTE", price: 80 },
  { key: "HOLY_WATER", price: 100 },
  { key: "MANA_POTION", price: 200 },
  { key: "TOWN_PORTAL", price: 100 },
  { key: "DAGGER", price: 50 },
  { key: "WAND", price: 120 },
  { key: "SHORT_SWORD", price: 150 },
  { key: "RAPIER", price: 180 },
  { key: "MACE", price: 100 },
  { key: "SACRED_MACE", price: 320 },
  { key: "NINJA_DAGGER", price: 300 },
  { key: "LONG_SWORD", price: 400 },
  { key: "CLAYMORE", price: 750 },
  { key: "KATANA", price: 1500 },
  { key: "SMALL_SHIELD", price: 80 },
  { key: "BUCKLER", price: 120 },
  { key: "LARGE_SHIELD", price: 250 },
  { key: "KNIGHT_SHIELD", price: 450 },
  { key: "ROBE", price: 30 },
  { key: "MAGE_CLOAK", price: 380 },
  { key: "LEATHER_ARMOR", price: 120 },
  { key: "EXPLORER_CLOAK", price: 160 },
  { key: "NINJA_SUIT", price: 250 },
  { key: "SCALE_MAIL", price: 220 },
  { key: "CHAIN_MAIL", price: 350 },
  { key: "PRIEST_ROBE", price: 500 },
  { key: "PLATE_MAIL", price: 900 }
];

export function getItemOwnership(key) {
  let bagCount = 0;
  let equippedCount = 0;

  state.inventory.forEach(item => {
    if (item) {
      if (getItemBaseId(item) === key) bagCount++;
    }
  });

  state.party.forEach(char => {
    if (char && char.equipment) {
      Object.values(char.equipment).forEach(eq => {
        if (eq) {
          if (getItemBaseId(eq) === key) equippedCount++;
        }
      });
    }
  });

  const total = bagCount + equippedCount;
  return { total, bagCount, equippedCount };
}

export let shopState = {
  mode: "buy", // "buy" or "sell"
  filter: "all", // "all", "weapon", "armor", "usable"
  selectedKey: null,
  selectedIdx: -1,
  lastAppraised: null // { idx, beforeName }
};

function getAppraisalCost(eqItem) {
  const rarity = eqItem.rarity || "magic";
  const baseCost = { magic: 30, rare: 120, epic: 300 }[rarity] || 30;
  const bestDiscount = state.party.reduce((max, char) => {
    if (char.status === "dead") return max;
    return Math.max(max, getCharAffixSum(char, "identifyDiscount"));
  }, 0);
  return Math.max(1, Math.floor(baseCost * (1 - bestDiscount / 100)));
}

const DERIVED_COMPARE_ROWS = [
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "magic", label: "魔力" },
  { key: "healing", label: "回復" },
  { key: "speed", label: "速度" },
  { key: "trap", label: "罠解除" },
  { key: "treasure", label: "探宝" }
];

const SYNERGY_AFFIX_LABELS = {
  followUp: "追撃適性あり",
  arcane: "魔導適性あり",
  devotion: "祈祷適性あり",
  guardian: "守護適性あり",
  treasureSense: "探宝適性あり",
  trapBonus: "罠解除適性あり",
  antiUndead: "不死祓い適性あり",
  poisonWard: "毒避け適性あり",
  firstStrike: "先制適性あり"
};

function getEquipmentPreview(char, eqItem) {
  const item = getItemData(eqItem);
  if (!item || !["weapon", "shield", "armor"].includes(item.type)) return null;

  const current = getCharDerivedStats(char);
  const slot = item.type;
  const oldEq = char.equipment[slot];
  char.equipment[slot] = eqItem;
  const next = getCharDerivedStats(char);
  char.equipment[slot] = oldEq;

  const diffs = DERIVED_COMPARE_ROWS
    .map(row => ({ ...row, diff: next[row.key] - current[row.key] }))
    .filter(row => row.diff !== 0);

  const passive = getClassPassive(char);
  const itemAffixTypes = new Set((eqItem.affixes || []).map(aff => aff.type));
  const synergies = Object.keys(passive.bonuses)
    .filter(type => itemAffixTypes.has(type) && SYNERGY_AFFIX_LABELS[type])
    .map(type => SYNERGY_AFFIX_LABELS[type]);

  return { diffs, synergies };
}

function formatEquipmentPreview(preview) {
  if (!preview) return "差分なし";
  const diffText = preview.diffs.length > 0
    ? preview.diffs.slice(0, 4).map(row => `${row.label}${row.diff > 0 ? "+" : ""}${row.diff}`).join(" / ")
    : "主要差分なし";
  if (preview.synergies.length === 0) return diffText;
  return `${diffText} / ${preview.synergies.join(" / ")}`;
}

export function openShopAppraise() {
  shopState.mode = "appraise";
  shopState.selectedKey = null;
  shopState.selectedIdx = -1;
  shopState.lastAppraised = null;
  openSubmenu("shop_main", "ボルタック商店 - 鑑定：");
}

export function renderShop() {
  const overlay = document.getElementById("shop-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  // 1. Create header (only title)
  const header = document.createElement("div");
  header.className = "shop-header";
  
  const title = document.createElement("span");
  title.className = "shop-title";
  title.textContent = "ボルタック商店";
  header.appendChild(title);
  
  overlay.appendChild(header);

  // 2. Create body
  const body = document.createElement("div");
  body.className = "shop-body";

  // 2.1 Left Column: List Container
  const listContainer = document.createElement("div");
  listContainer.className = "shop-list-container";
  listContainer.style.maxHeight = "none";
  listContainer.style.flexShrink = "0";

  // Filters row (only for Buy and Sell mode) - moved directly above list
  if (shopState.mode === "buy" || shopState.mode === "sell") {
    const filterRow = document.createElement("div");
    filterRow.className = "shop-filters";
    filterRow.style.display = "flex";
    filterRow.style.gap = "6px";
    filterRow.style.marginBottom = "8px";
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
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
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
    listContainer.appendChild(filterRow);
  }

  // Scrollable Items list
  const itemsList = document.createElement("div");
  itemsList.className = "shop-items-list";
  itemsList.style.maxHeight = "160px";

  const TYPE_PRIORITIES = {
    usable: 0,
    weapon: 1,
    armor: 2,
    shield: 2,
    quest: 3
  };

  function getTypeDisplayName(type) {
    if (type === "usable") return "道具";
    if (type === "weapon") return "武器";
    if (type === "armor" || type === "shield") return "防具";
    return "その他";
  }

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

    // Sort stock: usable -> weapon -> armor/shield -> other
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
        renderShop();
      });

      itemsList.appendChild(row);
    });
  } else if (shopState.mode === "sell") {
    // Selling Mode: list player inventory mapped to preserve index
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

    // Sort inventory: usable -> weapon -> armor/shield -> other
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
            renderShop();
          }
        });

        itemsList.appendChild(row);
      });
    }
  } else if (shopState.mode === "appraise") {
    // Appraise Mode: include the last appraised item so it doesn't instantly vanish
    const unidentifiedItems = [];
    state.inventory.forEach((itemKey, idx) => {
      const isLastAppraised = shopState.lastAppraised && shopState.lastAppraised.idx === idx;
      if (isLastAppraised || (typeof itemKey === "object" && !itemKey.identified)) {
        unidentifiedItems.push({ itemKey, idx });
      }
    });

    // Sort unidentified items by actual identified type
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

  // 2.2 Right/Bottom Column: Detail Panel
  const detailPanel = document.createElement("div");
  detailPanel.className = "shop-detail-panel";
  detailPanel.id = "shop-detail-panel";
  detailPanel.style.minHeight = "100px";

  const hasSelected = (shopState.mode === "buy" && shopState.selectedKey) || 
                       (shopState.mode === "sell" && shopState.selectedIdx !== -1) ||
                       (shopState.mode === "appraise" && shopState.selectedIdx !== -1);

  let actionBtn = null;

  if (shopState.mode === "appraise" && shopState.lastAppraised) {
    // ----------------------------------------------------
    // Custom Appraised Result Panel
    // ----------------------------------------------------
    const appraisedIdx = shopState.lastAppraised.idx;
    const eqItem = state.inventory[appraisedIdx];
    if (eqItem) {
      const item = getItemData(eqItem);
      
      const scrollContent = document.createElement("div");
      scrollContent.className = "detail-scroll-content";

      // 1. Detail Header (Title: 鑑定結果)
      const detailHeader = document.createElement("div");
      detailHeader.className = "detail-header";
      detailHeader.style.borderBottom = "1px solid var(--neon-green)";
      detailHeader.innerHTML = `
        <div style="font-size: 10px; color: var(--neon-green); font-weight: bold; text-shadow: 0 0 2px rgba(0, 255, 102, 0.3);">✨ 鑑定結果</div>
        <div class="detail-name" style="color: #fff; text-shadow: none; font-size: 15px; margin-top: 2px;">
          ${shopState.lastAppraised.beforeName} ➔ <span style="color: var(--neon-green); font-weight: bold; text-shadow: 0 0 4px rgba(0, 255, 102, 0.4);">${item.name}</span>
        </div>
      `;
      scrollContent.appendChild(detailHeader);

      // 2. Stats and Rarity Info
      const statsDiv = document.createElement("div");
      statsDiv.className = "detail-stats";
      
      let typeJp = "貴重品";
      if (item.type === "usable") typeJp = "消費アイテム";
      else if (item.type === "weapon") typeJp = "武器";
      else if (item.type === "shield") typeJp = "盾";
      else if (item.type === "armor") typeJp = "鎧";

      const sellPrice = Math.floor((item.price || 0) * 0.5);
      const rarityJp = { magic: "MAGIC", rare: "RARE", epic: "EPIC" }[eqItem.rarity || "magic"] || "NORMAL";
      const rarityColor = { magic: "var(--neon-cyan)", rare: "var(--neon-gold)", epic: "var(--neon-purple)" }[eqItem.rarity || "magic"] || "var(--text-muted)";

      statsDiv.innerHTML = `
        <div class="detail-stat-row">
          <span>アイテム種別:</span>
          <span>${typeJp}</span>
        </div>
        <div class="detail-stat-row">
          <span>レアリティ:</span>
          <span style="color: ${rarityColor}; font-weight: bold; text-shadow: 0 0 2px ${rarityColor}55;">${rarityJp}</span>
        </div>
        <div class="detail-stat-row">
          <span>売却価値:</span>
          <span style="color: var(--neon-gold); font-weight: bold;">${sellPrice}G</span>
        </div>
      `;
      scrollContent.appendChild(statsDiv);

      // 3. Stats details and Comparisons
      if (item.type === "weapon" || item.type === "armor" || item.type === "shield") {
        const equipStatsDiv = document.createElement("div");
        equipStatsDiv.className = "detail-stats";
        let statLabel = item.type === "weapon" ? "攻撃力" : "防御力";
        let statVal = item.type === "weapon" ? item.atk : item.def;
        equipStatsDiv.innerHTML = `
          <div class="detail-stat-row">
            <span>${statLabel}:</span>
            <span class="detail-stat-val">+${statVal}</span>
          </div>
        `;
        scrollContent.appendChild(equipStatsDiv);

        // 🔮 付与アフィックスの表示を追加
        if (eqItem.affixes && eqItem.affixes.length > 0) {
          const affixesDiv = document.createElement("div");
          affixesDiv.className = "detail-compat";
          affixesDiv.style.marginTop = "6px";
          affixesDiv.style.marginBottom = "6px";
          
          let affList = eqItem.affixes.map(aff => {
            const label = {
              atk: "攻撃力", def: "防御力", hp: "最大HP", mp: "最大MP",
              str: "力", int: "知恵", pie: "信仰", vit: "生命", agi: "素早さ", luk: "運",
              trapBonus: "罠解除率", followUp: "追加攻撃率", arcane: "呪文威力",
              devotion: "回復威力", guardian: "守護", treasureSense: "宝探",
              antiUndead: "不死祓い", antiDragon: "竜殺し", spellGuard: "魔除け",
              poisonWard: "毒避け", firstStrike: "先制"
            }[aff.type] || aff.type;
            const unit = ["trapBonus", "followUp", "arcane", "devotion", "guardian", "treasureSense", "antiUndead", "antiDragon", "spellGuard", "poisonWard"].includes(aff.type) ? "%" : "";
            return `<div style="font-size: 11px; margin-bottom: 2px;">・${label}: <strong style="color:var(--neon-green)">+${aff.value}${unit}</strong></div>`;
          }).join("");
          
          affixesDiv.innerHTML = `
            <div class="compat-title">🔮 付与アフィックス</div>
            <div style="padding: 4px 8px; color: #eee;">${affList}</div>
          `;
          scrollContent.appendChild(affixesDiv);
        }

        const compatDiv = document.createElement("div");
        compatDiv.className = "detail-compat";
        compatDiv.innerHTML = `<div class="compat-title">おすすめ</div>`;

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
            const preview = getEquipmentPreview(char, eqItem);
            const bestDiff = preview?.diffs[0]?.diff || 0;
            const diffText = formatEquipmentPreview(preview);
            const resultClass = bestDiff > 0 ? "upgrade" : (bestDiff < 0 ? "downgrade" : "ok");

            row.innerHTML = `
              <span class="compat-name">${char.name}</span>
              <span class="compat-result ${resultClass}">🟢 ${diffText}</span>
            `;
          }
          compatDiv.appendChild(row);
        });
        scrollContent.appendChild(compatDiv);
      }

      // 4. Detail Description
      const detailDesc = document.createElement("div");
      detailDesc.className = "detail-desc";
      detailDesc.style.marginTop = "8px";
      detailDesc.textContent = item.desc || "特別な効果はありません。";
      scrollContent.appendChild(detailDesc);

      detailPanel.appendChild(scrollContent);

      const appraisedActions = document.createElement("div");
      appraisedActions.className = "shop-detail-actions";

      const btnNext = document.createElement("button");
      btnNext.className = "btn btn-neon";
      btnNext.style.flex = "1";
      btnNext.style.minHeight = "44px";

      const nextItemIdx = state.inventory.findIndex((it, i) => i !== appraisedIdx && typeof it === "object" && !it.identified);
      if (nextItemIdx !== -1) {
        btnNext.textContent = "🔮 次を鑑定";
        btnNext.addEventListener("click", () => {
          shopState.lastAppraised = null;
          shopState.selectedKey = state.inventory[nextItemIdx];
          shopState.selectedIdx = nextItemIdx;
          renderShop();
        });
      } else {
        btnNext.textContent = "✅ 鑑定完了";
        btnNext.addEventListener("click", () => {
          shopState.lastAppraised = null;
          shopState.selectedKey = null;
          shopState.selectedIdx = -1;
          renderShop();
        });
      }
      appraisedActions.appendChild(btnNext);

      const btnToSell = document.createElement("button");
      btnToSell.className = "btn btn-danger";
      btnToSell.style.flex = "1";
      btnToSell.style.minHeight = "44px";
      btnToSell.textContent = "💰 売却へ";
      btnToSell.addEventListener("click", () => {
        const itemVal = state.inventory[appraisedIdx];
        shopState.lastAppraised = null;
        shopState.mode = "sell";
        shopState.filter = "all";
        shopState.selectedKey = itemVal;
        shopState.selectedIdx = appraisedIdx;
        renderShop();
      });
      appraisedActions.appendChild(btnToSell);

      detailPanel.appendChild(appraisedActions);
    }
  } else if (!hasSelected) {
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
      itemPrice = getAppraisalCost(eqItem);
    }

    // Create scrollable content container
    const scrollContent = document.createElement("div");
    scrollContent.className = "detail-scroll-content";

    // 1. Detail Header (Name)
    const detailHeader = document.createElement("div");
    detailHeader.className = "detail-header";
    detailHeader.innerHTML = `<div class="detail-name">${item.name}</div>`;
    scrollContent.appendChild(detailHeader);

    // 2. Stats (if weapon or armor/shield) - moved to top
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

      // 3. Compatibility and comparisons
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

    // 4. Detail Ownership (Only for BUY mode) - moved to top
    if (shopState.mode === "buy") {
      const ownership = getItemOwnership(itemKey);
      const ownershipDiv = document.createElement("div");
      ownershipDiv.className = "detail-ownership";
      ownershipDiv.style.marginTop = "8px";
      ownershipDiv.style.padding = "6px 8px";
      ownershipDiv.style.backgroundColor = "rgba(18, 18, 24, 0.6)";
      ownershipDiv.style.border = "1px solid #22222d";
      ownershipDiv.style.borderRadius = "4px";
      ownershipDiv.style.fontSize = "11px";
      ownershipDiv.style.color = "var(--text-muted)";
      ownershipDiv.style.fontFamily = "var(--font-mono)";

      let ownershipHtml = `<div>所持数: <span style="color: ${ownership.total > 0 ? "var(--neon-cyan)" : "inherit"}; font-weight: bold;">${ownership.total}個</span></div>`;
      if (ownership.total > 0) {
        ownershipHtml += `<div style="font-size: 9px; margin-top: 2px; color: var(--text-muted);">（バッグ: ${ownership.bagCount}個 / 装備中: ${ownership.equippedCount}個）</div>`;
      }
      ownershipDiv.innerHTML = ownershipHtml;
      scrollContent.appendChild(ownershipDiv);
    }

    // 5. Detail Description - moved to bottom
    const detailDesc = document.createElement("div");
    detailDesc.className = "detail-desc";
    detailDesc.style.marginTop = "8px";
    detailDesc.textContent = item.desc || "特別な効果はありません。";
    scrollContent.appendChild(detailDesc);

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
        actionBtn.classList.add("disabled");
        if (bagCheck) {
          actionBtn.textContent = "バッグが満杯です";
        } else {
          actionBtn.textContent = "ゴールド不足";
        }
      }

      actionBtn.addEventListener("click", () => {
        const added = addInventoryItem(itemKey);
        if (!added) {
          addLog("バッグがいっぱいで購入できません。");
          return;
        }
        state.gold -= itemPrice;
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
      const hasTicket = (state.identifyTickets || 0) > 0;
      actionBtn.className = `btn btn-block shop-action-btn btn-neon`;
      if (hasTicket) {
        actionBtn.textContent = `鑑定する (割引券: 残${state.identifyTickets}枚)`;
      } else {
        actionBtn.textContent = `鑑定する (${itemPrice}G)`;
      }

      const goldCheck = state.gold < itemPrice;
      if (goldCheck && !hasTicket) {
        actionBtn.disabled = true;
        actionBtn.classList.add("disabled");
        actionBtn.textContent = "ゴールド不足";
      }

      actionBtn.addEventListener("click", () => {
        if (hasTicket) {
          state.identifyTickets = Math.max(0, state.identifyTickets - 1);
        } else {
          state.gold -= itemPrice;
        }
        
        const eqItem = state.inventory[shopState.selectedIdx];
        const beforeName = getItemData(eqItem).name;

        eqItem.identified = true;
        const resultItem = getItemData(eqItem);

        playSound("level_up");
        addLog(`鑑定成功！未鑑定のアイテムは [${resultItem.name}] だった！`);
        saveAutosave();

        // Save appraisal results
        shopState.lastAppraised = {
          idx: shopState.selectedIdx,
          beforeName: beforeName
        };

        const goldLabel = document.getElementById("gold-counter");
        if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

        renderShop();
        updateUI();
      });
    }

    if (actionBtn) {
      actionBtn.style.minHeight = "44px";
      detailPanel.appendChild(actionBtn);
    }
  }

  body.appendChild(detailPanel);
  overlay.appendChild(body);

  // 3. Create Bottom Actions Panel (Sticky comfort UI)
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  // 3.1 Status Bar row: [GOLD: 820G] [バッグ: 12/20]
  const statusBar = document.createElement("div");
  statusBar.className = "shop-status-bar";
  statusBar.innerHTML = `
    <span class="shop-status-gold">💰 ${state.gold}G</span>
    <span class="shop-status-capacity">🎒 バッグ: ${state.inventory.length}/20</span>
  `;
  footer.appendChild(statusBar);

  // 3.2 Tabs row: [買う] [売る] [鑑定]
  const tabRow = document.createElement("div");
  tabRow.className = "bottom-actions-row";
  
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
  footer.appendChild(tabRow);

  // 3.3 Close button row
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";
  
  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.style.width = "100%";
  btnClose.style.minHeight = "44px";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", () => {
    goBackSubmenu();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}
