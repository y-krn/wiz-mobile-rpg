import { state } from "./state.js";
import { getClassJpName, isSpellcaster, SPELLS } from "./data.js";
import { updateUI } from "./ui.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "./navigation.js";
import { executeAllySpell, executeUtilitySpell } from "./menu.js";

export let spellMenuState = {
  filter: "all", // "all", "usable", "heal", "utility", "combat"
  selectedKey: null
};

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
  if (caster.mp < spell.cost) {
    return { usable: false, reason: "MP不足" };
  }

  // Check target availability
  if (["DIOS", "MADIOS", "DIALMA"].includes(spKey)) {
    const hasDamaged = state.party.some(c => c.status !== "dead" && c.hp < c.maxHp);
    if (!hasDamaged) {
      return { usable: false, reason: "対象なし" };
    }
  } else if (spKey === "KADORTO") {
    const hasDead = state.party.some(c => c.status === "dead");
    if (!hasDead) {
      return { usable: false, reason: "対象なし" };
    }
  } else if (spKey === "LATUMOFIS") {
    const hasPoisoned = state.party.some(c => c.status === "poisoned");
    if (!hasPoisoned) {
      return { usable: false, reason: "対象なし" };
    }
  } else if (spKey === "DIURCO") {
    const hasBlind = state.party.some(c => c.status === "blind");
    if (!hasBlind) {
      return { usable: false, reason: "対象なし" };
    }
  } else if (spKey === "DIALKO") {
    const hasSleepOrParalyze = state.party.some(c => ["sleep", "paralyze", "paralyzed"].includes(c.status));
    if (!hasSleepOrParalyze) {
      return { usable: false, reason: "対象なし" };
    }
  }

  return { usable: true, reason: "" };
}

// Helper function to categorize spells
export function getSpellCategory(spKey) {
  const healSpells = ["DIOS", "MADIOS", "DIALMA", "DIALKO", "DIURCO", "LATUMOFIS", "KADORTO"];
  const utilitySpells = ["DUMAPIC", "MILWA", "LOMILWA", "MASFEAL"];
  if (healSpells.includes(spKey)) {
    if (spKey === "KADORTO") return { cat: "heal", name: "蘇生" };
    if (["DIALKO", "DIURCO", "LATUMOFIS"].includes(spKey)) return { cat: "heal", name: "治療" };
    return { cat: "heal", name: "回復" };
  }
  if (utilitySpells.includes(spKey)) return { cat: "utility", name: "探索" };
  return { cat: "combat", name: "戦闘" };
}

