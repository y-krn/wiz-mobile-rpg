import { state, saveAutosave, addLog } from "./state.js";
import { 
  getClassJpName, getCharMaxHp, getCharMaxMp, getItemData,
  getCharDerivedStats, getClassPassive
} from "./data.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";
import { triggerRunResult } from "./result.js";

export let equipState = {
  mode: "use", // "use" | "equip" | "unequip" | "organize"
  filter: "all", // "all" | "usable" | "weapon" | "armor"
  actorIdx: 0,
  selectedIdx: -1,
  selectedKey: null,
  selectedSlot: null,     // unequip用: "weapon" | "shield" | "armor"
  selectedActorIdx: -1,   // unequip用: 装備元のキャラインデックス
  prevGameState: null
};

export function openEquipOverlay(actorIdx = 0) {
  if (state.gameState !== "equip_overlay") {
    equipState.prevGameState = state.gameState;
  }
  state.gameState = "equip_overlay";
  equipState.actorIdx = actorIdx;
  equipState.mode = "use";
  equipState.filter = "all";
  equipState.selectedKey = null;
  equipState.selectedIdx = -1;
  equipState.selectedSlot = null;
  equipState.selectedActorIdx = -1;
  
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
    mp: getCharMaxMp(char)
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
    { key: "mp", label: "最大MP" }
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
    if (itemKey === "HEAL_POTION" && char.hp >= getCharMaxHp(char)) {
      return { usable: false, reason: "HPはすでに満タンです" };
    }
    if (itemKey === "ANTIDOTE" && char.status !== "poisoned") {
      return { usable: false, reason: "毒状態ではありません" };
    }
  }
  return { usable: true, reason: "" };
}

function changeMode(newMode) {
  equipState.mode = newMode;
  equipState.selectedIdx = -1;
  equipState.selectedKey = null;
  equipState.selectedSlot = null;
  equipState.selectedActorIdx = -1;
  renderEquip();
}

