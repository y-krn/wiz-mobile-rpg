import { state, saveAutosave, addLog } from "./state.js";
import {
  getClassJpName,
  getCharMaxHp,
  getCharMaxMp,
  getItemData,
  getCharDerivedStats,
  canUseMageSpells,
  canUsePriestSpells
} from "./data.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";

export let equipState = {
  mode: "equip",
  filter: "all",
  actorIdx: 0,
  selectedIdx: -1,
  selectedKey: null,
  selectedSlot: null,
  selectedActorIdx: -1,
  selectedIsEquipped: false,
  prevGameState: null
};

const EQUIP_FILTERS = [
  { id: "all", label: "すべて" },
  { id: "weapon", label: "武器" },
  { id: "shield", label: "盾" },
  { id: "armor", label: "鎧" },
  { id: "accessory", label: "装飾" }
];

const SLOT_LABELS = {
  weapon: "武器",
  shield: "盾",
  armor: "鎧",
  accessory: "装飾"
};

const STAT_ROWS = [
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "magic", label: "魔力" },
  { key: "healing", label: "回復" },
  { key: "speed", label: "速度" },
  { key: "trap", label: "罠" },
  { key: "treasure", label: "探宝" }
];

export function openEquipOverlay(actorIdx = 0) {
  if (state.gameState !== "equip_overlay") {
    equipState.prevGameState = state.gameState;
  }
  state.gameState = "equip_overlay";
  equipState.mode = "equip";
  equipState.filter = "all";
  equipState.actorIdx = actorIdx;
  clearSelection();

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

function clearSelection() {
  equipState.selectedIdx = -1;
  equipState.selectedKey = null;
  equipState.selectedSlot = null;
  equipState.selectedActorIdx = -1;
  equipState.selectedIsEquipped = false;
}

function isEquipmentItem(item) {
  return item && (item.type === "weapon" || item.type === "shield" || item.type === "armor" || item.type === "accessory");
}

function isIdentified(itemKey) {
  return typeof itemKey !== "object" || itemKey.identified;
}

function getDisplayStats(char) {
  return getCharDerivedStats(char);
}

function getEquipPreview(char, itemKey) {
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) return null;

  const slot = item.type;
  const current = getDisplayStats(char);
  const oldEq = char.equipment[slot];
  char.equipment[slot] = itemKey;
  const next = getDisplayStats(char);
  char.equipment[slot] = oldEq;

  const rows = STAT_ROWS.map((stat) => ({
    ...stat,
    current: current[stat.key],
    next: next[stat.key],
    diff: next[stat.key] - current[stat.key]
  }));
  const primaryKey = slot === "weapon" ? "attack" : "defense";
  const primaryDiff = rows.find((row) => row.key === primaryKey)?.diff ?? 0;
  return { item, slot, rows, primaryDiff, oldEq };
}

function getUnequipPreview(char, slot) {
  const itemKey = char.equipment[slot];
  const item = getItemData(itemKey);
  if (!item) return null;

  const current = getDisplayStats(char);
  char.equipment[slot] = null;
  const next = getDisplayStats(char);
  char.equipment[slot] = itemKey;

  const rows = STAT_ROWS.map((stat) => ({
    ...stat,
    current: current[stat.key],
    next: next[stat.key],
    diff: next[stat.key] - current[stat.key]
  }));
  const primaryKey = slot === "weapon" ? "attack" : "defense";
  const primaryDiff = rows.find((row) => row.key === primaryKey)?.diff ?? 0;
  return { item, slot, rows, primaryDiff, oldEq: null };
}

