import { state, saveAutosave, addLog } from "./state.js";
import { getScreenViewState, getUsableSpellKeys, isUsableSpellForActor } from "./state/view_state.ts";
import { getSpellPayment, paySpellCost, getCoreLogText, getCharMaxHp, getCharMaxMp } from "./data.js";
import { SPELLS } from "./data/spells.js";
import { SPELL_EFFECTS } from "./systems/spell_effects.js";
import { isSpellcaster } from "./rules/magic_rules.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "./navigation.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import {
  CURE_SPELL_KEYS,
  HEAL_SPELL_KEYS,
  isSpellAvailableInContext,
  getSpellAllyTargetIndices,
  getSpellAllyTargetStatus
} from "./rules/spell_targeting.js";
import { trackExplorationDecision } from "./telemetry.js";
import { getActiveSpellKeys } from "./rules/magic_rules.js";

export let spellMenuState = {
  filter: "all", // "all", "usable", "heal", "utility", "combat"
  selectedKey: null
};

function executeUtilitySpell() {
  const spell = SPELLS[menuContext.spellName];
  if (!isUsableSpellForActor(state.party, menuContext.actorIdx, menuContext.spellName, "utility") ||
      !isSpellAvailableInContext(spell, "exploration")) return;
  const caster = state.party[menuContext.actorIdx];
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
  const result = SPELL_EFFECTS[menuContext.spellName]({
    caster,
    target: state,
    party: state.party,
    rng: Math.random,
    telemetryEnabled: false,
    state: null,
    logQueue: null,
    measurement: null
  });
  addLog(result.log);
  saveAutosave();
  closeSubmenu();
}

