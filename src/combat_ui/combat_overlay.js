import { state } from "../state.js";
import { ITEMS, SPELLS, getClassJpName, getCharMaxHp, getCharMaxMp } from "../data.js";
import { menuContext, goBackSubmenu } from "../navigation.js";
import { combatCallbacks } from "./combat_state.js";
import { getEnemyRow } from "./encounter.js";
import { canMeleeTargetEnemy } from "../combat_logic/targeting.js";
import { isSpellTargetAvailable, getSpellCombatSummary } from "./spell_menu.js";

export function renderCombatOverlay() {
  const overlay = document.getElementById("combat-overlay");
  if (!overlay) return;
  overlay.innerHTML = "";

  const type = menuContext.type;

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
  header.innerHTML = `<span class="combat-overlay-title">${titleText}</span>`;
  overlay.appendChild(header);

  // 2. Create scrollable body
  const body = document.createElement("div");
  body.className = "combat-overlay-body";

  if (type === "combat_target") {
    const targetGrid = document.createElement("div");
    targetGrid.className = "combat-target-grid";

    if (menuContext.targetType === "enemy") {
      // Enemy targets
      const monsters = state.combatState.monsters;
      const isMeleeTarget = !menuContext.spellName;
      monsters.forEach((m, idx) => {
        const card = document.createElement("div");
        card.className = "combat-target-card enemy";
        const blocked = isMeleeTarget && !canMeleeTargetEnemy(monsters, m);
        if (m.hp <= 0 || blocked) {
          card.classList.add("dead");
          if (blocked) card.classList.add("blocked");
        }

        const hpPct = m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0;
        const rowLabel = getEnemyRow(m) === "front" ? "前" : "後";
        let omenHtml = "";
        if (m.chargeQueued) omenHtml = `<div class="enemy-omen charge">⚠️ 溜め中 (大ダメージ)</div>`;
        else if (m.selfDestructQueued) omenHtml = `<div class="enemy-omen explode">⚠️ 爆発寸前 (自爆)</div>`;
        else if (m.lahalitoQueued) omenHtml = `<div class="enemy-omen spell">⚠️ 詠唱準備 (ラハリト/全体)</div>`;
        else if (m.madaltoQueued) omenHtml = `<div class="enemy-omen spell">⚠️ 詠唱準備 (マダルト/全体)</div>`;
        else if (m.tiltowaitQueued) omenHtml = `<div class="enemy-omen spell-boss">⚠️ 詠唱準備 (極大爆裂/全体)</div>`;
        else if (m.dragonBreathQueued) omenHtml = `<div class="enemy-omen breath">⚠️ ブレス準備 (全体)</div>`;
        else if (m.multiActionQueued) omenHtml = `<div class="enemy-omen multi">⚠️ 連続行動の予兆</div>`;
        else if (m.summonQueued) omenHtml = `<div class="enemy-omen summon">⚠️ 召喚の予兆</div>`;
        else if (m.snipeQueued) {
          const targetChar = state.party[m.snipeTargetIdx];
          omenHtml = `<div class="enemy-omen snipe">⚠️ 狙撃準備 (対象: ${targetChar ? targetChar.name : "後列"})</div>`;
        }

        card.innerHTML = `
          <div class="card-title"><span class="enemy-row-tag ${getEnemyRow(m)}">${rowLabel}</span>${m.name}</div>
          <div class="card-hp-bar-container">
            <div class="card-hp-bar" style="width: ${hpPct}%"></div>
          </div>
          <div class="card-hp-text">HP: ${m.hp}/${m.maxHp}</div>
          ${omenHtml}
          ${blocked ? `<div class="card-note">前列に阻まれている</div>` : ""}
        `;

        if (m.hp > 0 && !blocked) {
          card.addEventListener("click", () => {
            state.gameState = "combat";
            if (combatCallbacks.activeTargetCallback) combatCallbacks.activeTargetCallback(idx);
          });
        }
        targetGrid.appendChild(card);
      });
    } else {
      // Ally targets
      state.party.forEach((char, idx) => {
        const card = document.createElement("div");
        card.className = "combat-target-card ally";
        
        let disabled = false;
        if (menuContext.spellName === "KADORTO") {
          if (char.status !== "dead") disabled = true;
        } else {
          if (char.status === "dead") disabled = true;
        }

        if (disabled) {
          card.classList.add("dead");
        }

        const maxHp = getCharMaxHp(char);
        const maxMp = getCharMaxMp(char);
        const hpPct = maxHp > 0 ? (char.hp / maxHp) * 100 : 0;
        const mpPct = maxMp > 0 ? (char.mp / maxMp) * 100 : 0;
        
        card.innerHTML = `
          <div class="card-title">${char.name} <span class="card-class-tag">${getClassJpName(char.class)}</span></div>
          <div class="card-hp-bar-container">
            <div class="card-hp-bar" style="width: ${hpPct}%"></div>
          </div>
          <div class="card-hp-text">HP: ${char.hp}/${maxHp}</div>
          ${maxMp > 0 ? `
          <div class="card-mp-bar-container">
            <div class="card-mp-bar" style="width: ${mpPct}%"></div>
          </div>
          <div class="card-mp-text">MP: ${char.mp}/${maxMp}</div>
          ` : ""}
        `;

        if (!disabled) {
          card.addEventListener("click", () => {
            state.gameState = "combat";
            if (combatCallbacks.activeTargetCallback) combatCallbacks.activeTargetCallback(idx);
          });
        }
        targetGrid.appendChild(card);
      });
    }
    body.appendChild(targetGrid);
  } else if (type === "combat_spell") {
    // Spells grid
    const spellGrid = document.createElement("div");
    spellGrid.className = "combat-selection-grid spell-grid";

    const casterIdx = menuContext.actorIdx;
    const caster = state.party[casterIdx];

    caster.spells.forEach(spKey => {
      const spell = SPELLS[spKey];
      if (spell.campOnly) return;
      
      const card = document.createElement("div");
      card.className = "combat-item-card spell";
      
      const mpCheck = caster.mp < spell.cost;
      const targetCheck = isSpellTargetAvailable(spell, caster);
      const disabled = mpCheck || !targetCheck;

      if (mpCheck) {
        card.classList.add("disabled-mp");
      } else if (!targetCheck) {
        card.classList.add("disabled-unavailable");
      }

      const summary = getSpellCombatSummary(spKey);
      
      let reasonBadgeHTML = "";
      if (mpCheck) {
        reasonBadgeHTML = `<span class="disabled-reason-tag mp-shortage">MP不足</span>`;
      } else if (!targetCheck) {
        const reasonText = spell.target === "utility" ? "戦闘不可" : "対象なし";
        reasonBadgeHTML = `<span class="disabled-reason-tag unavailable">${reasonText}</span>`;
      }

      card.innerHTML = `
        <div class="spell-card-top">
          <span class="spell-name" title="${spell.name}">${spell.name}</span>
          <span class="cost-tag">${spell.cost}MP</span>
        </div>
        <div class="spell-card-bottom">
          <span class="spell-tag ${summary.category}">${summary.tag}</span>
          <span class="spell-effect" title="${summary.effect}">${summary.effect}</span>
          ${reasonBadgeHTML}
        </div>
      `;

      if (!disabled) {
        card.addEventListener("click", () => {
          state.gameState = "combat";
          if (combatCallbacks.activeSpellCallback) combatCallbacks.activeSpellCallback(spKey);
        });
      }
      spellGrid.appendChild(card);
    });
    body.appendChild(spellGrid);
  } else if (type === "combat_item") {
    // Items grid
    const itemGrid = document.createElement("div");
    itemGrid.className = "combat-selection-grid";

    if (state.inventory.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "detail-placeholder";
      emptyMsg.textContent = "共有バッグは空っぽです。";
      itemGrid.appendChild(emptyMsg);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = ITEMS[itemKey];
        const card = document.createElement("div");
        card.className = "combat-item-card item";

        const usableCheck = item.type !== "usable" || item.campOnly;
        if (usableCheck) {
          card.classList.add("disabled");
        }

        card.innerHTML = `
          <div class="item-card-title">${item.name}</div>
          <div class="item-card-desc">${item.desc || "消費アイテム"}</div>
        `;

        if (!usableCheck) {
          card.addEventListener("click", () => {
            state.gameState = "combat";
            if (combatCallbacks.activeItemCallback) combatCallbacks.activeItemCallback(itemKey, idx);
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
  btnBack.className = "btn btn-danger btn-combat-back";
  btnBack.textContent = "◀ 戻る (キャンセル)";
  btnBack.style.width = "100%";
  btnBack.style.minHeight = "44px";
  btnBack.addEventListener("click", () => {
    goBackSubmenu();
  });
  closeRow.appendChild(btnBack);
  footer.appendChild(closeRow);
  overlay.appendChild(footer);
}