export function getItemUseStatus(char, itemKey) {
  const item = getItemData(itemKey);
  if (!item || item.type !== "usable") return { usable: true, reason: "" };
  const canRestoreMp = canUsePriestSpells(char) || canUseMageSpells(char);

  if (item.combatOnly && !state.combatState) {
    return { usable: false, reason: "戦闘中のみ使用できます" };
  }

  if (itemKey === "ESCAPE_SCROLL" && state.combatState && (state.combatState.isBoss || state.combatState.isMidboss)) {
    return { usable: false, reason: "ボス戦では使用できません" };
  }

  if (char.status === "dead") {
    if (itemKey !== "SACRED_ASHES" && itemKey !== "LIFE_WATER") {
      return { usable: false, reason: "死亡中は回復アイテムを使用できません" };
    }
  } else {
    if (itemKey === "SACRED_ASHES" || itemKey === "LIFE_WATER") {
      return { usable: false, reason: "蘇生アイテムは死亡キャラの画面で使用できます" };
    }
    if ((itemKey === "HEAL_POTION" || itemKey === "GREATER_HEAL") && char.hp >= getCharMaxHp(char)) {
      return { usable: false, reason: "HPはすでに満タンです" };
    }
    if (itemKey === "ANTIDOTE" && char.status !== "poisoned") {
      return { usable: false, reason: "毒状態ではありません" };
    }
    if (itemKey === "EYE_DROPS" && char.status !== "blind") {
      return { usable: false, reason: "盲目状態ではありません" };
    }
    if (itemKey === "PARALYZE_CURE" && char.status !== "paralyzed" && char.status !== "paralyze") {
      return { usable: false, reason: "麻痺状態ではありません" };
    }
    if (itemKey === "WAKE_POWDER" && char.status !== "sleep") {
      return { usable: false, reason: "睡眠状態ではありません" };
    }
    if (itemKey === "PANACEA" && !["poisoned", "blind", "paralyzed", "paralyze", "sleep"].includes(char.status)) {
      return { usable: false, reason: "治療できる状態異常ではありません" };
    }
    if ((itemKey === "MANA_POTION" || itemKey === "ETHER") && (!canRestoreMp || char.mp >= getCharMaxMp(char))) {
      return { usable: false, reason: canRestoreMp ? "MPはすでに満タンです" : "MPを持たない職業です" };
    }
  }
  return { usable: true, reason: "" };
}

function getEquipmentItems() {
  const typePriority = { weapon: 0, shield: 1, armor: 2, accessory: 3 };
  return state.inventory
    .map((itemKey, idx) => ({ itemKey, idx, item: getItemData(itemKey) }))
    .filter(({ item }) => {
      if (!isEquipmentItem(item)) return false;
      if (equipState.filter === "all") return true;
      return item.type === equipState.filter;
    })
    .sort((a, b) => {
      const priA = typePriority[a.item?.type] ?? 9;
      const priB = typePriority[b.item?.type] ?? 9;
      if (priA !== priB) return priA - priB;
      return a.idx - b.idx;
    });
}

function getItemSummary(item) {
  if (item.type === "weapon") return `攻撃 +${item.atk || 0}`;
  if (item.type === "shield") return `防御 +${item.def || 0}`;
  if (item.type === "armor") return `防御 +${item.def || 0}`;
  if (item.type === "accessory") {
    if (item.hpBonus) return `HP +${item.hpBonus}`;
    if (item.mpBonus) return `MP +${item.mpBonus}`;
    if (item.trapBonus) return `罠 +${item.trapBonus}%`;
    const stat = Object.entries(item.statsBonus || {}).find(([, value]) => value);
    if (stat) return `${stat[0].toUpperCase()} +${stat[1]}`;
    const affix = Object.entries(item.affixBonus || {}).find(([, value]) => value);
    if (affix) return `${affix[0]} +${affix[1]}%`;
  }
  return "";
}

function canEquip(char, itemKey) {
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) {
    return { ok: false, reason: "装備品ではありません" };
  }
  if (item.classes && !item.classes.includes(char.class)) {
    return { ok: false, reason: `${getClassJpName(char.class)}は装備できません` };
  }
  return { ok: true, reason: "" };
}

