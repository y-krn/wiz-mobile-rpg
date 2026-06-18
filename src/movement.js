import { state, saveAutosave, addLog } from "./state.js";
import { DIR_N, START_X, START_Y, DX, DY, DIR_NAMES, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { playSound } from "./audio.js";
import { renderer } from "./game.js";
import { updateUI } from "./ui.js";
import { startCombat, triggerGameOver } from "./combat.js";
import { setupChestState } from "./chest.js";
import { openSubmenu } from "./menu.js";

export function handleMove(action) {
  if (state.transitioning || state.gameState !== "explore") return;
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
      
      // Update light turns (B2F: consume 2 turns per step)
      if (state.lightTurns > 0) {
        const cost = state.floor === 2 ? 2 : 1;
        state.lightTurns = Math.max(0, state.lightTurns - cost);
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
      
      // Update event cooldown turns
      if (state.eventCooldownTurns > 0) {
        state.eventCooldownTurns--;
      }
      
      // Mark as visited
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩進んだ。現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}`);

      // Apply poison damage
      const wiped = applyExplorationPoison();
      if (!wiped) {
        // Apply floor flame trap (B5F only, 5% chance)
        const cell = state.map[state.y][state.x];
        const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                              cell.event === "midboss" || cell.event === "boss" || cell.event === "chest" ||
                              cell.message;
        if (state.floor === 5 && !isSpecialCell && Math.random() < 0.05) {
          triggerFlameTrap();
        } else {
          // Check coordinates trigger events
          checkCellEvents(prevX, prevY);
        }
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
      // Update light turns (B2F: consume 2 turns per step)
      if (state.lightTurns > 0) {
        const cost = state.floor === 2 ? 2 : 1;
        state.lightTurns = Math.max(0, state.lightTurns - cost);
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
      
      // Update event cooldown turns
      if (state.eventCooldownTurns > 0) {
        state.eventCooldownTurns--;
      }
      state.visitedMap[state.y][state.x] = true;
      addLog(`一歩下がった。現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}`);
      
      // Apply poison damage
      const wiped = applyExplorationPoison();
      if (!wiped) {
        // Apply floor flame trap (B5F only, 5% chance)
        const cell = state.map[state.y][state.x];
        const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                              cell.event === "midboss" || cell.event === "boss" || cell.event === "chest" ||
                              cell.message;
        if (state.floor === 5 && !isSpecialCell && Math.random() < 0.05) {
          triggerFlameTrap();
        } else {
          checkCellEvents(prevX, prevY);
        }
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

function checkSensoryAura() {
  const px = state.x;
  const py = state.y;
  
  let nearestSpring = null;
  let nearestBoss = null;
  let nearestTablet = null;
  let nearestMerchant = null;
  let nearestStairs = null;
  let nearestChest = null;

  let minDistSpring = 999;
  let minDistBoss = 999;
  let minDistTablet = 999;
  let minDistMerchant = 999;
  let minDistStairs = 999;
  let minDistChest = 999;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    if (!state.map[y]) continue;
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (x === px && y === py) continue; // Skip current cell
      if (!state.map[y][x]) continue;

      const cell = state.map[y][x];
      const dist = Math.abs(x - px) + Math.abs(y - py);

      if (cell.event === "event_spring") {
        if (dist < minDistSpring) { minDistSpring = dist; nearestSpring = { x, y }; }
      } else if (cell.event === "boss" || cell.event === "midboss") {
        if (dist < minDistBoss) { minDistBoss = dist; nearestBoss = { x, y }; }
      } else if (cell.event === "event_tablet") {
        if (dist < minDistTablet) { minDistTablet = dist; nearestTablet = { x, y }; }
      } else if (cell.event === "event_merchant") {
        if (dist < minDistMerchant) { minDistMerchant = dist; nearestMerchant = { x, y }; }
      } else if (cell.event === "chest") {
        if (dist < minDistChest) { minDistChest = dist; nearestChest = { x, y }; }
      }

      if (cell.type === "stairs-up" || cell.type === "stairs-down") {
        if (dist < minDistStairs) { minDistStairs = dist; nearestStairs = { x, y }; }
      }
    }
  }

  // 1. Boss / Midboss magic aura (distance <= 3)
  if (minDistBoss <= 3 && nearestBoss) {
    const dy = nearestBoss.y - py;
    const dx = nearestBoss.x - px;
    let dirStr = "";
    if (Math.abs(dy) > Math.abs(dx)) {
      dirStr = dy < 0 ? "北" : "南";
    } else {
      dirStr = dx < 0 ? "西" : "東";
    }
    addLog(`【気配】${dirStr}の方からただならぬ魔力の気配を感じる…`);
  }

  // 2. Spring water sound (distance <= 2)
  if (minDistSpring <= 2 && nearestSpring) {
    addLog("【気配】近くからかすかに水音が聞こえる…");
  }

  // 3. Tablet magic wave (distance <= 2)
  if (minDistTablet <= 2 && nearestTablet) {
    addLog("【気配】近くの壁から弱い魔力の波動を感じる…");
  }

  // 4. Merchant footsteps/presence (distance <= 2)
  if (minDistMerchant <= 2 && nearestMerchant) {
    addLog("【気配】近くから静かな衣擦れの音が聞こえる気がする…");
  }

  // 5. Stairs wind draft (distance <= 2)
  if (minDistStairs <= 2 && nearestStairs) {
    addLog("【気配】どこからかかすかに風が流れてきている…近くに階段があるようだ。");
  }

  // 6. Chest hidden treasure vibe (distance <= 2)
  if (minDistChest <= 2 && nearestChest) {
    addLog("【気配】この近くに何かが隠されている気がする…");
  }
}

export function checkCellEvents(prevX = START_X, prevY = START_Y) {
  const cell = state.map[state.y][state.x];

  // Stairs Up (exit to town or go to previous floor)
  if (cell.type === "stairs-up") {
    if (state.floor === 1) {
      state.transitioning = true;
      addLog("階段を上がります。リルガミンの街へ戻る...");
      setTimeout(() => {
        state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);
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
        
        let floorMsg = `地下${prevFloor}階に上った。`;
        if (prevFloor === 1) {
          floorMsg = `地下1階に戻った。穏やかな風が吹いている...`;
        } else if (prevFloor === 2) {
          floorMsg = `地下2階に戻った。濃い暗闇と毒気が漂っている...`;
        } else if (prevFloor === 3) {
          floorMsg = `地下3階に戻った。中ボスの不気味な魔力の残滓を感じる...`;
        } else if (prevFloor === 4) {
          floorMsg = `地下4階に戻った。凶悪な強敵の気配が満ちている...`;
        }
        addLog(floorMsg);
        
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
      state.sessionMaxFloor = Math.max(state.sessionMaxFloor, state.floor);
      const target = findCellCoordsByType(state.maps[nextFloor - 1], "stairs-up");
      state.x = target.x;
      state.y = target.y;
      state.visitedMap[state.y][state.x] = true;
      
      let floorMsg = `地下${nextFloor}階に降りた。さらに強い殺気を感じる...`;
      if (nextFloor === 2) {
        floorMsg = `地下2階に降りた。鼻を突く毒気と、光を吸い込むような暗闇が漂っている...`;
      } else if (nextFloor === 3) {
        floorMsg = `地下3階に降りた。不気味な咆哮が木霊し、強大な門番が竜の鍵を握っている気配がする...`;
      } else if (nextFloor === 4) {
        floorMsg = `地下4階に降りた。ここは強者の領域。凶悪な魔物の気配と、伝説の財宝が眠っている予感がする...`;
      } else if (nextFloor === 5) {
        floorMsg = `地下5階：竜の領域に降りた。灼熱の熱気と強烈なプレッシャーが肌を刺す！`;
      }
      addLog(floorMsg);
      
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

  // Spring encounter
  if (cell.event === "event_spring") {
    openSubmenu("event_spring", "怪しい泉を見つけた。澄んだ水が湧き出ている…");
    return;
  }

  // Tablet encounter
  if (cell.event === "event_tablet") {
    openSubmenu("event_tablet", "謎の石碑が立っている。古代の文字が刻まれている…");
    return;
  }

  // Merchant encounter
  if (cell.event === "event_merchant") {
    openSubmenu("event_merchant", "フードを被ったさまよう商人が現れた！");
    return;
  }

  // Random Event (3% chance) on standard cells with cooldown constraint
  const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                        cell.event === "midboss" || cell.event === "boss" || cell.event === "chest" ||
                        cell.message;
  const cooldownActive = state.eventCooldownTurns && state.eventCooldownTurns > 0;
  if (!isSpecialCell && !cooldownActive && Math.random() < 0.03) {
    state.eventCooldownTurns = 15; // Set 15 steps cooldown
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
    return;
  }

  // Check nearby sensory aura
  checkSensoryAura();
}

export function applyExplorationPoison() {
  let tookDamage = false;
  state.party.forEach(c => {
    if (c.status === "poisoned" && c.hp > 0) {
      const baseDmg = state.floor === 2 ? 2 : 1;
      const pDmg = Math.floor(Math.random() * 2) + baseDmg; // B2F: 2-3, Others: 1-2 HP damage
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

export function triggerFlameTrap() {
  addLog("【⚠️熱気！】天井から猛烈な火炎ブレスが吹き出した！");
  playSound("chest_trap");
  if (renderer) renderer.triggerShake(10, 400);
  if (renderer && typeof renderer.triggerFlash === "function") {
    renderer.triggerFlash(400);
  }
  state.party.forEach(c => {
    if (c.status !== "dead") {
      const dmg = Math.floor(Math.random() * 11) + 10; // 10-20 damage
      c.hp = Math.max(0, c.hp - dmg);
      addLog(`${c.name}は${dmg}の炎ダメージを受けた。`);
      if (c.hp === 0) {
        c.status = "dead";
        addLog(`[!] ${c.name}は炎に焼かれて力尽きた！`);
      }
    }
  });

  const allPartyDead = state.party.every(c => c.status === "dead");
  if (allPartyDead) {
    triggerGameOver();
  } else {
    saveAutosave();
    updateUI();
  }
}

export function enterDungeon() {
  if (!state.party || state.party.length === 0) {
    addLog("【警告】迷宮に入るには、まずお城の「訓練場」でパーティを編成してください。");
    playSound("bump");
    updateUI();
    return;
  }

  if (state.lastReturnedFloor && state.lastReturnedFloor > 1 && state.lastReturnedFloor <= 4) {
    openSubmenu("enter_dungeon_select", "迷宮への進入地点を選択してください：");
  } else {
    executeEnterDungeon(1);
  }
}

export function executeEnterDungeon(floor) {
  state.gameState = "explore";
  state.floor = floor;
  state.sessionMaxFloor = floor; // セッション最深階を初期化

  if (floor === 1) {
    state.x = START_X;
    state.y = START_Y;
  } else {
    // 2階以上は上り階段マスから開始
    const target = findCellCoordsByType(state.maps[floor - 1], "stairs-up");
    if (target) {
      state.x = target.x;
      state.y = target.y;
    } else {
      state.x = START_X;
      state.y = START_Y;
    }
  }

  state.dir = DIR_N;
  state.visitedMap[state.y][state.x] = true;
  addLog(`地下${state.floor}階の階段から探索を再開した。冷たい石造りの暗闇が迫る...`);
  playSound("move");
  saveAutosave();
  updateUI();
}
