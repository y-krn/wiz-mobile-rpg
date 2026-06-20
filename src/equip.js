import { state, saveAutosave, addLog, getCharWeaponAtk, getCharDef } from "./state.js";
import { 
  DIR_N, START_X, START_Y, 
  getClassJpName, getCharMaxHp, getCharMaxMp, getItemData, getCharStr,
  getCharInt, getCharPie, getCharVit, getCharAgi, getCharLuk, getCharTrapBonus
} from "./data.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";

export let equipState = {
  actorIdx: 0,
  filter: "all",
  selectedKey: null,
  selectedIdx: -1,
  selectedSlot: null,
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
  equipState.selectedSlot = null;
  
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

function isEquipmentItem(item) {
  return item && (item.type === "weapon" || item.type === "shield" || item.type === "armor");
}

function getDisplayStats(char) {
  return {
    atk: getCharWeaponAtk(char) + getCharStr(char),
    def: getCharDef(char),
    hp: getCharMaxHp(char),
    mp: getCharMaxMp(char),
    str: getCharStr(char),
    int: getCharInt(char),
    pie: getCharPie(char),
    vit: getCharVit(char),
    agi: getCharAgi(char),
    luk: getCharLuk(char),
    trap: Math.round(getCharTrapBonus(char) * 100)
  };
}

function getEquipPreview(char, itemKey) {
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) return null;

  const current = getDisplayStats(char);
  const slot = item.type;
  const oldEq = char.equipment[slot];
  char.equipment[slot] = itemKey;
  const next = getDisplayStats(char);
  char.equipment[slot] = oldEq;

  const rows = [
    { key: "atk", label: "攻撃力" },
    { key: "def", label: "防御力" },
    { key: "hp", label: "最大HP" },
    { key: "mp", label: "最大MP" },
    { key: "str", label: "力" },
    { key: "int", label: "知恵" },
    { key: "pie", label: "信仰" },
    { key: "vit", label: "生命" },
    { key: "agi", label: "素早さ" },
    { key: "luk", label: "運" },
    { key: "trap", label: "罠解除", unit: "%" }
  ].map((stat) => ({
    ...stat,
    current: current[stat.key],
    next: next[stat.key],
    diff: next[stat.key] - current[stat.key]
  }));

  const primaryKey = slot === "weapon" ? "atk" : "def";
  const primaryDiff = rows.find((row) => row.key === primaryKey)?.diff ?? 0;
  return { item, slot, rows, primaryDiff };
}

