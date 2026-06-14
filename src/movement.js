import { state, saveAutosave, addLog } from "./state.js";
import { DIR_N, START_X, START_Y, DX, DY, DIR_NAMES, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { startCombat, triggerGameOver } from "./combat.js";
import { setupChestState } from "./chest.js";

export function handleMove(action) {
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
      
      // Mark as visited
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩進んだ。現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}`);

      // Apply poison damage
      const wiped = applyExplorationPoison();
      if (!wiped) {
        // Check coordinates trigger events
        checkCellEvents();
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
      if (state.lightTurns > 0) state.lightTurns--;
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩下がった。現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}`);
      
      // Apply poison damage
      const wiped = applyExplorationPoison();
      if (!wiped) {
        checkCellEvents();
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

export function checkCellEvents() {
  const cell = state.map[state.y][state.x];

  // Stairs Up (exit to town or go to B1F)
  if (cell.type === "stairs-up") {
    if (state.floor === 1) {
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
    } else {
      addLog("階段を上がります。地下1階へ...");
      playSound("move");
      setTimeout(() => {
        state.floor = 1;
        const target = findCellCoordsByType(state.maps[0], "stairs-down");
        state.x = target.x;
        state.y = target.y;
        state.visitedMap[state.y][state.x] = true;
        addLog("地下1階に上った。");
        saveAutosave();
        updateUI();
      }, 1200);
    }
    return;
  }

  // Stairs Down (go to B2F)
  if (cell.type === "stairs-down") {
    addLog("階段を下ります。地下2階へ...");
    playSound("move");
    setTimeout(() => {
      state.floor = 2;
      const target = findCellCoordsByType(state.maps[1], "stairs-up");
      state.x = target.x;
      state.y = target.y;
      state.visitedMap[state.y][state.x] = true;
      addLog("地下2階に降りた。さらに強い殺気を感じる...");
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
