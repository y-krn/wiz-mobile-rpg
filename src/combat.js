import { state, saveAutosave, addLog, getCharWeaponAtk, getCharDef, checkCharLevelUp, EXP_LEVELS } from "./state.js";
import { DIR_N, START_X, START_Y, MONSTERS, ITEMS, SPELLS, getClassJpName, generateRandomEquipment, getItemData, getCharStr, getCharAgi, getCharMaxHp, getCharMaxMp } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { updateUI } from "./ui.js";
import { menuContext, menuHistory, openSubmenu, closeSubmenu, triggerRunResult } from "./menu.js";
import { setupChestState, resetSubmenuBackButton } from "./chest.js";
import { createRng } from "./seed_rng.js";
import { runCombatRoundCalculation } from "./combat_logic.js";

// Combat action selection state
export let combatSelection = {
  charIdx: 0,
  actions: [] // array of { type, actorIdx, targetIdx, spellName, itemKey }
};

let activeTargetCallback = null;
let activeSpellCallback = null;
let activeItemCallback = null;

export function startCombat(isBoss, isMidboss = false, isRoamingFlack = false) {
  state.gameState = "combat";
  if (state.currentRun) {
    state.currentRun.battles++;
  }
  
  // Choose monsters
  const monsters = [];
  if (isBoss) {
    // Ancient Dragon Boss
    const dragonTemplate = MONSTERS.find(m => m.name === "いにしえの竜");
    monsters.push({
      ...dragonTemplate,
      hp: dragonTemplate.hp,
      maxHp: dragonTemplate.hp
    });
  } else if (isMidboss) {
    // Demon Guard Midboss
    const midbossTemplate = MONSTERS.find(m => m.name === "デーモンガード");
    monsters.push({
      ...midbossTemplate,
      hp: midbossTemplate.hp,
      maxHp: midbossTemplate.hp
    });
  } else if (isRoamingFlack) {
    // Roaming Flack Encounter
    const flackTemplate = MONSTERS.find(m => m.name === "フラック");
    monsters.push({
      ...flackTemplate,
      hp: flackTemplate.hp,
      maxHp: flackTemplate.hp
    });
  }
  
  if (isBoss || isMidboss || isRoamingFlack) {
    addLog("【⚠️強敵遭遇！】周囲の空気が張り詰める...！");
  } else {
    // Regular random encounter
    const dist = Math.abs(state.x - START_X) + Math.abs(state.y - START_Y);
    
    let targetLevel = 1;
    if (state.floor === 1) {
      targetLevel = dist < 20 ? 1 : 2;
    } else if (state.floor === 2) {
      targetLevel = dist < 20 ? 2 : 3;
    } else if (state.floor === 3) {
      targetLevel = dist < 20 ? 3 : 4;
    } else if (state.floor === 4) {
      targetLevel = dist < 20 ? 4 : 6;
    } else if (state.floor === 5) {
      targetLevel = dist < 20 ? 6 : 7;
    }
    
    let minCount = 1;
    let maxCount = 2;
    if (state.floor === 2) { minCount = 1; maxCount = 3; }
    else if (state.floor === 3) { minCount = 2; maxCount = 3; }
    else if (state.floor === 4) { minCount = 2; maxCount = 4; }
    else if (state.floor === 5) { minCount = 3; maxCount = 4; }
    
    // Check rare encounter chance (e.g. 8% chance, B4F has 18%)
    const rareChance = state.floor === 4 ? 0.18 : 0.08;
    const treasureCandidates = MONSTERS.filter(m => m.treasureRare && m.level <= targetLevel + 1);
    const isTreasureEncounter = (Math.random() < rareChance) && (treasureCandidates.length > 0);
    
    if (isTreasureEncounter) {
      const template = treasureCandidates[Math.floor(Math.random() * treasureCandidates.length)];
      monsters.push({
        ...template,
        hp: template.hp,
        maxHp: template.hp
      });
      addLog("【✨希少遭遇！】珍しい魔物が現れた！");
    } else {
      // Choose monsters based on target level and count limits
      const count = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
      
      let candidates = [];
      const themeSeed = `${state.seed}:monster_theme:B${state.floor}`;
      const themeRng = state.seed ? createRng(themeSeed) : Math.random;
      let theme = "standard";
      if (state.floor === 2) {
        theme = themeRng() < 0.60 ? "poisonous" : "standard";
      } else if (state.floor === 3) {
        theme = themeRng() < 0.60 ? "spirit" : "standard";
      } else if (state.floor === 5) {
        theme = themeRng() < 0.70 ? "dragon" : "giant";
      }

      if (state.floor === 5) {
        if (theme === "dragon") {
          const dragons = MONSTERS.filter(m => !m.isBoss && !m.isRare && m.spriteType === "dragon");
          candidates = dragons.length > 0 ? dragons : MONSTERS.filter(m => !m.isBoss && !m.isRare && m.level >= 6);
        } else {
          candidates = MONSTERS.filter(m => !m.isBoss && !m.isRare && ["アースジャイアント", "マスターデーモン"].includes(m.name));
          if (candidates.length === 0) {
            candidates = MONSTERS.filter(m => !m.isBoss && !m.isRare && m.level >= 6);
          }
        }
      } else {
        candidates = MONSTERS.filter(m => !m.isBoss && !m.isRare && m.level === targetLevel);
        if (candidates.length === 0) {
          candidates = MONSTERS.filter(m => !m.isBoss && !m.isRare && Math.abs(m.level - targetLevel) <= 1);
        }
        
        if (state.floor === 2 && theme === "poisonous") {
          const poisonous = candidates.filter(m => m.isPoisonous);
          if (poisonous.length > 0) {
            candidates = poisonous;
          }
        } else if (state.floor === 3 && theme === "spirit") {
          const demonSpirits = candidates.filter(m => m.spriteType === "spirit" || m.spriteType === "flack" || m.spriteType === "mage");
          if (demonSpirits.length > 0) {
            candidates = demonSpirits;
          }
        }
      }
      
      for (let i = 0; i < count; i++) {
        const template = candidates[Math.floor(Math.random() * candidates.length)] || MONSTERS[0];
        const suffix = count > 1 ? ` ${String.fromCharCode(65 + i)}` : "";
        monsters.push({
          ...template,
          name: template.name + suffix,
          hp: template.hp,
          maxHp: template.hp
        });
      }
    }
  }

  state.combatState = {
    monsters,
    phase: "choose_actions",
    isBoss,
    isMidboss,
    isRoamingFlack,
    isAuto: false
  };
  state.chestState = null;

  combatSelection.charIdx = 0;
  combatSelection.actions = [];
  menuContext.prevGameState = null;
  menuContext.type = "";
  menuHistory.length = 0;

  addLog(`戦闘開始！敵が現れた：${monsters.map(m => m.name).join(", ")}`);
  
  if (state.codex) {
    if (!state.codex.monsters) state.codex.monsters = {};
    monsters.forEach(m => {
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (!state.codex.monsters[baseName]) {
        state.codex.monsters[baseName] = { encountered: 0, killed: 0, firstKilled: false };
      }
      state.codex.monsters[baseName].encountered++;
    });
  }
  
  // Check if first character needs choice (if alive)
  advanceActionSelection();
  saveAutosave();
}

