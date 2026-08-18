import { state, saveAutosave, addLog } from "./state.js";
import {
  getClassJpName,
  getCharMaxHp,
  getCharMaxMp,
  getItemData,
  getCharAffixSum,
  getCharDerivedStats,
  getCharStr,
  getCharInt,
  getCharPie,
  getCharVit,
  getCharAgi,
  getCharLuk,
  formatAffixText,
  canUseManaItems,
  isCurseLocked
} from "./data.js";
import { CURSE_EFFECTS } from "./data/items.js";
import {
  identifyEquipment,
  revealEquipmentOnEquip
} from "./systems/identification.js";
import { IDENTIFICATION_BALANCE } from "./rules/identification_rules.js";
import { playSound } from "./audio.js";
import { updateUI } from "./ui.js";
import {
  executeEnhance,
  getEnhanceCost,
  executePolish,
  getPolishCost
} from "./craft.js";
import { getAffixDefinition } from "./data/affixes.js";
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_TYPE_LABELS,
  getEquipmentSlot,
  getEquipmentSlotsForType
} from "./rules/equipment_slots.js";

export let equipState = {
  mode: "equip",
  filter: "all",
  actorIdx: 0,
  selectedIdx: -1,
  selectedKey: null,
  selectedSlot: null,
  selectedActorIdx: -1,
  selectedIsEquipped: false,
  listScrollTop: 0,
  prevGameState: null
};

const EQUIP_FILTERS = [
  { id: "all", label: "すべて" },
  ...Object.entries(EQUIPMENT_TYPE_LABELS).map(([id, label]) => ({ id, label }))
];

const SLOT_LABELS = Object.fromEntries(
  EQUIPMENT_SLOTS.map(({ id, label }) => [id, label])
);

const RARITY_LABELS = {
  common: "COMMON",
  magic: "MAGIC",
  rare: "RARE",
  epic: "EPIC"
};

const STAT_ROWS = [
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "maxHp", label: "最大HP" },
  { key: "maxMp", label: "最大MP" },
  { key: "str", label: "力" },
  { key: "int", label: "知恵" },
  { key: "pie", label: "信仰" },
  { key: "vit", label: "生命" },
  { key: "agi", label: "素早さ" },
  { key: "luk", label: "運" },
  { key: "magic", label: "魔力" },
  { key: "healing", label: "回復" },
  { key: "speed", label: "速度" },
  { key: "trap", label: "罠" },
  { key: "treasure", label: "探宝" },
  { key: "spellGuard", label: "魔法耐性" },
  { key: "antiDragon", label: "竜特効" },
  { key: "antiUndead", label: "不死特効" },
  { key: "firstStrike", label: "先制" },
  { key: "poisonWard", label: "毒耐性" },
  { key: "poisonAtk", label: "毒付与" }
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

function getDefaultTargetSlot(char, itemType) {
  const slots = getEquipmentSlotsForType(itemType);
  const emptySlot = slots.find(({ id }) => !char.equipment?.[id]);
  if (emptySlot) return emptySlot.id;
  const replaceableSlot = slots.find(({ id }) => !isCurseLocked(char.equipment?.[id]));
  return replaceableSlot?.id || slots[0]?.id || null;
}

function getTargetSlot(char, itemType, requestedSlot = null) {
  const requested = getEquipmentSlot(requestedSlot);
  return requested?.itemType === itemType
    ? requested.id
    : getDefaultTargetSlot(char, itemType);
}

function isIdentified(itemKey) {
  return !itemKey || typeof itemKey !== "object" || itemKey.identified === true;
}

function getRarityInfo(itemKey) {
  if (!itemKey || !isIdentified(itemKey) || typeof itemKey !== "object") return null;
  const label = RARITY_LABELS[itemKey.rarity];
  return label ? { key: itemKey.rarity, label } : null;
}

function getRarityClass(itemKey) {
  const rarity = getRarityInfo(itemKey);
  return rarity ? `rarity-${rarity.key}` : "";
}

function createRarityBadge(itemKey, className = "") {
  const rarity = getRarityInfo(itemKey);
  if (!rarity) return null;

  const badge = document.createElement("span");
  badge.className = `equip-rarity-badge ${rarity.key} ${className}`.trim();
  badge.textContent = rarity.label;
  badge.setAttribute("aria-label", `レア度 ${rarity.label}`);
  return badge;
}

