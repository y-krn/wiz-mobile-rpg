import { state, saveAutosave, addLog } from "./state.js";
import { DIR_N, START_X, START_Y, DX, DY, DIR_NAMES, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { startCombat, triggerGameOver } from "./combat.js";
import { setupChestState } from "./chest.js";
import { openSubmenu } from "./menu.js";

export function handleMove(action) {
  playSound("move");
  
  const prevX = state.x;
  const prevY = state.y;
  
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
      if (renderer) renderer.triggerShake(4, 150);
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
      
      // Update repel turns
      if (state.repelTurns > 0) {
        state.repelTurns--;
        if (state.repelTurns === 0) {
          addLog("マスペアルの効果が切れた。モンスターの殺気が戻った。");
        }
      }
      
      // Mark as visited
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩進んだ。現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}`);

      // Apply poison damage
      const wiped = applyExplorationPoison();
      if (!wiped) {
        // Check coordinates trigger events
        checkCellEvents(prevX, prevY);
      }
    }
  } else if (action === "backward") {
    const currentCell = state.map[state.y][state.x];
    const backDir = (state.dir + 2) % 4;
    if (currentCell.walls[backDir]) {
      playSound("bump");
      if (renderer) renderer.triggerShake(4, 150);
      addLog("下がれない。後ろは壁だ。");
    } else {
      state.x += DX[backDir];
      state.y += DY[backDir];
      if (state.lightTurns > 0) {
        state.lightTurns--;
        if (state.lightTurns === 0) {
          addLog("明かりの呪文の効果が切れた。暗闇に包まれた。");
        }
      }
      if (state.repelTurns > 0) {
        state.repelTurns--;
        if (state.repelTurns === 0) {
          addLog("マスペアルの効果が切れた。モンスターの殺気が戻った。");
        }
      }
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩下がった。現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}`);
      
      // Apply poison damage
      const wiped = applyExplorationPoison();
      if (!wiped) {
        checkCellEvents(prevX, prevY);
      }
    }
  }
  
  saveAutosave();
  updateUI();
}

export function findCellCoordsByType(grid, type) {
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (grid[y] && grid[y][x] && grid[y][x].type === type) {
        return { x, y };
      }
    }
  }
  return { x: MAP_WIDTH - 2, y: 1 }; // Default fallback coordinate
}