export function toggleCombatAuto() {
  if (!state.combatState) return;
  state.combatState.isAuto = !state.combatState.isAuto;
  playSound("move");
  addLog(`オート戦闘を${state.combatState.isAuto ? "オン" : "オフ"}にしました。`);
  
  if (state.combatState.isAuto && state.combatState.phase === "choose_actions") {
    advanceActionSelection();
  } else {
    updateUI();
  }
}

export function advanceActionSelection() {
  // Find next living character
  const livingIdxs = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status)).map(x => x.i);
  
  if (state.combatState && state.combatState.isAuto) {
    while (combatSelection.charIdx < livingIdxs.length) {
      const charOriginalIdx = livingIdxs[combatSelection.charIdx];
      combatSelection.actions.push({
        type: "fight",
        actorIdx: charOriginalIdx,
        targetIdx: 0 // Will auto-redirect to a living monster if target 0 is dead
      });
      combatSelection.charIdx++;
    }
  }

  const currentSelect = livingIdxs[combatSelection.charIdx];
  if (combatSelection.charIdx >= livingIdxs.length) {
    // All characters chose actions! Run turn resolution.
    resolveCombatRound();
  } else {
    updateUI();
  }
}

export function selectCombatAction(type) {
  if (!state.combatState || state.combatState.phase !== "choose_actions") return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status));
  const char = livingChars[combatSelection.charIdx].c;
  const charOriginalIdx = livingChars[combatSelection.charIdx].i;

  if (type === "fight") {
    // Let player choose target monster
    openCombatTargetMenu("enemy", (targetIdx) => {
      combatSelection.actions.push({
        type: "fight",
        actorIdx: charOriginalIdx,
        targetIdx
      });
      combatSelection.charIdx++;
      advanceActionSelection();
    });
  } else if (type === "spell") {
    // Show available caster spells
    if (!char.spells || char.spells.length === 0) {
      addLog(`${char.name}は唱えられる呪文を持っていません。`);
      return;
    }
    openCombatSpellMenu(char, (spellName) => {
      const spell = SPELLS[spellName];
      if (char.mp < spell.cost) {
        addLog("MPが足りません。");
        return;
      }
      
      // Determine targets
      if (spell.target === "single_enemy") {
        openCombatTargetMenu("enemy", (targetIdx) => {
          combatSelection.actions.push({
            type: "spell",
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          combatSelection.charIdx++;
          advanceActionSelection();
        });
      } else if (spell.target === "single_ally") {
        openCombatTargetMenu("ally", (targetIdx) => {
          combatSelection.actions.push({
            type: "spell",
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          combatSelection.charIdx++;
          advanceActionSelection();
        }, spellName);
      } else {
        // All enemies / all allies
        combatSelection.actions.push({
          type: "spell",
          actorIdx: charOriginalIdx,
          targetIdx: -1, // targets all
          spellName
        });
        combatSelection.charIdx++;
        advanceActionSelection();
      }
    });
  } else if (type === "item") {
    // Open item selection
    if (state.inventory.length === 0) {
      addLog("共有バッグは空っぽです。");
      return;
    }
    openCombatItemMenu((itemKey, itemIdx) => {
      const item = ITEMS[itemKey];
      if (item.type !== "usable") {
        addLog("戦闘中その装備品は使用できません。");
        return;
      }
      openCombatTargetMenu("ally", (targetIdx) => {
        combatSelection.actions.push({
          type: "item",
          actorIdx: charOriginalIdx,
          targetIdx,
          itemKey,
          itemIdx
        });
        combatSelection.charIdx++;
        advanceActionSelection();
      });
    });
  } else if (type === "defend") {
    combatSelection.actions.push({
      type: "defend",
      actorIdx: charOriginalIdx
    });
    combatSelection.charIdx++;
    advanceActionSelection();
  } else if (type === "run") {
    combatSelection.actions.push({
      type: "run",
      actorIdx: charOriginalIdx
    });
    combatSelection.charIdx++;
    advanceActionSelection();
  }
}

export function cancelCombatAction() {
  if (!state.combatState || state.combatState.phase !== "choose_actions") return;
  if (combatSelection.charIdx > 0) {
    combatSelection.actions.pop();
    combatSelection.charIdx--;
    playSound("move");
    updateUI();
  }
}

export function openCombatTargetMenu(type, callback, spellName = null) {
  state.gameState = "submenu";
  menuContext.type = "combat_target";
  menuContext.targetType = type;
  menuContext.spellName = spellName;
  activeTargetCallback = callback;

  // Render quick-select buttons in controls panel
  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (type === "enemy") {
    const monsters = state.combatState.monsters;
    monsters.forEach((m, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-target-enemy";
      btn.textContent = `${m.name} (${m.hp}/${m.maxHp})`;
      
      if (m.hp <= 0) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      } else {
        btn.addEventListener("click", () => {
          state.gameState = "combat";
          if (activeTargetCallback) activeTargetCallback(idx);
        });
      }
      optGrid.appendChild(btn);
    });
  } else {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-target-ally";
      btn.textContent = `${idx + 1}.${char.name} (${char.hp}/${getCharMaxHp(char)})`;
      
      let disabled = false;
      if (spellName === "KADORTO") {
        if (char.status !== "dead") disabled = true;
      } else {
        if (char.status === "dead") disabled = true;
      }

      if (disabled) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      } else {
        btn.addEventListener("click", () => {
          state.gameState = "combat";
          if (activeTargetCallback) activeTargetCallback(idx);
        });
      }
      optGrid.appendChild(btn);
    });
  }

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = type === "enemy" ? "攻撃対象選択" : "対象選択";

  updateUI();
}