function getDisplayStats(char) {
  const derived = getCharDerivedStats(char, { floor: state.floor });
  return {
    ...derived,
    maxHp: getCharMaxHp(char),
    maxMp: getCharMaxMp(char),
    str: getCharStr(char),
    int: getCharInt(char),
    pie: getCharPie(char),
    vit: getCharVit(char),
    agi: getCharAgi(char),
    luk: getCharLuk(char),
    spellGuard: getCharAffixSum(char, "spellGuard"),
    antiDragon: getCharAffixSum(char, "antiDragon"),
    antiUndead: getCharAffixSum(char, "antiUndead"),
    firstStrike: getCharAffixSum(char, "firstStrike"),
    poisonWard: getCharAffixSum(char, "poisonWard"),
    poisonAtk: getCharAffixSum(char, "poisonAtk")
  };
}

function getPrimaryDiff(itemType, rows) {
  if (itemType === "weapon") return rows.find((row) => row.key === "attack")?.diff ?? 0;
  if (itemType === "shield" || itemType === "armor") return rows.find((row) => row.key === "defense")?.diff ?? 0;
  return rows.find((row) => row.diff !== 0)?.diff ?? 0;
}

function getEquipPreview(char, itemKey, requestedSlot = null) {
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) return null;

  const slot = getTargetSlot(char, item.type, requestedSlot);
  if (!slot) return null;
  const current = getDisplayStats(char);
  const oldEq = char.equipment?.[slot] || null;
  char.equipment[slot] = itemKey;
  const next = getDisplayStats(char);
  char.equipment[slot] = oldEq;

  const rows = STAT_ROWS.map((stat) => ({
    ...stat,
    current: current[stat.key],
    next: next[stat.key],
    diff: next[stat.key] - current[stat.key]
  }));
  const primaryDiff = getPrimaryDiff(item.type, rows);
  return { item, itemType: item.type, slot, rows, primaryDiff, oldEq };
}

function getUnequipPreview(char, slot) {
  const itemKey = char.equipment?.[slot];
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
  const primaryDiff = getPrimaryDiff(item.type, rows);
  return { item, itemType: item.type, slot, rows, primaryDiff, oldEq: null };
}

