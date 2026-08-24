import { state, saveAutosave, addLog } from "./state.js";
import { getScreenViewState, getUsableSpellKeys, isUsableSpellKey } from "./state/view_state.js";
import { getClassJpName, isSpellcaster, SPELLS, getSpellPayment, paySpellCost, getCoreLogText, getCharMaxHp } from "./data.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "./navigation.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import {
  CURE_SPELL_KEYS,
  HEAL_SPELL_KEYS,
  getSpellAllyTargetIndices,
  getSpellAllyTargetStatus
} from "./rules/spell_targeting.js";
import { trackExplorationDecision } from "./telemetry.js";

export let spellMenuState = {
  filter: "all", // "all", "usable", "heal", "utility", "combat"
  selectedKey: null
};

function executeUtilitySpell() {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];
  const payment = paySpellCost(caster, spell.cost);
  if (!payment.canCast) return;
  trackExplorationDecision("spell", {
    state,
    character: caster,
    source: state.map?.[state.y]?.[state.x]?.event,
    spellName: menuContext.spellName
  });
  if (payment.resource === "hp") addLog(getCoreLogText("CORE_BLOOD_WAND"));
  playSound("cast_spell");
  if (menuContext.spellName === "DUMAPIC") state.dumapicTurns = 30;
  const result = spell.effect(caster, state, state.party);
  addLog(result.log);
  saveAutosave();
  closeSubmenu();
}

function executeAllySpell(targetIdx) {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];
  const payment = paySpellCost(caster, spell.cost);
  if (!payment.canCast) return;
  trackExplorationDecision("spell", {
    state,
    character: caster,
    source: state.map?.[state.y]?.[state.x]?.event,
    spellName: menuContext.spellName,
    targetIdx
  });
  if (payment.resource === "hp") addLog(getCoreLogText("CORE_BLOOD_WAND"));
  playSound("cast_spell");
  const target = spell.target === "all_allies" ? state.party : state.party[targetIdx];
  const result = spell.effect(caster, target, state.party);
  addLog(result.log);
  if (result.heal) {
    playSound("heal");
    renderer?.addDamageText(`+${result.heal}`, "#00ff66");
  }
  saveAutosave();
  closeSubmenu();
}

// Helper function to check spell usability in camps
export function getSpellUsability(caster, spKey) {
  const spell = SPELLS[spKey];
  if (!spell) return { usable: false, reason: "不明" };

  // Check if combat-only spell
  const isCombatOnly = (spell.target === "single_enemy" || spell.target === "all_enemies");
  if (isCombatOnly) {
    return { usable: false, reason: "戦闘のみ" };
  }

  // Check MP
  if (!getSpellPayment(caster, spell.cost).canCast) {
    return { usable: false, reason: "MP・HP不足" };
  }

  // Check target availability
  if (spell.target === "single_ally" && getSpellAllyTargetIndices(spKey, state.party).length === 0) {
    return { usable: false, reason: "対象なし" };
  }

  return { usable: true, reason: "" };
}

// Helper function to categorize spells
export function getSpellCategory(spKey) {
  const utilitySpells = ["DUMAPIC", "MILWA", "LOMILWA", "MASFEAL"];
  if (HEAL_SPELL_KEYS.includes(spKey)) {
    if (CURE_SPELL_KEYS.includes(spKey)) return { cat: "heal", name: "治療" };
    return { cat: "heal", name: "回復" };
  }
  if (utilitySpells.includes(spKey)) return { cat: "utility", name: "探索" };
  return { cat: "combat", name: "戦闘" };
}

function getSafeMenuType() {
  const view = getScreenViewState(state, menuContext);
  return view.isUsableSpellOverlaySubmenu ? view.menuType : "";
}