export function openCombatSpellMenu(char, callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_spell";
  
  // Find actor index
  const actorIdx = state.party.findIndex(c => c.name === char.name);
  menuContext.actorIdx = actorIdx;
  activeSpellCallback = callback;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  char.spells.forEach(spKey => {
    const spell = SPELLS[spKey];
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-select-spell";
    btn.textContent = `${spell.name} (${spell.cost}M)`;

    const mpCheck = char.mp < spell.cost;
    if (mpCheck) {
      btn.disabled = true;
      btn.style.opacity = "0.3";
    } else {
      btn.addEventListener("click", () => {
        state.gameState = "combat";
        if (activeSpellCallback) activeSpellCallback(spKey);
      });
    }
    optGrid.appendChild(btn);
  });

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = `${char.name}の呪文詠唱`;

  updateUI();
}

export function openCombatItemMenu(callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_item";
  activeItemCallback = callback;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (state.inventory.length === 0) {
    const info = document.createElement("div");
    info.style.color = "var(--text-muted)";
    info.style.textAlign = "center";
    info.style.marginTop = "20px";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    info.textContent = "共有バッグは空っぽです。";
    optGrid.appendChild(info);
  } else {
    state.inventory.forEach((itemKey, idx) => {
      const item = ITEMS[itemKey];
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-select-item";
      btn.textContent = item.name;

      const usableCheck = item.type !== "usable";
      if (usableCheck) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      } else {
        btn.addEventListener("click", () => {
          state.gameState = "combat";
          if (activeItemCallback) activeItemCallback(itemKey, idx);
        });
      }
      optGrid.appendChild(btn);
    });
  }

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = "道具使用";

  updateUI();
}

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
      monsters.forEach((m, idx) => {
        const card = document.createElement("div");
        card.className = "combat-target-card enemy";
        if (m.hp <= 0) {
          card.classList.add("dead");
        }

        const hpPct = m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0;
        card.innerHTML = `
          <div class="card-title">${m.name}</div>
          <div class="card-hp-bar-container">
            <div class="card-hp-bar" style="width: ${hpPct}%"></div>
          </div>
          <div class="card-hp-text">HP: ${m.hp}/${m.maxHp}</div>
        `;

        if (m.hp > 0) {
          card.addEventListener("click", () => {
            state.gameState = "combat";
            if (activeTargetCallback) activeTargetCallback(idx);
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
            if (activeTargetCallback) activeTargetCallback(idx);
          });
        }
        targetGrid.appendChild(card);
      });
    }
    body.appendChild(targetGrid);
  } else if (type === "combat_spell") {
    // Spells grid
    const spellGrid = document.createElement("div");
    spellGrid.className = "combat-selection-grid";

    const casterIdx = menuContext.actorIdx;
    const caster = state.party[casterIdx];

    caster.spells.forEach(spKey => {
      const spell = SPELLS[spKey];
      const card = document.createElement("div");
      card.className = "combat-item-card spell";
      
      const mpCheck = caster.mp < spell.cost;
      if (mpCheck) {
        card.classList.add("disabled");
      }

      card.innerHTML = `
        <div class="item-card-title">${spell.name} <span class="cost-tag">${spell.cost}MP</span></div>
        <div class="item-card-desc">${spell.desc}</div>
      `;

      if (!mpCheck) {
        card.addEventListener("click", () => {
          state.gameState = "combat";
          if (activeSpellCallback) activeSpellCallback(spKey);
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

        const usableCheck = item.type !== "usable";
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
            if (activeItemCallback) activeItemCallback(itemKey, idx);
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

export function resolveCombatRound() {
  state.gameState = "combat";
  state.combatState.phase = "resolving";
  document.getElementById("btn-submenu-back").style.display = "none";
  
  const { logQueue } = runCombatRoundCalculation(state, combatSelection);
  
  playBattleLogs(logQueue, 0);
}

export function playBattleLogs(queue, index) {
  if (index >= queue.length) {
    checkCombatStatus();
    return;
  }

  const log = queue[index];
  const isAuto = state.combatState && state.combatState.isAuto;

  if (log.sound) playSound(log.sound);
  if (log.shake && renderer) renderer.triggerShake(log.shake, 250);
  if (log.flash && renderer) renderer.triggerFlash(200);
  if (log.floatText && renderer) renderer.addDamageText(log.floatText, log.floatColor);

  addLog(log.msg);
  updateUI();

  if (log.runEscape) {
    state.transitioning = true;
    setTimeout(() => {
      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        state.transitioning = false;
        triggerGameOver();
      } else {
        if (state.combatState && state.combatState.isRoamingFlack) {
          // Push player back to prevX, prevY
          state.x = state.prevX;
          state.y = state.prevY;
        }
        state.gameState = "explore";
        state.combatState = null;
        resetSubmenuBackButton();
        state.transitioning = false;
        saveAutosave();
        updateUI();
      }
    }, isAuto ? 150 : 1200);
    return;
  }

  if (log.escapeToTown) {
    state.transitioning = true;
    setTimeout(() => {
      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        state.transitioning = false;
        triggerGameOver();
      } else {
        state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);
        state.combatState = null;
        resetSubmenuBackButton();
        state.transitioning = false;
        triggerRunResult("escape_scroll");
      }
    }, isAuto ? 150 : 1200);
    return;
  }

  if (log.giveCrystal) {
    state.transitioning = true;
    if (state.map[state.y]?.[state.x]?.event === "boss") {
      state.map[state.y][state.x].event = null;
    }
    state.inventory.push("ANTIGRAVITY_CRYSTAL");
    if (state.currentRun) {
      state.currentRun.itemsFound.push("ANTIGRAVITY_CRYSTAL");
    }
    if (!state.inventory.includes("LEGENDARY_SWORD")) {
      state.inventory.push("LEGENDARY_SWORD");
      if (state.currentRun) {
        state.currentRun.equipmentFound.push("LEGENDARY_SWORD");
      }
    }
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, isAuto ? 300 : 3000);
    return;
  }

  if (log.giveKey) {
    state.transitioning = true;
    if (state.map[state.y]?.[state.x]?.event === "midboss") {
      state.map[state.y][state.x].event = null;
    }
    if (!state.inventory.includes("DRAGON_KEY")) {
      state.inventory.push("DRAGON_KEY");
      if (state.currentRun) {
        state.currentRun.itemsFound.push("DRAGON_KEY");
      }
    }
    if (!state.inventory.includes("LEGENDARY_SHIELD")) {
      state.inventory.push("LEGENDARY_SHIELD");
      if (state.currentRun) {
        state.currentRun.equipmentFound.push("LEGENDARY_SHIELD");
      }
    }
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, isAuto ? 300 : 3000);
    return;
  }

  if (log.triggerChest) {
    state.transitioning = true;
    setTimeout(() => {
      state.gameState = "chest";
      state.transitioning = false;
      setupChestState();
    }, isAuto ? 150 : 1500);
    return;
  }

  if (log.endCombat) {
    state.transitioning = true;
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, isAuto ? 150 : 1200);
    return;
  }

  const delay = isAuto ? 50 : (log.msg.startsWith("[!]") || log.msg.includes("[★]") ? 1200 : 700);
  setTimeout(() => {
    playBattleLogs(queue, index + 1);
  }, delay);
}

export function checkCombatStatus() {
  if (!state.combatState) return;

  const monsters = state.combatState.monsters;
  const allMonstersDead = monsters.every(m => m.hp <= 0);
  const allPartyDead = state.party.every(c => c.status === "dead");

  if (allMonstersDead) {
    // 勝利時の処理は resolveCombatRound のログ再生を通して非同期に実行されているため、
    // 二重処理を防ぐために早期リターンします。
    return;
  } else if (allPartyDead) {
    // 全滅
    triggerGameOver();
  } else {
    // 次のターンへ
    state.combatState.phase = "choose_actions";
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    advanceActionSelection();
  }
}

export function triggerGameOver() {
  playSound("game_over");
  state.lastReturnedFloor = null;
  triggerRunResult("gameover");
  // Hide normal back button
  document.getElementById("btn-submenu-back").style.display = "none";
}