export function getItemUseStatus(char, itemKey) {
  const item = getItemData(itemKey);
  if (!item || item.type !== "usable") return { usable: true, reason: "" };
  const canRestoreMp = canUseManaItems(char);

  if (item.combatOnly && !state.combatState) {
    return { usable: false, reason: "戦闘中のみ使用できます" };
  }

  if (itemKey === "ESCAPE_SCROLL" && state.combatState && (state.combatState.isBoss || state.combatState.isMidboss)) {
    return { usable: false, reason: "ボス戦では使用できません" };
  }

  if (char.status === "dead") {
    return { usable: false, reason: "死亡中はアイテムを使用できません" };
  } else {
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

function isItemEquipped(itemKey) {
  return state.party.some((char) =>
    Object.values(char.equipment || {}).some((equippedKey) => equippedKey === itemKey)
  );
}

function discardEquipment(itemIdx, expectedItemKey) {
  const selectedItem = state.inventory[itemIdx];
  const item = getItemData(selectedItem);
  if (selectedItem !== expectedItemKey || !isEquipmentItem(item) || isItemEquipped(selectedItem)) {
    return false;
  }

  const displayName = `${isIdentified(selectedItem) ? "" : "? "}${item.name}`;
  if (!confirm(`「${displayName}」を破棄しますか？この操作は取り消せません。`)) {
    return false;
  }

  state.inventory.splice(itemIdx, 1);
  addLog(`[破棄] ${displayName}を破棄した。`);
  playSound("move");
  saveAutosave();
  clearSelection();
  renderEquip();
  updateUI();
  return true;
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

function canEquip(char, itemKey, requestedSlot = null) {
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) {
    return { ok: false, reason: "装備品ではありません" };
  }
  if (item.classes && !item.classes.includes(char.class)) {
    return { ok: false, reason: `${getClassJpName(char.class)}は装備できません` };
  }
  const slot = getTargetSlot(char, item.type, requestedSlot);
  if (!slot) {
    return { ok: false, reason: "装備先がありません" };
  }
  if (isCurseLocked(char.equipment?.[slot])) {
    return { ok: false, reason: "現在の呪い装備を外せません" };
  }
  return { ok: true, reason: "", slot };
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
  header.appendChild(titleRow);

  const statusBar = document.createElement("div");
  statusBar.className = "equip-status-bar";
  statusBar.innerHTML = `
    <span>素材 ${Object.values(state.currentRun?.materials || {}).reduce((sum, quantity) => sum + quantity, 0)}</span>
    <span class="${state.inventory.length >= 20 ? "full" : ""}">バッグ ${state.inventory.length}/20</span>
  `;
  header.appendChild(statusBar);
  overlay.appendChild(header);
}

function createFooter(overlay) {
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  const filterRow = document.createElement("div");
  filterRow.className = "bottom-actions-row equip-filters";
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
  footer.appendChild(filterRow);

  const actorRow = document.createElement("div");
  actorRow.className = "bottom-actions-row equip-actor-row";
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
  footer.appendChild(actorRow);

  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";
  const btnClose = document.createElement("button");
  btnClose.id = "btn-equip-close";
  btnClose.className = "btn btn-danger";
  btnClose.textContent = "閉じる";
  btnClose.addEventListener("click", closeEquipOverlay);
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}

function createEquipmentList(char, savedScrollTop) {
  const listContainer = document.createElement("div");
  listContainer.className = "equip-list-container";

  const filteredSlots = EQUIPMENT_SLOTS.filter(s => equipState.filter === "all" || equipState.filter === s.itemType);
  const equippedCount = filteredSlots.filter(({ id }) => char.equipment[id] && getItemData(char.equipment[id])).length;

  const equippedSection = document.createElement("section");
  equippedSection.className = "equip-list-section equip-equipped-section";

  const headingEquipped = document.createElement("h2");
  headingEquipped.className = "equip-section-heading";
  headingEquipped.textContent = `装備中（${equippedCount}枠）`;
  equippedSection.appendChild(headingEquipped);

  const equippedRows = document.createElement("div");
  equippedRows.className = "equip-equipped-rows";

  const emptySlots = [];
  const comparisonRows = [];
  const condensedRows = [];
  filteredSlots.forEach(({ id, label }) => {
    const itemKey = char.equipment[id];
    const item = itemKey ? getItemData(itemKey) : null;
    const selected = equipState.selectedIsEquipped && equipState.selectedSlot === id;

    if (!item) {
      emptySlots.push({ id, label });
      return;
    }

    const comparisonTarget = equipState.selectedSlot === id;
    
    const row = document.createElement("button");
    row.type = "button";
    row.className = `equip-item-row equip-equipped-row ${getRarityClass(itemKey)} ${selected ? "selected" : ""} ${comparisonTarget ? "is-comparison-target" : "is-condensed"}`.trim();
    row.dataset.slotId = id;
    row.setAttribute("aria-selected", selected ? "true" : "false");
    if (comparisonTarget) row.setAttribute("aria-current", "location");

    const left = document.createElement("div");
    left.className = "equip-item-row-main";
    const name = document.createElement("span");
    name.className = "equip-item-row-name";
    name.textContent = item ? `${isIdentified(itemKey) ? "" : "? "}${item.name}` : "（なし）";
    if (!item) {
      name.style.color = "var(--text-muted)";
    }
    left.appendChild(name);

    const summary = document.createElement("span");
    summary.className = "equip-item-row-tag";
    summary.textContent = comparisonTarget
      ? `${label} ${item ? `/ ${isCurseLocked(itemKey) ? "🔒 呪い・外せない" : (isIdentified(itemKey) ? getItemSummary(item) : "比較不能")}` : ""}`
      : `${label}${isCurseLocked(itemKey) ? " / 🔒 呪い・外せない" : ""}`;
    left.appendChild(summary);
    row.appendChild(left);

    const badges = document.createElement("span");
    badges.className = "equip-item-row-badges";
    const stateBadge = document.createElement("span");
    stateBadge.className = "equip-row-badge equipped";
    stateBadge.textContent = "装備中";
    badges.appendChild(stateBadge);
    const rarityBadge = createRarityBadge(itemKey);
    if (rarityBadge) badges.appendChild(rarityBadge);
    row.appendChild(badges);

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

    if (comparisonTarget) {
      comparisonRows.push(row);
    } else {
      condensedRows.push(row);
    }
  });

  comparisonRows.forEach(row => equippedRows.appendChild(row));
  condensedRows.forEach(row => equippedRows.appendChild(row));

  equippedSection.appendChild(equippedRows);

  if (emptySlots.length > 0) {
    const emptySlotSummary = document.createElement("div");
    emptySlotSummary.className = "equip-empty-slots";
    emptySlotSummary.setAttribute("aria-label", "空いている装備スロット");
    emptySlots.forEach(({ id, label }) => {
      const comparisonTarget = equipState.selectedSlot === id;
      const emptySlot = document.createElement("span");
      emptySlot.className = `equip-empty-slot ${comparisonTarget ? "is-comparison-target" : ""}`.trim();
      emptySlot.dataset.slotId = id;
      emptySlot.textContent = `${label}: 空き`;
      if (comparisonTarget) emptySlot.setAttribute("aria-current", "location");
      emptySlotSummary.appendChild(emptySlot);
    });
    equippedSection.appendChild(emptySlotSummary);
  }

  listContainer.appendChild(equippedSection);

  const bagSection = document.createElement("section");
  bagSection.className = "equip-list-section equip-bag-section";

  const headingBag = document.createElement("h2");
  headingBag.className = "equip-section-heading";
  headingBag.textContent = "バッグの装備品";
  bagSection.appendChild(headingBag);

  const itemList = document.createElement("div");
  itemList.className = "equip-item-list";

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
        const heading = document.createElement("h3");
        heading.className = "equip-type-heading";
        heading.textContent = EQUIPMENT_TYPE_LABELS[currentType];
        itemList.appendChild(heading);
      }

      const selected = !equipState.selectedIsEquipped && equipState.selectedIdx === idx;
      const preview = getEquipPreview(char, itemKey, equipState.selectedSlot);
      const availability = canEquip(char, itemKey, preview?.slot);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `equip-item-row ${getRarityClass(itemKey)} ${selected ? "selected" : ""} ${availability.ok ? "" : "not-equipable"}`.trim();
      row.setAttribute("aria-selected", selected ? "true" : "false");

      const left = document.createElement("div");
      left.className = "equip-item-row-main";
      const name = document.createElement("span");
      name.className = "equip-item-row-name";
      name.textContent = `${isIdentified(itemKey) ? "" : "? "}${item.name}`;
      left.appendChild(name);

      const summary = document.createElement("span");
      summary.className = "equip-item-row-tag";
      summary.textContent = `${EQUIPMENT_TYPE_LABELS[item.type]} / ${isIdentified(itemKey) ? getItemSummary(item) : "比較不能"}`;
      left.appendChild(summary);
      row.appendChild(left);

      const badges = document.createElement("span");
      badges.className = "equip-item-row-badges";
      const rarityBadge = createRarityBadge(itemKey);
      if (rarityBadge) badges.appendChild(rarityBadge);

      const badge = document.createElement("span");
      if (!isIdentified(itemKey)) {
        badge.className = "equip-row-badge unident";
        badge.textContent = "? 未鑑定";
        badge.style.background = "rgba(255, 170, 0, 0.2)";
        badge.style.color = "rgb(255, 170, 0)";
      } else if (!availability.ok) {
        badge.className = "equip-row-badge cant";
        badge.textContent = "不可";
      } else {
        badge.className = `equip-row-badge ${preview.primaryDiff > 0 ? "up" : preview.primaryDiff < 0 ? "down" : "zero"}`;
        badge.textContent = `${preview.primaryDiff >= 0 ? "+" : ""}${preview.primaryDiff}`;
      }
      badges.appendChild(badge);
      row.appendChild(badges);

      row.addEventListener("click", () => {
        if (selected) {
          clearSelection();
        } else {
          equipState.selectedIdx = idx;
          equipState.selectedKey = itemKey;
          equipState.selectedSlot = preview?.slot || getDefaultTargetSlot(char, item.type);
          equipState.selectedActorIdx = equipState.actorIdx;
          equipState.selectedIsEquipped = false;
        }
        renderEquip();
      });
      itemList.appendChild(row);
    });
  }

  bagSection.appendChild(itemList);
  listContainer.appendChild(bagSection);
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

