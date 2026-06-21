import { state } from "./state.js";
import { getClassJpName, isSpellcaster, SPELLS } from "./data.js";
import { updateUI } from "./ui.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext } from "./navigation.js";
import { executeAllySpell, executeUtilitySpell } from "./camp.js";

export let spellMenuState = {
  filter: "all", // "all", "heal", "utility", "combat"
  selectedKey: null
};

function getShortClassJp(cls) {
  if (cls === "Mage") return "魔";
  if (cls === "Priest") return "僧";
  if (cls === "Bishop") return "司";
  if (cls === "Lord") return "君";
  if (cls === "Samurai") return "侍";
  return cls[0];
}

export function renderSpellOverlay() {
  const overlay = document.getElementById("spell-overlay");
  if (!overlay) return;

  // Clear container
  overlay.innerHTML = "";

  // Reset filter when entering caster select
  if (menuContext.type === "spell_caster_select") {
    spellMenuState.filter = "all";
    spellMenuState.selectedKey = null;
  }

  // 1. Header
  const header = document.createElement("div");
  header.className = "spell-header";

  const title = document.createElement("span");
  title.className = "spell-title";
  title.textContent = "呪文（スペル）";
  header.appendChild(title);

  overlay.appendChild(header);

  // 2. Body
  const body = document.createElement("div");
  body.className = "spell-body";

  const listCol = document.createElement("div");
  listCol.className = "spell-list-col";

  const listContainer = document.createElement("div");
  listContainer.className = "spell-item-list";

  const detailCol = document.createElement("div");
  detailCol.className = "spell-detail-col";
  detailCol.id = "spell-detail-panel";
  detailCol.innerHTML = `<div class="spell-detail-placeholder">呪文を選択してください</div>`;

  // Render based on type
  if (menuContext.type === "spell_caster_select") {
    // Hide detail column for caster select to give list full width
    detailCol.style.display = "none";
    listCol.style.width = "100%";
    listCol.style.maxWidth = "100%";

    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon spell-item-row";
      
      // Determine if disabled and reason
      let isDisabled = false;
      let reason = "";
      if (char.status === "dead") {
        isDisabled = true;
        reason = "死亡";
      } else if (!isSpellcaster(char)) {
        isDisabled = true;
        reason = "呪文なし";
      } else if (char.maxMp === 0) {
        isDisabled = true;
        reason = "MPなし";
      } else if (char.mp <= 0) {
        isDisabled = true;
        reason = "MP枯渇";
      }

      const reasonBadge = reason ? `<span class="spell-row-tag tag-disabled">${reason}</span>` : `<span class="spell-row-mp">MP:${char.mp}/${char.maxMp}</span>`;
      btn.innerHTML = `
        <span class="spell-row-name">${char.name} <span class="spell-row-class">(${getClassJpName(char.class)})</span></span>
        ${reasonBadge}
      `;

      if (isDisabled) {
        btn.disabled = true;
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => {
          menuContext.actorIdx = idx;
          openSubmenu("spell_select", `呪文選択 - ${char.name}:`);
        });
      }
      listContainer.appendChild(btn);
    });
  } else if (menuContext.type === "spell_select") {
    // Create Filter Chips Row directly above the list
    const filterRow = document.createElement("div");
    filterRow.className = "spell-filters";
    filterRow.style.display = "flex";
    filterRow.style.gap = "6px";
    filterRow.style.marginBottom = "8px";
    filterRow.style.width = "100%";
    
    const categories = [
      { id: "all", label: "すべて" },
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
      chip.style.flex = "1";
      chip.style.minHeight = "44px";
      chip.addEventListener("click", () => {
        spellMenuState.filter = cat.id;
        spellMenuState.selectedKey = null;
        renderSpellOverlay();
      });
      filterRow.appendChild(chip);
    });
    listCol.appendChild(filterRow);
    listContainer.classList.add("grid-mode");

    const caster = state.party[menuContext.actorIdx];
    const casterSpells = caster.spells || [];

    const healSpells = ["DIOS", "MADIOS", "DIALMA", "DIALKO", "DIURCO", "LATUMOFIS", "KADORTO"];
    const utilitySpells = ["DUMAPIC", "MILWA", "LOMILWA", "MASFEAL"];

    // Filter spells
    const filteredSpells = casterSpells.filter(spKey => {
      const spell = SPELLS[spKey];
      if (!spell) return false;
      let spellCat = "combat";
      if (healSpells.includes(spKey)) spellCat = "heal";
      else if (utilitySpells.includes(spKey)) spellCat = "utility";

      if (spellMenuState.filter === "all") return true;
      return spellMenuState.filter === spellCat;
    });

    // Sort spells by priority: heal (回復) -> utility (探索) -> combat (戦闘)
    const typePriority = {
      heal: 0,
      utility: 1,
      combat: 2
    };
    filteredSpells.sort((a, b) => {
      const catA = healSpells.includes(a) ? "heal" : utilitySpells.includes(a) ? "utility" : "combat";
      const catB = healSpells.includes(b) ? "heal" : utilitySpells.includes(b) ? "utility" : "combat";
      return typePriority[catA] - typePriority[catB];
    });

    if (filteredSpells.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "spell-empty-text";
      emptyDiv.textContent = "選択したカテゴリの呪文がありません";
      listContainer.appendChild(emptyDiv);
    } else {
      let currentCategory = null;
      filteredSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const isSelected = spellMenuState.selectedKey === spKey;
        
        // Determine category heading
        let spellCat = "戦闘";
        let tagClass = "tag-combat";
        if (healSpells.includes(spKey)) {
          spellCat = "回復";
          tagClass = "tag-heal";
        } else if (utilitySpells.includes(spKey)) {
          spellCat = "探索";
          tagClass = "tag-utility";
        }

        if (spellCat !== currentCategory) {
          currentCategory = spellCat;
          const heading = document.createElement("div");
          heading.className = "spell-list-heading";
          heading.textContent = currentCategory;
          listContainer.appendChild(heading);
        }

        const btn = document.createElement("button");
        btn.className = `btn btn-neon spell-item-row ${isSelected ? "active" : ""}`;

        // Explore usability check
        let isCombatOnly = false;
        if (spell.target === "single_enemy" || spell.target === "all_enemies") {
          isCombatOnly = true;
        }

        let isDisabled = false;
        let reason = "";
        if (isCombatOnly) {
          isDisabled = true;
          reason = "戦闘中のみ";
          tagClass = "tag-disabled";
        } else if (caster.mp < spell.cost) {
          isDisabled = true;
          reason = "MP不足";
        }

        let rightText = reason || spellCat;

        btn.innerHTML = `
          <span class="spell-row-name">${spell.name}</span>
          <div class="spell-row-meta">
            <span class="spell-row-mp">MP:${spell.cost}</span>
            <span class="spell-row-tag ${tagClass}">${rightText}</span>
          </div>
        `;

        btn.addEventListener("click", () => {
          listContainer.querySelectorAll(".spell-item-row").forEach(r => r.classList.remove("active"));
          btn.classList.add("active");
          spellMenuState.selectedKey = spKey;
          renderSpellDetail(spKey, isDisabled, reason, spellCat, tagClass);
        });

        listContainer.appendChild(btn);
      });

      // Auto-select and display details of previously selected spell
      if (spellMenuState.selectedKey && filteredSpells.includes(spellMenuState.selectedKey)) {
        const activeKey = spellMenuState.selectedKey;
        const spell = SPELLS[activeKey];
        let spellCat = "戦闘";
        let tagClass = "tag-combat";
        if (healSpells.includes(activeKey)) {
          spellCat = "回復";
          tagClass = "tag-heal";
        } else if (utilitySpells.includes(activeKey)) {
          spellCat = "探索";
          tagClass = "tag-utility";
        }

        let isCombatOnly = (spell.target === "single_enemy" || spell.target === "all_enemies");
        let isDisabled = false;
        let reason = "";
        if (isCombatOnly) {
          isDisabled = true;
          reason = "戦闘中のみ";
          tagClass = "tag-disabled";
        } else if (caster.mp < spell.cost) {
          isDisabled = true;
          reason = "MP不足";
        }
        
        setTimeout(() => {
          renderSpellDetail(activeKey, isDisabled, reason, spellCat, tagClass);
        }, 0);
      }
    }
  } else if (menuContext.type === "spell_target_ally") {
    // For target selection
    const spell = SPELLS[menuContext.spellName];
    detailCol.style.display = "none";
    listCol.style.width = "100%";
    listCol.style.maxWidth = "100%";
    listCol.style.maxHeight = "none";
    listCol.style.flex = "1";
    listContainer.style.maxHeight = "none";

    // Add Spell Summary at the top of target selection list
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "spell-target-summary-header";
    summaryDiv.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; color: var(--neon-purple); margin-bottom: 4px;">
        🔮 詠唱中: ${spell.name} <span style="font-size: 10px; color: var(--text-muted); font-weight: normal; margin-left: 6px;">(消費MP: ${spell.cost} / 対象: 味方単体)</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">
        ${spell.desc}
      </div>
    `;
    listContainer.appendChild(summaryDiv);

    // Create 2x2 Grid Container
    const gridContainer = document.createElement("div");
    gridContainer.className = "spell-target-grid";

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
        <div class="target-card-status" style="color: ${statusColor}; font-weight: bold; font-size: 10px; margin-top: 4px;">
          ${reason}${statusSuffix}
        </div>
      `;

      gridContainer.appendChild(card);
    });

    listContainer.appendChild(gridContainer);
  }

  listCol.appendChild(listContainer);
  body.appendChild(listCol);
  body.appendChild(detailCol);
  overlay.appendChild(body);

  // 3. Bottom Actions Container (Footer)
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  if (menuContext.type === "spell_caster_select") {
    const closeRow = document.createElement("div");
    closeRow.className = "bottom-actions-row";

    const btnClose = document.createElement("button");
    btnClose.className = "btn btn-danger btn-spell-close";
    btnClose.textContent = "❌ 閉じる";
    btnClose.style.width = "100%";
    btnClose.style.minHeight = "44px";
    btnClose.addEventListener("click", () => {
      closeSubmenu();
    });
    closeRow.appendChild(btnClose);
    footer.appendChild(closeRow);
  } else if (menuContext.type === "spell_select") {
    // Caster Switching Mini Bar
    const casterBar = document.createElement("div");
    casterBar.className = "spell-mini-casters";
    casterBar.style.display = "flex";
    casterBar.style.gap = "6px";
    casterBar.style.marginBottom = "6px";
    casterBar.style.width = "100%";

    const spellcasters = state.party.map((c, i) => ({ char: c, idx: i }))
      .filter(x => x.char.status !== "dead" && isSpellcaster(x.char));

    spellcasters.forEach(sc => {
      const slotBtn = document.createElement("button");
      slotBtn.type = "button";
      const isCurrent = sc.idx === menuContext.actorIdx;
      slotBtn.className = `spell-mini-caster-btn ${isCurrent ? "active" : ""}`;
      slotBtn.innerHTML = `
        <span style="font-weight: bold; font-size: 10px; color: ${isCurrent ? "var(--neon-cyan)" : "#fff"}">${sc.char.name}</span>
        <span style="font-size: 9px; color: var(--text-muted); margin-top: 1px;">
          ${getShortClassJp(sc.char.class)} MP:${sc.char.mp}/${sc.char.maxMp}
        </span>
      `;
      slotBtn.addEventListener("click", () => {
        menuContext.actorIdx = sc.idx;
        spellMenuState.selectedKey = null; // Prevent cost mismatches
        renderSpellOverlay();
      });
      casterBar.appendChild(slotBtn);
    });

    footer.appendChild(casterBar);

    // Primary Actions Row
    const actionRow = document.createElement("div");
    actionRow.className = "bottom-actions-row";

    const btnBack = document.createElement("button");
    btnBack.className = "btn btn-danger btn-spell-close";
    btnBack.textContent = "◀ 戻る";
    btnBack.style.minHeight = "44px";
    btnBack.addEventListener("click", () => {
      goBackSubmenu();
    });
    actionRow.appendChild(btnBack);

    const btnCast = document.createElement("button");
    btnCast.id = "btn-spell-cast-action";
    btnCast.className = "btn btn-neon btn-cast-action disabled";
    btnCast.disabled = true;
    btnCast.textContent = "唱える呪文を選択";
    btnCast.style.minHeight = "44px";
    btnCast.style.flex = "2";
    actionRow.appendChild(btnCast);

    footer.appendChild(actionRow);
  } else if (menuContext.type === "spell_target_ally") {
    // Back row for target selection with context label
    const closeRow = document.createElement("div");
    closeRow.className = "bottom-actions-row";

    const btnBack = document.createElement("button");
    btnBack.className = "btn btn-danger";
    btnBack.textContent = "◀ 戻る";
    btnBack.style.minHeight = "44px";
    btnBack.addEventListener("click", () => {
      goBackSubmenu();
    });
    closeRow.appendChild(btnBack);
    
    const selectionLabel = document.createElement("div");
    selectionLabel.style.flex = "2";
    selectionLabel.style.display = "flex";
    selectionLabel.style.alignItems = "center";
    selectionLabel.style.justifyContent = "center";
    selectionLabel.style.fontFamily = "var(--font-mono)";
    selectionLabel.style.fontSize = "12px";
    selectionLabel.style.color = "var(--neon-purple)";
    selectionLabel.style.border = "1px solid rgba(191, 90, 242, 0.3)";
    selectionLabel.style.borderRadius = "4px";
    selectionLabel.style.backgroundColor = "rgba(191, 90, 242, 0.05)";
    selectionLabel.textContent = `選択中: ${SPELLS[menuContext.spellName].name}`;
    closeRow.appendChild(selectionLabel);

    footer.appendChild(closeRow);
  }

  overlay.appendChild(footer);

  // Helper to render spell detail
  function renderSpellDetail(spKey, isDisabled, reason, spellTag, tagClass) {
    const spell = SPELLS[spKey];
    const caster = state.party[menuContext.actorIdx];
    const panel = document.getElementById("spell-detail-panel");
    if (!panel) return;

    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "spell-detail-header";
    header.innerHTML = `
      <span class="spell-detail-name">${spell.name}</span>
      <span class="spell-detail-tag ${tagClass}">${spellTag}</span>
    `;
    panel.appendChild(header);

    const stats = document.createElement("div");
    stats.className = "spell-detail-stats";
    
    let targetJp = "単体味方";
    if (spell.target === "all_enemies") targetJp = "敵全体";
    else if (spell.target === "single_enemy") targetJp = "敵単体";
    else if (spell.target === "utility") targetJp = "探索ユーティリティ";

    stats.innerHTML = `
      <div>消費MP: <span class="detail-mp">${spell.cost}</span> (現在MP: ${caster.mp})</div>
      <div>対象: <span>${targetJp}</span></div>
    `;
    panel.appendChild(stats);

    const desc = document.createElement("div");
    desc.className = "spell-detail-desc";
    desc.textContent = spell.desc;
    panel.appendChild(desc);

    // Update bottom cast button
    const btnCastFooter = document.getElementById("btn-spell-cast-action");
    if (btnCastFooter) {
      btnCastFooter.className = "btn btn-neon btn-cast-action";
      btnCastFooter.disabled = false;
      btnCastFooter.textContent = "🔮 呪文を唱える";
      
      const newBtnCast = btnCastFooter.cloneNode(true);
      btnCastFooter.parentNode.replaceChild(newBtnCast, btnCastFooter);

      if (isDisabled) {
        newBtnCast.disabled = true;
        newBtnCast.classList.add("disabled");
        newBtnCast.textContent = `詠唱不可 (${reason})`;
        
        const warn = document.createElement("div");
        warn.className = "spell-detail-warning";
        warn.textContent = `※${reason}のため探索中には唱えられません。`;
        panel.appendChild(warn);
      } else {
        newBtnCast.addEventListener("click", () => {
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
}
