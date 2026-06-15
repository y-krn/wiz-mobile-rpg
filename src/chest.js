import { state, saveAutosave, addLog } from "./state.js";
import { ITEMS, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { menuContext, openSubmenu, goBackSubmenu, closeSubmenu } from "./menu.js";
import { triggerGameOver } from "./combat.js";

export function setupChestState() {
  // Traps are levels dependent
  const traps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
  const randIdx = Math.floor(Math.random() * traps.length);
  const trap = traps[randIdx];

  // Gold reward
  const gold = Math.floor(Math.random() * 81) + 20;


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
  const trap = state.chestState.trap;
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
  const chestX = state.x;
  const chestY = state.y;
  
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