function createAffixDetails(itemKey) {
  if (typeof itemKey !== "object" || !itemKey.identified) return null;

  const details = document.createElement("div");
  details.className = "equip-affix-details";
  const groups = [
    { kind: "core", label: "コア" },
    { kind: "support", label: "サポート" }
  ];

  groups.forEach(group => {
    const affixes = itemKey.affixes.filter(affix => (affix.kind || "support") === group.kind);
    if (affixes.length === 0) return;
    const section = document.createElement("div");
    section.className = `equip-affix-group ${group.kind}`;
    const label = document.createElement("strong");
    label.textContent = group.label;
    section.appendChild(label);
    affixes.forEach(affix => {
      const line = document.createElement("span");
      line.textContent = `${group.kind === "support" ? "・" : ""}${formatAffixText(affix, ": ")}`;
      section.appendChild(line);
    });
    details.appendChild(section);
  });

  if (itemKey.curseEffectId) {
    const curse = CURSE_EFFECTS[itemKey.curseEffectId];
    const section = document.createElement("div");
    section.className = "equip-affix-group curse";
    const label = document.createElement("strong");
    label.textContent = "🔒 呪い・装備解除不可";
    section.appendChild(label);
    const line = document.createElement("span");
    line.textContent = `${curse?.name || "不明な呪い"}: ${curse?.desc || "効果不明"}`;
    section.appendChild(line);
    details.appendChild(section);
  }

  return details.childElementCount > 0 ? details : null;
}

