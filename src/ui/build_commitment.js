import { SPELLS } from "../data/spells.js";
import { formatAffixText, getAffixDefinition, getAffixKind } from "../data/affixes.js";
import { getItemData } from "../rules/item_rules.js";
import { getCharAttackBreakdown, getCharDef, getCharMaxHp, getCharMaxMp } from "../rules/character_stats.js";
import { getGuardProfile } from "../rules/guard_rules.js";
import { EQUIPMENT_SLOTS } from "../rules/equipment_slots.js";
import { getCharacterEquipmentHands, MAX_EQUIPMENT_HANDS } from "../rules/equipment_hands.js";
import {
  getActiveRuneSpellKeys,
  getEquippedMedium,
  getRuneSpellKey
} from "../rules/magic_rules.js";
import { getWeaponBehaviorProfile } from "../data/weapon_behavior_profiles.js";
import { getLoadoutInventoryChanges } from "../rules/loadout_transaction.js";

const EXPLORATION_SUPPORT_IDS = new Set([
  "trapBonus", "trapGuard", "treasureSense", "arcaneSense", "hearRange", "traceRead",
  "materialFind", "identifyDiscount"
]);

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(1)));
}

function getItemName(item) {
  return getItemData(item)?.name || "なし";
}

function getKnownBuildAffixes(char) {
  const cores = { main: [], auxiliary: [] };
  const supports = { combat: [], exploration: [] };
  EQUIPMENT_SLOTS.map(({ id }) => char?.equipment?.[id]).forEach(item => {
    if (!item || typeof item !== "object" || item.identified !== true || !Array.isArray(item.affixes)) return;
    item.affixes.forEach(affix => {
      const definition = getAffixDefinition(affix);
      const kind = getAffixKind(affix);
      if (!definition || !kind) return;
      if (kind === "core") {
        const axis = definition.buildAxis === "auxiliary" ? "auxiliary" : "main";
        if (!cores[axis].some(entry => entry.id === definition.id)) {
          cores[axis].push({ id: definition.id, text: `◆${definition.jpName}: ${definition.desc || "特殊効果"}` });
        }
        return;
      }
      if (kind === "support") {
        const group = EXPLORATION_SUPPORT_IDS.has(definition.id) ? "exploration" : "combat";
        supports[group].push({ id: definition.id, text: formatAffixText(affix, ": ") });
      }
    });
  });
  return { cores, supports };
}

function getRuneNames(char) {
  return getActiveRuneSpellKeys(char).map(spellKey => SPELLS[spellKey]?.name || spellKey);
}

function getReturnedItemSummary(items) {
  const runes = items.filter(item => getRuneSpellKey(item));
  const equipment = items.filter(item => !getRuneSpellKey(item));
  const parts = [];
  if (runes.length > 0) parts.push(`装着中のルーン ${runes.length}個がバッグへ戻る`);
  equipment.forEach(item => parts.push(`${getItemName(item)}がバッグへ戻る`));
  return parts.join(" / ") || "なし";
}

export function getBuildCommitment(char) {
  const weapon = char?.equipment?.weapon;
  const shield = char?.equipment?.shield;
  const medium = getEquippedMedium(char);
  const guard = getGuardProfile(char);
  const usedHands = Math.max(0, getCharacterEquipmentHands(char));
  const maxHp = getCharMaxHp(char);
  const maxMp = getCharMaxMp(char);
  const currentMp = Math.max(0, Math.min(Number(char?.mp) || 0, maxMp));
  const attack = getCharAttackBreakdown(char);
  const affixes = getKnownBuildAffixes(char);

  return {
    hp: `${Math.max(0, Number(char?.hp) || 0)}/${maxHp}`,
    mp: `${formatNumber(currentMp)}/${formatNumber(maxMp)}`,
    attack: formatNumber(attack.total),
    defense: formatNumber(getCharDef(char)),
    weapon: weapon ? `${getItemName(weapon)} / ${getWeaponBehaviorText(char)}` : `素手 / ${getWeaponBehaviorText(char)}`,
    hands: `使用 ${usedHands}/${MAX_EQUIPMENT_HANDS}・空き ${Math.max(0, MAX_EQUIPMENT_HANDS - usedHands)}`,
    guard: `${shield ? getItemName(shield) : "盾なし"} / ${guard.label}`,
    medium: medium ? getItemName(medium.item) : "なし",
    runeSlots: formatNumber(medium?.runeSlots || 0),
    activeRunes: getRuneNames(char),
    mainCores: affixes.cores.main.map(entry => entry.text),
    auxiliaryCores: affixes.cores.auxiliary.map(entry => entry.text),
    support: affixes.supports.combat.map(entry => entry.text),
    explorationSupport: affixes.supports.exploration.map(entry => entry.text),
    currentMp: formatNumber(currentMp),
    maxMp: formatNumber(maxMp),
    maxHp: formatNumber(maxHp)
  };
}

function getWeaponBehaviorText(char) {
  const profile = getWeaponBehaviorProfile(char);
  return `${profile.label}（${profile.description}）`;
}

function appendBuildRow(container, label, value, key) {
  const row = document.createElement("div");
  row.className = "equip-build-row";
  if (key) row.dataset.buildField = key;
  const name = document.createElement("span");
  name.className = "equip-build-label";
  name.textContent = label;
  const content = document.createElement("span");
  content.className = "equip-build-value";
  content.textContent = Array.isArray(value) && value.length > 0 ? value.join(" / ") : Array.isArray(value) ? "なし" : value;
  row.append(name, content);
  container.appendChild(row);
}