function createHeader(overlay) {
  const header = document.createElement("div");
  header.className = "equip-header-area";

  const titleRow = document.createElement("div");
  titleRow.className = "equip-title-row";

  const title = document.createElement("span");
  title.className = "equip-title";
  title.textContent = "装備";
  titleRow.appendChild(title);

  const btnClose = document.createElement("button");
  btnClose.id = "btn-equip-close";
  btnClose.className = "btn btn-danger";
  btnClose.textContent = "閉じる";
  btnClose.addEventListener("click", closeEquipOverlay);
  titleRow.appendChild(btnClose);
  header.appendChild(titleRow);

  const statusBar = document.createElement("div");
  statusBar.className = "equip-status-bar";
  statusBar.innerHTML = `
    <span>所持金 ${state.gold}G</span>
    <span class="${state.inventory.length >= 20 ? "full" : ""}">バッグ ${state.inventory.length}/20</span>
  `;
  header.appendChild(statusBar);

  const actorRow = document.createElement("div");
  actorRow.className = "equip-actor-row";
  state.party.forEach((char, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `equip-actor-chip ${idx === equipState.actorIdx ? "active" : ""}`;
    btn.setAttribute("aria-pressed", idx === equipState.actorIdx ? "true" : "false");
    btn.innerHTML = `
      <span>${char.name}</span>
      <small>${getClassJpName(char.class)} Lv.${char.level} / HP ${char.hp}/${getCharMaxHp(char)}</small>
    `;
    btn.addEventListener("click", () => {
      equipState.actorIdx = idx;
      renderEquip();
    });
    actorRow.appendChild(btn);
  });
  header.appendChild(actorRow);

  const filterRow = document.createElement("div");
  filterRow.className = "equip-filters";
  EQUIP_FILTERS.forEach((filter) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `equip-filter-chip ${equipState.filter === filter.id ? "active" : ""}`;
    chip.textContent = filter.label;
    chip.addEventListener("click", () => {
      equipState.filter = filter.id;
      clearSelection();
      renderEquip();
    });
    filterRow.appendChild(chip);
  });
  header.appendChild(filterRow);
  overlay.appendChild(header);
}