function getSelectedItemKey() {
  if (equipState.selectedIsEquipped) {
    return state.party[equipState.actorIdx]?.equipment?.[equipState.selectedSlot] || null;
  }
  return state.inventory[equipState.selectedIdx] || null;
}

function getSelectedWorkshopTarget() {
  return equipState.selectedIsEquipped
    ? { type: "equipped", actorIdx: equipState.actorIdx, slot: equipState.selectedSlot }
    : { type: "inventory", index: equipState.selectedIdx };
}

function createMaterialCost(cost) {
  const list = document.createElement("div");
  list.className = "equip-material-cost";
  Object.entries(cost?.mats || {}).forEach(([material, required]) => {
    const owned = state.metaMaterials?.[material] || 0;
    const line = document.createElement("span");
    line.className = `equip-material-line ${owned < required ? "insufficient" : ""}`.trim();
    line.textContent = `${material} ${owned}/${required}`;
    line.dataset.material = material;
    list.appendChild(line);
  });
  return list;
}

function getSupportAffixes(itemKey) {
  if (!itemKey || typeof itemKey !== "object" || !Array.isArray(itemKey.affixes)) return [];
  return itemKey.affixes.flatMap((affix, index) => {
    const definition = getAffixDefinition(affix);
    const kind = affix.kind || definition?.kind || "support";
    return kind === "support" && definition?.enabled ? [{ affix, definition, index }] : [];
  });
}

