import { DIR_N, DIR_E, DIR_S, DIR_W, DX, DY, DIR_NAMES, MONSTERS, ITEMS, SPELLS, MAP_WIDTH, MAP_HEIGHT, START_X, START_Y } from "./data.js";
import { state, initNewGame, loadGame, saveGame, saveAutosave, getCharWeaponAtk, getCharDef, checkCharLevelUp, addLog, EXP_LEVELS } from "./state.js";
import { DungeonRenderer } from "./renderer.js";
import { playSound } from "./audio.js";

let renderer = null;
let lastTime = 0;

// Submenu navigation tracker
let menuContext = {
  type: "", // "camp", "spell", "item", "equip", "shop_buy", "shop_sell", "temple", "target_enemy", "target_ally"
  actorIdx: -1,
  spellName: "",
  itemKey: "",
  itemIdx: -1,
  prevGameState: null,
  slot: "" // "weapon", "shield", "armor"
};
let menuHistory = [];

// Combat action selection state
let combatSelection = {
  charIdx: 0,
  actions: [] // array of { type, actorIdx, targetIdx, spellName, itemKey }
};

export function initGame() {
  loadGame();
  
  renderer = new DungeonRenderer("dungeon-canvas");
  
  // Set up animation/render loop
  requestAnimationFrame(gameLoop);

  // Bind Buttons
  bindButtons();

  // Load Initial UI state
  updateUI();
  addLog("--- ADVENTURE BEGINS ---");
}

function gameLoop(time) {
  const dt = time - lastTime;
  lastTime = time;

  if (renderer) {
    renderer.update(dt);
    renderer.draw();
  }

  requestAnimationFrame(gameLoop);
}

// ----------------------------------------------------
// UI UPDATER
// ----------------------------------------------------
function resetViewportZoom() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    // Force reset viewport scale to 1.0
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  }
}

export function updateUI() {
  resetViewportZoom();

  // Update locations & gold labels
  const locLabel = document.getElementById("location-label");
  const goldLabel = document.getElementById("gold-counter");
  
  if (state.gameState === "town") {
    locLabel.textContent = "TOWN OF LLYLGAMYN";
  } else if (state.gameState === "explore") {
    const lightText = state.lightTurns > 0 ? ` (LIGHT:${state.lightTurns})` : "";
    locLabel.textContent = `DUNGEON B1F X:${state.x} Y:${state.y}${lightText}`;
  } else if (state.gameState === "combat") {
    locLabel.textContent = "BATTLE ENCOUNTER";
  } else if (state.gameState === "chest") {
    locLabel.textContent = "TREASURE CHEST";
  } else if (state.gameState === "victory") {
    locLabel.textContent = "CONGRATULATIONS!";
  } else if (state.gameState === "gameover") {
    locLabel.textContent = "GAME OVER";
  }
  
  goldLabel.textContent = `GOLD: ${state.gold}`;

  // Update Logs
  const logContent = document.getElementById("log-content");
  logContent.innerHTML = "";
  state.logs.forEach(msg => {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    
    // Auto color coding Japanese logs & Combat sides
    if (msg.includes("[味方]")) {
      if (msg.includes("回復") || msg.includes("治") || msg.includes("無事")) {
        entry.classList.add("heal"); // 味方の回復/治療/解除成功はグリーン
      } else {
        entry.classList.add("ally"); // 味方の通常の攻撃等はパープル
      }
    } else if (msg.includes("[ 敵 ]")) {
      entry.classList.add("enemy"); // 敵の行動はすべてレッド
    } else if (msg.includes("ダメージ") || msg.includes("倒れた") || msg.includes("失敗")) {
      entry.classList.add("damage");
    } else if (msg.includes("回復") || msg.includes("レベルアップ") || msg.includes("強さ") || msg.includes("休息")) {
      entry.classList.add("heal");
    } else if (msg.includes("ゴールド") || msg.includes("ゴールド") || msg.includes("手に入れた") || msg.includes("獲得した") || msg.includes("購入") || msg.includes("売却")) {
      entry.classList.add("loot");
    } else if (msg.includes("唱えた") || msg.includes("明かり") || msg.includes("座標")) {
      entry.classList.add("info");
    }
    
    entry.textContent = msg;
    logContent.appendChild(entry);
  });
  // Auto scroll logs
  const logPanel = document.getElementById("log-panel");
  logPanel.scrollTop = logPanel.scrollHeight;

  // Update Controls Panel visible state
  const groups = ["explore-controls", "combat-controls", "town-controls", "submenu-controls"];
  groups.forEach(g => {
    const el = document.getElementById(g);
    el.classList.remove("active");
  });

  if (state.gameState === "explore") {
    document.getElementById("explore-controls").classList.add("active");
  } else if (state.gameState === "combat") {
    document.getElementById("combat-controls").classList.add("active");
    const gridEl = document.querySelector(".combat-grid");
    if (gridEl) {
      if (state.combatState && state.combatState.phase === "resolving") {
        gridEl.style.pointerEvents = "none";
        gridEl.style.opacity = "0.5";
      } else {
        gridEl.style.pointerEvents = "auto";
        gridEl.style.opacity = "1";
        
        const cancelBtn = document.getElementById("btn-combat-cancel");
        if (cancelBtn) {
          if (combatSelection.charIdx === 0) {
            cancelBtn.style.opacity = "0.3";
            cancelBtn.style.pointerEvents = "none";
          } else {
            cancelBtn.style.opacity = "1";
            cancelBtn.style.pointerEvents = "auto";
          }
        }
      }
    }
    updateCombatPrompt();
  } else if (state.gameState === "town") {
    document.getElementById("town-controls").classList.add("active");
  } else if (state.gameState === "submenu") {
    document.getElementById("submenu-controls").classList.add("active");
  }

  // Update Party HUD
  updatePartyHUD();
}

