import { state, saveAutosave, addLog } from "./state.js";
import { 
  DIR_N, START_X, START_Y, 
  getClassJpName, getCharMaxHp, getCharMaxMp, getItemData, getCharStr,
  getCharInt, getCharPie, getCharVit, getCharAgi, getCharLuk, getCharDerivedStats
} from "./data.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";
import { triggerRunResult } from "./result.js";

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
  const derived = getCharDerivedStats(char);
  return {
    atk: derived.attack,
    def: derived.defense,
    magic: derived.magic,
    healing: derived.healing,
    speed: derived.speed,
    trap: derived.trap,
    treasure: derived.treasure,
    hp: getCharMaxHp(char),
    mp: getCharMaxMp(char),
    str: getCharStr(char),
    int: getCharInt(char),
    pie: getCharPie(char),
    vit: getCharVit(char),
    agi: getCharAgi(char),
    luk: getCharLuk(char)
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
    { key: "atk", label: "攻撃" },
    { key: "def", label: "防御" },
    { key: "magic", label: "魔力" },
    { key: "healing", label: "回復" },
    { key: "speed", label: "速度" },
    { key: "trap", label: "罠解除" },
    { key: "treasure", label: "探宝" },
    { key: "hp", label: "最大HP" },
    { key: "mp", label: "最大MP" },
    { key: "str", label: "力" },
    { key: "int", label: "知恵" },
    { key: "pie", label: "信仰" },
    { key: "vit", label: "生命" },
    { key: "agi", label: "素早さ" },
    { key: "luk", label: "運" }
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

export function getItemUseStatus(char, itemKey) {
  const item = getItemData(itemKey);
  if (!item || item.type !== "usable") return { usable: true, reason: "" };

  if (char.status === "dead") {
    if (itemKey !== "SACRED_ASHES") {
      return { usable: false, reason: "死亡中は回復アイテムを使用できません" };
    }
  } else {
    if (itemKey === "SACRED_ASHES") {
      return { usable: false, reason: "蘇生アイテムは死亡キャラの画面で使用できます" };
    }
    if (itemKey === "HEAL_POTION" && char.hp >= char.maxHp) {
      return { usable: false, reason: "HPはすでに満タンです" };
    }
    if (itemKey === "ANTIDOTE" && char.status !== "poisoned") {
      return { usable: false, reason: "毒状態ではありません" };
    }
  }
  return { usable: true, reason: "" };
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
  summaryPanel.style.padding = "10px 12px";
  summaryPanel.style.backgroundColor = "#121216";
  summaryPanel.style.borderBottom = "1px solid #22222d";
  summaryPanel.style.flexShrink = "0";

  const charNameRow = document.createElement("div");
  charNameRow.style.display = "flex";
  charNameRow.style.justifyContent = "space-between";
  charNameRow.style.fontSize = "14px";
  charNameRow.style.fontWeight = "bold";
  charNameRow.style.color = "var(--neon-cyan)";
  charNameRow.innerHTML = `
    <span>${char.name} <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(${getClassJpName(char.class)} Lv.${char.level})</span></span>
    <span>HP: ${char.hp}/${getCharMaxHp(char)}</span>
  `;
  summaryPanel.appendChild(charNameRow);

  const charMpRow = document.createElement("div");
  charMpRow.style.display = "flex";
  charMpRow.style.justifyContent = "flex-end";
  charMpRow.style.fontSize = "11px";
  charMpRow.style.color = "var(--text-muted)";
  charMpRow.style.marginTop = "2px";
  charMpRow.innerHTML = `<span>MP: ${char.mp}/${getCharMaxMp(char)}</span>`;
  summaryPanel.appendChild(charMpRow);
  
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
      
      const badge = document.createElement("span");
      
      if (isEquipmentItem(item)) {
        if (!isIdentified || !canEquip) {
          row.classList.add("not-equipable");
          badge.className = "equip-row-badge cant";
          badge.textContent = !isIdentified ? "未鑑定" : "不可";
          row.appendChild(badge);
        } else {
          const preview = getEquipPreview(char, itemKey);
          if (preview) {
            badge.className = `equip-row-badge ${preview.primaryDiff > 0 ? "up" : preview.primaryDiff < 0 ? "down" : "zero"}`;
            badge.textContent = `${preview.primaryDiff >= 0 ? "+" : ""}${preview.primaryDiff}`;
            row.appendChild(badge);
          }
        }
      } else if (item.type === "usable") {
        badge.className = "equip-row-badge tool";
        badge.textContent = "道具";
        row.appendChild(badge);
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
      } else if (item.type === "usable" && equipState.selectedIdx !== -1) {
        const useStatus = getItemUseStatus(char, itemKey);
        
        const compat = document.createElement("div");
        compat.className = `equip-detail-compat ${useStatus.usable ? "yes" : "no"}`;
        compat.textContent = useStatus.usable ? "🟢 使用可能" : `🔴 使用不可: ${useStatus.reason}`;
        detailContent.appendChild(compat);
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
        if (item.type === "usable") {
          const useStatus = getItemUseStatus(char, itemKey);

          if (!useStatus.usable) {
            actionBtn = document.createElement("button");
            actionBtn.className = "btn btn-block disabled";
            actionBtn.style.opacity = "0.5";
            actionBtn.disabled = true;
            if (useStatus.reason.includes("満タン")) {
              actionBtn.textContent = "HP満タン";
            } else if (useStatus.reason.includes("死亡中")) {
              actionBtn.textContent = "死亡中につき使用不可";
            } else if (useStatus.reason.includes("蘇生")) {
              actionBtn.textContent = "生存中のため使用不可";
            } else {
              actionBtn.textContent = "使用不可";
            }
          } else {
            actionBtn = document.createElement("button");
            actionBtn.className = "btn btn-neon btn-block";
            actionBtn.textContent = "使用する";
            actionBtn.addEventListener("click", () => {
              if (itemKey === "TOWN_PORTAL") {
                closeEquipOverlay();
                playSound("cast_spell");
                addLog(`${char.name}は帰還のスクロールを読んだ！街へ戻った！`);
                state.inventory.splice(equipState.selectedIdx, 1);
                triggerRunResult("escape_scroll");
                return;
              }

              if (itemKey === "SACRED_ASHES" && !confirm(`${char.name}に聖灰を使用し、HP1で蘇生させます。よろしいですか？`)) {
                return;
              }
              
              const log = item.effect(char);
              addLog(log);
              if (itemKey === "SACRED_ASHES") {
                playSound("level_up");
              } else {
                playSound("heal");
              }
              state.inventory.splice(equipState.selectedIdx, 1);
              saveAutosave();
              
              equipState.selectedKey = null;
              equipState.selectedIdx = -1;
              renderEquip();
              updateUI();
            });
          }
        } else {
          actionBtn = document.createElement("button");
          actionBtn.className = "btn btn-neon btn-block";
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
    equipState.actorIdx = (equipState.actorIdx - 1 + state.party.length) % state.party.length;
    equipState.selectedKey = null;
    equipState.selectedIdx = -1;
    equipState.selectedSlot = null;
    renderEquip();
    updateUI();
  });
  charRow.appendChild(btnPrev);
  
  const btnNext = document.createElement("button");
  btnNext.className = "btn btn-neon";
  btnNext.textContent = "次のキャラ ▶";
  btnNext.addEventListener("click", () => {
    equipState.actorIdx = (equipState.actorIdx + 1) % state.party.length;
    equipState.selectedKey = null;
    equipState.selectedIdx = -1;
    equipState.selectedSlot = null;
    renderEquip();
    updateUI();
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