function createEquipmentList(char, savedScrollTop) {
  const listContainer = document.createElement("div");
  listContainer.className = "equip-list-container";

  const itemList = document.createElement("div");
  itemList.className = "equip-item-list";

  // 1. 装備中セクション
  const headingEquipped = document.createElement("div");
  headingEquipped.className = "equip-list-heading";
  headingEquipped.textContent = "装備中";
  itemList.appendChild(headingEquipped);

  const slots = [
    { id: "weapon", label: "武器" },
    { id: "shield", label: "盾" },
    { id: "armor", label: "鎧" },
    { id: "accessory", label: "装飾" }
  ];

  const filteredSlots = slots.filter(s => equipState.filter === "all" || equipState.filter === s.id);
  filteredSlots.forEach(({ id, label }) => {
    const itemKey = char.equipment[id];
    const item = itemKey ? getItemData(itemKey) : null;
    const selected = equipState.selectedIsEquipped && equipState.selectedSlot === id;
    
    const row = document.createElement("button");
    row.type = "button";
    row.className = `equip-item-row ${selected ? "selected" : ""}`;
    row.setAttribute("aria-selected", selected ? "true" : "false");

    const left = document.createElement("div");
    left.className = "equip-item-row-main";
    const name = document.createElement("span");
    name.className = "equip-item-row-name";
    name.textContent = item ? item.name : "（なし）";
    if (!item) {
      name.style.color = "var(--text-muted)";
    }
    left.appendChild(name);

    const summary = document.createElement("span");
    summary.className = "equip-item-row-tag";
    summary.textContent = `${label} ${item ? `/ ${getItemSummary(item)}` : ""}`;
    left.appendChild(summary);
    row.appendChild(left);

    row.addEventListener("click", () => {
      if (!itemKey) {
        clearSelection();
      } else {
        if (selected) {
          clearSelection();
        } else {
          equipState.selectedIdx = -1;
          equipState.selectedKey = itemKey;
          equipState.selectedSlot = id;
          equipState.selectedActorIdx = equipState.actorIdx;
          equipState.selectedIsEquipped = true;
        }
      }
      renderEquip();
    });

    itemList.appendChild(row);
  });

  // 2. バッグの装備品セクション
  const headingBag = document.createElement("div");
  headingBag.className = "equip-list-heading";
  headingBag.textContent = "バッグの装備品";
  itemList.appendChild(headingBag);

  const equipmentItems = getEquipmentItems();

  if (equipmentItems.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.textContent = "装備品がバッグにありません。";
    itemList.appendChild(placeholder);
  } else {
    let currentType = "";
    equipmentItems.forEach(({ itemKey, idx, item }) => {
      if (item.type !== currentType) {
        currentType = item.type;
        const heading = document.createElement("div");
        heading.className = "equip-list-heading";
        heading.textContent = SLOT_LABELS[currentType];
        itemList.appendChild(heading);
      }

      const selected = !equipState.selectedIsEquipped && equipState.selectedIdx === idx;
      const availability = canEquip(char, itemKey);
      const preview = getEquipPreview(char, itemKey);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `equip-item-row ${selected ? "selected" : ""} ${availability.ok ? "" : "not-equipable"}`;
      row.setAttribute("aria-selected", selected ? "true" : "false");

      const left = document.createElement("div");
      left.className = "equip-item-row-main";
      const name = document.createElement("span");
      name.className = "equip-item-row-name";
      name.textContent = item.name;
      left.appendChild(name);

      const summary = document.createElement("span");
      summary.className = "equip-item-row-tag";
      summary.textContent = `${SLOT_LABELS[item.type]} / ${getItemSummary(item)}`;
      left.appendChild(summary);
      row.appendChild(left);

      const badge = document.createElement("span");
      if (!isIdentified(itemKey)) {
        badge.className = "equip-row-badge unident";
        badge.textContent = "未鑑定";
        badge.style.background = "rgba(255, 170, 0, 0.2)";
        badge.style.color = "rgb(255, 170, 0)";
      } else if (!availability.ok) {
        badge.className = "equip-row-badge cant";
        badge.textContent = "不可";
      } else {
        badge.className = `equip-row-badge ${preview.primaryDiff > 0 ? "up" : preview.primaryDiff < 0 ? "down" : "zero"}`;
        badge.textContent = `${preview.primaryDiff >= 0 ? "+" : ""}${preview.primaryDiff}`;
      }
      row.appendChild(badge);

      row.addEventListener("click", () => {
        if (selected) {
          clearSelection();
        } else {
          equipState.selectedIdx = idx;
          equipState.selectedKey = itemKey;
          equipState.selectedSlot = item.type;
          equipState.selectedActorIdx = equipState.actorIdx;
          equipState.selectedIsEquipped = false;
        }
        renderEquip();
      });
      itemList.appendChild(row);
    });
  }

  listContainer.appendChild(itemList);
  requestAnimationFrame(() => {
    itemList.scrollTop = savedScrollTop;
  });
  return listContainer;
}

function createStatPill(row) {
  const pill = document.createElement("div");
  pill.className = `equip-stat-pill ${row.diff > 0 ? "upgrade" : row.diff < 0 ? "downgrade" : ""}`;
  const sign = row.diff >= 0 ? "+" : "";
  pill.innerHTML = `
    <span>${row.label}</span>
    <strong>${row.current}→${row.next}</strong>
    <em>${sign}${row.diff}</em>
  `;
  return pill;
}