function updatePartyHUD() {
  const grid = document.getElementById("party-grid");
  grid.innerHTML = "";

  state.party.forEach((char, idx) => {
    const card = document.createElement("div");
    card.className = "party-card";
    
    // Highlight if selecting combat actions for this character
    if (state.gameState === "combat" && combatSelection.charIdx === idx) {
      card.classList.add("selected");
    }
    
    // Name and Class
    const header = document.createElement("div");
    header.className = "char-header";
    header.innerHTML = `<span class="char-name">${char.name}</span><span class="char-class">Lv.${char.level} ${char.class[0]}</span>`;
    card.appendChild(header);

    // HP Bar
    const hpPct = char.maxHp > 0 ? (char.hp / char.maxHp) * 100 : 0;
    const hpContainer = document.createElement("div");
    hpContainer.className = "char-hpmp";
    hpContainer.innerHTML = `
      <div class="bar-container">
        <span class="bar-label">H</span>
        <div class="bar"><div class="bar-fill hp" style="width: ${hpPct}%"></div></div>
        <span>${char.hp}</span>
      </div>
    `;
    
    // MP Bar (only for spellcasters)
    if (char.class === "Priest" || char.class === "Mage") {
      const mpPct = char.maxMp > 0 ? (char.mp / char.maxMp) * 100 : 0;
      hpContainer.innerHTML += `
        <div class="bar-container">
          <span class="bar-label">M</span>
          <div class="bar"><div class="bar-fill mp" style="width: ${mpPct}%"></div></div>
          <span>${char.mp}</span>
        </div>
      `;
    }
    card.appendChild(hpContainer);

    // Status overlay
    if (char.status !== "ok") {
      const statusLabel = document.createElement("div");
      statusLabel.className = `char-status ${char.status}`;
      statusLabel.textContent = char.status.toUpperCase();
      card.appendChild(statusLabel);
    }

    grid.appendChild(card);
  });
}

function updateCombatPrompt() {
  const prompt = document.getElementById("combat-prompt");
  if (!state.combatState) return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok");
  const currentSelect = livingChars[combatSelection.charIdx];
  if (state.combatState.phase === "resolving") {
    prompt.textContent = "ターン解決中...";
  } else if (currentSelect) {
    const classJp = currentSelect.c.class === "Fighter" ? "戦士" : currentSelect.c.class === "Thief" ? "盗賊" : currentSelect.c.class === "Priest" ? "僧侶" : "魔術師";
    prompt.textContent = `${currentSelect.c.name} (${classJp}) の行動を選択：`;
  } else {
    prompt.textContent = "ターン解決中...";
  }
}

// ----------------------------------------------------
// BUTTON BINDINGS
// ----------------------------------------------------
function bindButtons() {
  // Exploration
  document.getElementById("btn-turn-left").addEventListener("click", () => handleMove("turn-left"));
  document.getElementById("btn-move-forward").addEventListener("click", () => handleMove("forward"));
  document.getElementById("btn-turn-right").addEventListener("click", () => handleMove("turn-right"));
  document.getElementById("btn-move-backward").addEventListener("click", () => handleMove("backward"));

  document.getElementById("btn-inspect").addEventListener("click", () => handleExploreAction("search"));
  document.getElementById("btn-cast").addEventListener("click", () => handleExploreAction("spell"));
  document.getElementById("btn-item").addEventListener("click", () => handleExploreAction("item"));
  document.getElementById("btn-camp").addEventListener("click", () => handleExploreAction("camp"));

  // Town
  document.getElementById("btn-town-dungeon").addEventListener("click", () => enterDungeon());
  document.getElementById("btn-town-castle").addEventListener("click", () => handleTownOption("castle"));
  document.getElementById("btn-town-shop").addEventListener("click", () => handleTownOption("shop"));
  document.getElementById("btn-town-temple").addEventListener("click", () => handleTownOption("temple"));
  document.getElementById("btn-town-camp").addEventListener("click", () => handleTownOption("camp"));

  // Combat actions
  document.getElementById("btn-combat-fight").addEventListener("click", () => selectCombatAction("fight"));
  document.getElementById("btn-combat-spell").addEventListener("click", () => selectCombatAction("spell"));
  document.getElementById("btn-combat-item").addEventListener("click", () => selectCombatAction("item"));
  document.getElementById("btn-combat-defend").addEventListener("click", () => selectCombatAction("defend"));
  document.getElementById("btn-combat-run").addEventListener("click", () => selectCombatAction("run"));
  document.getElementById("btn-combat-cancel").addEventListener("click", () => cancelCombatAction());

  // Submenu
  document.getElementById("btn-submenu-back").addEventListener("click", () => goBackSubmenu());

  // Prevent iOS Safari pinch zoom and gesture zoom
  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
  });
  document.addEventListener("gesturechange", (e) => {
    e.preventDefault();
  });
  document.addEventListener("gestureend", (e) => {
    e.preventDefault();
  });

  // Prevent pinch zoom via multi-touch touchstart
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  // Prevent double-tap zoom on non-interactive background elements
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
      const isInteractive = e.target.tagName === "BUTTON" || 
                            e.target.tagName === "A" || 
                            e.target.closest("button") || 
                            e.target.closest(".btn");
      if (!isInteractive) {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Keyboard navigation for desktop testing
  window.addEventListener("keydown", (e) => {
    if (state.gameState === "explore") {
      if (e.key === "ArrowUp" || e.key === "w") handleMove("forward");
      if (e.key === "ArrowDown" || e.key === "s") handleMove("backward");
      if (e.key === "ArrowLeft" || e.key === "a") handleMove("turn-left");
      if (e.key === "ArrowRight" || e.key === "d") handleMove("turn-right");
      if (e.key === "f") handleExploreAction("search");
    }
  });
}

// ----------------------------------------------------
// MOVEMENT LOGIC
// ----------------------------------------------------
function handleMove(action) {
  playSound("move");
  
  if (action === "turn-left") {
    state.dir = (state.dir + 3) % 4;
    addLog(`左を向いた。方角: ${DIR_NAMES[state.dir]}`);
  } else if (action === "turn-right") {
    state.dir = (state.dir + 1) % 4;
    addLog(`右を向いた。方角: ${DIR_NAMES[state.dir]}`);
  } else if (action === "forward") {
    const currentCell = state.map[state.y][state.x];
    if (currentCell.walls[state.dir]) {
      playSound("bump");
      renderer.triggerShake(4, 150);
      addLog("痛い！壁にぶつかった！");
    } else {
      // Step forward
      state.x += DX[state.dir];
      state.y += DY[state.dir];
      
      // Update light turns
      if (state.lightTurns > 0) {
        state.lightTurns--;
        if (state.lightTurns === 0) {
          addLog("明かりの呪文の効果が切れた。暗闇に包まれた。");
        }
      }
      
      // Mark as visited
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩進んだ。現在位置: X:${state.x}, Y:${state.y}`);

      // Check coordinates trigger events
      checkCellEvents();
    }
  } else if (action === "backward") {
    const currentCell = state.map[state.y][state.x];
    const backDir = (state.dir + 2) % 4;
    if (currentCell.walls[backDir]) {
      playSound("bump");
      renderer.triggerShake(4, 150);
      addLog("下がれない。後ろは壁だ。");
    } else {
      state.x += DX[backDir];
      state.y += DY[backDir];
      if (state.lightTurns > 0) state.lightTurns--;
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩下がった。現在位置: X:${state.x}, Y:${state.y}`);
      checkCellEvents();
    }
  }
  
  saveAutosave();
  updateUI();
}