export function renderSpellOverlay() {
  const overlay = document.getElementById("spell-overlay");
  if (!overlay) return;

  let menuType = getSafeMenuType();

  // Clear container
  overlay.innerHTML = "";
  if (!menuType) {
    overlay.style.display = "none";
    return;
  }

  // Set default values if uninitialized
  if (spellMenuState.filter === undefined) {
    spellMenuState.filter = "all";
  }
  if (spellMenuState.selectedKey === undefined) {
    spellMenuState.selectedKey = null;
  }
  if (spellMenuState.selectedKey && !isUsableSpellKey(spellMenuState.selectedKey)) {
    spellMenuState.selectedKey = null;
  }

  // Auto-normalize caster selection when entering spell system
  if (menuType === "spell_caster_select") {
    spellMenuState.filter = "all";
    spellMenuState.selectedKey = null;
    
    // Choose first living caster
    const firstCasterIdx = state.party.findIndex(c => c.status !== "dead" && isSpellcaster(c) && c.maxMp > 0);
    menuContext.actorIdx = firstCasterIdx !== -1 ? firstCasterIdx : 0;
    menuContext.type = "spell_select";
    menuType = getSafeMenuType();
  }

  // 1. Header
  const header = document.createElement("div");
  header.className = "spell-header";
  header.innerHTML = `<span class="spell-title">呪文</span>`;
  overlay.appendChild(header);

  // 2. Render based on type
  if (menuType === "spell_select") {
    // 2.1 Caster Switch Bar (術者バー)
    const casterBar = document.createElement("div");
    casterBar.className = "spell-caster-bar";

    state.party.forEach((char, idx) => {
      // Hide characters who can't cast spells entirely
      if (!isSpellcaster(char) || char.maxMp === 0) return;

      const btn = document.createElement("button");
      btn.type = "button";
      const isCurrent = idx === menuContext.actorIdx;
      
      let isDisabled = false;
      let reason = "";
      if (char.status === "dead") {
        isDisabled = true;
        reason = "死亡";
      } else if (char.mp <= 0 && !getUsableSpellKeys(char.spells).some(spellKey => getSpellPayment(char, SPELLS[spellKey].cost).canCast)) {
        isDisabled = true;
        reason = "MP枯渇";
      }

      btn.className = `spell-caster-btn ${isCurrent ? "active" : ""} ${isDisabled ? "disabled" : ""}`;
      
      const mpInfo = reason ? `<span class="caster-btn-reason">${reason}</span>` : `MP ${char.mp}/${char.maxMp}`;

      btn.innerHTML = `
        <div class="caster-btn-name">${char.name}</div>
        <div class="caster-btn-meta">${getClassJpName(char.class)} ${mpInfo}</div>
      `;

      if (isDisabled && !isCurrent) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          menuContext.actorIdx = idx;
          spellMenuState.selectedKey = null; // Clear selected spell on caster switch
          renderSpellOverlay();
        });
      }

      casterBar.appendChild(btn);
    });
    overlay.appendChild(casterBar);

    // 2.3 Spell List (呪文一覧)
    const listContainer = document.createElement("div");
    listContainer.className = "spell-item-list";

    const caster = state.party[menuContext.actorIdx];
    const casterSpells = caster ? getUsableSpellKeys(caster.spells) : [];

    // Filter spells
    const filteredSpells = casterSpells.filter(spKey => {
      const usability = getSpellUsability(caster, spKey);
      const catInfo = getSpellCategory(spKey);
      
      if (spellMenuState.filter === "all") return true;
      if (spellMenuState.filter === "usable") return usability.usable;
      return spellMenuState.filter === catInfo.cat;
    });

    // Sort spells
    // 1. Usable (使用可能)
    // 2. Category order: heal (回復 -> 治療) -> utility (探索) -> combat (戦闘)
    // 3. Unusable reason order: 戦闘のみ -> MP不足 -> 対象なし
    filteredSpells.sort((a, b) => {
      const statusA = getSpellUsability(caster, a);
      const statusB = getSpellUsability(caster, b);

      if (statusA.usable !== statusB.usable) {
        return statusA.usable ? -1 : 1;
      }

      const catA = getSpellCategory(a);
      const catB = getSpellCategory(b);
      const catOrder = { heal: 0, utility: 1, combat: 2 };

      if (statusA.usable) {
        if (catA.cat !== catB.cat) {
          return catOrder[catA.cat] - catOrder[catB.cat];
        }
        if (catA.cat === "heal") {
          const subOrder = { "回復": 0, "治療": 1 };
          return subOrder[catA.name] - subOrder[catB.name];
        }
        return 0;
      } else {
        const reasonOrder = { "戦闘のみ": 0, "MP不足": 1, "対象なし": 2 };
        const rA = statusA.reason === "戦闘のみ" || statusA.reason === "戦闘中のみ" ? "戦闘のみ" : statusA.reason;
        const rB = statusB.reason === "戦闘のみ" || statusB.reason === "戦闘中のみ" ? "戦闘のみ" : statusB.reason;
        if (rA !== rB) {
          return (reasonOrder[rA] ?? 99) - (reasonOrder[rB] ?? 99);
        }
        return 0;
      }
    });

    if (filteredSpells.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "list-empty";
      emptyDiv.textContent = "該当する呪文がありません";
      listContainer.appendChild(emptyDiv);
    } else {
      filteredSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const usability = getSpellUsability(caster, spKey);
        const payment = getSpellPayment(caster, spell.cost);
        const catInfo = getSpellCategory(spKey);
        const isSelected = spellMenuState.selectedKey === spKey;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-neon spell-item-row-card ${isSelected ? "active" : ""} ${!usability.usable ? "disabled" : ""}`;

        const rightTagText = usability.reason || catInfo.name;
        let tagClass = `tag-${catInfo.cat}`;
        if (!usability.usable) {
          tagClass = usability.reason === "MP不足" ? "tag-mp-short" : "tag-disabled";
        }

        btn.innerHTML = `
          <div class="spell-card-row-top">
            <span class="spell-card-name">${spell.name}</span>
            <span class="spell-card-mp">${payment.resource === "hp" ? `HP ${payment.cost}` : `MP ${spell.cost}`}</span>
          </div>
          <div class="spell-card-row-bottom">
            <span class="spell-card-desc">${spell.desc}</span>
            <span class="spell-card-tag ${tagClass}">${rightTagText}</span>
          </div>
        `;

        btn.addEventListener("click", () => {
          listContainer.querySelectorAll(".spell-item-row-card").forEach(r => r.classList.remove("active"));
          btn.classList.add("active");
          spellMenuState.selectedKey = spKey;
          renderSpellDetailInPanel(spKey, caster);
        });

        listContainer.appendChild(btn);
      });
    }

    overlay.appendChild(listContainer);

    // 2.2 Spell Filter (呪文フィルタ) - Moved here to be closer to bottom action area
    const filterRow = document.createElement("div");
    filterRow.className = "spell-filters";

    const categories = [
      { id: "all", label: "すべて" },
      { id: "usable", label: "使用可" },
      { id: "heal", label: "回復" },
      { id: "utility", label: "探索" },
      { id: "combat", label: "戦闘" }
    ];

    categories.forEach(cat => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isActive = spellMenuState.filter === cat.id;
      chip.className = `filter-chip ${isActive ? "active" : ""}`;
      chip.textContent = cat.label;
      chip.addEventListener("click", () => {
        spellMenuState.filter = cat.id;
        spellMenuState.selectedKey = null; // Clear selected spell on filter switch
        renderSpellOverlay();
      });
      filterRow.appendChild(chip);
    });
    overlay.appendChild(filterRow);

    // 2.4 Detail Panel & Cast Button Container
    const detailContainer = document.createElement("div");
    detailContainer.className = "spell-detail-container";
    detailContainer.id = "spell-detail-panel";
    overlay.appendChild(detailContainer);

    // Render details for previously selected key or show placeholder
    renderSpellDetailInPanel(spellMenuState.selectedKey, caster);
  } else if (menuType === "spell_target_ally") {
    // 3. Spell Target Selection Screen (2x2 Grid)
    const spell = SPELLS[menuContext.spellName];
    const caster = state.party[menuContext.actorIdx];

    // Summary Header
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "spell-target-summary-header";
    
    const payment = getSpellPayment(caster, spell.cost);
    const resourcePreview = payment.resource === "hp"
      ? `HP ${caster.hp} → ${Math.max(1, caster.hp - payment.cost)}`
      : `MP ${caster.mp} → ${Math.max(0, caster.mp - spell.cost)}`;
    
    summaryDiv.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; color: var(--neon-purple); margin-bottom: 4px;">
        🔮 ${caster.name} が ${spell.name} を唱える <span style="font-size: 10px; color: var(--text-muted); font-weight: normal; margin-left: 6px;">(${resourcePreview})</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">
        ${spell.desc}
      </div>
    `;
    overlay.appendChild(summaryDiv);

    const selectPrompt = document.createElement("div");
    selectPrompt.className = "spell-target-prompt";
    selectPrompt.textContent = "対象を選択";
    overlay.appendChild(selectPrompt);

    // 2x2 Grid Container
    const gridContainer = document.createElement("div");
    gridContainer.className = "spell-target-grid";

    state.party.forEach((char, idx) => {
      const card = document.createElement("button");
      card.type = "button";

      // Target validation logic
      const { isDisabled, reason, isRecommended } = getSpellAllyTargetStatus(menuContext.spellName, char);

      card.className = `spell-target-card ${isDisabled ? "disabled" : ""} ${isRecommended ? "recommended" : ""}`;

      if (isDisabled) {
        card.disabled = true;
      } else {
        card.addEventListener("click", () => {
          executeAllySpell(idx);
        });
      }

      let statusColor;
      if (isRecommended) {
        statusColor = "var(--neon-green)";
      } else if (isDisabled) {
        statusColor = "rgba(255, 255, 255, 0.2)";
      } else {
        statusColor = "var(--neon-cyan)";
      }

      const hpColor = char.hp <= char.maxHp * 0.3 ? "var(--neon-red)" : (char.hp <= char.maxHp * 0.5 ? "var(--neon-amber)" : "#fff");
      const statusSuffix = char.status !== "ok" && char.status !== "dead" ? ` [${char.status.toUpperCase()}]` : "";

      let hpOrStatusHtml = `<div class="target-card-hp" style="color: ${hpColor}">HP: ${char.hp}/${char.maxHp}</div>`;
      if (char.status === "dead") {
        hpOrStatusHtml = `<div class="target-card-hp" style="color: var(--neon-red); font-weight: bold;">死亡</div>`;
      }

      card.innerHTML = `
        <div class="target-card-name">${char.name}</div>
        <div class="target-card-class">${getClassJpName(char.class)}</div>
        ${hpOrStatusHtml}
        <div class="target-card-status" style="color: ${statusColor}; font-weight: bold; font-size: 11px; margin-top: 4px;">
          ${reason}${statusSuffix}
        </div>
      `;

      gridContainer.appendChild(card);
    });

    overlay.appendChild(gridContainer);
  }

  // 4. Footer Row (戻るボタン)
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  const btnBack = document.createElement("button");
  btnBack.type = "button";
  btnBack.className = "btn btn-danger btn-block";
  btnBack.textContent = "◀ 戻る";
  btnBack.addEventListener("click", () => {
    if (getSafeMenuType() === "spell_select") {
      closeSubmenu();
    } else {
      goBackSubmenu();
    }
  });
  footer.appendChild(btnBack);
  overlay.appendChild(footer);

  // Helper to render spell details & cast button inside the fixed panel
  function renderSpellDetailInPanel(spKey, caster) {
    const panel = document.getElementById("spell-detail-panel");
    if (!panel) return;

    if (!spKey || !caster || !isUsableSpellKey(spKey)) {
      if (spKey && !isUsableSpellKey(spKey)) spellMenuState.selectedKey = null;
      panel.innerHTML = `
        <div class="spell-detail-placeholder">呪文を選択してください</div>
        <button class="btn btn-neon btn-block disabled" disabled>唱える呪文を選択</button>
      `;
      return;
    }

    const spell = SPELLS[spKey];
    const usability = getSpellUsability(caster, spKey);
    
    let targetJp = "味方単体";
    if (spell.target === "all_enemies") targetJp = "敵全体";
    else if (spell.target === "all_allies") targetJp = "自分";
    else if (spell.target === "single_enemy") targetJp = "敵単体";
    else if (spell.target === "utility") targetJp = "探索全体";

    let btnText = "🔮 呪文を唱える";
    let isBtnDisabled = false;
    let warnHtml = "";

    if (!usability.usable) {
      isBtnDisabled = true;
      if (usability.reason === "戦闘のみ" || usability.reason === "戦闘中のみ") {
        btnText = "戦闘中のみ";
        warnHtml = `<div class="spell-detail-warning">※戦闘中のみ使用可能な呪文です。</div>`;
      } else if (usability.reason === "MP不足") {
        btnText = "MP不足";
        warnHtml = `<div class="spell-detail-warning">※MPが不足しています。</div>`;
      } else if (usability.reason === "対象なし") {
        btnText = "対象なし";
        warnHtml = `<div class="spell-detail-warning">※効果のある対象がいません。</div>`;
      } else {
        btnText = usability.reason;
      }
    }

    panel.innerHTML = `
      <div class="spell-detail-content">
        <div class="spell-detail-header-row">
          <span class="spell-detail-name">${spell.name}</span>
          <span class="spell-detail-target">対象: ${targetJp}</span>
        </div>
        <div class="spell-detail-caster-row">
          術者: ${caster.name}（${getClassJpName(caster.class)}） / HP: <span class="detail-hp-val">${caster.hp}/${getCharMaxHp(caster)}</span>${caster.status !== "ok" ? ` / 状態: ${caster.status.toUpperCase()}` : ""}
        </div>
        <div class="spell-detail-mp-row">
          消費MP: <span class="detail-mp-val">${spell.cost}</span> / 現在MP: <span class="detail-mp-val">${caster.mp}</span>
        </div>
        <div class="spell-detail-desc">${spell.desc}</div>
        ${warnHtml}
      </div>
      <button id="btn-spell-cast-action" class="btn btn-neon btn-block ${isBtnDisabled ? "disabled" : ""}" ${isBtnDisabled ? "disabled" : ""}>
        ${btnText}
      </button>
    `;

    if (!isBtnDisabled) {
      const castBtn = panel.querySelector("#btn-spell-cast-action");
      castBtn.addEventListener("click", () => {
        menuContext.spellName = spKey;
        if (spell.target === "single_ally") {
          const targetIndices = getSpellAllyTargetIndices(spKey, state.party);
          if (targetIndices.length === 1) {
            executeAllySpell(targetIndices[0]);
          } else {
            openSubmenu("spell_target_ally", `${spell.name}の対象を選択:`);
          }
        } else if (spell.target === "all_allies") {
          executeAllySpell();
        } else if (spell.target === "utility") {
          executeUtilitySpell();
        }
      });
    }
  }
}