function createDetailPanel(char) {
  const detailCol = document.createElement("div");
  detailCol.className = "equip-detail-col";

  if (equipState.selectedKey === null) {
    const placeholder = document.createElement("div");
    placeholder.className = "equip-detail-placeholder";
    placeholder.textContent = "装備品を選択してください。";
    detailCol.appendChild(placeholder);
    return detailCol;
  }

  const itemKey = equipState.selectedKey;
  const item = getItemData(itemKey);
  const isEquipped = equipState.selectedIsEquipped;

  let preview;
  let availability;
  if (isEquipped) {
    preview = getUnequipPreview(char, equipState.selectedSlot);
    availability = { ok: true, reason: "" };
  } else {
    preview = getEquipPreview(char, itemKey);
    availability = canEquip(char, itemKey);
  }

  const content = document.createElement("div");
  content.className = "equip-detail-content";

  const heading = document.createElement("div");
  heading.className = "equip-detail-heading";
  heading.innerHTML = `
    <div>
      <div class="equip-detail-name">${item.name}</div>
      <div class="equip-detail-desc">${item.desc || getItemSummary(item)}</div>
    </div>
    <div class="equip-target-summary">${char.name}<small>${getClassJpName(char.class)} Lv.${char.level}</small></div>
  `;
  content.appendChild(heading);

  const exchange = document.createElement("div");
  exchange.className = "equip-exchange-line";
  if (isEquipped) {
    exchange.textContent = `${SLOT_LABELS[equipState.selectedSlot]}: ${item.name} → なし`;
  } else {
    const currentEquip = preview?.oldEq ? getItemData(preview.oldEq) : null;
    exchange.textContent = `${SLOT_LABELS[item.type]}: ${currentEquip ? currentEquip.name : "なし"} → ${item.name}`;
  }
  content.appendChild(exchange);

  if (preview && availability.ok) {
    const primaryRows = preview.rows.filter((row) => row.diff !== 0);
    const importantRows = primaryRows.length > 0 ? primaryRows.slice(0, 7) : preview.rows.slice(0, 2);
    const statGrid = document.createElement("div");
    statGrid.className = "equip-stat-grid";
    importantRows.forEach((row) => {
      statGrid.appendChild(createStatPill(row));
    });
    content.appendChild(statGrid);
  }

  const compat = document.createElement("div");
  if (isEquipped) {
    compat.className = "equip-detail-compat yes";
    compat.textContent = "現在装備しています";
  } else {
    compat.className = `equip-detail-compat ${availability.ok ? "yes" : "no"}`;
    compat.textContent = availability.ok ? "装備できます" : availability.reason;
  }
  content.appendChild(compat);

  detailCol.appendChild(content);

  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  if (isEquipped) {
    const bagFull = state.inventory.length >= 20;
    actionBtn.className = bagFull ? "btn btn-block equip-action-btn disabled" : "btn btn-neon btn-block equip-action-btn";
    actionBtn.disabled = bagFull;
    actionBtn.textContent = bagFull ? "バッグが満杯です" : "外す";
    actionBtn.addEventListener("click", () => {
      if (bagFull) return;
      const currentChar = state.party[equipState.actorIdx];
      const slot = equipState.selectedSlot;
      const currentItemKey = currentChar.equipment[slot];
      const itemData = getItemData(currentItemKey);

      currentChar.equipment[slot] = null;
      state.inventory.push(currentItemKey);

      addLog(`${currentChar.name}は${itemData.name}を外した。`);
      playSound("move");
      saveAutosave();
      clearSelection();
      renderEquip();
      updateUI();
    });
  } else {
    actionBtn.className = availability.ok ? "btn btn-neon btn-block equip-action-btn" : "btn btn-block equip-action-btn disabled";
    actionBtn.disabled = !availability.ok;
    actionBtn.textContent = availability.ok ? "装備する" : "装備できません";
    actionBtn.addEventListener("click", () => {
      if (!availability.ok) return;
      const currentChar = state.party[equipState.actorIdx];
      const selectedItem = state.inventory[equipState.selectedIdx];
      const selectedData = getItemData(selectedItem);
      const slot = selectedData.type;
      const oldEq = currentChar.equipment[slot];

      currentChar.equipment[slot] = selectedItem;
      if (oldEq) {
        state.inventory[equipState.selectedIdx] = oldEq;
      } else {
        state.inventory.splice(equipState.selectedIdx, 1);
      }

      addLog(`${currentChar.name}は${selectedData.name}を装備した。`);
      playSound("move");
      saveAutosave();
      clearSelection();
      renderEquip();
      updateUI();
    });
  }
  detailCol.appendChild(actionBtn);
  return detailCol;
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

  createHeader(overlay);

  const body = document.createElement("div");
  body.className = "equip-body";
  body.appendChild(createEquipmentList(char, savedScrollTop));
  body.appendChild(createDetailPanel(char));
  overlay.appendChild(body);
}