export function checkCellEvents(prevX = START_X, prevY = START_Y) {
  const cell = state.map[state.y][state.x];

  // Stairs Up (exit to town or go to previous floor)
  if (cell.type === "stairs-up") {
    if (state.floor === 1) {
      state.transitioning = true;
      addLog("階段を上がります。リルガミンの街へ戻る...");
      setTimeout(() => {
        state.gameState = "town";
        state.x = START_X;
        state.y = START_Y;
        state.dir = DIR_N;
        addLog("リルガミンの街に戻り、体力を回復しました。");
        state.transitioning = false;
        saveAutosave();
        updateUI();
      }, 1200);
    } else {
      state.transitioning = true;
      const prevFloor = state.floor - 1;
      addLog(`階段を上がります。地下${prevFloor}階へ...`);
      playSound("move");
      setTimeout(() => {
        state.floor = prevFloor;
        const target = findCellCoordsByType(state.maps[prevFloor - 1], "stairs-down");
        state.x = target.x;
        state.y = target.y;
        state.visitedMap[state.y][state.x] = true;
        addLog(`地下${prevFloor}階に上った。`);
        state.transitioning = false;
        saveAutosave();
        updateUI();
      }, 1200);
    }
    return;
  }

  // Stairs Down (go to next floor)
  if (cell.type === "stairs-down") {
    state.transitioning = true;
    const nextFloor = state.floor + 1;
    addLog(`階段を下ります。地下${nextFloor}階へ...`);
    playSound("move");
    setTimeout(() => {
      state.floor = nextFloor;
      const target = findCellCoordsByType(state.maps[nextFloor - 1], "stairs-up");
      state.x = target.x;
      state.y = target.y;
      state.visitedMap[state.y][state.x] = true;
      addLog(`地下${nextFloor}階に降りた。さらに強い殺気を感じる...`);
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, 1200);
    return;
  }

  // Custom cell message
  if (cell.message) {
    addLog(cell.message);
  }

  // Midboss encounter
  if (cell.event === "midboss") {
    state.transitioning = true;
    addLog("警告：ただならぬ気配を感じる！デーモンガードが立ちはだかった！");
    playSound("chest_trap");
    setTimeout(() => {
      state.transitioning = false;
      startCombat(false, true);
    }, 1000);
    return;
  }

  // Boss encounter
  if (cell.event === "boss") {
    if (!state.inventory.includes("DRAGON_KEY")) {
      addLog("扉は閉ざされている。「竜の鍵」がなければ開かないようだ…");
      playSound("bump");
      if (renderer) renderer.triggerShake(4, 150);
      state.x = prevX;
      state.y = prevY;
      return;
    }
    state.transitioning = true;
    addLog("竜の鍵を使って頑丈な扉を開けた！");
    addLog("警告：ただならぬ巨大な気配が立ちふさがる！戦闘準備！");
    playSound("chest_trap");
    setTimeout(() => {
      state.transitioning = false;
      startCombat(true, false);
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

  // Random Event (5% chance) on standard cells (not stairs, boss, chest, midboss, or message cells)
  const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                        cell.event === "midboss" || cell.event === "boss" || cell.event === "chest" ||
                        cell.message;
  if (!isSpecialCell && Math.random() < 0.05) {
    const events = ["event_spring", "event_tablet", "event_merchant"];
    const chosen = events[Math.floor(Math.random() * events.length)];
    if (chosen === "event_spring") {
      openSubmenu("event_spring", "怪しい泉を見つけた。澄んだ水が湧き出ている…");
    } else if (chosen === "event_tablet") {
      openSubmenu("event_tablet", "謎の石碑が立っている。古代の文字が刻まれている…");
    } else {
      openSubmenu("event_merchant", "フードを被ったさまよう商人が現れた！");
    }
    return;
  }

  // Random Encounter (10% chance)
  if ((!state.repelTurns || state.repelTurns <= 0) && Math.random() < 0.10) {
    state.transitioning = true;
    addLog("モンスターが暗闇から襲いかかってきた！");
    setTimeout(() => {
      state.transitioning = false;
      startCombat(false, false);
    }, 600);
  }
}

export function applyExplorationPoison() {
  let tookDamage = false;
  state.party.forEach(c => {
    if (c.status === "poisoned" && c.hp > 0) {
      const pDmg = Math.floor(Math.random() * 2) + 1; // 1-2 HP damage
      c.hp = Math.max(0, c.hp - pDmg);
      addLog(`[!] 毒のダメージ！${c.name}は${pDmg}のダメージを受けた。`);
      tookDamage = true;
      if (c.hp === 0) {
        c.status = "dead";
        addLog(`[!] ${c.name}は毒で力尽きた！`);
      }
    }
  });

  if (tookDamage) {
    playSound("hit");
    if (renderer) renderer.triggerShake(4, 150);
  }

  const allPartyDead = state.party.every(c => c.status === "dead");
  if (allPartyDead) {
    triggerGameOver();
    return true;
  }
  return false;
}

export function enterDungeon() {
  if (!state.party || state.party.length === 0) {
    addLog("【警告】迷宮に入るには、まずお城の「訓練場」でパーティを編成してください。");
    playSound("bump");
    updateUI();
    return;
  }
  state.gameState = "explore";
  state.floor = 1;
  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.visitedMap[state.y][state.x] = true;
  addLog(`地下${state.floor}階に降りた。冷たい石造りの暗闇が迫る...`);
  playSound("move");
  saveAutosave();
  updateUI();
}