export function renderEquip() {
  const overlay = document.getElementById("equip-overlay");
  if (!overlay) return;

  const existingList = overlay.querySelector(".equip-item-list");
  const savedScrollTop = existingList ? existingList.scrollTop : 0;

  overlay.innerHTML = "";

  const char = state.party[equipState.actorIdx];
  if (!char) {
    closeEquipOverlay();
    return;
  }

  // 1. Header Area
  const header = document.createElement("div");
  header.className = "equip-header-area";
  header.style.display = "flex";
  header.style.flexDirection = "column";
  header.style.gap = "8px";
  header.style.flexShrink = "0";

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.justifyContent = "space-between";
  titleRow.style.alignItems = "center";

  const title = document.createElement("span");
  title.className = "equip-title";
  title.textContent = "道具・装備";
  titleRow.appendChild(title);

  const btnClose = document.createElement("button");
  btnClose.id = "btn-equip-close";
  btnClose.className = "btn btn-danger";
  btnClose.style.minHeight = "44px";
  btnClose.style.padding = "0 16px";
  btnClose.textContent = "閉じる";
  btnClose.addEventListener("click", () => {
    closeEquipOverlay();
  });
  titleRow.appendChild(btnClose);
  header.appendChild(titleRow);

  // 2. Status Bar
  const statusBar = document.createElement("div");
  statusBar.className = "equip-status-bar";
  statusBar.style.display = "flex";
  statusBar.style.justifyContent = "space-between";
  statusBar.style.fontSize = "13px";
  statusBar.style.padding = "6px 8px";
  statusBar.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
  statusBar.style.border = "1px solid #22222d";
  statusBar.style.borderRadius = "4px";
  statusBar.innerHTML = `
    <span class="equip-status-gold" style="color: var(--neon-gold); font-weight: bold;">💰 ${state.gold}G</span>
    <span class="equip-status-capacity" style="color: ${state.inventory.length >= 20 ? "var(--neon-red)" : "var(--text-muted)"}; font-weight: ${state.inventory.length >= 20 ? "bold" : "normal"};">🎒 バッグ: ${state.inventory.length}/20</span>
  `;
  header.appendChild(statusBar);

  // 3. Mode Tabs
  const tabRow = document.createElement("div");
  tabRow.className = "equip-tabs";
  tabRow.style.display = "flex";
  tabRow.style.gap = "6px";
  tabRow.style.width = "100%";

  const modes = [
    { id: "use", label: "使う" },
    { id: "equip", label: "装備" },
    { id: "unequip", label: "外す" },
    { id: "organize", label: "整理" }
  ];

  modes.forEach(m => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `equip-tab ${equipState.mode === m.id ? "active" : ""}`;
    tab.style.flex = "1";
    tab.style.minHeight = "44px";
    tab.textContent = m.label;
    tab.addEventListener("click", () => {
      changeMode(m.id);
    });
    tabRow.appendChild(tab);
  });
  header.appendChild(tabRow);

  // 4. Category Filter
  const filterRow = document.createElement("div");
  filterRow.className = "equip-filters";
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
    chip.className = `equip-filter-chip ${equipState.filter === cat.id ? "active" : ""}`;
    chip.style.flex = "1";
    chip.style.minHeight = "44px";
    chip.textContent = cat.label;
    chip.addEventListener("click", () => {
      equipState.filter = cat.id;
      equipState.selectedIdx = -1;
      equipState.selectedKey = null;
      equipState.selectedSlot = null;
      equipState.selectedActorIdx = -1;
      renderEquip();
    });
    filterRow.appendChild(chip);
  });
  header.appendChild(filterRow);

  overlay.appendChild(header);

  // 5. Body Layout
  const body = document.createElement("div");
  body.className = "equip-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.flex = "1";
  body.style.minHeight = "0";
  body.style.gap = "8px";
  body.style.padding = "8px 0";

  // 5.1 List Container
  const listContainer = document.createElement("div");
  listContainer.className = "equip-list-container";
  listContainer.style.flex = "1";
  listContainer.style.minHeight = "0";
  listContainer.style.overflowY = "auto";
  listContainer.style.display = "flex";
  listContainer.style.flexDirection = "column";

  const itemList = document.createElement("div");
  itemList.className = "equip-item-list";
  itemList.style.display = "flex";
  itemList.style.flexDirection = "column";
  itemList.style.gap = "4px";

  if (equipState.mode === "use" || equipState.mode === "equip" || equipState.mode === "organize") {
    // Inventory Items
    const mappedInv = state.inventory.map((itemKey, idx) => ({ itemKey, idx }));
    const filteredInv = mappedInv.filter(({ itemKey }) => {
      const item = getItemData(itemKey);
      if (!item) return false;

      if (equipState.mode === "use" && item.type !== "usable") return false;
      if (equipState.mode === "equip" && !isEquipmentItem(item)) return false;

      if (equipState.filter === "all") return true;
      if (equipState.filter === "usable") return item.type === "usable";
      if (equipState.filter === "weapon") return item.type === "weapon";
      if (equipState.filter === "armor") return item.type === "armor" || item.type === "shield";
      return true;
    });

    const typePriority = { usable: 0, weapon: 1, shield: 2, armor: 2 };
    filteredInv.sort((a, b) => {
      const itemA = getItemData(a.itemKey);
      const itemB = getItemData(b.itemKey);
      const priA = typePriority[itemA?.type] ?? 3;
      const priB = typePriority[itemB?.type] ?? 3;
      return priA - priB;
    });

    if (filteredInv.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "equip-detail-placeholder";
      placeholder.textContent = "対象のアイテムがバッグにありません。";
      itemList.appendChild(placeholder);
    } else {
      let currentCategory = null;
      filteredInv.forEach(({ itemKey, idx }) => {
        const item = getItemData(itemKey);
        const isSelected = equipState.selectedIdx === idx;
        
        let itemCat = "";
        if (item.type === "usable") itemCat = "道具";
        else if (item.type === "weapon") itemCat = "武器";
        else if (item.type === "shield" || item.type === "armor") itemCat = "防具";
        else itemCat = "その他";

        if (itemCat !== currentCategory) {
          currentCategory = itemCat;
          const heading = document.createElement("div");
          heading.className = "equip-list-heading";
          heading.style.fontSize = "11px";
          heading.style.color = "var(--neon-cyan)";
          heading.style.padding = "4px 8px";
          heading.style.marginTop = "6px";
          heading.style.borderLeft = "2px solid var(--neon-cyan)";
          heading.style.backgroundColor = "rgba(0, 229, 255, 0.03)";
          heading.textContent = currentCategory;
          itemList.appendChild(heading);
        }

        const row = document.createElement("button");
        row.type = "button";
        row.className = `equip-item-row ${isSelected ? "selected" : ""}`;
        row.style.minHeight = "44px";
        row.style.width = "100%";
        row.style.textAlign = "left";
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
        
        const leftDiv = document.createElement("div");
        leftDiv.style.display = "flex";
        leftDiv.style.flexDirection = "column";
        leftDiv.style.alignItems = "flex-start";
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "equip-item-row-name";
        nameSpan.style.fontWeight = "bold";
        nameSpan.style.fontSize = "14px";
        nameSpan.textContent = item.name;
        leftDiv.appendChild(nameSpan);

        const summarySpan = document.createElement("span");
        summarySpan.style.fontSize = "11px";
        summarySpan.style.color = "var(--text-muted)";
        if (item.type === "usable") {
          summarySpan.textContent = "消費道具";
        } else if (item.type === "weapon") {
          summarySpan.textContent = `武器 / 攻撃 +${item.atk || 0}`;
        } else if (item.type === "shield" || item.type === "armor") {
          summarySpan.textContent = `${item.type === "shield" ? "盾" : "鎧"} / 防御 +${item.def || 0}`;
        }
        leftDiv.appendChild(summarySpan);
        row.appendChild(leftDiv);

        const isIdentified = typeof itemKey !== "object" || itemKey.identified;
        const canEquip = isEquipmentItem(item) && (!item.classes || item.classes.includes(char.class)) && isIdentified;
        
        if (equipState.mode === "equip" && isEquipmentItem(item)) {
          const badge = document.createElement("span");
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
        } else if (equipState.mode === "use" && item.type === "usable") {
          const useStatus = getItemUseStatus(char, itemKey);
          if (!useStatus.usable) {
            row.classList.add("not-equipable");
            const badge = document.createElement("span");
            badge.className = "equip-row-badge cant";
            badge.textContent = "不可";
            row.appendChild(badge);
          }
        }
        
        row.addEventListener("click", () => {
          equipState.selectedKey = isSelected ? null : itemKey;
          equipState.selectedIdx = isSelected ? -1 : idx;
          equipState.selectedSlot = null;
          equipState.selectedActorIdx = -1;
          renderEquip();
        });
        itemList.appendChild(row);
      });
    }
  } else if (equipState.mode === "unequip") {
    // Equipped Items
    const equippedItems = [];
    state.party.forEach((actor, aIdx) => {
      const slots = ["weapon", "shield", "armor"];
      slots.forEach(slot => {
        const eqKey = actor.equipment[slot];
        if (eqKey) {
          const item = getItemData(eqKey);
          if (item) {
            let matchesFilter = true;
            if (equipState.filter === "usable") matchesFilter = false;
            else if (equipState.filter === "weapon") matchesFilter = item.type === "weapon";
            else if (equipState.filter === "armor") matchesFilter = item.type === "armor" || item.type === "shield";
            
            if (matchesFilter) {
              equippedItems.push({ actor, aIdx, slot, eqKey, item });
            }
          }
        }
      });
    });

    if (equippedItems.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "equip-detail-placeholder";
      placeholder.textContent = "装備中のアイテムがありません。";
      itemList.appendChild(placeholder);
    } else {
      let currentCategory = null;
      equippedItems.forEach(({ actor, aIdx, slot, eqKey, item }) => {
        const isSelected = equipState.selectedActorIdx === aIdx && equipState.selectedSlot === slot;
        
        let itemCat = "";
        if (item.type === "weapon") itemCat = "武器";
        else if (item.type === "shield" || item.type === "armor") itemCat = "防具";
        else itemCat = "その他";

        if (itemCat !== currentCategory) {
          currentCategory = itemCat;
          const heading = document.createElement("div");
          heading.className = "equip-list-heading";
          heading.style.fontSize = "11px";
          heading.style.color = "var(--neon-cyan)";
          heading.style.padding = "4px 8px";
          heading.style.marginTop = "6px";
          heading.style.borderLeft = "2px solid var(--neon-cyan)";
          heading.style.backgroundColor = "rgba(0, 229, 255, 0.03)";
          heading.textContent = currentCategory;
          itemList.appendChild(heading);
        }

        const slotJp = { weapon: "武器", shield: "盾", armor: "鎧" }[slot] || slot;

        const row = document.createElement("button");
        row.type = "button";
        row.className = `equip-item-row ${isSelected ? "selected" : ""}`;
        row.style.minHeight = "44px";
        row.style.width = "100%";
        row.style.textAlign = "left";
        row.setAttribute("aria-selected", isSelected ? "true" : "false");

        const leftDiv = document.createElement("div");
        leftDiv.style.display = "flex";
        leftDiv.style.flexDirection = "column";
        leftDiv.style.alignItems = "flex-start";

        const actorSlotSpan = document.createElement("span");
        actorSlotSpan.style.fontSize = "11px";
        actorSlotSpan.style.color = "var(--neon-cyan)";
        actorSlotSpan.textContent = `${actor.name} / ${slotJp}`;
        leftDiv.appendChild(actorSlotSpan);

        const nameSpan = document.createElement("span");
        nameSpan.className = "equip-item-row-name";
        nameSpan.style.fontWeight = "bold";
        nameSpan.style.fontSize = "14px";
        nameSpan.style.marginTop = "2px";
        nameSpan.textContent = item.name;
        leftDiv.appendChild(nameSpan);

        row.appendChild(leftDiv);

        row.addEventListener("click", () => {
          equipState.selectedKey = isSelected ? null : eqKey;
          equipState.selectedIdx = -1;
          equipState.selectedSlot = isSelected ? null : slot;
          equipState.selectedActorIdx = isSelected ? -1 : aIdx;
          renderEquip();
        });
        itemList.appendChild(row);
      });
    }
  }

  listContainer.appendChild(itemList);
  body.appendChild(listContainer);

  // 5.2 Detail Panel
  const detailCol = document.createElement("div");
  detailCol.className = "equip-detail-col";
  detailCol.style.minHeight = "120px";
  detailCol.style.flexShrink = "0";
  detailCol.style.borderTop = "1px solid #22222d";
  detailCol.style.padding = "8px 0";

  let actionBtn = null;
  const isSelected = equipState.selectedKey !== null;

  if (!isSelected) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.style.color = "var(--text-muted)";
    placeholder.style.fontSize = "13px";
    placeholder.style.textAlign = "center";
    placeholder.style.padding = "16px";
    placeholder.innerHTML = "アイテムを選択してください。";
    detailCol.appendChild(placeholder);
  } else {
    const itemKey = equipState.selectedKey;
    const item = getItemData(itemKey);

    if (item) {
      const detailContent = document.createElement("div");
      detailContent.className = "equip-detail-content";
      detailContent.style.display = "flex";
      detailContent.style.flexDirection = "column";
      detailContent.style.gap = "8px";

      const dName = document.createElement("div");
      dName.className = "equip-detail-name";
      dName.style.fontSize = "15px";
      dName.style.fontWeight = "bold";
      dName.style.color = "#fff";
      dName.textContent = item.name;
      detailContent.appendChild(dName);

      const dDesc = document.createElement("div");
      dDesc.className = "equip-detail-desc";
      dDesc.style.fontSize = "12px";
      dDesc.style.color = "var(--text-muted)";
      dDesc.textContent = item.desc || "効果はありません。";
      detailContent.appendChild(dDesc);

      if (equipState.mode === "use" || equipState.mode === "equip") {
        const charSelectTitle = document.createElement("div");
        charSelectTitle.style.fontSize = "11px";
        charSelectTitle.style.color = "var(--neon-cyan)";
        charSelectTitle.style.marginTop = "4px";
        charSelectTitle.textContent = "対象キャラを選択してください:";
        detailContent.appendChild(charSelectTitle);

        const charSelectContainer = document.createElement("div");
        charSelectContainer.style.display = "flex";
        charSelectContainer.style.flexDirection = "column";
        charSelectContainer.style.gap = "4px";
        charSelectContainer.style.marginTop = "2px";

        state.party.forEach((partyChar, pIdx) => {
          const charBtn = document.createElement("button");
          charBtn.type = "button";
          charBtn.style.minHeight = "44px";
          charBtn.style.width = "100%";
          charBtn.style.display = "flex";
          charBtn.style.justifyContent = "space-between";
          charBtn.style.alignItems = "center";
          charBtn.style.padding = "0 12px";
          charBtn.style.border = pIdx === equipState.actorIdx ? "1.5px solid var(--neon-cyan)" : "1px solid #22222d";
          charBtn.style.borderRadius = "6px";
          charBtn.style.backgroundColor = pIdx === equipState.actorIdx ? "rgba(0, 229, 255, 0.08)" : "#14141a";
          charBtn.style.color = "#fff";

          const leftSpan = document.createElement("span");
          leftSpan.style.fontSize = "13px";
          leftSpan.style.fontWeight = "bold";
          leftSpan.textContent = partyChar.name;
          
          const statusText = partyChar.status === "dead" ? " [死亡]" : partyChar.status === "poisoned" ? " [毒]" : "";
          if (statusText) {
            const statusSpan = document.createElement("span");
            statusSpan.style.color = partyChar.status === "dead" ? "var(--neon-red)" : "var(--neon-gold)";
            statusSpan.style.fontSize = "11px";
            statusSpan.textContent = statusText;
            leftSpan.appendChild(statusSpan);
          }
          charBtn.appendChild(leftSpan);

          const rightSpan = document.createElement("span");
          rightSpan.style.fontSize = "12px";
          rightSpan.style.color = "var(--text-muted)";
          rightSpan.textContent = `HP ${partyChar.hp}/${getCharMaxHp(partyChar)}`;
          charBtn.appendChild(rightSpan);

          charBtn.addEventListener("click", () => {
            equipState.actorIdx = pIdx;
            renderEquip();
          });

          charSelectContainer.appendChild(charBtn);
        });
        detailContent.appendChild(charSelectContainer);

        if (equipState.mode === "use") {
          const useStatus = getItemUseStatus(char, itemKey);
          
          const compat = document.createElement("div");
          compat.className = `equip-detail-compat ${useStatus.usable ? "yes" : "no"}`;
          compat.style.fontSize = "12px";
          compat.style.padding = "6px 8px";
          compat.style.borderRadius = "4px";
          compat.style.marginTop = "6px";
          
          if (useStatus.usable) {
            compat.style.color = "var(--neon-green)";
            compat.style.backgroundColor = "rgba(0, 255, 102, 0.05)";
            
            let previewText = "";
            if (itemKey === "HEAL_POTION" || itemKey === "HOLY_WATER") {
              const currentHp = char.hp;
              const maxHp = getCharMaxHp(char);
              const nextHp = Math.min(maxHp, currentHp + (itemKey === "HEAL_POTION" ? 30 : 15));
              previewText = `対象: ${char.name} / HP ${currentHp}/${maxHp} → ${nextHp}/${maxHp}`;
            } else if (itemKey === "ANTIDOTE") {
              previewText = `対象: ${char.name} / 状態: 毒 → 正常`;
            } else if (itemKey === "SACRED_ASHES") {
              previewText = `対象: ${char.name} / 状態: 死亡 → 生存 (HP 1)`;
            } else if (itemKey === "MANA_POTION") {
              const currentMp = char.mp;
              const maxMp = getCharMaxMp(char);
              const nextMp = Math.min(maxMp, currentMp + 15);
              previewText = `対象: ${char.name} / MP ${currentMp}/${maxMp} → ${nextMp}/${maxMp}`;
            } else if (itemKey === "TOWN_PORTAL") {
              previewText = `対象: 全員 / 効果: お城へ安全に帰還する`;
            } else {
              previewText = `対象: ${char.name}`;
            }
            compat.textContent = `🟢 使用可能\n${previewText}`;
          } else {
            compat.style.color = "var(--neon-red)";
            compat.style.backgroundColor = "rgba(255, 0, 85, 0.05)";
            compat.textContent = `🔴 使用できません: ${useStatus.reason}`;
          }
          detailContent.appendChild(compat);

          actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.style.minHeight = "44px";
          actionBtn.style.width = "100%";
          actionBtn.style.marginTop = "8px";
          if (!useStatus.usable) {
            actionBtn.className = "btn btn-block disabled";
            actionBtn.style.opacity = "0.5";
            actionBtn.disabled = true;
            actionBtn.textContent = "使用できません";
          } else {
            actionBtn.className = "btn btn-neon btn-block";
            actionBtn.textContent = "使用する";
            actionBtn.addEventListener("click", () => {
              if (itemKey === "TOWN_PORTAL") {
                closeEquipOverlay();
                playSound("cast_spell");
                addLog(`${char.name}は帰還のスクロールを読んだ！お城へ戻った！`);
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
        } else if (equipState.mode === "equip") {
          const isIdentified = typeof itemKey !== "object" || itemKey.identified;
          const canEquip = (!item.classes || item.classes.includes(char.class)) && isIdentified;
          const slot = item.type;
          
          const isFull = state.inventory.length >= 20;
          const hasExistingEquip = !!char.equipment[slot];
          const isBagBlocked = isFull && !hasExistingEquip;

          const compat = document.createElement("div");
          compat.className = `equip-detail-compat ${canEquip && !isBagBlocked ? "yes" : "no"}`;
          compat.style.fontSize = "12px";
          compat.style.padding = "6px 8px";
          compat.style.borderRadius = "4px";
          compat.style.marginTop = "6px";

          if (canEquip && !isBagBlocked) {
            compat.style.color = "var(--neon-green)";
            compat.style.backgroundColor = "rgba(0, 255, 102, 0.05)";
            let msg = `🟢 装備可能 (対象: ${char.name})`;
            if (hasExistingEquip) {
              const oldItem = getItemData(char.equipment[slot]);
              msg += `\n※現在装備中の [${oldItem.name}] はバッグに戻ります。`;
            }
            compat.textContent = msg;
          } else {
            compat.style.color = "var(--neon-red)";
            compat.style.backgroundColor = "rgba(255, 0, 85, 0.05)";
            if (isBagBlocked) {
              compat.textContent = `🔴 装備できません: バッグがいっぱいです。既存装備がないため装備解除が発生しません。`;
            } else if (!isIdentified) {
              compat.textContent = `🔴 装備できません: 未鑑定のアイテムです。`;
            } else {
              compat.textContent = `🔴 装備できません: ${getClassJpName(char.class)}はこの装備を扱えません。`;
            }
          }
          detailContent.appendChild(compat);

          if (canEquip) {
            const preview = getEquipPreview(char, itemKey);
            if (preview) {
              const compare = document.createElement("div");
              compare.className = "equip-stat-compare";
              compare.style.marginTop = "6px";
              compare.style.border = "1px solid #22222d";
              compare.style.borderRadius = "4px";
              compare.style.padding = "6px";

              const summary = document.createElement("div");
              summary.className = `equip-stat-summary ${preview.primaryDiff > 0 ? "upgrade" : preview.primaryDiff < 0 ? "downgrade" : ""}`;
              summary.style.fontSize = "12px";
              summary.style.fontWeight = "bold";
              summary.style.marginBottom = "4px";
              
              const slotJp = { weapon: "武器", shield: "盾", armor: "鎧" }[slot] || slot;
              const oldItem = char.equipment[slot] ? getItemData(char.equipment[slot]) : null;
              summary.textContent = `${slotJp}: ${oldItem ? oldItem.name : "なし"} ➔ ${item.name}`;
              compare.appendChild(summary);

              const statRows = preview.rows.filter(st => st.diff !== 0);
              if (statRows.length === 0) {
                const noDiff = document.createElement("div");
                noDiff.style.fontSize = "11px";
                noDiff.style.color = "var(--text-muted)";
                noDiff.textContent = "ステータス変化なし";
                compare.appendChild(noDiff);
              } else {
                statRows.forEach(st => {
                  const row = document.createElement("div");
                  row.style.display = "flex";
                  row.style.justifyContent = "space-between";
                  row.style.fontSize = "11px";
                  row.style.padding = "2px 0";

                  const label = document.createElement("span");
                  label.style.color = "var(--text-muted)";
                  label.textContent = st.label;
                  row.appendChild(label);

                  const val = document.createElement("span");
                  val.style.color = st.diff > 0 ? "var(--neon-green)" : "var(--neon-red)";
                  const sign = st.diff >= 0 ? "+" : "";
                  val.textContent = `${st.current} ➔ ${st.next} (${sign}${st.diff})`;
                  row.appendChild(val);

                  compare.appendChild(row);
                });
              }
              detailContent.appendChild(compare);
            }
          }

          actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.style.minHeight = "44px";
          actionBtn.style.width = "100%";
          actionBtn.style.marginTop = "8px";
          if (!canEquip || isBagBlocked) {
            actionBtn.className = "btn btn-block disabled";
            actionBtn.style.opacity = "0.5";
            actionBtn.disabled = true;
            actionBtn.textContent = "装備できません";
          } else {
            actionBtn.className = "btn btn-neon btn-block";
            actionBtn.textContent = "装備する";
            actionBtn.addEventListener("click", () => {
              const eqData = state.inventory[equipState.selectedIdx];
              const oldEq = char.equipment[slot];
              
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
          }
        }
      } else if (equipState.mode === "unequip") {
        const actor = state.party[equipState.selectedActorIdx];
        const slot = equipState.selectedSlot;
        const isFull = state.inventory.length >= 20;

        const compat = document.createElement("div");
        compat.className = `equip-detail-compat ${!isFull ? "yes" : "no"}`;
        compat.style.fontSize = "12px";
        compat.style.padding = "6px 8px";
        compat.style.borderRadius = "4px";
        compat.style.marginTop = "6px";

        const slotJp = { weapon: "武器", shield: "盾", armor: "鎧" }[slot] || slot;

        if (!isFull) {
          compat.style.color = "var(--neon-green)";
          compat.style.backgroundColor = "rgba(0, 255, 102, 0.05)";
          compat.innerHTML = `🟢 外すことができます<br>装備者: ${actor.name} / 位置: ${slotJp}<br>バッグ空き容量: ${state.inventory.length}/20 ➔ ${state.inventory.length + 1}/20`;
        } else {
          compat.style.color = "var(--neon-red)";
          compat.style.backgroundColor = "rgba(255, 0, 85, 0.05)";
          compat.innerHTML = `🔴 外せません: バッグがいっぱいです。`;
        }
        detailContent.appendChild(compat);

        actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.style.minHeight = "44px";
        actionBtn.style.width = "100%";
        actionBtn.style.marginTop = "8px";
        if (isFull) {
          actionBtn.className = "btn btn-block disabled";
          actionBtn.style.opacity = "0.5";
          actionBtn.disabled = true;
          actionBtn.textContent = "バッグがいっぱいです";
        } else {
          actionBtn.className = "btn btn-neon btn-block";
          actionBtn.textContent = "外す";
          actionBtn.addEventListener("click", () => {
            actor.equipment[slot] = null;
            state.inventory.push(itemKey);
            saveAutosave();
            
            equipState.selectedKey = null;
            equipState.selectedSlot = null;
            equipState.selectedActorIdx = -1;
            renderEquip();
            updateUI();
          });
        }
      } else if (equipState.mode === "organize") {
        const isQuestItem = item.type === "quest";

        const compat = document.createElement("div");
        compat.className = `equip-detail-compat ${!isQuestItem ? "yes" : "no"}`;
        compat.style.fontSize = "12px";
        compat.style.padding = "6px 8px";
        compat.style.borderRadius = "4px";
        compat.style.marginTop = "6px";

        if (!isQuestItem) {
          compat.style.color = "var(--neon-green)";
          compat.style.backgroundColor = "rgba(0, 255, 102, 0.05)";
          compat.innerHTML = `⚠️ 廃棄注意: このアイテムを完全に捨てます。<br>売却ゴールドは得られません。`;
        } else {
          compat.style.color = "var(--neon-red)";
          compat.style.backgroundColor = "rgba(255, 0, 85, 0.05)";
          compat.innerHTML = `🔴 廃棄できません: クエストアイテムは捨てることはできません。`;
        }
        detailContent.appendChild(compat);

        actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.style.minHeight = "44px";
        actionBtn.style.width = "100%";
        actionBtn.style.marginTop = "8px";
        if (isQuestItem) {
          actionBtn.className = "btn btn-block disabled";
          actionBtn.style.opacity = "0.5";
          actionBtn.disabled = true;
          actionBtn.textContent = "廃棄不可";
        } else {
          actionBtn.className = "btn btn-danger btn-block";
          actionBtn.textContent = "捨てる";
          actionBtn.addEventListener("click", () => {
            if (confirm(`本当に [${item.name}] を捨てますか？この操作は取り消せません。`)) {
              state.inventory.splice(equipState.selectedIdx, 1);
              saveAutosave();
              
              equipState.selectedKey = null;
              equipState.selectedIdx = -1;
              renderEquip();
              updateUI();
            }
          });
        }
      }

      detailCol.appendChild(detailContent);
    }
  }

  if (actionBtn) {
    detailCol.appendChild(actionBtn);
  }

  body.appendChild(detailCol);
  overlay.appendChild(body);

  requestAnimationFrame(() => {
    const list = overlay.querySelector(".equip-item-list");
    if (list) {
      list.scrollTop = savedScrollTop;
    }
  });
}
