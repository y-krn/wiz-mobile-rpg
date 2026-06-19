import { state, saveAutosave, addLog } from "./state.js";
import { ITEMS, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { menuContext, openSubmenu, goBackSubmenu, closeSubmenu } from "./menu.js";
import { triggerGameOver } from "./combat.js";

export function setupChestState() {
  // Traps are floor dependent
  let traps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
  if (state.floor === 2) {
    // B2F: Moderate poison needle rate (around 28% chance)
    traps = ["poison needle", "poison needle", "gas bomb", "teleporter", "flash bomb", "none", "none"];
  } else if (state.floor === 4) {
    // B4F: Higher teleporter and gas bomb chance, no "none"
    traps = ["gas bomb", "teleporter", "teleporter", "flash bomb", "poison needle"];
  } else if (state.floor === 5) {
    // B5F: Extremely dangerous traps, high chance of teleporter
    traps = ["gas bomb", "teleporter", "teleporter", "poison needle", "flash bomb"];
  }
  const randIdx = Math.floor(Math.random() * traps.length);
  const trap = traps[randIdx];

  // Gold reward scale by floor
  let gold = Math.floor(Math.random() * 81) + 20; // Default 20-100G
  if (state.floor === 4) {
    gold = Math.floor(Math.random() * 201) + 100; // B4F: 100-300G
  } else if (state.floor === 5) {
    gold = Math.floor(Math.random() * 301) + 150; // B5F: 150-450G
  }

  // Item reward scale by floor
  let item = null;
  const itemChance = state.floor === 4 ? 0.75 : 0.50; // B4F has high item drop rate
  if (Math.random() < itemChance) {
    let candidates = [];
    if (state.floor === 1) {
      candidates = ["DAGGER", "WAND", "MACE", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "HEAL_POTION", "ANTIDOTE"];
    } else if (state.floor === 2) {
      candidates = ["DAGGER", "WAND", "SHORT_SWORD", "MACE", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "SCALE_MAIL", "MAGE_CLOAK", "HEAL_POTION", "ANTIDOTE", "MANA_POTION", "HOLY_WATER", "TOWN_PORTAL"];
    } else if (state.floor === 3) {
      candidates = ["SHORT_SWORD", "NINJA_DAGGER", "LONG_SWORD", "MACE", "SMALL_SHIELD", "LARGE_SHIELD", "LEATHER_ARMOR", "NINJA_SUIT", "SCALE_MAIL", "CHAIN_MAIL", "HEAL_POTION", "MANA_POTION", "HOLY_WATER", "TOWN_PORTAL"];
    } else if (state.floor === 4) {
      // B4F: Standard standard chests only drop high-level store gear (e.g. Katana, Claymore)
      candidates = ["CLAYMORE", "KATANA", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "NINJA_DAGGER", "NINJA_SUIT", "CHAIN_MAIL", "HOLY_WATER"];
    } else if (state.floor === 5) {
      // B5F: Standard standard chests drop high-level gear
      candidates = ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "HOLY_WATER", "TOWN_PORTAL"];
    }

    if (candidates.length > 0) {
      item = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      const itemKeys = Object.keys(ITEMS).filter(k => k !== "ANTIGRAVITY_CRYSTAL");
      const randItemIdx = Math.floor(Math.random() * itemKeys.length);
      item = itemKeys[randItemIdx];
    }
  }

  state.chestState = {
    trap,
    gold,
    item,
    inspected: false,
    identifiedTrap: "",
    x: state.x,
    y: state.y
  };
  
  // Transition to chest submenu
  openChestMenu();
}

