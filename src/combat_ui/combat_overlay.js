import { state } from "../state.js";
import { SPELLS, getCharMaxHp, getCharMaxMp, getSpellPayment } from "../data.js";
import { menuContext, goBackSubmenu } from "../navigation.js";
import { combatCallbacks } from "./combat_state.js";
import { isSpellTargetAvailable, getSpellCombatSummary } from "./spell_menu.js";
import { getUsableInventoryItems, INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { getItemAllyTargetIndices, getSpellAllyTargetIndices } from "../rules/spell_targeting.js";
import { getScreenViewState, getUsableSpellKeys } from "../state/view_state.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { getActiveSpellKeys } from "../rules/magic_rules.js";
import { getEnemyHpState } from "../rules/enemy_hp_state.js";
import { trackUxDecisionResolved } from "../telemetry.js";

function isLivingEnemy(targetIdx) {
  const monster = state.combatState?.monsters?.[targetIdx];
  return Number.isInteger(targetIdx) && Boolean(monster) && typeof monster === "object" && !Array.isArray(monster) && monster.hp > 0;
}

export function commitCombatTarget(targetIdx) {
  const view = getScreenViewState(state, menuContext);
  if (!view.isUsableCombatOverlaySubmenu || typeof combatCallbacks.activeTargetCallback !== "function") return false;
  if (menuContext.targetType === "enemy" && !isLivingEnemy(targetIdx)) return false;

  state.gameState = "combat";
  trackUxDecisionResolved("combat_target", "commit");
  combatCallbacks.activeTargetCallback(targetIdx);
  return true;
}

// Hand-of-cards presentation: who a spell reaches and the glyph its card
// shows. Wording only; targeting rules live in rules/spell_targeting.
const SPELL_REACH = Object.freeze({
  single_enemy: { label: "敵ひとり", tone: "foe" },
  all_enemies: { label: "敵すべて", tone: "foe" },
  single_ally: { label: "味方ひとり", tone: "ally" },
  all_allies: { label: "味方すべて", tone: "ally" },
  utility: { label: "探索", tone: "utility" }
});
const SPELL_GLYPHS = [["火", "火"], ["氷", "氷"], ["爆", "爆"], ["聖", "聖"], ["回復", "癒"], ["全体睡眠", "眠"], ["毒", "解"], ["魔法軽減", "護"]];

function getSpellGlyph(summary, spell) {
  const effect = String(summary?.effect || "");
  const match = SPELL_GLYPHS.find(([needle]) => effect.includes(needle));
  if (match) return match[1];
  if (summary?.category === "cure") return "治";
  if (spell?.target === "utility") return "灯";
  return "術";
}

function getOverlayHint(type) {
  if (type === "combat_spell") return "カードに触れる";
  if (type === "combat_item") return "小瓶に触れる";
  if (type === "combat_target" && menuContext.targetType === "enemy") {
    return menuContext.spellName ? `敵に触れて${SPELLS[menuContext.spellName]?.label || menuContext.spellName}を放つ` : "敵に触れて攻撃";
  }
  return "仲間に触れる";
}

export function renderCombatOverlay() {
  const overlay = document.getElementById("combat-overlay");
  if (!overlay) return;
  const view = getScreenViewState(state, menuContext);
  if (!view.isUsableCombatOverlaySubmenu) {
    overlay.replaceChildren();
    return;
  }
  overlay.replaceChildren();

  const type = view.menuType;

  const canCommitOverlayAction = () => getScreenViewState(state, menuContext).isUsableCombatOverlaySubmenu;

  // 1. Create header
  const header = document.createElement("div");
  header.className = "combat-overlay-header";
  
  let titleText = "";
  if (type === "combat_target") {
    titleText = menuContext.targetType === "enemy" ? "⚔️ 攻撃対象を選択" : "❤️ 対象を選択";
  } else if (type === "combat_spell") {
    titleText = "🪄 呪文を唱える";
  } else if (type === "combat_item") {
    titleText = "🎒 道具を使う";
  }
  const title = document.createElement("span");
  title.className = "combat-overlay-title";
  title.textContent = titleText;
  header.appendChild(title);
  // What to touch next, said where the eye already is.
  const hint = document.createElement("span");
  hint.className = "combat-overlay-hint";
  hint.textContent = getOverlayHint(type);
  header.appendChild(hint);
  overlay.dataset.overlayType = type;
  if (type === "combat_target") overlay.dataset.targetType = menuContext.targetType || "";
  else delete overlay.dataset.targetType;
  overlay.appendChild(header);

  // 2. Create scrollable body
  const body = document.createElement("div");
  body.className = "combat-overlay-body";

  if (type === "combat_target") {
    if (menuContext.targetType === "enemy") {
      const instructions = document.createElement("div");
      instructions.id = "combat-target-instructions";
      instructions.className = "combat-target-selection-message sr-only";
      instructions.setAttribute("role", "status");
      instructions.setAttribute("aria-live", "polite");
      instructions.textContent = "敵をタップして対象を選択";
      body.appendChild(instructions);

      // The chosen spell stays in hand while the player aims.
      if (menuContext.spellName && SPELLS[menuContext.spellName]) {
        const aimed = SPELLS[menuContext.spellName];
        const aimSummary = getSpellCombatSummary(menuContext.spellName);
        const aimCard = document.createElement("div");
        aimCard.className = "combat-aim-card";
        const aimName = document.createElement("strong");
        aimName.textContent = aimed.name;
        const aimMeta = document.createElement("small");
        aimMeta.textContent = `${aimed.cost}MP・${aimSummary.effect}`;
        aimCard.append(aimName, aimMeta);
        body.appendChild(aimCard);
      }

      const accessibilityList = document.createElement("div");
      accessibilityList.className = "combat-target-a11y-list";
      accessibilityList.setAttribute("aria-label", "敵対象のキーボード選択");
      const monsters = state.combatState.monsters;
      monsters.forEach((m, idx) => {
        if (m.hp <= 0) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "combat-target-a11y";
        const hpState = getEnemyHpState(m);
        button.textContent = `${m.name}、${hpState}、攻撃対象にする`;
        button.setAttribute("aria-label", `${m.name}、${hpState}、攻撃対象にする`);
        button.addEventListener("click", () => {
          if (canCommitOverlayAction()) commitCombatTarget(idx);
        });
        accessibilityList.appendChild(button);
      });
      body.appendChild(accessibilityList);
    } else {
      // Ally targets
      const targetGrid = document.createElement("div");
      targetGrid.className = "combat-target-grid";
      const targetIndices = menuContext.spellName
        ? getSpellAllyTargetIndices(menuContext.spellName, state.party)
        : getItemAllyTargetIndices(state.party);
      const availableTargetIndices = new Set(targetIndices);
      state.party.forEach((char, idx) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "btn combat-target-card ally";
        
        const disabled = !availableTargetIndices.has(idx);

        if (disabled) {
          card.classList.add(char.status === "dead" ? "dead" : "blocked");
          card.disabled = true;
        }

        const maxHp = getCharMaxHp(char);
        const maxMp = getCharMaxMp(char);
        const clampPercent = value => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
        const hpPct = clampPercent(maxHp > 0 ? (char.hp / maxHp) * 100 : 0);
        const mpPct = clampPercent(maxMp > 0 ? (char.mp / maxMp) * 100 : 0);
        const name = document.createElement("div");
        name.className = "card-title";
        name.textContent = char.name;
        const hpBarContainer = document.createElement("div");
        hpBarContainer.className = "card-hp-bar-container";
        const hpBar = document.createElement("div");
        hpBar.className = "card-hp-bar";
        hpBar.style.width = `${hpPct}%`;
        hpBarContainer.appendChild(hpBar);
        const hpText = document.createElement("div");
        hpText.className = "card-hp-text";
        hpText.textContent = `HP: ${char.hp}/${maxHp}`;
        card.appendChild(name);
        card.appendChild(hpBarContainer);
        card.appendChild(hpText);
        if (maxMp > 0) {
          const mpBarContainer = document.createElement("div");
          mpBarContainer.className = "card-mp-bar-container";
          const mpBar = document.createElement("div");
          mpBar.className = "card-mp-bar";
          mpBar.style.width = `${mpPct}%`;
          mpBarContainer.appendChild(mpBar);
          const mpText = document.createElement("div");
          mpText.className = "card-mp-text";
          mpText.textContent = `MP: ${char.mp}/${maxMp}`;
          card.appendChild(mpBarContainer);
          card.appendChild(mpText);
        }
        card.setAttribute("aria-label", `${char.name}、HP ${char.hp}/${maxHp}${maxMp > 0 ? `、MP ${char.mp}/${maxMp}` : ""}${disabled ? "、対象外" : "、対象にする"}`);

        if (!disabled) {
          card.addEventListener("click", () => {
            if (!canCommitOverlayAction() || typeof combatCallbacks.activeTargetCallback !== "function") return;
            commitCombatTarget(idx);
          });
        }
        targetGrid.appendChild(card);
      });
      body.appendChild(targetGrid);
    }
  } else if (type === "combat_spell") {
    // Spells grid
    const spellGrid = document.createElement("div");
    spellGrid.className = "combat-selection-grid spell-grid";

    const casterIdx = menuContext.actorIdx;
    const caster = state.party[casterIdx];

    getUsableSpellKeys(getActiveSpellKeys(caster)).forEach(spKey => {
      const spell = SPELLS[spKey];
      if (spell.campOnly) return;
      
      const card = document.createElement("button");
      card.type = "button";
      card.className = "btn combat-item-card spell";
      
      const payment = getSpellPayment(caster, spell.cost);
      const mpCheck = !payment.canCast;
      const targetCheck = isSpellTargetAvailable(spell, spKey);
      const disabled = mpCheck || !targetCheck;

      if (mpCheck) {
        card.classList.add("disabled-mp");
      } else if (!targetCheck) {
        card.classList.add("disabled-unavailable");
      }
      card.disabled = disabled;

      const summary = getSpellCombatSummary(spKey);
      
      let reasonText = "";
      let reasonClass = "";
      if (mpCheck) {
        reasonText = "MP不足";
        reasonClass = "mp-shortage";
      } else if (!targetCheck) {
        reasonText = spell.target === "utility" ? "戦闘不可" : "対象なし";
        reasonClass = "unavailable";
      }

      const reach = SPELL_REACH[spell.target] || { label: summary.tag, tone: "utility" };
      card.dataset.reach = reach.tone;
      const glyph = document.createElement("span");
      glyph.className = "spell-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = getSpellGlyph(summary, spell);
      card.appendChild(glyph);
      const reachTag = document.createElement("span");
      reachTag.className = "spell-reach";
      reachTag.textContent = reach.label;

      const top = document.createElement("div");
      top.className = "spell-card-top";
      const spellName = document.createElement("span");
      spellName.className = "spell-name";
      spellName.title = spell.label;
      spellName.textContent = spell.label;
      const cost = document.createElement("span");
      cost.className = "cost-tag";
      cost.textContent = payment.resource === "hp" ? `${payment.cost}HP` : `${spell.cost}MP`;
      top.appendChild(spellName);
      top.appendChild(cost);
      const bottom = document.createElement("div");
      bottom.className = "spell-card-bottom";
      const tag = document.createElement("span");
      tag.className = `spell-tag ${summary.category}`;
      tag.textContent = summary.tag;
      const effect = document.createElement("span");
      effect.className = "spell-effect";
      effect.title = summary.effect;
      effect.textContent = summary.effect;
      bottom.appendChild(tag);
      bottom.appendChild(effect);
      if (reasonText) {
        const reason = document.createElement("span");
        reason.className = `disabled-reason-tag ${reasonClass}`;
        reason.textContent = reasonText;
        bottom.appendChild(reason);
      }
      card.appendChild(top);
      card.appendChild(reachTag);
      card.appendChild(bottom);
      card.setAttribute("aria-label", `${spell.label}、${payment.resource === "hp" ? `${payment.cost}HP` : `${spell.cost}MP`}、${summary.effect}${disabled ? "、使用不可" : ""}`);

      if (!disabled) {
        card.addEventListener("click", () => {
          if (!canCommitOverlayAction() || typeof combatCallbacks.activeSpellCallback !== "function") return;
          state.gameState = "combat";
          combatCallbacks.activeSpellCallback(spKey);
        });
      }
      spellGrid.appendChild(card);
    });
    body.appendChild(spellGrid);
  } else if (type === "combat_item") {
    // Items grid
    const itemGrid = document.createElement("div");
    itemGrid.className = "combat-selection-grid";

    itemGrid.appendChild(createBagCapacitySummary(state.inventory, {
      className: "inventory-capacity-status",
      note: state.inventory.length >= INVENTORY_CAPACITY
        ? "満杯。戦闘中は新しい戦果を拾えません。戦闘後に装備画面で整理します。"
        : "戦闘中に使う道具。装備品は装備画面で確認します。"
    }));

    const usableItems = getUsableInventoryItems(state.inventory);
    if (usableItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = state.inventory.length > 0
        ? `戦闘で使える道具はありません。バッグの他の${state.inventory.length}個は戦闘後にバッグで確認できます。`
        : "使える道具がありません";
      itemGrid.appendChild(emptyMsg);
    } else {
      // One vial per kind with a count; using it consumes the first copy.
      const grouped = [];
      usableItems.forEach((entry) => {
        const existing = grouped.find(group => group.itemKey === entry.itemKey);
        if (existing) existing.count += 1;
        else grouped.push({ ...entry, count: 1 });
      });
      grouped.forEach(({ itemKey, idx, item, count }) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "btn combat-item-card item";
        card.dataset.count = String(count);

        const usableCheck = item.campOnly;
        if (usableCheck) {
          card.classList.add("disabled");
        }
        card.disabled = usableCheck;

        const itemName = document.createElement("div");
        itemName.className = "item-card-title";
        itemName.textContent = item.name;
        const itemDescription = document.createElement("div");
        itemDescription.className = "item-card-desc";
        itemDescription.textContent = item.desc || "消費アイテム";
        const countBadge = document.createElement("span");
        countBadge.className = "item-count";
        countBadge.textContent = `×${count}`;
        countBadge.setAttribute("aria-hidden", "true");
        card.appendChild(countBadge);
        card.appendChild(itemName);
        card.appendChild(itemDescription);
        card.setAttribute("aria-label", `${item.name}、${count}個${usableCheck ? "、戦闘中は使用不可" : "、使用する"}`);

        if (!usableCheck) {
          card.addEventListener("click", () => {
            if (!canCommitOverlayAction() || typeof combatCallbacks.activeItemCallback !== "function") return;
            state.gameState = "combat";
            combatCallbacks.activeItemCallback(itemKey, idx);
          });
        }
        itemGrid.appendChild(card);
      });
    }
    body.appendChild(itemGrid);
  }

  overlay.appendChild(body);

  // 3. Bottom Actions Container
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnBack = document.createElement("button");
  btnBack.type = "button";
  btnBack.className = "btn btn-danger btn-combat-back dock-action-back";
  btnBack.setAttribute("data-action-role", "back");
  btnBack.setAttribute("aria-label", "選択をやめて戦闘へ戻る");
  btnBack.textContent = "◀ 戻る (キャンセル)";
  btnBack.addEventListener("click", () => {
    goBackSubmenu();
  });
  closeRow.appendChild(btnBack);
  footer.appendChild(closeRow);
  overlay.appendChild(footer);
}