function appendComparisonRow(container, label, current, next, key) {
  const row = document.createElement("div");
  row.className = "equip-build-compare-row";
  if (key) row.dataset.buildCompare = key;
  const name = document.createElement("span");
  name.className = "equip-build-label";
  name.textContent = label;
  const value = document.createElement("span");
  value.className = "equip-build-value";
  const currentText = Array.isArray(current) ? (current.length ? current.join(" / ") : "なし") : current;
  const nextText = Array.isArray(next) ? (next.length ? next.join(" / ") : "なし") : next;
  value.textContent = currentText === nextText ? `${currentText}（変化なし）` : `${currentText} → ${nextText}`;
  row.append(name, value);
  container.appendChild(row);
}

export function createBuildCommitmentPanel(
  char,
  { proposedChar = null, currentDraft = null, proposedDraft = null } = {}
) {
  const current = getBuildCommitment(char);
  const panel = document.createElement("section");
  panel.className = "equip-build-commitment";
  panel.setAttribute("aria-label", proposedDraft ? "現在の構成と交換後の差分" : "現在の装備構成");

  const heading = document.createElement("h3");
  heading.className = "equip-build-heading";
  heading.textContent = "現在の構成";
  panel.appendChild(heading);

  const currentGrid = document.createElement("div");
  currentGrid.className = "equip-build-grid";
  appendBuildRow(currentGrid, "HP", current.hp, "hp");
  appendBuildRow(currentGrid, "MP", current.mp, "mp");
  appendBuildRow(currentGrid, "ATK", current.attack, "attack");
  appendBuildRow(currentGrid, "DEF", current.defense, "defense");
  appendBuildRow(currentGrid, "通常攻撃", current.weapon, "weapon");
  appendBuildRow(currentGrid, "装備に使う手", current.hands, "hands");
  appendBuildRow(currentGrid, "Guard", current.guard, "guard");
  appendBuildRow(currentGrid, "媒体", current.medium, "medium");
  appendBuildRow(currentGrid, "ルーン枠", current.runeSlots, "rune-slots");
  appendBuildRow(currentGrid, "使用中のルーン", current.activeRunes, "active-runes");
  if (currentDraft) appendBuildRow(currentGrid, "バッグ", `${currentDraft.inventory.length}/20`, "bag");
  appendBuildRow(currentGrid, "戦い方を変える効果", current.mainCores, "main-cores");
  appendBuildRow(currentGrid, "補助的な特殊効果", current.auxiliaryCores, "auxiliary-cores");
  appendBuildRow(currentGrid, "装備効果", current.support, "support");
  appendBuildRow(currentGrid, "探索に役立つ効果", current.explorationSupport, "exploration-support");
  panel.appendChild(currentGrid);

  if (proposedChar && proposedDraft && currentDraft) {
    const comparisonHeading = document.createElement("h4");
    comparisonHeading.className = "equip-build-comparison-heading";
    comparisonHeading.textContent = "この交換で変わること";
    panel.appendChild(comparisonHeading);

    const next = getBuildCommitment(proposedChar);
    const comparison = document.createElement("div");
    comparison.className = "equip-build-comparison";
    appendComparisonRow(comparison, "HP", current.maxHp, next.maxHp, "max-hp");
    appendComparisonRow(comparison, "MP", current.mp, next.mp, "mp");
    appendComparisonRow(comparison, "ATK", current.attack, next.attack, "attack");
    appendComparisonRow(comparison, "DEF", current.defense, next.defense, "defense");
    appendComparisonRow(comparison, "通常攻撃", current.weapon, next.weapon, "weapon");
    appendComparisonRow(comparison, "装備に使う手", current.hands, next.hands, "hands");
    appendComparisonRow(comparison, "Guard", current.guard, next.guard, "guard");
    appendComparisonRow(comparison, "最大MP", current.maxMp, next.maxMp, "max-mp");
    appendComparisonRow(comparison, "ルーン枠", current.runeSlots, next.runeSlots, "rune-slots");
    appendComparisonRow(comparison, "使用中のルーン", current.activeRunes, next.activeRunes, "active-runes");
    const inventoryChanges = getLoadoutInventoryChanges(currentDraft.inventory, proposedDraft.inventory);
    appendComparisonRow(
      comparison,
      "バッグ",
      `${currentDraft.inventory.length}/20`,
      `${proposedDraft.inventory.length}/20`,
      "bag"
    );
    appendComparisonRow(
      comparison,
      "バッグへ戻る",
      "なし",
      getReturnedItemSummary(inventoryChanges.added),
      "bag-items"
    );
    appendComparisonRow(comparison, "戦い方を変える効果", current.mainCores, next.mainCores, "main-cores");
    appendComparisonRow(comparison, "補助的な特殊効果", current.auxiliaryCores, next.auxiliaryCores, "auxiliary-cores");
    appendComparisonRow(comparison, "装備効果", current.support, next.support, "support");
    appendComparisonRow(comparison, "探索に役立つ効果", current.explorationSupport, next.explorationSupport, "exploration-support");
    panel.appendChild(comparison);

    const note = document.createElement("p");
    note.className = "equip-build-comparison-note";
    note.textContent = "比較は確定前の見込みです。交換を確定するまで探索時間は進みません。";
    panel.appendChild(note);
  }
  return panel;
}