export function openChestMenu() {
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
    if (t === "flash bomb") return "閃光弾";
    return "なし";
  };

  // Create Info Panel for Chest Details & Floor Risks
  const infoPanel = document.createElement("div");
  infoPanel.style.marginBottom = "12px";
  infoPanel.style.padding = "10px";
  infoPanel.style.border = "1px solid #3a3a4c";
  infoPanel.style.borderRadius = "4px";
  infoPanel.style.backgroundColor = "rgba(27, 27, 34, 0.6)";
  infoPanel.style.fontSize = "12px";
  infoPanel.style.fontFamily = "var(--font-mono)";
  infoPanel.style.lineHeight = "1.5";

  // 1. Floor Risk Warning
  let riskText = "";
  if (state.floor === 1 || state.floor === 3) {
    riskText = `<span style="color:var(--neon-yellow)">[階層情報] 宝箱の罠遭遇率：高 (約80%)</span>`;
  } else if (state.floor === 2) {
    riskText = `<span style="color:var(--neon-green)">[階層情報] 宝箱の罠遭遇率：中 (約70%)</span>`;
  } else if (state.floor === 4) {
    riskText = `<span style="color:var(--neon-red)">[警告] この階の宝箱はすべて罠付き。転移の罠に警戒せよ！</span>`;
  } else if (state.floor === 5) {
    riskText = `<span style="color:var(--neon-red)">[警告] この階の宝箱はすべて罠付き。転移の罠に警戒せよ！<br>(※移動時の床の火炎トラップにも注意)</span>`;
  }

  // 2. Inspection result
  let inspectText = "";
  if (!state.chestState.inspected) {
    inspectText = `<span style="color:var(--text-muted)">推定された宝箱の罠: 未調査</span>`;
  } else {
    const trapNameJp = translateTrap(state.chestState.identifiedTrap);
    const chance = state.chestState.inspectChance || 0;
    let reliability = "極低";
    let reliabilityColor = "var(--neon-red)";
    if (chance >= 0.8) {
      reliability = "高";
      reliabilityColor = "var(--neon-green)";
    } else if (chance >= 0.4) {
      reliability = "中";
      reliabilityColor = "var(--neon-yellow)";
    } else if (chance >= 0.3) {
      reliability = "低";
      reliabilityColor = "#ff9f0a"; // orange
    }
    inspectText = `推定された宝箱の罠: <strong style="color:var(--neon-cyan)">${trapNameJp}</strong> (信頼度: <span style="color:${reliabilityColor}">${reliability}</span>)`;
  }

  // 3. Traps Help
  const helpText = `<div style="font-size:10px; color:var(--text-muted); border-top:1px solid #3a3a4c; margin-top:8px; padding-top:6px;">
【宝箱の罠効果】<br>
毒針:単体ダメージ+毒 | ガス爆弾:全体ダメージ<br>
テレポーター:ランダム転移 | 閃光弾:全体盲目
</div>`;

  infoPanel.innerHTML = `
    <div>${riskText}</div>
    <div style="margin-top:6px;">${inspectText}</div>
    ${helpText}
  `;
  optGrid.appendChild(infoPanel);

  // Inspect Chest
  const btnInspect = document.createElement("button");
  btnInspect.className = "btn btn-neon btn-block";
  btnInspect.textContent = "罠を調べる";
  btnInspect.addEventListener("click", () => {
    // Thief class has high inspect rate, others low
    const thief = state.party.find(c => c.class === "Thief" && ["ok", "poisoned", "blind"].includes(c.status));
    let chance = thief ? 0.85 : 0.30;
    if (thief && thief.status === "blind") {
      chance = chance / 2.0;
    } else if (!thief) {
      const activeChar = state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status));
      if (activeChar && activeChar.status === "blind") {
        chance = chance / 2.0;
      }
    }
    state.chestState.inspected = true;
    state.chestState.inspectChance = chance; // Save inspect success rate for reliability display
    
    if (Math.random() < chance) {
      state.chestState.identifiedTrap = state.chestState.trap;
      addLog(`調査結果：[${translateTrap(state.chestState.trap)}]の罠のようだ！`);
    } else {
      // Pick random false trap
      const falseTraps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
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
  if (!state.chestState.inspected) {
    btnDisarm.textContent = "罠を解除する（要調査）";
    btnDisarm.disabled = true;
  } else {
    btnDisarm.textContent = "罠を解除する";
  }
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
    if (state.floorChestsOpened) {
      state.floorChestsOpened[state.floor - 1] = (state.floorChestsOpened[state.floor - 1] ?? 0) + 1;
    }
    state.chestState = null;
    state.gameState = "explore";
    saveAutosave();
    updateUI();
  });
  optGrid.appendChild(btnLeave);
  
  // Custom back button disable because we are in event
  document.getElementById("btn-submenu-back").style.display = "none";
  updateUI();
}

export function resetSubmenuBackButton() {
  document.getElementById("btn-submenu-back").style.display = "block";
}


export function executeDisarm(char) {
  let chance = 0.25;
  if (char.class === "Thief") {
    chance = 0.85;
  } else if (char.class === "Ranger") {
    chance = 0.60;
  }
  if (char.status === "blind") {
    chance = chance / 2.0;
  }
  const success = Math.random() < chance;
  
  state.transitioning = true;
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

export function triggerChestTrap(char) {
  if (!state.chestState || state.chestState.trap === "none") return;
  const trap = state.chestState.trap;
  state.chestState.trap = "none";
  playSound("chest_trap");
  if (renderer) renderer.triggerShake(10, 400);

  if (trap === "poison needle") {
    char.hp = Math.max(0, char.hp - 12);
    char.status = char.hp === 0 ? "dead" : "poisoned";
    addLog(`毒針が作動！${char.name}は12のダメージを受け、毒状態になった！`);
    if (renderer) renderer.addDamageText("12", "#ff3b30");
  } else if (trap === "gas bomb") {
    addLog("ガス爆弾が作動！パーティ全体にガスが充満した！");
    state.party.forEach(c => {
      if (c.status !== "dead") {
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
  } else if (trap === "flash bomb") {
    addLog("閃光弾が作動！まばゆい光がパーティを包み込んだ！");
    if (renderer && typeof renderer.triggerFlash === "function") {
      renderer.triggerFlash(400);
    }
    state.party.forEach(c => {
      if (c.status === "ok" && Math.random() < 0.60) {
        c.status = "blind";
        addLog(`${c.name}は光に目がくらみ、盲目状態になった！`);
      }
    });
  }
}

export function openChestDirectly() {
  state.transitioning = true;
  const chest = state.chestState;
  const chestMap = state.map;
  const chestX = chest.x;
  const chestY = chest.y;
  
  const translateTrap = (t) => {
    if (t === "poison needle") return "毒針";
    if (t === "gas bomb") return "ガス爆弾";
    if (t === "teleporter") return "テレポーター";
    if (t === "flash bomb") return "閃光弾";
    return "なし";
  };

  // If trap is still active, trigger on character 1
  if (chest.trap !== "none") {
    const opener = state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status)) || state.party[0];
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

  // Clear the original chest cell even if a trap moved the party.
  chestMap[chestY][chestX].event = null;
  if (state.floorChestsOpened) {
    state.floorChestsOpened[state.floor - 1] = (state.floorChestsOpened[state.floor - 1] ?? 0) + 1;
  }

  // Check game over
  const partyAlive = state.party.some(c => c.status !== "dead");
  
  setTimeout(() => {
    resetSubmenuBackButton();
    state.transitioning = false;
    if (!partyAlive) {
      triggerGameOver();
    } else {
      state.chestState = null;
      state.gameState = "explore";
      saveAutosave();
      updateUI();
    }
  }, 1800);
}
