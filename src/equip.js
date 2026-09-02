import { state, saveAutosave, addLog, INVENTORY_CAPACITY } from "./state.js";
import {
  getClassJpName,
  getCharMaxHp,
  getCharMaxMp,
  getItemData,
  getCharAttackBreakdown,
  formatAffixText,
  canUseManaItems,
  isCurseLocked
} from "./data.js";
import { CURSE_EFFECTS } from "./data/items.js";
import {
  IDENTIFICATION_BALANCE,
  getKnowledgeHintTags,
  getKnowledgeStage,
  getKnowledgeStageLabel,
  KNOWLEDGE_STAGES,
  SENSORY_HINT_LABELS
} from "./rules/identification_rules.js";
import { updateUI } from "./ui.js";
import {
  getEnhanceCost,
  getPolishCost
} from "./craft.js";
import { getAffixDefinition } from "./data/affixes.js";
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_TYPE_LABELS,
  getEquipmentSlotsForType
} from "./rules/equipment_slots.js";
import { getDiscardRisk } from "./systems/equipment_discard.js";
import {
  createEquipmentPreviewChar,
  getEquipmentPreview,
  getEquipmentSlotValue,
  getUnequipPreview,
  isEquipmentItem
} from "./rules/equipment_preview.js";
import { canEquipEquipment } from "./rules/equipment_rules.js";
import {
  discardEquipmentAt,
  discardEquipmentSelection,
  enhanceEquipment,
  equipEquipment,
  identifyEquipmentAt,
  polishEquipment,
  unequipEquipment
} from "./systems/equipment_actions.js";
import { trackEquipmentDecision } from "./telemetry.js";
import { appendOwnershipBadge, getItemOwnership, setDockActionRole } from "./ui/common_shell.js";
import { createBagCapacitySummary } from "./ui/bag_summary.js";