export function renderSpellOverlay() {
  const overlay = document.getElementById("spell-overlay");
  if (!overlay) return;

  // Clear container
  overlay.innerHTML = "";

  // Set default values if uninitialized
  if (spellMenuState.filter === undefined) {
    spellMenuState.filter = "all";
  }
  if (spellMenuState.selectedKey === undefined) {
    spellMenuState.selectedKey = null;
  }

  // Auto-normalize caster selection when entering spell system
  if (menuContext.type === "spell_caster_select") {
    spellMenuState.filter = "all";
    spellMenuState.selectedKey = null;
    
    // Choose first living caster
    const firstCasterIdx = state.party.findIndex(c => c.status !== "dead" && isSpellcaster(c) && c.maxMp > 0);
    menuContext.actorIdx = firstCasterIdx !== -1 ? firstCasterIdx : 0;
    menuContext.type = "spell_select";
  }

  // 1. Header
  const header = document.createElement("div");
  header.className = "spell-header";
  header.innerHTML = `<span class="spell-title">呪文</span>`;
  overlay.appendChild(header);

  // 2. Render based on type
  if (menuContext.type === "spell_select") {
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
      } else if (char.mp <= 0) {
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
    const casterSpells = caster ? (caster.spells || []) : [];

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
    // 2. Category order: heal (回復 -> 治療 -> 蘇生) -> utility (探索) -> combat (戦闘)
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
          const subOrder = { "回復": 0, "治療": 1, "蘇生": 2 };
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
      emptyDiv.className = "spell-empty-text";
      emptyDiv.textContent = "該当する呪文がありません";
      listContainer.appendChild(emptyDiv);
    } else {
      filteredSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const usability = getSpellUsability(caster, spKey);
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
            <span class="spell-card-mp">MP ${spell.cost}</span>
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
    filterRow.style.display = "grid";
    filterRow.style.gridTemplateColumns = "repeat(3, 1fr)";
    filterRow.style.gap = "6px";
    filterRow.style.marginBottom = "8px";
    filterRow.style.width = "100%";

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
      chip.style.minHeight = "44px";
      chip.style.fontSize = "11px";
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
  } else if (menuContext.type === "spell_target_ally") {
    // 3. Spell Target Selection Screen (2x2 Grid)
    const spell = SPELLS[menuContext.spellName];
    const caster = state.party[menuContext.actorIdx];

    // Summary Header
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "spell-target-summary-header";
    
    const nextMp = Math.max(0, caster.mp - spell.cost);
    
    summaryDiv.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; color: var(--neon-purple); margin-bottom: 4px;">
        🔮 ${caster.name} が ${spell.name} を唱える <span style="font-size: 10px; color: var(--text-muted); font-weight: normal; margin-left: 6px;">(MP ${caster.mp} → ${nextMp})</span>
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
    gridContainer.style.flex = "1";
    gridContainer.style.maxHeight = "none";

    state.party.forEach((char, idx) => {
      const card = document.createElement("button");
      card.type = "button";

      // Target validation logic
      let isDisabled = false;
      let reason = "選択可能";
      let isRecommended = false;

      if (char.status === "dead") {
        if (menuContext.spellName === "KADORTO") {
          reason = "蘇生可";
          isRecommended = true;
        } else {
          isDisabled = true;
          reason = "対象外";
        }
      } else {
        if (menuContext.spellName === "KADORTO") {
          isDisabled = true;
          reason = "生存中";
        } else if (["DIOS", "MADIOS", "DIALMA"].includes(menuContext.spellName)) {
          if (char.hp >= char.maxHp) {
            isDisabled = true;
            reason = "HP満タン";
          } else {
            const ratio = char.hp / char.maxHp;
            reason = "回復推奨";
            if (ratio <= 0.5) {
              isRecommended = true;
            }
          }
        } else if (menuContext.spellName === "DIURCO") {
          if (char.status === "blind") {
            reason = "治療可";
            isRecommended = true;
          } else {
            isDisabled = true;
            reason = "健康";
          }
        } else if (menuContext.spellName === "DIALKO") {
          if (["sleep", "paralyze", "paralyzed"].includes(char.status)) {
            reason = "治療可";
            isRecommended = true;
          } else {
            isDisabled = true;
            reason = "健康";
          }
        } else if (menuContext.spellName === "LATUMOFIS") {
          if (char.status === "poisoned") {
            reason = "治療可";
            isRecommended = true;
          } else {
            isDisabled = true;
            reason = "健康";
          }
        }
      }

      card.className = `spell-target-card ${isDisabled ? "disabled" : ""} ${isRecommended ? "recommended" : ""}`;
      card.style.minHeight = "80px";

      if (isDisabled) {
        card.disabled = true;
      } else {
        card.addEventListener("click", () => {
          executeAllySpell(idx);
        });
      }

      let statusColor = "var(--text-muted)";
      if (isRecommended) {
        statusColor = "var(--neon-green)";
      } else if (isDisabled) {
        statusColor = "rgba(255, 255, 255, 0.2)";
      } else {
        statusColor = "var(--neon-cyan)";
      }

      const hpColor = char.hp <= char.maxHp * 0.3 ? "var(--neon-red)" : (char.hp <= char.maxHp * 0.5 ? "var(--neon-gold)" : "#fff");
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
  btnBack.style.minHeight = "44px";
  btnBack.addEventListener("click", () => {
    if (menuContext.type === "spell_select") {
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

    if (!spKey || !caster) {
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
          openSubmenu("spell_target_ally", `${spell.name}の対象を選択:`);
        } else if (spell.target === "utility") {
          executeUtilitySpell();
        }
      });
    }
  }
}