export function renderEquip() {
  const overlay = document.getElementById("equip-overlay");
  if (!overlay) return;
  
  // Clear container
  overlay.innerHTML = "";
  
  const char = state.party[equipState.actorIdx];
  if (!char) {
    closeEquipOverlay();
    return;
  }

  const slots = [
    { id: "weapon", label: "武器" },
    { id: "shield", label: "盾" },
    { id: "armor", label: "鎧" }
  ];
  
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
  
  overlay.appendChild(header);

  // 2. Character summary (Top content - slots grid deleted)
  const summaryPanel = document.createElement("div");
  summaryPanel.className = "equip-summary-panel";
  summaryPanel.style.padding = "8px";
  summaryPanel.style.backgroundColor = "#121216";
  summaryPanel.style.borderBottom = "1px solid var(--border-color)";
  summaryPanel.style.flexShrink = "0";

  const charName = document.createElement("div");
  charName.className = "equip-char-name";
  charName.style.fontSize = "14px";
  charName.style.fontWeight = "bold";
  charName.style.color = "var(--neon-cyan)";
  charName.style.marginBottom = "0";
  charName.textContent = `${char.name} (${getClassJpName(char.class)} Lv.${char.level}) HP:${char.hp}/${getCharMaxHp(char)} MP:${char.mp}/${getCharMaxMp(char)}`;
  summaryPanel.appendChild(charName);
  
  overlay.appendChild(summaryPanel);

  // 3. Create Body
  const body = document.createElement("div");
  body.className = "equip-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.flex = "1";
  body.style.minHeight = "0";
  body.style.gap = "8px";
  body.style.padding = "8px 0";

  // 3.1 Inventory List
  const invCol = document.createElement("div");
  invCol.className = "equip-inventory-col";
  invCol.style.display = "flex";
  invCol.style.flexDirection = "column";
  invCol.style.flex = "1";
  invCol.style.minHeight = "0";
  invCol.style.gap = "8px";

  // Create Filter Chips Row directly above the items list
  const filterRow = document.createElement("div");
  filterRow.className = "equip-filters";
  
  const categories = [
    { id: "all", label: "すべて" },
    { id: "usable", label: "道具" },
    { id: "weapon", label: "武器" },
    { id: "armor", label: "防具" }
  ];

  categories.forEach(cat => {
    const chip = document.createElement("button");
    chip.type = "button";
    const isActive = equipState.filter === cat.id;
    chip.className = `equip-filter-chip ${isActive ? "active" : ""}`;
    chip.textContent = cat.label;
    chip.addEventListener("click", () => {
      equipState.filter = cat.id;
      equipState.selectedKey = null;
      equipState.selectedIdx = -1;
      renderEquip();
    });
    filterRow.appendChild(chip);
  });
  invCol.appendChild(filterRow);

  const itemList = document.createElement("div");
  itemList.className = "equip-item-list";
  itemList.style.overflowY = "auto";
  itemList.style.display = "flex";
  itemList.style.flexDirection = "column";
  itemList.style.gap = "4px";

  // Filter inventory
  const filteredInv = state.inventory.map((itemKey, idx) => ({ itemKey, idx })).filter(({ itemKey }) => {
    const item = getItemData(itemKey);
    if (!item) return false;
    if (equipState.filter === "all") return true;
    if (equipState.filter === "weapon") return item.type === "weapon";
    if (equipState.filter === "armor") return item.type === "armor" || item.type === "shield";
    if (equipState.filter === "usable") return item.type === "usable";
    return true;
  });

  // Sort bag items by priority: usable (道具) -> weapon (武器) -> shield/armor (防具)
  const typePriority = {
    usable: 0,
    weapon: 1,
    shield: 2,
    armor: 2
  };
  filteredInv.sort((a, b) => {
    const itemA = getItemData(a.itemKey);
    const itemB = getItemData(b.itemKey);
    const priorityA = typePriority[itemA?.type] ?? 3;
    const priorityB = typePriority[itemB?.type] ?? 3;
    return priorityA - priorityB;
  });

  if (filteredInv.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.textContent = "バッグは空っぽです。";
    itemList.appendChild(placeholder);
  } else {
    let currentCategory = null;
    filteredInv.forEach(({ itemKey, idx }) => {
      const item = getItemData(itemKey);
      const isSelected = equipState.selectedIdx === idx;
      
      // Determine category heading
      let itemCat = "";
      if (item.type === "usable") itemCat = "道具";
      else if (item.type === "weapon") itemCat = "武器";
      else if (item.type === "shield" || item.type === "armor") itemCat = "防具";
      else itemCat = "その他";

      if (itemCat !== currentCategory) {
        currentCategory = itemCat;
        const heading = document.createElement("div");
        heading.className = "equip-list-heading";
        heading.textContent = currentCategory;
        itemList.appendChild(heading);
      }

      const row = document.createElement("button");
      row.className = `equip-item-row ${isSelected ? "selected" : ""}`;
      row.style.minHeight = "44px";
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      
      const name = document.createElement("span");
      name.className = "equip-item-row-name";
      name.textContent = item.name;
      row.appendChild(name);

      const isIdentified = typeof itemKey !== "object" || itemKey.identified;
      const canEquip = isEquipmentItem(item) && (!item.classes || item.classes.includes(char.class)) && isIdentified;
      if (isEquipmentItem(item)) {
        if (!isIdentified || !canEquip) {
          row.classList.add("not-equipable");
          const badge = document.createElement("span");
          badge.className = "equip-row-badge cant";
          badge.textContent = !isIdentified ? "未鑑定" : "不可";
          row.appendChild(badge);
        } else {
          const preview = getEquipPreview(char, itemKey);
          if (preview && preview.primaryDiff !== 0) {
            const badge = document.createElement("span");
            badge.className = `equip-row-badge ${preview.primaryDiff > 0 ? "up" : "down"}`;
            badge.textContent = `${preview.primaryDiff > 0 ? "+" : ""}${preview.primaryDiff}`;
            row.appendChild(badge);
          }
        }
      }
      
      row.addEventListener("click", () => {
        equipState.selectedKey = isSelected ? null : itemKey;
        equipState.selectedIdx = isSelected ? -1 : idx;
        equipState.selectedSlot = null;
        renderEquip();
      });
      itemList.appendChild(row);
    });
  }
  invCol.appendChild(itemList);
  body.appendChild(invCol);

  // 3.2 Detail Panel
  const detailCol = document.createElement("div");
  detailCol.className = "equip-detail-col";
  detailCol.style.minHeight = "90px";
  detailCol.style.flexShrink = "0";
  
  let actionBtn = null;

  const hasSelection = equipState.selectedIdx !== -1 || equipState.selectedSlot !== null;

  if (!hasSelection || !equipState.selectedKey) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.innerHTML = "バッグまたは装備スロットを<br>選択してください。";
    detailCol.appendChild(placeholder);
  } else {
    const itemKey = equipState.selectedKey;
    const item = getItemData(itemKey);
    
    if (item) {
      const detailContent = document.createElement("div");
      detailContent.className = "equip-detail-content";
      detailContent.style.maxHeight = "220px";
      detailContent.style.overflowY = "auto";
      
      const dName = document.createElement("div");
      dName.className = "equip-detail-name";
      dName.textContent = item.name;
      detailContent.appendChild(dName);
      
      const dDesc = document.createElement("div");
      dDesc.className = "equip-detail-desc";
      dDesc.textContent = item.desc || "効果はありません。";
      detailContent.appendChild(dDesc);
      
      // Compare Stats if equipable
      const isEquipableType = isEquipmentItem(item);
      if (isEquipableType && equipState.selectedIdx !== -1) {
        const isIdentified = typeof itemKey !== "object" || itemKey.identified;
        const canEquip = (!item.classes || item.classes.includes(char.class)) && isIdentified;
        
        const compat = document.createElement("div");
        compat.className = `equip-detail-compat ${canEquip ? "yes" : "no"}`;
        compat.textContent = canEquip ? "🟢 装備可能" : !isIdentified ? "🔴 装備不可 (未鑑定)" : "🔴 装備不可 (職業制限)";
        detailContent.appendChild(compat);

        const preview = getEquipPreview(char, itemKey);
        if (preview) {
          const compare = document.createElement("div");
          compare.className = "equip-stat-compare";

          const summary = document.createElement("div");
          summary.className = `equip-stat-summary ${preview.primaryDiff > 0 ? "upgrade" : preview.primaryDiff < 0 ? "downgrade" : ""}`;
          summary.textContent = preview.primaryDiff > 0
            ? `主要ステータス +${preview.primaryDiff}`
            : preview.primaryDiff < 0
              ? `主要ステータス ${preview.primaryDiff}`
              : "主要ステータス ±0";
          compare.appendChild(summary);

          const renderStatRow = (st) => {
            const row = document.createElement("div");
            row.className = "equip-stat-compare-row";
            const sign = st.diff >= 0 ? "+" : "";
            const unit = st.unit || "";

            const label = document.createElement("span");
            label.className = "equip-stat-label";
            label.textContent = st.label;
            row.appendChild(label);

            const val = document.createElement("span");
            val.className = `equip-stat-compare-val ${st.diff > 0 ? "upgrade" : st.diff < 0 ? "downgrade" : ""}`;
            val.textContent = `${st.current}${unit} → ${st.next}${unit}`;
            row.appendChild(val);

            const diff = document.createElement("span");
            diff.className = `equip-stat-diff ${st.diff > 0 ? "upgrade" : st.diff < 0 ? "downgrade" : ""}`;
            diff.textContent = `${sign}${st.diff}${unit}`;
            row.appendChild(diff);

            return row;
          };

          const primaryRows = preview.rows.filter(st => st.key === "atk" || st.key === "def");
          const secondaryRows = preview.rows.filter(st => st.key !== "atk" && st.key !== "def");

          const primaryGroup = document.createElement("div");
          primaryGroup.className = "equip-stat-primary";
          primaryRows.forEach(st => {
            primaryGroup.appendChild(renderStatRow(st));
          });
          compare.appendChild(primaryGroup);

          const secondaryGrid = document.createElement("div");
          secondaryGrid.className = "equip-stat-grid";
          secondaryRows.forEach(st => {
            secondaryGrid.appendChild(renderStatRow(st));
          });
          compare.appendChild(secondaryGrid);

          detailContent.appendChild(compare);
        }
      }
      
      detailCol.appendChild(detailContent);

      // Create action button for selection
      if (equipState.selectedSlot !== null) {
        // Unequip action
        actionBtn = document.createElement("button");
        actionBtn.className = "btn btn-danger btn-block";
        actionBtn.textContent = "外す (装備解除)";
        if (state.inventory.length >= 20) {
          actionBtn.disabled = true;
          actionBtn.textContent = "バッグ満杯のため外せません";
        } else {
          actionBtn.addEventListener("click", () => {
            const slotId = equipState.selectedSlot;
            char.equipment[slotId] = null;
            state.inventory.push(itemKey);
            saveAutosave();
            
            equipState.selectedKey = null;
            equipState.selectedSlot = null;
            renderEquip();
            updateUI();
          });
        }
      } else {
        // Equip/Use action
        actionBtn = document.createElement("button");
        actionBtn.className = "btn btn-neon btn-block";
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
              addLog(`${char.name}は帰還のスクロールを読んだ！街へ戻った！`);
              playSound("cast_spell");
              state.inventory.splice(equipState.selectedIdx, 1);
              saveAutosave();
              updateUI();
              return;
            }

            let checkWarning = "";
            if (itemKey === "HEAL_POTION" && char.hp >= char.maxHp) {
              checkWarning = "HPはすでに満タンです。本当に使用しますか？";
            } else if (itemKey === "ANTIDOTE" && char.status !== "poisoned") {
              checkWarning = "毒状態ではありません。本当に使用しますか？";
            }
            if (checkWarning && !confirm(checkWarning)) return;
            
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
              const slot = item.type;
              const oldEq = char.equipment[slot];
              const eqData = state.inventory[equipState.selectedIdx];
              
              char.equipment[slot] = eqData;
              if (oldEq) {
                state.inventory[equipState.selectedIdx] = oldEq;
              } else {
                state.inventory.splice(equipState.selectedIdx, 1);
              }
              
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
      }
    }
    
    if (actionBtn) {
      detailCol.appendChild(actionBtn);
    }
  }

  body.appendChild(detailCol);
  overlay.appendChild(body);

  // 4. Create Bottom Actions Panel
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  // 4.1 Current equipment summary
  const equipBar = document.createElement("div");
  equipBar.className = "equip-mini-slots";

  slots.forEach(slot => {
    const eqKey = char.equipment[slot.id];
    const eqItem = eqKey ? getItemData(eqKey) : null;
    const isSelected = equipState.selectedSlot === slot.id;
    const slotBtn = document.createElement("button");
    slotBtn.type = "button";
    slotBtn.className = `equip-mini-slot ${eqItem ? "filled" : "empty"} ${isSelected ? "selected" : ""}`;
    slotBtn.innerHTML = `
      <span class="equip-mini-slot-label">${slot.label}</span>
      <span class="equip-mini-slot-name">${eqItem ? eqItem.name : "なし"}</span>
    `;
    slotBtn.addEventListener("click", () => {
      equipState.selectedSlot = isSelected ? null : slot.id;
      equipState.selectedKey = isSelected ? null : eqKey;
      equipState.selectedIdx = -1;
      renderEquip();
    });
    equipBar.appendChild(slotBtn);
  });

  footer.appendChild(equipBar);

  // 4.2 Character Switch Row
  const charRow = document.createElement("div");
  charRow.className = "bottom-actions-row";
  
  const btnPrev = document.createElement("button");
  btnPrev.className = "btn btn-neon";
  btnPrev.textContent = "◀ 前のキャラ";
  btnPrev.addEventListener("click", () => {
    const prevIdx = (equipState.actorIdx - 1 + state.party.length) % state.party.length;
    openEquipOverlay(prevIdx);
  });
  charRow.appendChild(btnPrev);
  
  const btnNext = document.createElement("button");
  btnNext.className = "btn btn-neon";
  btnNext.textContent = "次のキャラ ▶";
  btnNext.addEventListener("click", () => {
    const nextIdx = (equipState.actorIdx + 1) % state.party.length;
    openEquipOverlay(nextIdx);
  });
  charRow.appendChild(btnNext);
  footer.appendChild(charRow);



  // 4.4 Back/Close row
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger";
  btnClose.style.width = "100%";
  btnClose.textContent = "❌ 閉じる";
  btnClose.addEventListener("click", () => {
    closeEquipOverlay();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}