export let equipState = {
  mode: "equip",
  filter: "all",
  actorIdx: 0,
  selectedIdx: -1,
  selectedKey: null,
  selectedSlot: null,
  selectedActorIdx: -1,
  selectedIsEquipped: false,
  selectedDiscardIndices: new Set(),
  pendingUnequip: null,
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

export function openEquipOverlay(actorIdx = 0) {
  if (state.gameState !== "equip_overlay") {
    equipState.prevGameState = state.gameState;
  }
  state.gameState = "equip_overlay";
  equipState.mode = "equip";
  equipState.filter = "all";
  equipState.actorIdx = actorIdx;
  clearSelection();
  clearDiscardSelection();
  equipState.pendingUnequip = null;

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

function clearDiscardSelection() {
  equipState.selectedDiscardIndices.clear();
}

function enterOrganizeMode() {
  clearSelection();
  clearDiscardSelection();
  equipState.pendingUnequip = null;
  equipState.mode = "organize";
  renderEquip();
}

function exitOrganizeMode() {
  clearDiscardSelection();
  equipState.pendingUnequip = null;
  equipState.mode = "equip";
  renderEquip();
}

export function resetEquipState() {
  equipState.mode = "equip";
  equipState.filter = "all";
  equipState.actorIdx = 0;
  clearSelection();
  clearDiscardSelection();
  equipState.pendingUnequip = null;
  equipState.listScrollTop = 0;
  equipState.prevGameState = null;
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
  try {
    return state.party.some((char) => {
      try {
        return Object.values(char.equipment || {}).some((equippedKey) => equippedKey === itemKey);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function discardEquipment(itemIdx, expectedItemKey) {
  const result = discardEquipmentAt(itemIdx, expectedItemKey, {
    actorIdx: equipState.actorIdx,
    requestedSlot: equipState.selectedSlot
  });
  if (!result.ok) return false;
  clearSelection();
  renderEquip();
  updateUI();
  return true;
}

function discardSelectedEquipment() {
  const pendingUnequip = equipState.pendingUnequip;
  if (pendingUnequip && equipState.selectedDiscardIndices.size !== 1) {
    addLog("装備を外す前に、バッグから破棄する装備を1件選んでください。");
    return false;
  }
  const result = discardEquipmentSelection(equipState.selectedDiscardIndices, {
    actorIdx: equipState.actorIdx
  });
  if (!result.ok) return false;
  if (pendingUnequip) {
    const unequipResult = unequipEquipment(pendingUnequip);
    if (!unequipResult.ok) {
      addLog("バッグを整理しましたが、装備を外せませんでした。");
      return false;
    }
    equipState.pendingUnequip = null;
    equipState.mode = "equip";
  }
  clearDiscardSelection();
  renderEquip();
  updateUI();
  return true;
}

function requestUnequipAfterDiscard() {
  equipState.pendingUnequip = {
    actorIdx: equipState.actorIdx,
    slot: equipState.selectedSlot
  };
  clearSelection();
  clearDiscardSelection();
  equipState.mode = "organize";
  renderEquip();
  updateUI();
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

function getKnowledgeSummary(itemKey) {
  if (!itemKey || typeof itemKey !== "object") return "";
  const hints = getKnowledgeHintTags(itemKey)
    .map(tag => SENSORY_HINT_LABELS[tag] || tag)
    .join("・");
  return `${getKnowledgeStageLabel(itemKey)}${hints ? ` / ${hints}` : ""}`;
}

function createHeader(overlay, char) {
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
  const materials = document.createElement("span");
  materials.textContent = `素材 ${Object.values(state.currentRun?.materials || {}).reduce((sum, quantity) => sum + quantity, 0)}`;
  statusBar.appendChild(materials);
  statusBar.appendChild(createBagCapacitySummary(state.inventory, {
    className: "equip-bag-summary",
    showNote: false
  }));
  header.appendChild(statusBar);

  const attack = getCharAttackBreakdown(char);
  const attackBreakdown = document.createElement("div");
  attackBreakdown.className = "equip-attack-breakdown";
  attackBreakdown.dataset.testid = "attack-breakdown";
  attackBreakdown.setAttribute("aria-label", "攻撃力の内訳");
  attackBreakdown.innerHTML = `
    <span><small>基礎</small><strong data-attack-base="true">${attack.base}</strong></span>
    <span><small>装備</small><strong data-attack-equipment="true">${attack.equipment}</strong></span>
    <span><small>罠喰い</small><strong data-attack-trap-eater="true">+${attack.trapEaterBonus}</strong></span>
    <span class="total"><small>合計</small><strong data-attack-total="true">${attack.total}</strong></span>
  `;
  header.appendChild(attackBreakdown);
  overlay.appendChild(header);
}

function createFooter(overlay, { organizing = false } = {}) {
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  if (organizing) {
    const discardRow = document.createElement("div");
    discardRow.className = "bottom-actions-row equip-discard-row";
    const discardButton = document.createElement("button");
    discardButton.type = "button";
    discardButton.className = "btn btn-danger btn-block equip-bulk-discard";
    discardButton.disabled = equipState.pendingUnequip
      ? equipState.selectedDiscardIndices.size !== 1
      : equipState.selectedDiscardIndices.size === 0;
    discardButton.textContent = equipState.pendingUnequip
      ? `1件破棄して装備を外す（${equipState.selectedDiscardIndices.size}件選択）`
      : `選択した装備を破棄（${equipState.selectedDiscardIndices.size}件）`;
    discardButton.setAttribute("aria-describedby", "equip-organize-help");
    discardButton.addEventListener("click", discardSelectedEquipment);
    discardRow.appendChild(discardButton);
    footer.appendChild(discardRow);
  }

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
      clearDiscardSelection();
      renderEquip();
    });
    filterRow.appendChild(chip);
  });
  footer.appendChild(filterRow);

  const actorRow = document.createElement("div");
  actorRow.className = "bottom-actions-row equip-actor-row";
  state.party.forEach((liveChar, idx) => {
    const char = createEquipmentPreviewChar(liveChar);
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
      clearDiscardSelection();
      renderEquip();
    });
    actorRow.appendChild(btn);
  });
  footer.appendChild(actorRow);

  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";
  if (!organizing) {
    const organizeEntry = document.createElement("button");
    organizeEntry.type = "button";
    organizeEntry.className = "btn equip-organize-entry";
    organizeEntry.textContent = "整理モード";
    organizeEntry.setAttribute("aria-label", "整理モードを開始");
    organizeEntry.addEventListener("click", enterOrganizeMode);
    closeRow.appendChild(organizeEntry);
  }
  const btnClose = document.createElement("button");
  btnClose.id = "btn-equip-close";
  btnClose.className = "btn btn-danger";
  setDockActionRole(btnClose, "back");
  btnClose.textContent = "閉じる";
  btnClose.addEventListener("click", closeEquipOverlay);
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}

function getSelectedDiscardRiskCounts() {
  const counts = {};
  equipState.selectedDiscardIndices.forEach((index) => {
    getDiscardRisk(state.inventory[index]).forEach((risk) => {
      counts[risk] = (counts[risk] || 0) + 1;
    });
  });
  return counts;
}

function createOrganizeControls() {
  const controls = document.createElement("div");
  controls.className = "equip-organize-controls";

  const heading = document.createElement("div");
  heading.className = "equip-organize-heading";
  const label = document.createElement("strong");
  label.textContent = "整理モード";
  heading.appendChild(label);
  const count = document.createElement("span");
  count.className = "equip-organize-count";
  count.setAttribute("aria-live", "polite");
  count.textContent = `${equipState.selectedDiscardIndices.size}件選択中`;
  heading.appendChild(count);
  controls.appendChild(heading);

  const help = document.createElement("p");
  help.id = "equip-organize-help";
  help.className = "equip-organize-help";
  help.textContent = equipState.pendingUnequip
    ? `バッグが満杯（${INVENTORY_CAPACITY}/${INVENTORY_CAPACITY}）です。装備を外すため、破棄する装備を1件選んでください。`
    : "不要なバッグ装備を選んでください。装備中のアイテムは整理対象から除外されます。";
  controls.appendChild(help);

  const risks = getSelectedDiscardRiskCounts();
  const riskEntries = Object.entries(risks);
  if (riskEntries.length > 0) {
    const warning = document.createElement("p");
    warning.className = "equip-organize-warning";
    warning.setAttribute("role", "status");
    warning.textContent = `注意: ${riskEntries.map(([risk, riskCount]) => `${risk} ${riskCount}件`).join("、")}を選択中です。`;
    controls.appendChild(warning);
  }

  const actions = document.createElement("div");
  actions.className = "equip-organize-inline-actions";
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "btn equip-organize-clear";
  clearButton.disabled = equipState.selectedDiscardIndices.size === 0;
  clearButton.textContent = "選択解除";
  clearButton.addEventListener("click", () => {
    clearDiscardSelection();
    renderEquip();
  });
  actions.appendChild(clearButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "btn equip-organize-cancel";
  cancelButton.textContent = "通常表示に戻る";
  cancelButton.addEventListener("click", exitOrganizeMode);
  actions.appendChild(cancelButton);
  controls.appendChild(actions);
  return controls;
}

function createEquipmentList(char, savedScrollTop) {
  const listContainer = document.createElement("div");
  listContainer.className = "equip-list-container";

  const filteredSlots = EQUIPMENT_SLOTS.filter(s => equipState.filter === "all" || equipState.filter === s.itemType);
  if (equipState.mode !== "organize") {
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
      ? `${label} ${item ? `/ ${isCurseLocked(itemKey) ? "🔒 呪い・外せない" : (isIdentified(itemKey) ? getItemSummary(item) : getKnowledgeSummary(itemKey))}` : ""}`
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
  }

  const bagSection = document.createElement("section");
  bagSection.className = "equip-list-section equip-bag-section";

  const headingBag = document.createElement("h2");
  headingBag.className = "equip-section-heading";
  headingBag.textContent = "バッグの装備品";
  bagSection.appendChild(headingBag);
  if (equipState.mode === "organize") {
    bagSection.appendChild(createOrganizeControls());
  }

  const itemList = document.createElement("div");
  itemList.className = "equip-item-list";

  const equipmentItems = getEquipmentItems().filter(({ itemKey }) => (
    equipState.mode !== "organize" || !isItemEquipped(itemKey)
  ));

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
      const selectedForDiscard = equipState.selectedDiscardIndices.has(idx);
      const preview = getEquipmentPreview(char, itemKey, equipState.selectedSlot, { floor: state.floor });
      const availability = canEquipEquipment(char, itemKey, preview?.slot);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `equip-item-row ${getRarityClass(itemKey)} ${selected ? "selected" : ""} ${selectedForDiscard ? "discard-selected" : ""} ${availability.ok ? "" : "not-equipable"}`.trim();
      row.setAttribute("aria-selected", selected ? "true" : "false");
      if (equipState.mode === "organize") {
        row.setAttribute("role", "checkbox");
        row.setAttribute("aria-checked", selectedForDiscard ? "true" : "false");
        row.setAttribute("aria-label", `${!isIdentified(itemKey) ? "未鑑定の" : ""}${item.name}`);

        const indicator = document.createElement("span");
        indicator.className = "equip-discard-indicator";
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = selectedForDiscard ? "☑" : "☐";
        row.appendChild(indicator);
      }

      const left = document.createElement("div");
      left.className = "equip-item-row-main";
      const name = document.createElement("span");
      name.className = "equip-item-row-name";
      name.textContent = `${isIdentified(itemKey) ? "" : "? "}${item.name}`;
      left.appendChild(name);

      const summary = document.createElement("span");
      summary.className = "equip-item-row-tag";
      summary.textContent = `${EQUIPMENT_TYPE_LABELS[item.type]} / ${isIdentified(itemKey) ? getItemSummary(item) : getKnowledgeSummary(itemKey)}`;
      left.appendChild(summary);
      row.appendChild(left);

      const badges = document.createElement("span");
      badges.className = "equip-item-row-badges";
      const ownership = getItemOwnership(itemKey, { state });
      row.dataset.ownership = ownership;
      appendOwnershipBadge(badges, ownership);
      const rarityBadge = createRarityBadge(itemKey);
      if (rarityBadge) badges.appendChild(rarityBadge);

      const badge = document.createElement("span");
      if (!isIdentified(itemKey)) {
        badge.className = "equip-row-badge unident";
        badge.textContent = `? ${getKnowledgeStageLabel(itemKey)}`;
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
        if (equipState.mode === "organize") {
          if (selectedForDiscard) {
            equipState.selectedDiscardIndices.delete(idx);
          } else {
            equipState.selectedDiscardIndices.add(idx);
          }
          renderEquip();
          return;
        }
        if (selected) {
          clearSelection();
        } else {
          trackEquipmentDecision("compare", {
            state,
            character: char,
            candidateKey: itemKey,
            currentKey: preview?.oldEq,
            preview
          });
          equipState.selectedIdx = idx;
          equipState.selectedKey = itemKey;
          equipState.selectedSlot = preview?.slot || null;
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
  if (typeof itemKey !== "object") return null;

  const details = document.createElement("div");
  details.className = "equip-affix-details";
  const groups = [
    { kind: "core", label: "コア" },
    { kind: "support", label: "サポート" }
  ];

  if (itemKey.identified === true) groups.forEach(group => {
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

  if (itemKey.curseEffectId && (itemKey.identified === true || itemKey.curseLocked)) {
    const section = document.createElement("div");
    section.className = "equip-affix-group curse";
    const label = document.createElement("strong");
    label.textContent = itemKey.identified === true
      ? "🔒 呪い・装備解除不可"
      : "🔒 呪われている（効果不明）・装備解除不可";
    section.appendChild(label);
    if (itemKey.identified === true) {
      const curse = CURSE_EFFECTS[itemKey.curseEffectId];
      const line = document.createElement("span");
      line.textContent = `${curse?.name || "不明な呪い"}: ${curse?.desc || "効果不明"}`;
      section.appendChild(line);
    }
    details.appendChild(section);
  }

  return details.childElementCount > 0 ? details : null;
}

function getSelectedItemKey() {
  if (equipState.selectedIsEquipped) {
    return getEquipmentSlotValue(
      state.party[equipState.actorIdx]?.equipment,
      equipState.selectedSlot
    );
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
      if (!enhanceEquipment(target)) return;
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
        if (!polishEquipment(target, index)) return;
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
    if (!itemKey || typeof itemKey !== "object" || itemKey.identified !== true) {
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
    const currentKey = getEquipmentSlotValue(char.equipment, id);
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
  const knowledgeStage = getKnowledgeStage(itemKey);
  const isEquipped = equipState.selectedIsEquipped;

  let preview;
  let availability;
  if (isEquipped) {
    preview = getUnequipPreview(char, equipState.selectedSlot, { floor: state.floor });
    availability = { ok: true, reason: "" };
  } else {
    preview = getEquipmentPreview(char, itemKey, equipState.selectedSlot, { floor: state.floor });
    availability = canEquipEquipment(char, itemKey, preview?.slot);
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
  } else if (preview && availability.ok && hidden && knowledgeStage === KNOWLEDGE_STAGES.TRIAL && item.primaryEffect) {
    const trialEffect = document.createElement("div");
    trialEffect.className = "equip-detail-trial-effect";
    trialEffect.textContent = `主な手応え: ${item.primaryEffect}`;
    content.appendChild(trialEffect);
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

  const knowledge = document.createElement("div");
  knowledge.className = "equip-knowledge-status";
  knowledge.textContent = `知識段階: ${getKnowledgeStageLabel(knowledgeStage)}`;
  content.appendChild(knowledge);

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
  setDockActionRole(backToListBtn, "back");
  backToListBtn.addEventListener("click", () => {
    clearSelection();
    renderEquip();
  });

  if (isEquipped) {
    const bagFull = state.inventory.length >= INVENTORY_CAPACITY;
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
    actionBtn.className = bagFull ? "btn btn-danger btn-block equip-action-btn" : "btn btn-neon btn-block equip-action-btn";
    actionBtn.disabled = false;
    actionBtn.textContent = bagFull ? "整理してから外す" : "外す";
    setDockActionRole(actionBtn, "confirm");
    actionBtn.addEventListener("click", () => {
      if (bagFull) {
        requestUnequipAfterDiscard();
        return;
      }
      const result = unequipEquipment({
        actorIdx: equipState.actorIdx,
        slot: equipState.selectedSlot
      });
      if (!result.ok) return;
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
      setDockActionRole(identifyBtn, "confirm");
      identifyBtn.addEventListener("click", () => {
        const result = identifyEquipmentAt({
          inventoryIndex: equipState.selectedIdx,
          actorIdx: equipState.actorIdx,
          requestedSlot: equipState.selectedSlot
        });
        if (!result.ok) return;
        equipState.selectedKey = result.itemKey;
        renderEquip();
        updateUI();
      });
      actions.appendChild(identifyBtn);
    }

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = availability.ok ? "btn btn-neon btn-block equip-action-btn" : "btn btn-block equip-action-btn disabled";
    actionBtn.disabled = !availability.ok;
    const oldEquipment = preview?.oldEq ? getItemData(preview.oldEq) : null;
    actionBtn.textContent = availability.ok
      ? (hidden
        ? "未鑑定で装備する"
        : oldEquipment
          ? `装備する（${oldEquipment.name}をバッグへ）`
          : "装備する")
      : "装備できません";
    if (availability.ok) {
      actionBtn.setAttribute("aria-label", "装備する");
      if (oldEquipment) actionBtn.title = `${oldEquipment.name}はバッグへ戻ります`;
    }
    setDockActionRole(actionBtn, "confirm");
    actionBtn.addEventListener("click", () => {
      if (!availability.ok) return;
      const result = equipEquipment({
        inventoryIndex: equipState.selectedIdx,
        actorIdx: equipState.actorIdx,
        requestedSlot: equipState.selectedSlot
      });
      if (!result.ok) return;
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
      setDockActionRole(discardBtn, "confirm");
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

  const liveChar = state.party[equipState.actorIdx];
  if (!liveChar) {
    closeEquipOverlay();
    return;
  }
  const char = createEquipmentPreviewChar(liveChar);

  createHeader(overlay, char);

  const body = document.createElement("div");
  const organizing = equipState.mode === "organize";
  body.className = `equip-body ${detailMode ? "is-detail" : ""} ${organizing ? "is-organize" : ""}`.trim();
  if (detailMode) {
    body.appendChild(createDetailPanel(char));
  } else {
    body.appendChild(createEquipmentList(char, savedScrollTop));
    if (!organizing) body.appendChild(createDetailPanel(char));
  }
  overlay.appendChild(body);
  if (!detailMode) createFooter(overlay, { organizing });
}
