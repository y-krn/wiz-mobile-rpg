import { state } from "./state.js";
import { getClassJpName, isSpellcaster, SPELLS } from "./data.js";
import { updateUI } from "./ui.js";
import { openSubmenu, closeSubmenu, goBackSubmenu, menuContext, executeAllySpell, executeUtilitySpell } from "./menu.js";

export function renderSpellOverlay() {
  const overlay = document.getElementById("spell-overlay");
  if (!overlay) return;

  // Clear container
  overlay.innerHTML = "";

  // 1. Header
  const header = document.createElement("div");
  header.className = "spell-header";

  const title = document.createElement("span");
  title.className = "spell-title";
  title.textContent = "呪文（スペル）";
  header.appendChild(title);

  overlay.appendChild(header);

  // 2. Character Switching HUD (only name / class / MP info display)
  if (menuContext.type === "spell_select" || menuContext.type === "spell_target_ally") {
    const caster = state.party[menuContext.actorIdx];
    const selector = document.createElement("div");
    selector.className = "spell-char-selector";
    selector.style.justifyContent = "center";

    const charInfo = document.createElement("span");
    charInfo.className = "spell-char-name";
    charInfo.textContent = `${caster.name} (${getClassJpName(caster.class)}) | MP: ${caster.mp}/${caster.maxMp}`;
    selector.appendChild(charInfo);

    overlay.appendChild(selector);
  }

  // 3. Body
  const body = document.createElement("div");
  body.className = "spell-body";

  const listCol = document.createElement("div");
  listCol.className = "spell-list-col";

  const listContainer = document.createElement("div");
  listContainer.className = "spell-item-list";

  const detailCol = document.createElement("div");
  detailCol.className = "spell-detail-col";
  detailCol.id = "spell-detail-panel";
  // Default text when no spell is selected
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
    const caster = state.party[menuContext.actorIdx];
    const casterSpells = caster.spells || [];

    if (casterSpells.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "spell-empty-text";
      emptyDiv.textContent = "修得している呪文がありません";
      listContainer.appendChild(emptyDiv);
      detailCol.style.display = "none";
      listCol.style.width = "100%";
    } else {
      casterSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const btn = document.createElement("button");
        btn.className = "btn btn-neon spell-item-row";

        // Determine spell tag
        let spellTag = "戦闘";
        let tagClass = "tag-combat";
        const healSpells = ["DIOS", "MADIOS", "DIALMA", "DIALKO", "DIURCO", "LATUMOFIS", "KADORTO"];
        const utilitySpells = ["DUMAPIC", "MILWA", "LOMILWA", "MASFEAL"];
        
        if (healSpells.includes(spKey)) {
          spellTag = "回復";
          tagClass = "tag-heal";
        } else if (utilitySpells.includes(spKey)) {
          spellTag = "補助";
          tagClass = "tag-utility";
        }

        // Determine explore usability
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
          spellTag = "戦闘のみ";
        } else if (caster.mp < spell.cost) {
          isDisabled = true;
          reason = "MP不足";
        }

        btn.innerHTML = `
          <span class="spell-row-name">${spell.name}</span>
          <span class="spell-row-mp">MP:${spell.cost}</span>
          <span class="spell-row-tag ${tagClass}">${reason || spellTag}</span>
        `;

        btn.addEventListener("click", () => {
          // Deselect others
          listContainer.querySelectorAll(".spell-item-row").forEach(r => r.classList.remove("active"));
          btn.classList.add("active");

          // Show detail panel
          renderSpellDetail(spKey, isDisabled, reason, spellTag, tagClass);
        });

        listContainer.appendChild(btn);
      });
    }
  } else if (menuContext.type === "spell_target_ally") {
    // For target selection
    const spell = SPELLS[menuContext.spellName];
    detailCol.style.display = "none";
    listCol.style.width = "100%";
    listCol.style.maxWidth = "100%";

    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon spell-item-row";

      // Validation logic for target
      let isDisabled = false;
      let reason = "";

      if (char.status === "dead") {
        if (menuContext.spellName !== "KADORTO") {
          isDisabled = true;
          reason = "死亡";
        }
      } else {
        // Living target checks
        if (menuContext.spellName === "KADORTO") {
          isDisabled = true;
          reason = "生存中";
        } else if (["DIOS", "MADIOS", "DIALMA"].includes(menuContext.spellName)) {
          if (char.hp >= char.maxHp) {
            isDisabled = true;
            reason = "HP満タン";
          }
        } else if (menuContext.spellName === "DIURCO") {
          if (char.status !== "blind") {
            isDisabled = true;
            reason = "健康";
          }
        } else if (menuContext.spellName === "DIALKO") {
          if (char.status !== "sleep" && char.status !== "paralyze" && char.status !== "paralyzed") {
            isDisabled = true;
            reason = "健康";
          }
        } else if (menuContext.spellName === "LATUMOFIS") {
          if (char.status !== "poisoned") {
            isDisabled = true;
            reason = "健康";
          }
        }
      }

      const statusText = char.status !== "ok" ? ` [${char.status.toUpperCase()}]` : "";
      const reasonBadge = reason ? `<span class="spell-row-tag tag-disabled">${reason}</span>` : `<span class="spell-row-mp">選択可能</span>`;

      btn.innerHTML = `
        <span class="spell-row-name">${char.name} <span class="spell-row-hp">(HP:${char.hp}/${char.maxHp})${statusText}</span></span>
        ${reasonBadge}
      `;

      if (isDisabled) {
        btn.disabled = true;
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => {
          executeAllySpell(idx);
        });
      }

      listContainer.appendChild(btn);
    });
  }

  listCol.appendChild(listContainer);
  body.appendChild(listCol);
  body.appendChild(detailCol);
  overlay.appendChild(body);

  // 4. Bottom Actions Container
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
    closeRow.appendChild(btnClose);
    footer.appendChild(closeRow);
  } else if (menuContext.type === "spell_select") {
    // Character Switching Row
    const charRow = document.createElement("div");
    charRow.className = "bottom-actions-row";

    const btnPrev = document.createElement("button");
    btnPrev.className = "btn btn-neon btn-char-switch";
    btnPrev.textContent = "◀ 前のキャラ";
    btnPrev.style.minHeight = "44px";
    
    // Find previous spellcaster
    let prevIdx = (menuContext.actorIdx - 1 + state.party.length) % state.party.length;
    while (prevIdx !== menuContext.actorIdx) {
      const c = state.party[prevIdx];
      if (c.status !== "dead" && c.maxMp > 0 && isSpellcaster(c)) break;
      prevIdx = (prevIdx - 1 + state.party.length) % state.party.length;
    }
    if (prevIdx === menuContext.actorIdx) {
      btnPrev.disabled = true;
      btnPrev.classList.add("disabled");
    }
    btnPrev.addEventListener("click", () => {
      menuContext.actorIdx = prevIdx;
      if (menuContext.type === "spell_target_ally") {
        menuContext.type = "spell_select";
      }
      updateUI();
    });
    charRow.appendChild(btnPrev);

    const btnNext = document.createElement("button");
    btnNext.className = "btn btn-neon btn-char-switch";
    btnNext.textContent = "次のキャラ ▶";
    btnNext.style.minHeight = "44px";

    // Find next spellcaster
    let nextIdx = (menuContext.actorIdx + 1) % state.party.length;
    while (nextIdx !== menuContext.actorIdx) {
      const c = state.party[nextIdx];
      if (c.status !== "dead" && c.maxMp > 0 && isSpellcaster(c)) break;
      nextIdx = (nextIdx + 1) % state.party.length;
    }
    if (nextIdx === menuContext.actorIdx) {
      btnNext.disabled = true;
      btnNext.classList.add("disabled");
    }
    btnNext.addEventListener("click", () => {
      menuContext.actorIdx = nextIdx;
      if (menuContext.type === "spell_target_ally") {
        menuContext.type = "spell_select";
      }
      updateUI();
    });
    charRow.appendChild(btnNext);

    footer.appendChild(charRow);

    // Primary Actions (Cast & Back)
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
    // Back row for target selection
    const closeRow = document.createElement("div");
    closeRow.className = "bottom-actions-row";

    const btnBack = document.createElement("button");
    btnBack.className = "btn btn-danger btn-spell-close";
    btnBack.textContent = "◀ 戻る";
    btnBack.style.width = "100%";
    btnBack.style.minHeight = "44px";
    btnBack.addEventListener("click", () => {
      goBackSubmenu();
    });
    closeRow.appendChild(btnBack);
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
