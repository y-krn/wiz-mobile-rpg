import { state, saveAutosave, addLog, getCharWeaponAtk, getCharDef, checkCharLevelUp, EXP_LEVELS } from "./state.js";
import { DIR_N, START_X, START_Y, MONSTERS, ITEMS, SPELLS, getClassJpName, generateRandomEquipment, getItemData, getCharStr, getCharAgi, getCharMaxHp, getCharMaxMp } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { menuContext, menuHistory, openSubmenu, closeSubmenu, triggerRunResult } from "./menu.js";
import { setupChestState, resetSubmenuBackButton } from "./chest.js";
import { createRng } from "./seed_rng.js";

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
    const rareCandidates = MONSTERS.filter(m => m.isRare && m.name !== "フラック" && m.level <= targetLevel + 1);
    const isRareEncounter = (Math.random() < rareChance) && (rareCandidates.length > 0);
    
    if (isRareEncounter) {
      const template = rareCandidates[Math.floor(Math.random() * rareCandidates.length)];
      monsters.push({
        ...template,
        hp: template.hp,
        maxHp: template.hp
      });
      addLog("【⚠️強敵遭遇！】周囲の空気が張り詰める...！");
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
}

export function resolveCombatRound() {
  state.gameState = "combat";
  state.combatState.phase = "resolving";
  document.getElementById("btn-submenu-back").style.display = "none";
  
  const logQueue = [];
  const monsters = state.combatState.monsters;
  let escaped = false;

  // Build Turn Order: All active characters + all active monsters
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status === "ok" || char.status === "poisoned" || char.status === "blind") {
      const chosen = combatSelection.actions.find(a => a.actorIdx === idx);
      const speed = getCharAgi(char) + Math.floor(Math.random() * 10);
      turns.push({
        type: "char",
        char,
        idx,
        speed,
        action: chosen || { type: "defend", actorIdx: idx }
      });
    }
  });

  // Monsters
  monsters.forEach((mon, idx) => {
    if (mon.hp > 0) {
      const speed = 10 + Math.floor(Math.random() * 10); // Standard speed roll
      turns.push({
        type: "monster",
        mon,
        idx,
        speed
      });
    }
  });

  // Sort by Speed descending
  turns.sort((a, b) => b.speed - a.speed);

  // Run each action
  turns.forEach(turn => {
    if (escaped) return;
    if (turn.type === "char") {
      const char = turn.char;
      if (char.status !== "ok" && char.status !== "poisoned" && char.status !== "blind") return; // Died/slept earlier in the round
      
      const act = turn.action;
      
      if (act.type === "fight") {
        const target = monsters[act.targetIdx];
        if (target.hp <= 0) {
          // Find another random living target
          const livingTargetIdx = monsters.findIndex(m => m.hp > 0);
          if (livingTargetIdx === -1) return; // All dead
          act.targetIdx = livingTargetIdx;
        }
        
        const finalTarget = monsters[act.targetIdx];
        
        let isBlindMiss = false;
        if (char.status === "blind" && Math.random() < 0.5) {
          isBlindMiss = true;
        }

        let dmg = 0;
        let msg = "";
        let floatText = "";
        let sound = "hit";
        let shake = 8;
        if (isBlindMiss) {
          msg = `[味方] ${char.name}の攻撃！しかし目がくらんで空振りした！`;
          floatText = "MISS";
          sound = "miss";
          shake = 0;
        } else {
          // Attack math
          const atkVal = getCharStr(char) + getCharWeaponAtk(char);
          const randRoll = Math.floor(Math.random() * 5); // 0-4
          dmg = Math.max(1, atkVal + randRoll - finalTarget.def);
          
          if (char.status === "blind") {
            dmg = Math.max(1, Math.floor(dmg / 2));
          }

          // Halve physical damage if attacking from the back row (index 2 or 3)
          if (turn.idx >= 2) {
            dmg = Math.max(1, Math.floor(dmg / 2));
          }
          
          if (finalTarget.physResist) {
            dmg = Math.max(1, Math.round(dmg * (1 - finalTarget.physResist)));
          }

          // Ninja decapitation (instant death)
          let isDecap = false;
          if (char.class === "Ninja" && !finalTarget.isBoss) {
            const decapChance = Math.min(0.15, 0.05 + 0.01 * char.level);
            if (Math.random() < decapChance) {
              isDecap = true;
            }
          }

          if (isDecap) {
            dmg = finalTarget.hp;
            finalTarget.hp = 0;
            msg = `[味方] 【🗡️急所攻撃！】${char.name}の必殺の一撃！${finalTarget.name}の首をはねた！`;
            floatText = "即死";
            sound = "kill";
            shake = 15;
          } else {
            finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
            msg = `[味方] ${char.name}の攻撃！${finalTarget.name}に${dmg}のダメージ。`;
            if (finalTarget.physResist && dmg <= 2) {
              msg += "（攻撃が弾かれている！）";
            }
            floatText = `${dmg}`;
          }
        }
        
        logQueue.push({
          msg,
          sound,
          shake,
          floatText,
          floatColor: isBlindMiss ? "#8e8e93" : finalTarget.color
        });

        if (finalTarget.hp === 0) {
          logQueue.push({ msg: `[味方] [!] ${finalTarget.name}を倒した！` });
        }
      } else if (act.type === "spell") {
        const spell = SPELLS[act.spellName];
        
        if (char.mp < spell.cost) {
          logQueue.push({ msg: `[味方] ${char.name}は${spell.name}を唱えようとしたが、MPが足りない！` });
          return;
        }
        char.mp -= spell.cost;

        if (spell.target === "single_enemy") {
          let target = monsters[act.targetIdx];
          if (target.hp <= 0) {
            const livingTargetIdx = monsters.findIndex(m => m.hp > 0);
            if (livingTargetIdx === -1) return;
            target = monsters[livingTargetIdx];
          }
          
          const result = spell.effect(char, target);
          target.hp = Math.max(0, target.hp - result.damage);
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "hit",
            shake: 12,
            floatText: `${result.damage}`,
            floatColor: target.color
          });

          if (target.hp === 0) {
            logQueue.push({ msg: `[味方] [!] ${target.name}を倒した！` });
          }
        } else if (spell.target === "all_enemies") {
          const result = spell.effect(char, monsters);
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          
          monsters.forEach(m => {
            if (m.hp === 0 && !m.loggedDeath) {
              m.loggedDeath = true;
              logQueue.push({ msg: `[味方] [!] ${m.name}を倒した！` });
            }
          });
        } else if (spell.target === "single_ally") {
          const target = state.party[act.targetIdx];
          const result = spell.effect(char, target);
          let floatText = undefined;
          if (result.heal) {
            floatText = `+${result.heal}`;
          } else if (spell.name === "LATUMOFIS" || spell.name === "DIALKO" || spell.name === "DIURCO") {
            floatText = "CURED";
          }
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "heal",
            floatText,
            floatColor: "#00ff66"
          });
        }
      } else if (act.type === "item") {
        const item = ITEMS[act.itemKey];
        const inventoryIdx = state.inventory.findIndex(key => key === act.itemKey);
        if (inventoryIdx === -1) {
          logQueue.push({ msg: `[味方] ${char.name}は道具を使おうとしたが、もうバッグに残っていない！` });
          return;
        }
        if (act.itemKey === "TOWN_PORTAL") {
          state.inventory.splice(inventoryIdx, 1);
          logQueue.push({
            msg: `[味方] ${char.name}は帰還のスクロールを読んだ！パーティ全員が眩い光に包まれる！`,
            sound: "cast_spell",
            escapeToTown: true
          });
          escaped = true;
          return;
        }
        const target = state.party[act.targetIdx];
        const log = item.effect(target);
        state.inventory.splice(inventoryIdx, 1);
        let floatText = undefined;
        let floatColor = "#00ff66";
        if (act.itemKey === "HEAL_POTION") {
          floatText = "+15";
        } else if (act.itemKey === "ANTIDOTE") {
          floatText = "CURED";
        } else if (act.itemKey === "HOLY_WATER") {
          floatText = "+40";
        } else if (act.itemKey === "MANA_POTION") {
          floatText = (target.class === "Priest" || target.class === "Mage") ? "+3 MP" : "無効";
        }
        logQueue.push({
          msg: `[味方] ${log}`,

          sound: "heal",
          floatText,
          floatColor
        });
      } else if (act.type === "defend") {
        logQueue.push({ msg: `[味方] ${char.name}は身を固めて防御している。` });
      } else if (act.type === "run") {
        if (state.combatState.isBoss || state.combatState.isMidboss) {
          logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、強敵の前からは逃げられない！` });
        } else {
          const escape = Math.random() < 0.40;
          if (escape) {
            logQueue.push({
              msg: "[味方] パーティは戦闘から逃げ出した！",
              sound: "miss",
              runEscape: true
            });
            escaped = true;
          } else {
            logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、失敗した！` });
          }
        }
      }
    } else {
      const mon = turn.mon;
      if (mon.hp <= 0) return;

      if (mon.status === "sleep") {
        logQueue.push({
          msg: `[ 敵 ] ${mon.name}は眠っていて動けない。`,
          sound: "miss"
        });
        return;
      }

      // Check if monster flees
      if (mon.fleeChance && Math.random() < mon.fleeChance) {
        mon.hp = 0;
        mon.fled = true;
        logQueue.push({
          msg: `[ 敵 ] [!] ${mon.name}は逃げ出した！`,
          sound: "miss"
        });
        return;
      }

      // Check if monster heals its allies first (35% chance if spellcaster healer)
      if (mon.spell && ["DIOS", "DIALMA"].includes(mon.spell) && Math.random() < 0.35) {
        const woundedMonsters = monsters.filter(m => m.hp > 0 && m.hp < m.maxHp);
        if (woundedMonsters.length > 0) {
          woundedMonsters.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
          const healTarget = woundedMonsters[0];
          const healAmount = mon.spell === "DIOS" ? (Math.floor(Math.random() * 6) + 10) : (Math.floor(Math.random() * 15) + 20);
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}は呪文を唱えた！${healTarget.name}のHPが ${healAmount} 回復した。`,
            sound: "heal",
            floatText: `+${healAmount}`,
            floatColor: "#00ff66"
          });
          return;
        }
      }

      // Prioritize living and active characters for physical attacks
      let targetCandidates = [];
      if (mon.isSniper) {
        // Snipe back-row characters (idx 2, 3) who are alive and active
        targetCandidates = state.party
          .map((c, i) => ({ c, i }))
          .filter(x => x.i >= 2 && !["dead", "paralyzed", "sleep"].includes(x.c.status));
        
        if (targetCandidates.length === 0) {
          targetCandidates = state.party
            .map((c, i) => ({ c, i }))
            .filter(x => x.c.status !== "dead");
        }
      } else {
        // Prioritize front-row characters (idx 0, 1)
        targetCandidates = state.party
          .map((c, i) => ({ c, i }))
          .filter(x => x.i < 2 && !["dead", "paralyzed", "sleep"].includes(x.c.status));

        if (targetCandidates.length === 0) {
          targetCandidates = state.party
            .map((c, i) => ({ c, i }))
            .filter(x => x.c.status !== "dead");
        }
      }

      if (targetCandidates.length === 0) return;

      const targetSelect = targetCandidates[Math.floor(Math.random() * targetCandidates.length)];
      const target = targetSelect.c;

      // Attack spells (HALITO, LAHALITO etc., excluding healer spells)
      if (mon.spell && !["DIOS", "DIALMA"].includes(mon.spell) && Math.random() < 0.20) {
        if (mon.spell === "HALITO") {
          const dmg = Math.floor(Math.random() * 10) + 5;
          target.hp = Math.max(0, target.hp - dmg);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！`,
            sound: "cast_spell",
            shake: 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });
        } else if (mon.spell === "LAHALITO") {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}は激しい炎の息（ラハリト）を吐き出した！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach(c => {
            if (c.status !== "dead") {
              const dmg = Math.floor(Math.random() * 15) + 10;
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。` });
            }
          });
        } else if (mon.spell === "MADALTO") {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はマダルトを唱えた！氷の嵐が吹き荒れる！`,
            sound: "cast_spell",
            shake: 15,
            flash: true
          });
          state.party.forEach(c => {
            if (c.status !== "dead") {
              const dmg = Math.floor(Math.random() * 20) + 15; // 15-35 DMG
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の氷ダメージを受けた。` });
            }
          });
        } else if (mon.spell === "TILTOWAIT") {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}はティルトウェイトを唱えた！極大爆裂が襲いかかる！`,
            sound: "cast_spell",
            shake: 25,
            flash: true
          });
          state.party.forEach(c => {
            if (c.status !== "dead") {
              const dmg = Math.floor(Math.random() * 30) + 35; // 35-65 DMG
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の爆裂ダメージを受けた。` });
            }
          });
        }
      } else {
        // Ninja physical attack evasion (25% chance to balance with row system)
        let isEvaded = false;
        if (target.class === "Ninja" && Math.random() < 0.25) {
          isEvaded = true;
        }

        if (isEvaded) {
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}の攻撃！しかし、忍者${target.name}は身軽に回避した！`,
            sound: "miss",
            shake: 0,
            floatText: "AVOID",
            floatColor: "#00ff66"
          });
        } else {
          const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
          const finalAtk = mon.atk + Math.floor(Math.random() * 4);
          const finalDef = getCharDef(target);
          let dmg = Math.max(1, finalAtk - finalDef);
          if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
          
          // Blind target receives 1.5x damage
          if (target.status === "blind") {
            dmg = Math.max(1, Math.round(dmg * 1.5));
          }

          target.hp = Math.max(0, target.hp - dmg);
          logQueue.push({
            msg: `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`,
            sound: "hit",
            shake: 8,
            floatText: `${dmg}`,
            floatColor: "#ff3b30"
          });

          // Apply poison effect if monster is poisonous and target survives
          if (mon.isPoisonous && target.hp > 0 && target.status === "ok" && Math.random() < 0.35) {
            target.status = "poisoned";
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は毒を受け、毒状態になった！`,
              sound: "chest_trap"
            });
          }

          // Apply paralyze effect if monster is paralyzing and target survives
          if (mon.isParalyzing && target.hp > 0 && ["ok", "poisoned", "blind", "sleep"].includes(target.status) && Math.random() < 0.35) {
            target.status = "paralyzed";
            logQueue.push({
              msg: `[ 敵 ] [!] ${target.name}は麻痺を受け、麻痺状態になった！`,
              sound: "chest_trap"
            });
          }

          // Apply blind effect if monster is blinding and target survives
          if (mon.isBlinding && target.hp > 0 && target.status === "ok" && Math.random() < 0.35) {
            target.status = "blind";
            logQueue.push({
              msg: `[ 敵 ] [!] ${mon.name}の放つ閃光により、${target.name}は盲目状態になった！`,
              sound: "chest_trap"
            });
          }
        }
      }

      if (target.hp === 0) {
        target.status = "dead";
        logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
      }
    }
  });

  if (escaped) {
    playBattleLogs(logQueue, 0);
    return;
  }

  const allMonstersDead = monsters.every(m => m.hp <= 0);
  if (allMonstersDead) {
    const nonFledMonsters = monsters.filter(m => !m.fled);
    const totalExp = nonFledMonsters.reduce((sum, m) => sum + m.exp, 0);
    const totalGold = nonFledMonsters.reduce((sum, m) => sum + m.gold, 0);
    const livingChars = state.party.filter(c => c.status !== "dead");

    // Check First Kill Bonuses
    let bonusExp = 0;
    let bonusGold = 0;
    const firstKilledNames = [];
    
    nonFledMonsters.forEach(m => {
      // Extract base name (remove " A", " B" suffix)
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (state.firstKills && !state.firstKills.includes(baseName)) {
        if (!state.firstKills) state.firstKills = [];
        state.firstKills.push(baseName);
        firstKilledNames.push(baseName);
        // Bonus reward: 100% of base monster rewards
        bonusExp += m.exp;
        bonusGold += m.gold;
      }
    });

    if (state.codex) {
      if (!state.codex.stats) {
        state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
      }
      state.codex.stats.totalKills += nonFledMonsters.length;
      
      if (!state.codex.monsters) state.codex.monsters = {};
      nonFledMonsters.forEach(m => {
        const baseName = m.name.replace(/\s[A-Z]$/, "");
        if (!state.codex.monsters[baseName]) {
          state.codex.monsters[baseName] = { encountered: 1, killed: 0, firstKilled: false };
        }
        state.codex.monsters[baseName].killed++;
        if (firstKilledNames.includes(baseName)) {
          state.codex.monsters[baseName].firstKilled = true;
        }
      });
    }

    const expShare = livingChars.length > 0 ? Math.round(totalExp / livingChars.length) : 0;
    const bonusExpShare = (livingChars.length > 0 && bonusExp > 0) ? Math.round(bonusExp / livingChars.length) : 0;

    if (state.currentRun) {
      state.currentRun.kills += nonFledMonsters.length;
      state.currentRun.goldGained += (totalGold + bonusGold);
      state.currentRun.expGained += (expShare + bonusExpShare);
      if (state.combatState.isBoss) {
        state.currentRun.bossesKilled += nonFledMonsters.length;
      } else if (state.combatState.isMidboss || state.combatState.isRoamingFlack) {
        state.currentRun.elitesKilled += nonFledMonsters.length;
      } else {
        nonFledMonsters.forEach(m => {
          if (m.isRare) {
            state.currentRun.elitesKilled++;
          }
        });
      }
    }

    logQueue.push({ msg: "======================================" });
    if (nonFledMonsters.length > 0) {
      let msg = "戦闘に勝利した！";
      if (expShare > 0 && totalGold > 0) {
        msg += `パーティは各自${expShare}の経験値と${totalGold}ゴールドを獲得した。`;
      } else if (expShare > 0) {
        msg += `パーティは各自${expShare}の経験値を得た。`;
      } else if (totalGold > 0) {
        msg += `パーティは${totalGold}ゴールドを獲得した。`;
      }
      logQueue.push({
        msg,
        sound: "level_up"
      });

      // Output first kill bonus logs
      if (firstKilledNames.length > 0) {
        logQueue.push({
          msg: `🎉【初回討伐ボーナス！】初めて [${firstKilledNames.join(", ")}] を討伐した！`,
          sound: "gold"
        });
        logQueue.push({
          msg: `  -> 特典ボーナス：各自 +${bonusExpShare} EXP / パーティ +${bonusGold} ゴールド！`
        });
      }
    } else {
      logQueue.push({
        msg: `敵がすべて逃げ出し、戦闘が終了した。`,
        sound: "miss"
      });
    }

    state.gold += totalGold + bonusGold;

    livingChars.forEach(c => {
      c.exp += (expShare + bonusExpShare);
      const lvlUp = checkCharLevelUp(c);
      if (lvlUp) {
        logQueue.push({
          msg: `[★] レベルアップ！${c.name}はレベル${c.level}になった！`,
          sound: "level_up",
          flash: true,
          floatText: "LEVEL UP!",
          floatColor: "#ffb300"
        });
      }

      // Display remaining EXP to next level
      const nextLevel = c.level + 1;
      if (nextLevel < EXP_LEVELS.length) {
        const nextReq = EXP_LEVELS[nextLevel];
        const remaining = Math.max(0, nextReq - c.exp);
        logQueue.push({
          msg: `  -> ${c.name}: 次Lvまであと ${remaining} EXP (現在:${c.exp}/${nextReq})`
        });
      } else {
        logQueue.push({
          msg: `  -> ${c.name}: レベル最大 (現在:${c.exp} EXP)`
        });
      }
    });

    logQueue.push({ msg: "======================================" });

    // 敵撃破時の未鑑定装備ドロップ判定
    let dropEquipment = null;
    if (state.combatState.isBoss) {
      dropEquipment = generateRandomEquipment(state.floor, "epic");
    } else if (state.combatState.isMidboss) {
      const rarity = Math.random() < 0.25 ? "epic" : "rare";
      dropEquipment = generateRandomEquipment(state.floor, rarity);
    } else {
      const isRare = state.combatState.monsters && state.combatState.monsters.some(m => m.isRare);
      const chance = isRare ? 0.25 : 0.03;
      if (Math.random() < chance) {
        dropEquipment = generateRandomEquipment(state.floor);
      }
    }

    if (dropEquipment) {
      if (state.inventory.length < 20) {
        state.inventory.push(dropEquipment);
        if (state.currentRun) {
          state.currentRun.equipmentFound.push(dropEquipment);
        }
        const eqData = getItemData(dropEquipment);
        logQueue.push({
          msg: `モンスターの骸から [${eqData.name}] を手に入れた！`,
          sound: "gold"
        });
      } else {
        logQueue.push({
          msg: `モンスターは何かを落としたが、バッグが満杯で拾えなかった！`,
          sound: "miss"
        });
      }
    }

    if (state.combatState.isBoss) {
      logQueue.push({
        msg: "ついに伝説の [浮遊石 (クリスタル)] を手に入れた！おしろに持ち帰ろう！",
        sound: "gold",
        giveCrystal: true
      });
    } else if (state.combatState.isMidboss) {
      logQueue.push({
        msg: "デーモンガードの骸から [竜の鍵] を手に入れた！これであの扉を開けられるはずだ！",
        sound: "gold",
        giveKey: true
      });
    } else if (state.combatState.isRoamingFlack) {
      // Remove Flack from state.roamingMonsters
      state.roamingMonsters = state.roamingMonsters.filter(
        rm => !(rm.floor === state.floor && rm.x === state.x && rm.y === state.y)
      );
      logQueue.push({
        msg: "強敵「フラック」を見事に撃破した！",
        sound: "gold"
      });
      logQueue.push({
        msg: "フラックの残骸の影に宝箱を見つけた！",
        triggerChest: true
      });
      if (state.floorChestsTotal) {
        state.floorChestsTotal[state.floor - 1] = (state.floorChestsTotal[state.floor - 1] ?? 0) + 1;
      }
    } else {
      if (Math.random() < 0.20) {
        logQueue.push({
          msg: "モンスターが宝箱を残していった！",
          triggerChest: true
        });
        if (state.floorChestsTotal) {
          state.floorChestsTotal[state.floor - 1] = (state.floorChestsTotal[state.floor - 1] ?? 0) + 1;
        }
      } else {
        logQueue.push({
          msg: "周囲に静寂が戻った。",
          endCombat: true
        });
      }
    }
  } else {
    // Combat round end poison damage
    state.party.forEach(c => {
      if (c.status === "poisoned" && c.hp > 0) {
        const pDmg = Math.floor(Math.random() * 3) + 2; // 2-4 damage
        c.hp = Math.max(0, c.hp - pDmg);
        logQueue.push({
          msg: `[味方] [!] 毒のダメージ！${c.name}は${pDmg}のダメージを受けた。`,
          sound: "hit",
          floatText: `${pDmg}`,
          floatColor: "#ff3b30"
        });
        if (c.hp === 0) {
          c.status = "dead";
          logQueue.push({ msg: `[味方] [!] ${c.name}は毒で力尽きた！` });
        }
      }
    });
  }

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