function executeAllySpell(targetIdx) {
  const spell = SPELLS[menuContext.spellName];
  if (!isUsableSpellForActor(state.party, menuContext.actorIdx, menuContext.spellName, ["single_ally", "all_allies"]) ||
      !isSpellAvailableInContext(spell, "exploration")) return;
  const caster = state.party[menuContext.actorIdx];
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
  const result = SPELL_EFFECTS[menuContext.spellName]({
    caster,
    target,
    party: state.party,
    rng: Math.random,
    telemetryEnabled: false,
    state: null,
    logQueue: null,
    measurement: null
  });
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

  // Check if the spell is available while exploring.
  if (!isSpellAvailableInContext(spell, "exploration")) {
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
  overlay.replaceChildren();
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
  if (spellMenuState.selectedKey && !isUsableSpellForActor(state.party, menuContext.actorIdx, spellMenuState.selectedKey)) {
    spellMenuState.selectedKey = null;
  }

  // Auto-normalize caster selection when entering spell system
  if (menuType === "spell_caster_select") {
    spellMenuState.filter = "all";
    spellMenuState.selectedKey = null;
    
    // Choose first living caster
    const firstCasterIdx = state.party.findIndex(c => c.status !== "dead" && isSpellcaster(c) && getCharMaxMp(c) > 0);
    menuContext.actorIdx = firstCasterIdx !== -1 ? firstCasterIdx : 0;
    menuContext.type = "spell_select";
    menuType = getSafeMenuType();
  }

  // 1. Header
  const header = document.createElement("div");
  header.className = "spell-header";
  const title = document.createElement("span");
  title.className = "spell-title";
  title.textContent = "呪文";
  header.appendChild(title);
  overlay.appendChild(header);

  // 2. Render based on type
  if (menuType === "spell_select") {
    // 2.1 Caster Switch Bar (術者バー)
    const casterBar = document.createElement("div");
    casterBar.className = "spell-caster-bar";

    state.party.forEach((char, idx) => {
      // Hide characters who can't cast spells entirely
      if (!isSpellcaster(char) || getCharMaxMp(char) === 0) return;

      const btn = document.createElement("button");
      btn.type = "button";
      const isCurrent = idx === menuContext.actorIdx;
      
      let isDisabled = false;
      let reason = "";
      if (char.status === "dead") {
        isDisabled = true;
        reason = "死亡";
      } else if (char.mp <= 0 && !getUsableSpellKeys(getActiveSpellKeys(char)).some(spellKey => getSpellPayment(char, SPELLS[spellKey].cost).canCast)) {
        isDisabled = true;
        reason = "MP枯渇";
      }

      btn.className = `spell-caster-btn ${isCurrent ? "active" : ""} ${isDisabled ? "disabled" : ""}`;
      
      const casterName = document.createElement("div");
      casterName.className = "caster-btn-name";
      casterName.textContent = char.name;
      const mpInfo = document.createElement("div");
      mpInfo.className = "caster-btn-meta";
      if (reason) {
        const reasonElement = document.createElement("span");
        reasonElement.className = "caster-btn-reason";
        reasonElement.textContent = reason;
        mpInfo.appendChild(reasonElement);
      } else {
        mpInfo.textContent = `MP ${char.mp}/${getCharMaxMp(char)}`;
      }
      btn.appendChild(casterName);
      btn.appendChild(mpInfo);

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
    const casterSpells = caster ? getUsableSpellKeys(getActiveSpellKeys(caster)) : [];

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

        const top = document.createElement("div");
        top.className = "spell-card-row-top";
        const name = document.createElement("span");
        name.className = "spell-card-name";
        name.textContent = spell.name;
        const cost = document.createElement("span");
        cost.className = "spell-card-mp";
        cost.textContent = payment.resource === "hp" ? `HP ${payment.cost}` : `MP ${spell.cost}`;
        top.appendChild(name);
        top.appendChild(cost);
        const bottom = document.createElement("div");
        bottom.className = "spell-card-row-bottom";
        const description = document.createElement("span");
        description.className = "spell-card-desc";
        description.textContent = spell.desc;
        const tag = document.createElement("span");
        tag.className = `spell-card-tag ${tagClass}`;
        tag.textContent = rightTagText;
        bottom.appendChild(description);
        bottom.appendChild(tag);
        btn.appendChild(top);
        btn.appendChild(bottom);

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
    
    const summaryTitle = document.createElement("div");
    summaryTitle.style.fontSize = "13px";
    summaryTitle.style.fontWeight = "bold";
    summaryTitle.style.color = "var(--neon-purple)";
    summaryTitle.style.marginBottom = "4px";
    summaryTitle.textContent = `🔮 ${caster.name} が ${spell.name} を唱える `;
    const preview = document.createElement("span");
    preview.style.fontSize = "10px";
    preview.style.color = "var(--text-muted)";
    preview.style.fontWeight = "normal";
    preview.style.marginLeft = "6px";
    preview.textContent = `(${resourcePreview})`;
    summaryTitle.appendChild(preview);
    const summaryDescription = document.createElement("div");
    summaryDescription.style.fontSize = "11px";
    summaryDescription.style.color = "var(--text-muted)";
    summaryDescription.style.lineHeight = "1.3";
    summaryDescription.textContent = spell.desc;
    summaryDiv.appendChild(summaryTitle);
    summaryDiv.appendChild(summaryDescription);
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
      const { isDisabled, reason } = getSpellAllyTargetStatus(menuContext.spellName, char);

      card.className = `spell-target-card ${isDisabled ? "disabled" : ""}`;

      if (isDisabled) {
        card.disabled = true;
      } else {
        card.addEventListener("click", () => {
          executeAllySpell(idx);
        });
      }

      const statusColor = isDisabled ? "var(--text-disabled)" : "var(--neon-cyan)";

      const hpColor = char.hp <= char.maxHp * 0.3 ? "var(--neon-red)" : (char.hp <= char.maxHp * 0.5 ? "var(--neon-amber)" : "#fff");
      const statusSuffix = char.status !== "ok" && char.status !== "dead" ? ` [${char.status.toUpperCase()}]` : "";

      const name = document.createElement("div");
      name.className = "target-card-name";
      name.textContent = char.name;
      const hpOrStatus = document.createElement("div");
      hpOrStatus.className = "target-card-hp";
      hpOrStatus.style.color = char.status === "dead" ? "var(--neon-red)" : hpColor;
      if (char.status === "dead") hpOrStatus.style.fontWeight = "bold";
      hpOrStatus.textContent = char.status === "dead" ? "死亡" : `HP: ${char.hp}/${char.maxHp}`;
      const status = document.createElement("div");
      status.className = "target-card-status";
      status.style.color = statusColor;
      status.style.fontWeight = "bold";
      status.style.fontSize = "11px";
      status.style.marginTop = "4px";
      status.textContent = `${reason}${statusSuffix}`;
      card.appendChild(name);
      card.appendChild(hpOrStatus);
      card.appendChild(status);

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

    if (!spKey || !caster || !isUsableSpellForActor(state.party, menuContext.actorIdx, spKey)) {
      if (spKey) spellMenuState.selectedKey = null;
      panel.replaceChildren();
      const placeholder = document.createElement("div");
      placeholder.className = "spell-detail-placeholder";
      placeholder.textContent = "呪文を選択してください";
      const disabledButton = document.createElement("button");
      disabledButton.className = "btn btn-neon btn-block disabled";
      disabledButton.disabled = true;
      disabledButton.textContent = "唱える呪文を選択";
      panel.appendChild(placeholder);
      panel.appendChild(disabledButton);
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
    let warningText = "";

    if (!usability.usable) {
      isBtnDisabled = true;
      if (usability.reason === "戦闘のみ" || usability.reason === "戦闘中のみ") {
        btnText = "戦闘中のみ";
        warningText = "※戦闘中のみ使用可能な呪文です。";
      } else if (usability.reason === "MP不足") {
        btnText = "MP不足";
        warningText = "※MPが不足しています。";
      } else if (usability.reason === "対象なし") {
        btnText = "対象なし";
        warningText = "※効果のある対象がいません。";
      } else {
        btnText = usability.reason;
      }
    }

    panel.replaceChildren();
    const content = document.createElement("div");
    content.className = "spell-detail-content";
    const detailHeader = document.createElement("div");
    detailHeader.className = "spell-detail-header-row";
    const spellName = document.createElement("span");
    spellName.className = "spell-detail-name";
    spellName.textContent = spell.name;
    const target = document.createElement("span");
    target.className = "spell-detail-target";
    target.textContent = `対象: ${targetJp}`;
    detailHeader.appendChild(spellName);
    detailHeader.appendChild(target);
    const casterRow = document.createElement("div");
    casterRow.className = "spell-detail-caster-row";
    casterRow.textContent = `術者: ${caster.name} / HP: `;
    const hp = document.createElement("span");
    hp.className = "detail-hp-val";
    hp.textContent = `${caster.hp}/${getCharMaxHp(caster)}`;
    casterRow.appendChild(hp);
    if (caster.status !== "ok") {
      const statusText = document.createElement("span");
      statusText.textContent = ` / 状態: ${caster.status.toUpperCase()}`;
      casterRow.appendChild(statusText);
    }
    const mpRow = document.createElement("div");
    mpRow.className = "spell-detail-mp-row";
    mpRow.textContent = "消費MP: ";
    const cost = document.createElement("span");
    cost.className = "detail-mp-val";
    cost.textContent = spell.cost;
    mpRow.appendChild(cost);
    const mpSeparator = document.createElement("span");
    mpSeparator.textContent = " / 現在MP: ";
    mpRow.appendChild(mpSeparator);
    const currentMp = document.createElement("span");
    currentMp.className = "detail-mp-val";
    currentMp.textContent = caster.mp;
    mpRow.appendChild(currentMp);
    const description = document.createElement("div");
    description.className = "spell-detail-desc";
    description.textContent = spell.desc;
    content.appendChild(detailHeader);
    content.appendChild(casterRow);
    content.appendChild(mpRow);
    content.appendChild(description);
    if (warningText) {
      const warning = document.createElement("div");
      warning.className = "spell-detail-warning";
      warning.textContent = warningText;
      content.appendChild(warning);
    }
    const castButton = document.createElement("button");
    castButton.id = "btn-spell-cast-action";
    castButton.className = `btn btn-neon btn-block ${isBtnDisabled ? "disabled" : ""}`;
    castButton.disabled = isBtnDisabled;
    castButton.textContent = btnText;
    panel.appendChild(content);
    panel.appendChild(castButton);

    if (!isBtnDisabled) {
      castButton.addEventListener("click", () => {
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