function checkCellEvents() {
  const cell = state.map[state.y][state.x];

  // Stairs Up (exit to town)
  if (cell.type === "stairs-up") {
    addLog("階段を上がります。リルガミンの街へ戻る...");
    setTimeout(() => {
      state.gameState = "town";
      state.x = START_X;
      state.y = START_Y;
      state.dir = DIR_N;
      addLog("リルガミンの街に戻り、体力を回復しました。");
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  // Custom cell message
  if (cell.message) {
    addLog(cell.message);
  }

  // Boss encounter
  if (cell.event === "boss") {
    addLog("警告：ただならぬ巨大な気配が立ちふさがる！戦闘準備！");
    playSound("chest_trap");
    setTimeout(() => {
      startCombat(true);
    }, 1000);
    return;
  }

  // Chest encounter
  if (cell.event === "chest") {
    addLog("鍵のかかった宝箱を見つけた！");
    playSound("gold");
    state.gameState = "chest";
    // Setup chest contents
    setupChestState();
    return;
  }

  // Random Encounter (10% chance)
  if (Math.random() < 0.10) {
    addLog("モンスターが暗闇から襲いかかってきた！");
    setTimeout(() => {
      startCombat(false);
    }, 600);
  }
}

// ----------------------------------------------------
// EXPLORE ACTIONS
// ----------------------------------------------------
function handleExploreAction(action) {
  if (action === "search") {
    // Manual search (could reveal chest if cell has it, but cell event does it automatically)
    addLog("周囲を調べたが、特に何も見つからなかった。");
    updateUI();
  } else if (action === "camp") {
    openCampMenu();
  } else if (action === "spell") {
    // Select caster
    openSubmenu("spell_caster_select", "呪文を唱えるキャラクターを選択：");
  } else if (action === "item") {
    // Select character to use item
    openSubmenu("item_user_select", `道具を使用/装備するキャラクターを選択 (バッグ: ${state.inventory.length}個)：`);
  }
}

// ----------------------------------------------------
// TOWN MENU ACTIONS
// ----------------------------------------------------
function enterDungeon() {
  state.gameState = "explore";
  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.visitedMap[state.y][state.x] = true;
  addLog("地下1階に降りた。冷たい石造りの暗闇が迫る...");
  playSound("move");
  saveAutosave();
  updateUI();
}

function handleTownOption(option) {
  if (option === "castle") {
    // Heal all HP, MP, status
    state.party.forEach(char => {
      char.hp = char.maxHp;
      char.mp = char.maxMp;
      if (char.status !== "dead") char.status = "ok";
    });
    addLog("おしろ：パーティは休息した。HPとMPが全回復した！");
    
    // Check Victory item
    const hasCrystal = state.inventory.includes("ANTIGRAVITY_CRYSTAL");
    if (hasCrystal) {
      playSound("level_up");
      state.gameState = "victory";
      addLog("**************************************************");
      addLog("おめでとうございます！浮遊石を持ち帰りました！");
      addLog("王より名誉勲章が授与されました。ゲームクリアです！");
      addLog("**************************************************");
      clearSaveData();
    } else {
      playSound("heal");
      saveGame();
      saveAutosave();
    }
    updateUI();
  } else if (option === "shop") {
    openSubmenu("shop_main", "ボルタック商店 - アイテムの売買：");
  } else if (option === "temple") {
    openSubmenu("temple_main", "カント寺院 - 蘇生と治療：");
  } else if (option === "camp") {
    openSubmenu("item_user_select", `道具を使用/装備するキャラクターを選択 (バッグ: ${state.inventory.length}個)：`);
  }
}

function clearSaveData() {
  // Let the user start fresh next time
  localStorage.removeItem("mobile_wiz_rpg_save");
}

// ----------------------------------------------------
// SUBMENU MANAGER
// ----------------------------------------------------
function openSubmenu(type, title, isBack = false) {
  if (!isBack) {
    if (state.gameState !== "submenu") {
      menuContext.prevGameState = state.gameState;
      menuHistory = []; // Reset history when entering submenu from main game
    } else {
      // Save current state to history before transitioning
      menuHistory.push({
        type: menuContext.type,
        title: document.getElementById("submenu-title").textContent,
        actorIdx: menuContext.actorIdx,
        spellName: menuContext.spellName,
        itemKey: menuContext.itemKey,
        itemIdx: menuContext.itemIdx,
        slot: menuContext.slot
      });
    }
  }
  state.gameState = "submenu";
  menuContext.type = type;
  document.getElementById("btn-submenu-back").style.display = "block";
  
  const titleEl = document.getElementById("submenu-title");
  // Dynamic replacement of bag/inventory item counts to prevent historical desync
  let displayTitle = title;
  if (displayTitle.includes("バッグ: ") || displayTitle.includes("共有バッグ (") || displayTitle.includes("売却 (バッグ: ")) {
    displayTitle = displayTitle.replace(/(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(共有バッグ\s*\()\d+(個)/g, `$1${state.inventory.length}$2`);
    displayTitle = displayTitle.replace(/(売却\s*\(バッグ:\s*)\d+(個)/g, `$1${state.inventory.length}$2`);
  }
  titleEl.textContent = displayTitle;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (type === "spell_caster_select") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (${char.class === "Priest" ? "僧侶" : "魔術師"}) - MP:${char.mp}/${char.maxMp}`;
      if (char.status === "dead" || char.maxMp === 0) btn.disabled = true;
      btn.addEventListener("click", () => {
        menuContext.actorIdx = idx;
        openSubmenu("spell_select", `呪文選択 - ${char.name}:`);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "spell_select") {
    const caster = state.party[menuContext.actorIdx];
    const casterSpells = caster.spells || [];
    if (casterSpells.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn btn-block";
      btn.textContent = "修得している呪文がありません";
      btn.disabled = true;
      optGrid.appendChild(btn);
    } else {
      casterSpells.forEach(spKey => {
        const spell = SPELLS[spKey];
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        btn.textContent = `${spell.name} (MP:${spell.cost}) - ${spell.desc}`;
        if (caster.mp < spell.cost) btn.disabled = true;
        btn.addEventListener("click", () => {
          menuContext.spellName = spKey;
          // Determine spell targeting
          if (spell.target === "single_ally") {
            openSubmenu("spell_target_ally", `${spell.name}の対象を選択:`);
          } else if (spell.target === "utility") {
            executeUtilitySpell();
          } else {
            addLog("この呪文は戦闘中のみ使用可能です！");
            closeSubmenu();
          }
        });
        optGrid.appendChild(btn);
      });
    }
  } else if (type === "spell_target_ally") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (HP:${char.hp}/${char.maxHp})`;
      btn.addEventListener("click", () => {
        executeAllySpell(idx);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "item_user_select") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      const classJp = char.class === "Fighter" ? "戦士" : char.class === "Thief" ? "盗賊" : char.class === "Priest" ? "僧侶" : "魔術師";
      btn.textContent = `${char.name} (Lv.${char.level} ${classJp})`;
      btn.addEventListener("click", () => {
        menuContext.actorIdx = idx;
        openSubmenu("item_inventory", `共有バッグ (${state.inventory.length}個) - ${char.name}の使用/装備:`);
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "item_inventory") {
    const char = state.party[menuContext.actorIdx];
    
    // Equipment stats show
    const statsDiv = document.createElement("div");
    statsDiv.style.gridColumn = "span 2";
    statsDiv.style.fontFamily = "var(--font-mono)";
    statsDiv.style.fontSize = "11px";
    statsDiv.style.color = "var(--neon-cyan)";
    statsDiv.style.textAlign = "center";
    statsDiv.style.marginBottom = "4px";
    
    const wName = char.equipment.weapon ? ITEMS[char.equipment.weapon].name : "なし";
    const sName = char.equipment.shield ? ITEMS[char.equipment.shield].name : "なし";
    const aName = char.equipment.armor ? ITEMS[char.equipment.armor].name : "なし";
    statsDiv.textContent = `武器: ${wName} | 盾: ${sName} | 鎧: ${aName}`;
    optGrid.appendChild(statsDiv);

    if (state.inventory.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn btn-block";
      btn.textContent = "バッグは空っぽです";
      btn.disabled = true;
      optGrid.appendChild(btn);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = ITEMS[itemKey];
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        const typeJp = item.type === "usable" ? "消費" : item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : "鎧";
        btn.textContent = `${item.name} [${typeJp}]`;
        btn.addEventListener("click", () => {
          menuContext.itemKey = itemKey;
          menuContext.itemIdx = idx;
          openSubmenu("item_action", `${item.name}:`);
        });
        optGrid.appendChild(btn);
      });
    }
  } else if (type === "item_action") {
    const item = ITEMS[menuContext.itemKey];
    
    if (item.type === "usable") {
      const btnUse = document.createElement("button");
      btnUse.className = "btn btn-neon btn-block";
      btnUse.textContent = "使用する";
      btnUse.addEventListener("click", () => {
        const char = state.party[menuContext.actorIdx];
        const log = item.effect(char);
        addLog(log);
        playSound("heal");
        // Remove item from inventory
        state.inventory.splice(menuContext.itemIdx, 1);
        saveAutosave();
        goBackSubmenu();
      });
      optGrid.appendChild(btnUse);
    } else if (item.type === "weapon" || item.type === "shield" || item.type === "armor") {
      const btnEquip = document.createElement("button");
      btnEquip.className = "btn btn-neon btn-block";
      btnEquip.textContent = "装備する";
      btnEquip.addEventListener("click", () => {
        const char = state.party[menuContext.actorIdx];
        const slot = item.type; // weapon, shield, armor
        
        // Return previous equipment to inventory
        const oldEq = char.equipment[slot];
        char.equipment[slot] = item.id;
        
        // Update inventory
        if (oldEq) {
          state.inventory[menuContext.itemIdx] = oldEq;
        } else {
          state.inventory.splice(menuContext.itemIdx, 1);
        }
        
        const newAtk = getCharWeaponAtk(char) + char.str;
        const newDef = getCharDef(char);
        
        addLog(`${char.name}は${item.name}を装備した。(攻撃:${newAtk}/守備:${newDef})`);
        playSound("move");
        saveAutosave();
        goBackSubmenu();
      });
      optGrid.appendChild(btnEquip);
    } else {
      // Quest item or unuseable
      const btnInfo = document.createElement("button");
      btnInfo.className = "btn btn-block";
      btnInfo.textContent = "今は使用できません";
      btnInfo.disabled = true;
      optGrid.appendChild(btnInfo);
    }
  } else if (type === "camp_main" || type === "camp") {
    // Camp layout
    const btnRest = document.createElement("button");
    btnRest.className = "btn btn-neon btn-block";
    btnRest.textContent = "パーティの強さ";
    btnRest.addEventListener("click", () => {
      openSubmenu("camp_status", "パーティ詳細ステータス:");
    });
    optGrid.appendChild(btnRest);

    const btnItems = document.createElement("button");
    btnItems.className = "btn btn-neon btn-block";
    btnItems.textContent = "道具・装備";
    btnItems.addEventListener("click", () => {
      openSubmenu("item_user_select", `道具を使用/装備するキャラクターを選択 (バッグ: ${state.inventory.length}個) ：`);
    });
    optGrid.appendChild(btnItems);

    const btnDiscard = document.createElement("button");
    btnDiscard.className = "btn btn-danger btn-block";
    btnDiscard.textContent = "冒険を最初からやり直す";
    btnDiscard.addEventListener("click", () => {
      if (confirm("セーブデータを削除して、最初からやり直しますか？")) {
        initNewGame();
        closeSubmenu();
      }
    });
    optGrid.appendChild(btnDiscard);
  } else if (type === "gameover_main") {
    const btnLoad = document.createElement("button");
    btnLoad.className = "btn btn-neon btn-block";
    btnLoad.textContent = "セーブデータから再開（おしろから）";
    
    // セーブデータが存在するか確認
    const hasSave = localStorage.getItem("mobile_wiz_rpg_save") !== null;
    if (!hasSave) {
      btnLoad.disabled = true;
      btnLoad.textContent = "セーブデータがありません";
    }
    
    btnLoad.addEventListener("click", () => {
      loadGame(true);
      closeSubmenu();
    });
    optGrid.appendChild(btnLoad);

    const btnRestart = document.createElement("button");
    btnRestart.className = "btn btn-danger btn-block";
    btnRestart.textContent = "最初からやり直す（新規データ）";
    btnRestart.addEventListener("click", () => {
      if (confirm("本当に最初からやり直しますか？現在のセーブデータは消去されます。")) {
        initNewGame();
        state.gameState = "town";
        closeSubmenu();
      }
    });
    optGrid.appendChild(btnRestart);
  } else if (type === "camp_status") {
    state.party.forEach(char => {
      const card = document.createElement("div");
      card.style.fontFamily = "var(--font-mono)";
      card.style.fontSize = "11px";
      card.style.border = "1px solid var(--border-color)";
      card.style.padding = "4px";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      const classJp = char.class === "Fighter" ? "戦士" : char.class === "Thief" ? "盗賊" : char.class === "Priest" ? "僧侶" : "魔術師";
      const nextReq = EXP_LEVELS[char.level + 1];
      const nextText = nextReq ? `${char.exp}/${nextReq}` : `${char.exp}/MAX`;
      card.innerHTML = `
        <strong style="color:var(--neon-gold)">${char.name} (${classJp})</strong>
        <span>HP: ${char.hp}/${char.maxHp} | MP: ${char.mp}/${char.maxMp}</span>
        <span>力:${char.str} 知恵:${char.int} 信仰:${char.pie}</span>
        <span>生命:${char.vit} 素早:${char.agi} 運:${char.luk}</span>
        <span>攻撃:+${getCharWeaponAtk(char)} | 守備:${getCharDef(char)}</span>
        <span style="color:var(--neon-cyan)">EXP: ${nextText}</span>
      `;
      optGrid.appendChild(card);
    });
  } else if (type === "shop_main") {
    const btnBuy = document.createElement("button");
    btnBuy.className = "btn btn-neon btn-block";
    btnBuy.textContent = "武器・防具を買う";
    btnBuy.addEventListener("click", () => {
      openSubmenu("shop_buy", "装備の購入:");
    });
    optGrid.appendChild(btnBuy);

    const btnSell = document.createElement("button");
    btnSell.className = "btn btn-neon btn-block";
    btnSell.textContent = "道具を売る";
    btnSell.addEventListener("click", () => {
      openSubmenu("shop_sell", `売却 (バッグ: ${state.inventory.length}個) - 半値での引き取り:`);
    });
    optGrid.appendChild(btnSell);
  } else if (type === "shop_buy") {
    // List shop stock
    const stock = [
      { key: "HEAL_POTION", price: 60 },
      { key: "DAGGER", price: 50 },
      { key: "SHORT_SWORD", price: 150 },
      { key: "LONG_SWORD", price: 400 },
      { key: "KATANA", price: 1500 },
      { key: "SMALL_SHIELD", price: 80 },
      { key: "LARGE_SHIELD", price: 250 },
      { key: "ROBE", price: 30 },
      { key: "LEATHER_ARMOR", price: 120 },
      { key: "CHAIN_MAIL", price: 350 },
      { key: "PLATE_MAIL", price: 900 }
    ];

    stock.forEach(st => {
      const item = ITEMS[st.key];
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${item.name} (${st.price}G)`;
      if (state.gold < st.price || state.inventory.length >= 20) btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gold -= st.price;
        state.inventory.push(st.key);
        playSound("gold");
        addLog(`${item.name}を${st.price}ゴールドで購入した。`);
        saveAutosave();
        openSubmenu("shop_buy", "装備の購入:"); // refresh
      });
      optGrid.appendChild(btn);
    });
  } else if (type === "shop_sell") {
    if (state.inventory.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn btn-block";
      btn.textContent = "バッグは空っぽです";
      btn.disabled = true;
      optGrid.appendChild(btn);
    } else {
      state.inventory.forEach((itemKey, idx) => {
        const item = ITEMS[itemKey];
        // 50% price
        const value = Math.floor((item.price || 0) * 0.5);
        const btn = document.createElement("button");
        btn.className = "btn btn-neon btn-block";
        btn.textContent = `${item.name} (+${value}G)`;
        if (item.price === 0) btn.disabled = true; // quest items
        btn.addEventListener("click", () => {
          state.gold += value;
          state.inventory.splice(idx, 1);
          playSound("gold");
          addLog(`${item.name}を${value}ゴールドで売却した。`);
          saveAutosave();
          openSubmenu("shop_sell", `売却 (バッグ: ${state.inventory.length}個) - 半値での引き取り:`); // refresh
        });
        optGrid.appendChild(btn);
      });
    }
  } else if (type === "temple_main") {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      
      let price = 0;
      let text = "";
      if (char.status === "dead") {
        price = char.level * 50;
        text = `蘇生する (${price}G)`;
      } else if (char.status === "sleep" || char.status === "paralyze") {
        price = 20;
        text = `治療する (${price}G)`;
      } else {
        text = "健康";
      }

      btn.textContent = `${char.name} - ${text}`;
      if (price === 0 || state.gold < price) btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gold -= price;
        char.status = "ok";
        if (char.hp === 0) char.hp = 1;
        playSound("heal");
        addLog(`僧侶が祈りを捧げる... ${char.name}は正常な状態に戻った！`);
        saveAutosave();
        openSubmenu("temple_main", "カント寺院 - 蘇生と治療："); // refresh
      });
      optGrid.appendChild(btn);
    });
  }

  updateUI();
}

function closeSubmenu() {
  // Return to appropriate state
  if (state.gameState === "submenu") {
    if (menuContext.prevGameState) {
      state.gameState = menuContext.prevGameState;
      menuContext.prevGameState = null;
    } else {
      // Fallback
      if (menuContext.type.startsWith("shop") || menuContext.type.startsWith("temple")) {
        state.gameState = "town";
      } else if (menuContext.type.startsWith("combat")) {
        state.gameState = "combat";
      } else {
        state.gameState = "explore";
      }
    }
  }
  updateUI();
}

function goBackSubmenu() {
  if (state.gameState === "submenu" && menuHistory.length > 0) {
    const prev = menuHistory.pop();
    menuContext.actorIdx = prev.actorIdx;
    menuContext.spellName = prev.spellName;
    menuContext.itemKey = prev.itemKey;
    menuContext.itemIdx = prev.itemIdx;
    menuContext.slot = prev.slot;
    openSubmenu(prev.type, prev.title, true);
  } else {
    closeSubmenu();
  }
}

function openCampMenu() {
  openSubmenu("camp_main", "キャンプメニュー:");
}

function executeUtilitySpell() {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];

  caster.mp -= spell.cost;
  playSound("cast_spell");
  
  const result = spell.effect(caster, state);
  addLog(result.log);
  
  saveAutosave();
  closeSubmenu();
}

function executeAllySpell(targetIdx) {
  const caster = state.party[menuContext.actorIdx];
  const spell = SPELLS[menuContext.spellName];
  const target = state.party[targetIdx];

  caster.mp -= spell.cost;
  playSound("cast_spell");

  const result = spell.effect(caster, target);
  addLog(result.log);
  
  if (result.heal) {
    playSound("heal");
    renderer.addDamageText(`+${result.heal}`, "#00ff66");
  }

  saveAutosave();
  closeSubmenu();
}

// ----------------------------------------------------
// TREASURE CHEST EVENTS
// ----------------------------------------------------
function setupChestState() {
  // Traps are levels dependent
  const traps = ["poison needle", "gas bomb", "teleporter", "none"];
  const randIdx = Math.floor(Math.random() * traps.length);
  const trap = traps[randIdx];

  // Gold reward
  const gold = Math.floor(Math.random() * 80) + 20;

  // Item reward (50% chance of random item)
  let item = null;
  if (Math.random() < 0.50) {
    const itemKeys = Object.keys(ITEMS).filter(k => k !== "ANTIGRAVITY_CRYSTAL");
    const randItemIdx = Math.floor(Math.random() * itemKeys.length);
    item = itemKeys[randItemIdx];
  }

  state.chestState = {
    trap,
    gold,
    item,
    inspected: false,
    identifiedTrap: ""
  };
  
  // Transition to chest submenu
  openChestMenu();
}

function openChestMenu() {
  state.gameState = "submenu";
  menuContext.type = "chest_menu";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = "宝箱の調査・解除";

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  const translateTrap = (t) => {
    if (t === "poison needle") return "毒針";
    if (t === "gas bomb") return "ガス爆弾";
    if (t === "teleporter") return "テレポーター";
    return "なし";
  };

  // Inspect Chest
  const btnInspect = document.createElement("button");
  btnInspect.className = "btn btn-neon btn-block";
  btnInspect.textContent = "罠を調べる";
  btnInspect.addEventListener("click", () => {
    // Thief class has high inspect rate, others low
    const thief = state.party.find(c => c.class === "Thief" && c.status === "ok");
    const chance = thief ? 0.85 : 0.30;
    state.chestState.inspected = true;
    
    if (Math.random() < chance) {
      state.chestState.identifiedTrap = state.chestState.trap;
      addLog(`調査結果：[${translateTrap(state.chestState.trap)}]の罠のようだ！`);
    } else {
      // Pick random false trap
      const falseTraps = ["poison needle", "gas bomb", "teleporter", "none"];
      const randTrap = falseTraps[Math.floor(Math.random() * falseTraps.length)];
      state.chestState.identifiedTrap = randTrap;
      addLog(`調査結果：[${translateTrap(randTrap)}]の罠の可能性が高い。（不確実）`);
    }
    playSound("move");
    openChestMenu(); // redraw
  });
  optGrid.appendChild(btnInspect);

  // Disarm Chest
  const btnDisarm = document.createElement("button");
  btnDisarm.className = "btn btn-neon btn-block";
  btnDisarm.textContent = "罠を解除する";
  if (!state.chestState.inspected) btnDisarm.disabled = true;
  btnDisarm.addEventListener("click", () => {
    openSubmenu("chest_disarmer_select", "罠を解除するキャラクターを選択：");
  });
  optGrid.appendChild(btnDisarm);

  // Open Chest
  const btnOpen = document.createElement("button");
  btnOpen.className = "btn btn-neon btn-block";
  btnOpen.textContent = "宝箱を開ける";
  btnOpen.addEventListener("click", () => {
    openChestDirectly();
  });
  optGrid.appendChild(btnOpen);

  // Leave Chest
  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.addEventListener("click", () => {
    addLog("宝箱を開けずに立ち去った。");
    // Clear chest event on current cell
    state.map[state.y][state.x].event = null;
    state.gameState = "explore";
    saveAutosave();
    updateUI();
  });
  optGrid.appendChild(btnLeave);
  
  // Custom back button disable because we are in event
  document.getElementById("btn-submenu-back").style.display = "none";
  updateUI();
}

// Resets back button view
function resetSubmenuBackButton() {
  document.getElementById("btn-submenu-back").style.display = "block";
}

// Override disarm characters selection
// Add listener to submenu buttons
window.addEventListener("click", (e) => {
  if (state.gameState === "submenu" && menuContext.type === "chest_disarmer_select") {
    // Populate disarm action
    const optGrid = document.getElementById("submenu-options");
    optGrid.innerHTML = "";
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      const classJp = char.class === "Fighter" ? "戦士" : char.class === "Thief" ? "盗賊" : char.class === "Priest" ? "僧侶" : "魔術師";
      btn.textContent = `${char.name} (${classJp})`;
      if (char.status !== "ok") btn.disabled = true;
      btn.addEventListener("click", () => {
        executeDisarm(char);
      });
      optGrid.appendChild(btn);
    });
  }
});

function executeDisarm(char) {
  const chance = char.class === "Thief" ? 0.85 : 0.25;
  const success = Math.random() < chance;
  
  if (success) {
    addLog(`解除成功！${char.name}は無事に罠を解除した。`);
    state.chestState.trap = "none";
    playSound("heal");
  } else {
    addLog(`解除失敗！${char.name}は罠を作動させてしまった！`);
    triggerChestTrap(char);
  }
  
  // Open the chest after disarm attempt resolves
  setTimeout(() => {
    openChestDirectly();
  }, 1500);
}

function triggerChestTrap(char) {
  const trap = state.chestState.trap;
  playSound("chest_trap");
  renderer.triggerShake(10, 400);

  if (trap === "poison needle") {
    char.hp = Math.max(0, char.hp - 12);
    char.status = char.hp === 0 ? "dead" : "ok"; // Simplified poison
    addLog(`毒針が作動！${char.name}は12のダメージを受けた。`);
    renderer.addDamageText("12", "#ff3b30");
  } else if (trap === "gas bomb") {
    addLog("ガス爆弾が作動！パーティ全体にガスが充満した！");
    state.party.forEach(c => {
      if (c.status === "ok") {
        const dmg = Math.floor(Math.random() * 8) + 5; // 5-12
        c.hp = Math.max(0, c.hp - dmg);
        if (c.hp === 0) c.status = "dead";
        addLog(`${c.name}は${dmg}のガスダメージを受けた。`);
      }
    });
  } else if (trap === "teleporter") {
    // Teleport to random coordinates inside map paths
    // Find empty spots (must not be isolated "stone/wall" cells - i.e. must have at least one open wall)
    const emptySpots = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const cell = state.map[y][x];
        const isPassable = cell.walls.some(closed => !closed);
        if (isPassable && cell.event !== "boss") {
          emptySpots.push({ x, y });
        }
      }
    }
    const spot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
    state.x = spot.x;
    state.y = spot.y;
    state.visitedMap[state.y][state.x] = true;
    addLog("テレポーターが作動！パーティは別の場所にテレポートした！");
  }
}

function openChestDirectly() {
  const chest = state.chestState;
  
  const translateTrap = (t) => {
    if (t === "poison needle") return "毒針";
    if (t === "gas bomb") return "ガス爆弾";
    if (t === "teleporter") return "テレポーター";
    return "なし";
  };

  // If trap is still active, trigger on character 1
  if (chest.trap !== "none") {
    const opener = state.party.find(c => c.status === "ok") || state.party[0];
    addLog(`宝箱を開けた瞬間、罠 [${translateTrap(chest.trap)}] が作動した！`);
    triggerChestTrap(opener);
  }

  // Award Gold
  state.gold += chest.gold;
  addLog(`宝箱から ${chest.gold} ゴールドを見つけた！`);
  
  // Award Item
  if (chest.item) {
    const item = ITEMS[chest.item];
    state.inventory.push(chest.item);
    addLog(`アイテム: [${item.name}] を手に入れた！`);
  }

  // Clear chest event on current cell
  state.map[state.y][state.x].event = null;

  // Check game over
  const partyAlive = state.party.some(c => c.status === "ok");
  
  setTimeout(() => {
    resetSubmenuBackButton();
    if (!partyAlive) {
      triggerGameOver();
    } else {
      state.gameState = "explore";
      saveAutosave();
      updateUI();
    }
  }, 1800);
}

// ----------------------------------------------------
// COMBAT SYSTEM
// ----------------------------------------------------
function startCombat(isBoss) {
  state.gameState = "combat";
  
  // Choose monsters
  const monsters = [];
  if (isBoss) {
    // Ancient Dragon Boss
    const dragonTemplate = MONSTERS.find(m => m.isBoss);
    monsters.push({
      ...dragonTemplate,
      hp: dragonTemplate.hp,
      maxHp: dragonTemplate.hp
    });
  } else {
    // Regular random encounter
    // Choose 1-3 monsters matching party level
    const avgLevel = Math.round(state.party.reduce((sum, c) => sum + c.level, 0) / state.party.length);
    const count = Math.floor(Math.random() * 3) + 1; // 1-3
    
    // Filter templates close to level
    const candidates = MONSTERS.filter(m => !m.isBoss && Math.abs(m.level - avgLevel) <= 1);
    
    for (let i = 0; i < count; i++) {
      const template = candidates[Math.floor(Math.random() * candidates.length)] || MONSTERS[0];
      // Letters A, B, C
      const suffix = count > 1 ? ` ${String.fromCharCode(65 + i)}` : "";
      monsters.push({
        ...template,
        name: template.name + suffix,
        hp: template.hp,
        maxHp: template.hp
      });
    }
  }

  state.combatState = {
    monsters,
    phase: "choose_actions",
    isBoss
  };

  combatSelection.charIdx = 0;
  combatSelection.actions = [];

  addLog(`戦闘開始！敵が現れた：${monsters.map(m => m.name).join(", ")}`);
  
  // Check if first character needs choice (if alive)
  advanceActionSelection();
}

function advanceActionSelection() {
  // Find next living character
  const livingIdxs = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok").map(x => x.i);
  
  const currentSelect = livingIdxs[combatSelection.charIdx];
  if (combatSelection.charIdx >= livingIdxs.length) {
    // All characters chose actions! Run turn resolution.
    resolveCombatRound();
  } else {
    updateUI();
  }
}

function selectCombatAction(type) {
  if (!state.combatState || state.combatState.phase !== "choose_actions") return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok");
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
        });
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

function cancelCombatAction() {
  if (!state.combatState || state.combatState.phase !== "choose_actions") return;
  if (combatSelection.charIdx > 0) {
    combatSelection.actions.pop();
    combatSelection.charIdx--;
    playSound("move");
    updateUI();
  }
}

function openCombatTargetMenu(type, callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_target";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = type === "enemy" ? "攻撃対象の敵を選択してください:" : "回復・支援対象の味方を選択してください:";

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  if (type === "enemy") {
    const monsters = state.combatState.monsters;
    monsters.forEach((m, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${m.name} (HP:${m.hp}/${m.maxHp})`;
      if (m.hp <= 0) btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gameState = "combat";
        callback(idx);
      });
      optGrid.appendChild(btn);
    });
  } else {
    // Ally targeting
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-block";
      btn.textContent = `${char.name} (HP:${char.hp}/${char.maxHp})`;
      if (char.status === "dead") btn.disabled = true;
      btn.addEventListener("click", () => {
        state.gameState = "combat";
        callback(idx);
      });
      optGrid.appendChild(btn);
    });
  }
  updateUI();
}

function openCombatSpellMenu(char, callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_spell";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = `Spell Cast - ${char.name} (MP:${char.mp}/${char.maxMp}):`;

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  char.spells.forEach(spKey => {
    const spell = SPELLS[spKey];
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    btn.textContent = `${spell.name} (MP:${spell.cost}) - ${spell.desc}`;
    if (char.mp < spell.cost) btn.disabled = true;
    btn.addEventListener("click", () => {
      state.gameState = "combat";
      callback(spKey);
    });
    optGrid.appendChild(btn);
  });
  updateUI();
}

function openCombatItemMenu(callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_item";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = "使用する道具を選択:";

  const optGrid = document.getElementById("submenu-options");
  optGrid.innerHTML = "";

  state.inventory.forEach((itemKey, idx) => {
    const item = ITEMS[itemKey];
    const btn = document.createElement("button");
    btn.className = "btn btn-neon btn-block";
    btn.textContent = `${item.name}`;
    if (item.type !== "usable") btn.disabled = true;
    btn.addEventListener("click", () => {
      state.gameState = "combat";
      callback(itemKey, idx);
    });
    optGrid.appendChild(btn);
  });
  updateUI();
}

// ----------------------------------------------------
// ROUND RESOLUTION
// ----------------------------------------------------
export function resolveCombatRound() {
  state.gameState = "combat";
  state.combatState.phase = "resolving";
  document.getElementById("btn-submenu-back").style.display = "none";
  
  const logQueue = [];
  const monsters = state.combatState.monsters;

  // Build Turn Order: All active characters + all active monsters
  const turns = [];

  // Characters
  state.party.forEach((char, idx) => {
    if (char.status === "ok") {
      const chosen = combatSelection.actions.find(a => a.actorIdx === idx);
      const speed = char.agi + Math.floor(Math.random() * 10);
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
    if (turn.type === "char") {
      const char = turn.char;
      if (char.status !== "ok") return; // Died/slept earlier in the round
      
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
        
        // Attack math
        const atkVal = char.str + getCharWeaponAtk(char);
        const randRoll = Math.floor(Math.random() * 5); // 0-4
        const dmg = Math.max(1, atkVal + randRoll - finalTarget.def);
        
        finalTarget.hp = Math.max(0, finalTarget.hp - dmg);
        logQueue.push({
          msg: `[味方] ${char.name}の攻撃！${finalTarget.name}に${dmg}のダメージ。`,
          sound: "hit",
          shake: 8,
          floatText: `${dmg}`,
          floatColor: finalTarget.color
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
          logQueue.push({
            msg: `[味方] ${result.log}`,
            sound: "heal",
            floatText: `+${result.heal}`,
            floatColor: "#00ff66"
          });
        }
      } else if (act.type === "item") {
        const item = ITEMS[act.itemKey];
        const target = state.party[act.targetIdx];
        const log = item.effect(target);
        state.inventory.splice(act.itemIdx, 1);
        logQueue.push({
          msg: `[味方] ${log}`,
          sound: "heal",
          floatText: `+15`,
          floatColor: "#00ff66"
        });
      } else if (act.type === "defend") {
        logQueue.push({ msg: `[味方] ${char.name}は身を固めて防御している。` });
      } else if (act.type === "run") {
        if (state.combatState.isBoss) {
          logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、竜の前からは逃げられない！` });
        } else {
          const escape = Math.random() < 0.40;
          if (escape) {
            logQueue.push({
              msg: "[味方] パーティは戦闘から逃げ出した！",
              sound: "miss",
              runEscape: true
            });
          } else {
            logQueue.push({ msg: `[味方] ${char.name}は逃げ出そうとしたが、失敗した！` });
          }
        }
      }
    } else {
      const mon = turn.mon;
      if (mon.hp <= 0) return;

      const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => x.c.status === "ok");
      if (livingChars.length === 0) return;

      const targetSelect = livingChars[Math.floor(Math.random() * livingChars.length)];
      const target = targetSelect.c;

      if (mon.spell && Math.random() < 0.20) {
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
            if (c.status === "ok") {
              const dmg = Math.floor(Math.random() * 15) + 10;
              c.hp = Math.max(0, c.hp - dmg);
              if (c.hp === 0) c.status = "dead";
              logQueue.push({ msg: `[ 敵 ] ${c.name}は${dmg}の炎ダメージを受けた。` });
            }
          });
        }
      } else {
        const isDefending = combatSelection.actions.some(a => a.actorIdx === targetSelect.i && a.type === "defend");
        const finalAtk = mon.atk + Math.floor(Math.random() * 4);
        const finalDef = getCharDef(target);
        let dmg = Math.max(1, finalAtk - finalDef);
        if (isDefending) dmg = Math.max(1, Math.round(dmg * 0.5));
        target.hp = Math.max(0, target.hp - dmg);
        logQueue.push({
          msg: `[ 敵 ] ${mon.name}の攻撃！${target.name}に${dmg}のダメージ！`,
          sound: "hit",
          shake: 8,
          floatText: `${dmg}`,
          floatColor: "#ff3b30"
        });
      }

      if (target.hp === 0) {
        target.status = "dead";
        logQueue.push({ msg: `[ 敵 ] [!] ${target.name}は倒れた！` });
      }
    }
  });

  const allMonstersDead = monsters.every(m => m.hp <= 0);
  if (allMonstersDead) {
    const totalExp = monsters.reduce((sum, m) => sum + m.exp, 0);
    const totalGold = monsters.reduce((sum, m) => sum + m.gold, 0);
    const livingChars = state.party.filter(c => c.status === "ok");
    const expShare = Math.round(totalExp / livingChars.length);

    logQueue.push({ msg: "======================================" });
    logQueue.push({
      msg: `戦闘に勝利した！パーティは${totalGold}ゴールドを獲得した。`,
      sound: "level_up"
    });

    state.gold += totalGold;

    livingChars.forEach(c => {
      c.exp += expShare;
      logQueue.push({ msg: `${c.name}は${expShare}の経験値を得た。` });
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
    });

    logQueue.push({ msg: "======================================" });

    if (state.combatState.isBoss) {
      logQueue.push({
        msg: "ついに伝説の [浮遊石 (クリスタル)] を手に入れた！おしろに持ち帰ろう！",
        sound: "gold",
        giveCrystal: true
      });
    } else {
      if (Math.random() < 0.40) {
        logQueue.push({
          msg: "モンスターが宝箱を残していった！",
          triggerChest: true
        });
      } else {
        logQueue.push({
          msg: "周囲に静寂が戻った。",
          endCombat: true
        });
      }
    }
  }

  playBattleLogs(logQueue, 0);
}

function playBattleLogs(queue, index) {
  if (index >= queue.length) {
    checkCombatStatus();
    return;
  }

  const log = queue[index];

  if (log.sound) playSound(log.sound);
  if (log.shake) renderer.triggerShake(log.shake, 250);
  if (log.flash) renderer.triggerFlash(200);
  if (log.floatText) renderer.addDamageText(log.floatText, log.floatColor);

  addLog(log.msg);
  updateUI();

  if (log.runEscape) {
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  if (log.giveCrystal) {
    state.inventory.push("ANTIGRAVITY_CRYSTAL");
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 3000);
    return;
  }

  if (log.triggerChest) {
    setTimeout(() => {
      state.gameState = "chest";
      setupChestState();
    }, 1500);
    return;
  }

  if (log.endCombat) {
    setTimeout(() => {
      state.gameState = "explore";
      state.combatState = null;
      resetSubmenuBackButton();
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  const delay = log.msg.startsWith("[!]") || log.msg.includes("[★]") ? 1200 : 700;
  setTimeout(() => {
    playBattleLogs(queue, index + 1);
  }, delay);
}

function checkCombatStatus() {
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
  state.gameState = "gameover";
  addLog("**************************************************");
  addLog("パーティは全滅した。");
  addLog("冒険者たちの旅は深い暗闇の中で途絶えた。");
  addLog("「おしろから再開」または「最初からやり直す」を選択してください。");
  addLog("**************************************************");
  // Allow reload or reset from sub-menu
  openSubmenu("gameover_main", "全滅：次のオプションを選択してください");
  // Hide normal back button
  document.getElementById("btn-submenu-back").style.display = "none";
}