function createWorkshopPanel(itemKey) {
  const item = getItemData(itemKey);
  const panel = document.createElement("section");
  panel.className = "equip-workshop-panel";
  panel.setAttribute("aria-label", "工房アクション");
  panel.setAttribute("aria-live", "polite");

  const heading = document.createElement("h3");
  heading.className = "equip-workshop-heading";
  heading.textContent = "工房";
  panel.appendChild(heading);

  const target = getSelectedWorkshopTarget();
  const enhanceSection = document.createElement("div");
  enhanceSection.className = "equip-workshop-section equip-enhance-section";
  const enhanceTitle = document.createElement("strong");
  enhanceTitle.textContent = "装備強化";
  enhanceSection.appendChild(enhanceTitle);

  const enhanceLevel = itemKey?.enhanceLevel || 0;
  const enhanceStatus = document.createElement("span");
  enhanceStatus.className = "equip-workshop-status";
  enhanceStatus.textContent = `強化段階: +${enhanceLevel} / +1`;
  enhanceSection.appendChild(enhanceStatus);

  const enhanceStat = isIdentified(itemKey) && item?.type === "weapon"
    ? { label: "攻撃力", value: item.atk || 0 }
    : isIdentified(itemKey) && (item?.type === "shield" || item?.type === "armor")
      ? { label: "防御力", value: item.def || 0 }
      : null;
  if (enhanceStat) {
    const stat = document.createElement("span");
    stat.className = "equip-workshop-stat";
    stat.textContent = `${enhanceStat.label}: ${enhanceStat.value}`;
    enhanceSection.appendChild(stat);
  }

  const enhanceCost = getEnhanceCost(itemKey);
  if (!enhanceCost) {
    const unavailable = document.createElement("span");
    unavailable.className = "equip-workshop-unavailable";
    unavailable.textContent = !isIdentified(itemKey)
      ? "未鑑定のため強化対象外です"
      : enhanceLevel >= 1
      ? "強化済み（現行上限 +1）"
      : "この装備は強化対象外です（武器・盾・防具のみ）";
    enhanceSection.appendChild(unavailable);
  } else {
    enhanceSection.appendChild(createMaterialCost(enhanceCost));
    const canAfford = Object.entries(enhanceCost.mats).every(([material, required]) => (
      (state.metaMaterials?.[material] || 0) >= required
    ));
    const enhanceButton = document.createElement("button");
    enhanceButton.type = "button";
    enhanceButton.className = "btn btn-neon btn-block equip-workshop-action";
    enhanceButton.disabled = !canAfford;
    enhanceButton.textContent = canAfford ? "強化する" : "強化素材が不足しています";
    enhanceButton.addEventListener("click", () => {
      if (!executeEnhance(target)) return;
      equipState.selectedKey = getSelectedItemKey();
      renderEquip();
      updateUI();
    });
    enhanceSection.appendChild(enhanceButton);
  }
  panel.appendChild(enhanceSection);

  const polishSection = document.createElement("div");
  polishSection.className = "equip-workshop-section equip-polish-section";
  const polishTitle = document.createElement("strong");
  polishTitle.textContent = "補助アフィックス研磨";
  polishSection.appendChild(polishTitle);

  const supportAffixes = getSupportAffixes(itemKey);
  const polishCost = getPolishCost(itemKey);
  if (polishCost) {
    polishSection.appendChild(createMaterialCost(polishCost));
    const canAfford = Object.entries(polishCost.mats).every(([material, required]) => (
      (state.metaMaterials?.[material] || 0) >= required
    ));
    supportAffixes.forEach(({ affix, definition, index }) => {
      const row = document.createElement("div");
      row.className = "equip-polish-row";
      const current = affix.value;
      const next = Math.ceil(current * 1.5);
      const label = document.createElement("span");
      label.textContent = `${definition.jpName}: ${current} → ${next}`;
      row.appendChild(label);

      const polishButton = document.createElement("button");
      polishButton.type = "button";
      polishButton.className = "btn btn-neon equip-workshop-action";
      polishButton.disabled = !canAfford;
      polishButton.textContent = canAfford ? "研磨する" : "研磨素材が不足しています";
      polishButton.addEventListener("click", () => {
        if (!executePolish(target, index)) return;
        equipState.selectedKey = getSelectedItemKey();
        renderEquip();
        updateUI();
      });
      row.appendChild(polishButton);
      polishSection.appendChild(row);
    });
    if (!canAfford) {
      const unavailable = document.createElement("span");
      unavailable.className = "equip-workshop-unavailable";
      unavailable.textContent = "研磨素材が不足しています";
      polishSection.appendChild(unavailable);
    }
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "equip-workshop-unavailable";
    if (!itemKey || typeof itemKey !== "object" || itemKey.identified === false) {
      unavailable.textContent = "未鑑定のため研磨対象外です";
    } else if (itemKey.polished) {
      unavailable.textContent = "研磨済み（この装備は1回まで）";
    } else if ((itemKey.affixes || []).some((affix) => {
      const definition = getAffixDefinition(affix);
      return (affix.kind || definition?.kind || "support") === "core";
    })) {
      unavailable.textContent = "コアは研磨対象外です";
    } else {
      unavailable.textContent = "研磨できるサポートアフィックスがありません";
    }
    polishSection.appendChild(unavailable);
  }
  panel.appendChild(polishSection);
  return panel;
}

