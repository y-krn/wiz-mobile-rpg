import { state } from "../state.js";
import { ITEMS, getItemData, getItemBaseId } from "../data.js";
import { shopState } from "./shop_state.js";
import { getAppraisalCost, getItemOwnership, getEquipmentPreview, formatEquipmentPreview } from "./shop_rules.js";
import { executeHalfAppraise, executeFullAppraise } from "./appraisal.js";
import { executePurchase, executeSale } from "./purchase.js";
import { renderShop } from "./shop_view.js";
import { SHOP_STOCK } from "./shop_stock.js";
import { updateUI } from "../ui.js";

export function renderShopDetail() {
  const detailPanel = document.getElementById("shop-detail-panel");
  if (!detailPanel) return;
  detailPanel.innerHTML = "";

  const hasSelected = (shopState.mode === "buy" && shopState.selectedKey) || 
                       (shopState.mode === "sell" && shopState.selectedIdx !== -1) ||
                       (shopState.mode === "appraise" && shopState.selectedIdx !== -1);

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
              poisonWard: "毒避け", firstStrike: "先制", antiDemon: "悪魔対策"
            }[aff.type] || aff.type;
            const unit = ["trapBonus", "followUp", "arcane", "devotion", "guardian", "treasureSense", "antiUndead", "antiDragon", "spellGuard", "poisonWard", "antiDemon"].includes(aff.type) ? "%" : "";
            return `<div style="font-size: 11px; margin-bottom: 2px;">・${label}: <strong style="color:var(--neon-green)">+${aff.value}${unit}</strong></div>`;
          }).join("");
          
          affixesDiv.innerHTML = `
            <div class="compat-title">🔮 付与アフィックス</div>
            <div style="padding: 4px 8px; color: #eee;">${affList}</div>
          `;
          scrollContent.appendChild(affixesDiv);
        }

        // ✨ 刻印の表示を追加
        if (eqItem.inscription) {
          const insDiv = document.createElement("div");
          insDiv.className = "detail-compat";
          insDiv.style.marginTop = "6px";
          insDiv.style.marginBottom = "6px";
          const inscriptionLabel = {
            poisonWard: "毒避け",
            antiUndead: "不死祓い",
            spellGuard: "魔除け",
            antiDemon: "悪魔対策",
            antiDragon: "竜殺し"
          }[eqItem.inscription.type] || eqItem.inscription.type;
          insDiv.innerHTML = `
            <div class="compat-title">✨ 刻印</div>
            <div style="padding: 4px 8px; color: #eee; font-size: 11px;">
              ・${eqItem.inscription.name} (${inscriptionLabel}): <strong style="color:var(--neon-green)">+${eqItem.inscription.value}%</strong>
            </div>
          `;
          scrollContent.appendChild(insDiv);
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
          updateUI();
        });
      } else {
        btnNext.textContent = "✅ 鑑定完了";
        btnNext.addEventListener("click", () => {
          shopState.lastAppraised = null;
          shopState.selectedKey = null;
          shopState.selectedIdx = -1;
          renderShop();
          updateUI();
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
        updateUI();
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
      
      const statLabel = item.type === "weapon" ? "攻撃力" : "防御力";
      const statVal = item.type === "weapon" ? item.atk : item.def;

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

          let diffText;
          let resultClass;
          
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

    // 4. Detail Ownership
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
    } else if (shopState.mode === "sell") {
      const originalItemKey = state.inventory[shopState.selectedIdx];
      const baseKey = getItemBaseId(originalItemKey);
      const ownership = getItemOwnership(baseKey);
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

      let ownershipHtml = `<div>所持数: <span style="color: var(--neon-cyan); font-weight: bold;">${ownership.total}個</span></div>`;
      ownershipHtml += `<div style="font-size: 9px; margin-top: 2px; color: var(--text-muted);">（バッグ: ${ownership.bagCount}個 / 装備中: ${ownership.equippedCount}個）</div>`;
      ownershipDiv.innerHTML = ownershipHtml;
      scrollContent.appendChild(ownershipDiv);
    }

    // 5. Detail Description
    const detailDesc = document.createElement("div");
    detailDesc.className = "detail-desc";
    detailDesc.style.marginTop = "8px";
    detailDesc.textContent = item.desc || "特別な効果はありません。";
    scrollContent.appendChild(detailDesc);

    detailPanel.appendChild(scrollContent);

    // Confirm button
    const actionBtn = document.createElement("button");
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
        if (executePurchase(itemKey, itemPrice)) {
          renderShop();
          updateUI();
        }
      });
    } else if (shopState.mode === "sell") {
      const originalItemKey = state.inventory[shopState.selectedIdx];
      const isUnidentified = (typeof originalItemKey === "object" && originalItemKey !== null && !originalItemKey.identified);

      actionBtn.className = `btn btn-block shop-action-btn btn-danger`;
      if (isUnidentified) {
        actionBtn.textContent = `売却不可 (未鑑定)`;
        actionBtn.disabled = true;
        actionBtn.classList.add("disabled");
      } else {
        actionBtn.textContent = `売却する (+${itemPrice}G)`;

        actionBtn.addEventListener("click", () => {
          if (executeSale(shopState.selectedIdx, itemPrice)) {
            renderShop();
            updateUI();
          }
        });
      }
    } else { // appraise
      const eqItem = state.inventory[shopState.selectedIdx];
      const hasTicket = (state.identifyTickets || 0) > 0;
      const fullCost = itemPrice;

      // 1. 完全鑑定ボタン
      const fullBtn = document.createElement("button");
      fullBtn.className = `btn btn-block shop-action-btn btn-neon`;
      fullBtn.style.minHeight = "44px";
      if (hasTicket) {
        fullBtn.textContent = `完全鑑定する (割引券: 残${state.identifyTickets}枚)`;
      } else {
        fullBtn.textContent = `完全鑑定する (${fullCost}G)`;
      }

      const goldCheck = state.gold < fullCost;
      if (goldCheck && !hasTicket) {
        fullBtn.disabled = true;
        fullBtn.classList.add("disabled");
        fullBtn.textContent = "完全鑑定: ゴールド不足";
      }

      fullBtn.addEventListener("click", () => {
        const cost = getAppraisalCost(eqItem);
        const hasTicketVal = (state.identifyTickets || 0) > 0;
        if (executeFullAppraise(shopState.selectedIdx, cost, hasTicketVal)) {
          renderShop();
          updateUI();
        }
      });
      detailPanel.appendChild(fullBtn);

      // 2. 簡易鑑定ボタン
      if (eqItem && !eqItem.halfIdentified) {
        const halfCost = Math.max(10, Math.floor(fullCost * 0.3));
        const halfBtn = document.createElement("button");
        halfBtn.className = `btn btn-block shop-action-btn btn-warning`;
        halfBtn.style.minHeight = "44px";
        halfBtn.style.marginTop = "8px";
        halfBtn.textContent = `簡易鑑定する (${halfCost}G)`;

        const halfGoldCheck = state.gold < halfCost;
        if (halfGoldCheck) {
          halfBtn.disabled = true;
          halfBtn.classList.add("disabled");
          halfBtn.textContent = "簡易鑑定: ゴールド不足";
        }

        halfBtn.addEventListener("click", () => {
          if (executeHalfAppraise(shopState.selectedIdx, halfCost)) {
            renderShop();
            updateUI();
          }
        });
        detailPanel.appendChild(halfBtn);
      }

      // Hide the default actionBtn
      actionBtn.style.display = "none";
    }

    if (actionBtn) {
      actionBtn.style.minHeight = "44px";
      detailPanel.appendChild(actionBtn);
    }
  }
}