function createAccessorySlotPicker(char, selectedSlot) {
  const picker = document.createElement("div");
  picker.className = "equip-slot-picker";

  const label = document.createElement("strong");
  label.textContent = "装備先";
  picker.appendChild(label);

  const choices = document.createElement("div");
  choices.className = "equip-slot-choices";
  getEquipmentSlotsForType("accessory").forEach(({ id }) => {
    const currentKey = char.equipment?.[id];
    const currentItem = currentKey ? getItemData(currentKey) : null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `equip-slot-choice ${selectedSlot === id ? "active" : ""}`;
    button.setAttribute("aria-pressed", selectedSlot === id ? "true" : "false");
    button.textContent = `${SLOT_LABELS[id]}: ${currentItem?.name || "なし"}`;
    button.addEventListener("click", () => {
      equipState.selectedSlot = id;
      renderEquip();
    });
    choices.appendChild(button);
  });
  picker.appendChild(choices);
  return picker;
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

  const itemKey = getSelectedItemKey() || equipState.selectedKey;
  const item = getItemData(itemKey);
  const hidden = !isIdentified(itemKey);
  const isEquipped = equipState.selectedIsEquipped;

  let preview;
  let availability;
  if (isEquipped) {
    preview = getUnequipPreview(char, equipState.selectedSlot);
    availability = { ok: true, reason: "" };
  } else {
    preview = getEquipPreview(char, itemKey, equipState.selectedSlot);
    availability = canEquip(char, itemKey, preview?.slot);
  }

  const content = document.createElement("div");
  content.className = "equip-detail-content";

  const heading = document.createElement("div");
  heading.className = `equip-detail-heading ${getRarityClass(itemKey)}`.trim();
  const titleBlock = document.createElement("div");
  titleBlock.className = "equip-detail-title-block";
  const titleLine = document.createElement("div");
  titleLine.className = "equip-detail-title-line";
  const name = document.createElement("div");
  name.className = "equip-detail-name";
  name.textContent = `${hidden ? "? " : ""}${item.name}`;
  titleLine.appendChild(name);
  const rarityBadge = createRarityBadge(itemKey, "equip-detail-rarity");
  if (rarityBadge) titleLine.appendChild(rarityBadge);
  titleBlock.appendChild(titleLine);
  const desc = document.createElement("div");
  desc.className = "equip-detail-desc";
  desc.innerHTML = item.desc || getItemSummary(item);
  heading.appendChild(titleBlock);

  const targetSummary = document.createElement("div");
  targetSummary.className = "equip-target-summary";
  targetSummary.textContent = char.name;
  const targetClass = document.createElement("small");
  targetClass.textContent = `${getClassJpName(char.class)} Lv.${char.level}`;
  targetSummary.appendChild(targetClass);
  content.appendChild(heading);

  const exchange = document.createElement("div");
  exchange.className = "equip-exchange-line";
  if (isEquipped) {
    exchange.textContent = `${SLOT_LABELS[equipState.selectedSlot]}: ${item.name} → なし`;
  } else {
    const currentEquip = preview?.oldEq ? getItemData(preview.oldEq) : null;
    exchange.textContent = `${SLOT_LABELS[preview?.slot] || EQUIPMENT_TYPE_LABELS[item.type]}: ${currentEquip ? currentEquip.name : "なし"} → ${item.name}`;
  }
  content.appendChild(exchange);

  if (!isEquipped && item.type === "accessory") {
    content.appendChild(createAccessorySlotPicker(char, preview?.slot));
  }

  if (preview && availability.ok && !hidden) {
    const primaryRows = preview.rows.filter((row) => row.diff !== 0);
    const importantRows = primaryRows.length > 0 ? primaryRows.slice(0, 7) : preview.rows.slice(0, 2);
    const statGrid = document.createElement("div");
    statGrid.className = "equip-stat-grid";
    importantRows.forEach((row) => {
      statGrid.appendChild(createStatPill(row));
    });
    content.appendChild(statGrid);
  } else if (preview && availability.ok && hidden) {
    const hiddenStats = document.createElement("div");
    hiddenStats.className = "equip-detail-placeholder";
    hiddenStats.textContent = "比較不能：装備効果・呪い不明";
    content.appendChild(hiddenStats);
  }

  const context = document.createElement("div");
  context.className = "equip-detail-context";
  context.appendChild(desc);
  context.appendChild(targetSummary);
  content.appendChild(context);

  const affixDetails = createAffixDetails(itemKey);
  if (affixDetails) content.appendChild(affixDetails);

  content.appendChild(createWorkshopPanel(itemKey));

  const compat = document.createElement("div");
  if (isEquipped) {
    compat.className = `equip-detail-compat ${isCurseLocked(itemKey) ? "no" : "yes"}`;
    compat.textContent = isCurseLocked(itemKey) ? "🔒 呪いで固定中：通常は外せません" : "現在装備しています";
  } else {
    compat.className = `equip-detail-compat ${availability.ok ? "yes" : "no"}`;
    compat.textContent = availability.ok ? "装備できます" : availability.reason;
  }
  content.appendChild(compat);

  detailCol.appendChild(content);

  const actions = document.createElement("div");
  actions.className = "equip-detail-actions";

  const backToListBtn = document.createElement("button");
  backToListBtn.type = "button";
  backToListBtn.className = "btn btn-block equip-action-btn";
  backToListBtn.textContent = "一覧へ戻る";
  backToListBtn.addEventListener("click", () => {
    clearSelection();
    renderEquip();
  });

  if (isEquipped) {
    const bagFull = state.inventory.length >= 20;
    const locked = isCurseLocked(itemKey);
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    if (locked) {
      actionBtn.className = "btn btn-block equip-action-btn disabled";
      actionBtn.disabled = true;
      actionBtn.textContent = "深層商人で解呪できます";
      actions.appendChild(actionBtn);
      actions.appendChild(backToListBtn);
      detailCol.appendChild(actions);
      return detailCol;
    }
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
    actions.appendChild(actionBtn);
  } else {
    if (hidden) {
      const identifyBtn = document.createElement("button");
      identifyBtn.type = "button";
      const canIdentify = (state.identifyTickets || 0) >= IDENTIFICATION_BALANCE.identifyCost;
      identifyBtn.className = canIdentify ? "btn btn-neon btn-block equip-action-btn" : "btn btn-block equip-action-btn disabled";
      identifyBtn.disabled = !canIdentify;
      identifyBtn.textContent = canIdentify
        ? `鑑定する（鑑定粉1 / 所持${state.identifyTickets || 0}）`
        : "鑑定粉がありません";
      identifyBtn.addEventListener("click", () => {
        const selectedItem = state.inventory[equipState.selectedIdx];
        const currentChar = state.party[equipState.actorIdx];
        const result = identifyEquipment(state, selectedItem, currentChar);
        if (!result.ok) return;
        const revealedData = getItemData(selectedItem);
        addLog(`[鑑定] ${revealedData.name}。${result.cursed ? "呪いを確認した。" : "呪いはない。"}`);
        playSound("level_up");
        saveAutosave();
        equipState.selectedKey = selectedItem;
        renderEquip();
        updateUI();
      });
      actions.appendChild(identifyBtn);
    }

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = availability.ok ? "btn btn-neon btn-block equip-action-btn" : "btn btn-block equip-action-btn disabled";
    actionBtn.disabled = !availability.ok;
    actionBtn.textContent = availability.ok ? (hidden ? "未鑑定で装備する（正体開示）" : "装備する") : "装備できません";
    actionBtn.addEventListener("click", () => {
      if (!availability.ok) return;
      const currentChar = state.party[equipState.actorIdx];
      const selectedItem = state.inventory[equipState.selectedIdx];
      const selectedData = getItemData(selectedItem);
      const slot = preview?.slot || getDefaultTargetSlot(currentChar, selectedData.type);
      const oldEq = currentChar.equipment[slot];

      currentChar.equipment[slot] = selectedItem;
      if (oldEq) {
        state.inventory[equipState.selectedIdx] = oldEq;
      } else {
        state.inventory.splice(equipState.selectedIdx, 1);
      }

      const reveal = revealEquipmentOnEquip(selectedItem);
      const revealedData = getItemData(selectedItem);
      addLog(`${currentChar.name}は${revealedData.name}を装備した。`);
      if (reveal.revealed) {
        addLog(reveal.cursed
          ? `[呪い発動] ${revealedData.name}は外せなくなった！`
          : `[賭け成功] ${revealedData.name}に呪いはなかった。`);
      } else if (reveal.cursed) {
        addLog(`[呪い装備] ${revealedData.name}は外せない。`);
      }
      playSound("move");
      saveAutosave();
      clearSelection();
      renderEquip();
      updateUI();
    });
    actions.appendChild(actionBtn);

    if (!isItemEquipped(itemKey)) {
      const discardBtn = document.createElement("button");
      discardBtn.type = "button";
      discardBtn.className = "btn btn-danger btn-block equip-action-btn";
      discardBtn.textContent = "破棄する";
      discardBtn.addEventListener("click", () => {
        discardEquipment(equipState.selectedIdx, itemKey);
      });
      actions.appendChild(discardBtn);
    }
  }
  actions.appendChild(backToListBtn);
  detailCol.appendChild(actions);
  return detailCol;
}

export function renderEquip() {
  const overlay = document.getElementById("equip-overlay");
  if (!overlay) return;

  const existingList = overlay.querySelector(".equip-item-list");
  const savedScrollTop = existingList ? existingList.scrollTop : equipState.listScrollTop;
  if (existingList) equipState.listScrollTop = existingList.scrollTop;
  const detailMode = equipState.selectedKey !== null;
  overlay.innerHTML = "";

  const char = state.party[equipState.actorIdx];
  if (!char) {
    closeEquipOverlay();
    return;
  }

  createHeader(overlay);

  const body = document.createElement("div");
  body.className = `equip-body ${detailMode ? "is-detail" : ""}`.trim();
  if (detailMode) {
    body.appendChild(createDetailPanel(char));
  } else {
    body.appendChild(createEquipmentList(char, savedScrollTop));
    body.appendChild(createDetailPanel(char));
  }
  overlay.appendChild(body);
  if (!detailMode) createFooter(overlay);
}
