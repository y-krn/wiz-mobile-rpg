import { state, saveAutosave, addLog, createDefaultCurrentRun } from "./state.js";
import { DIR_N, START_X, START_Y, DX, DY, DIR_NAMES, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES, getItemBaseId, isSpecialOrQuestItem } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { checkFloorOmenMessage } from "./systems/omens.js";
import { updateUI } from "./ui.js";
import { startCombat, triggerGameOver } from "./combat.js";
import { setupChestState } from "./chest.js";
import { openSubmenu } from "./navigation.js";
import { triggerRunResult } from "./result.js";
import { handleTrapStepCheck } from "./systems/traps.js";

function tickExplorationSpellEffects() {
  if (state.lightTurns > 0) {
    const cost = state.floor === 2 ? 2 : 1;
    state.lightTurns = Math.max(0, state.lightTurns - cost);
    if (state.lightTurns === 0) {
      state.lightPower = "";
      addLog("明かりの呪文の効果が切れた。暗闇に包まれた。");
    }
  }

  if (state.repelTurns > 0) {
    state.repelTurns--;
    if (state.repelTurns === 0) {
      addLog("マスペアルの効果が切れた。モンスターの殺気が戻った。");
    }
  }

  if (state.dumapicTurns > 0) {
    state.dumapicTurns--;
    if (state.dumapicTurns === 0) {
      state.dumapicHint = "";
      addLog("デュマピックの効果が切れた。詳細な座標探知が停止した。");
    }
  }

  if (state.eventCooldownTurns > 0) {
    state.eventCooldownTurns--;
  }
}

export function handleMove(action) {
  if (state.transitioning || state.gameState !== "explore") return;
  playSound("move");
  
  state.prevX = state.x;
  state.prevY = state.y;
  
  const prevX = state.x;
  const prevY = state.y;
  
  if (action === "turn-left") {
    state.dir = (state.dir + 3) % 4;
  } else if (action === "turn-right") {
    state.dir = (state.dir + 1) % 4;
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
      
      if (state.currentRun) {
        state.currentRun.steps++;
      }
      
      tickExplorationSpellEffects();
      
      // Mark as visited
      state.visitedMap[state.y][state.x] = true;

      processExplorationResolution(prevX, prevY);
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
      if (state.currentRun) {
        state.currentRun.steps++;
      }
      tickExplorationSpellEffects();
      state.visitedMap[state.y][state.x] = true;
      
      processExplorationResolution(prevX, prevY);
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
  const lightSenseRange = state.lightPower === "lomilwa" ? 4 : (state.lightTurns > 0 ? 3 : 2);
  const dumapicSenseRange = state.dumapicTurns > 0 ? 3 : 0;
  const senseRange = Math.max(lightSenseRange, dumapicSenseRange);
  
  let nearestSpring = null;
  let nearestBoss = null;
  let nearestTablet = null;
  let nearestMerchant = null;
  let nearestDownStairs = null;
  let nearestChest = null;

  let minDistSpring = 999;
  let minDistBoss = 999;
  let minDistTablet = 999;
  let minDistMerchant = 999;
  let minDistDownStairs = 999;
  let minDistChest = 999;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    if (!state.map[y]) continue;
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (x === px && y === py) continue; // Skip current cell
      if (!state.map[y][x]) continue;

      const cell = state.map[y][x];
      const dist = Math.abs(x - px) + Math.abs(y - py);

      if (cell.event === EVENT_TYPES.SPRING) {
        if (dist < minDistSpring) { minDistSpring = dist; nearestSpring = { x, y }; }
      } else if (cell.event === EVENT_TYPES.BOSS || cell.event === EVENT_TYPES.MIDBOSS) {
        if (dist < minDistBoss) { minDistBoss = dist; nearestBoss = { x, y }; }
      } else if (cell.event === EVENT_TYPES.TABLET) {
        if (dist < minDistTablet) { minDistTablet = dist; nearestTablet = { x, y }; }
      } else if (cell.event === EVENT_TYPES.MERCHANT) {
        if (dist < minDistMerchant) { minDistMerchant = dist; nearestMerchant = { x, y }; }
      } else if (cell.event === EVENT_TYPES.CHEST) {
        if (dist < minDistChest) { minDistChest = dist; nearestChest = { x, y }; }
      }

      if (cell.type === "stairs-down") {
        if (dist < minDistDownStairs) { minDistDownStairs = dist; nearestDownStairs = { x, y }; }
      }
    }
  }

  // 1. Boss / Midboss magic aura (distance <= 3)
  if (minDistBoss <= 3 && nearestBoss) {
    const dy = nearestBoss.y - py;
    const dx = nearestBoss.x - px;
    let dirStr;
    if (Math.abs(dy) > Math.abs(dx)) {
      dirStr = dy < 0 ? "北" : "南";
    } else {
      dirStr = dx < 0 ? "西" : "東";
    }
    addLog(`【気配】${dirStr}の方からただならぬ魔力の気配を感じる…`);
  }

  // 2. Spring water sound (distance <= 2)
  if (minDistSpring <= senseRange && nearestSpring) {
    addLog("【気配】近くからかすかに水音が聞こえる…");
  }

  // 3. Tablet magic wave (distance <= 2)
  if (minDistTablet <= senseRange && nearestTablet) {
    addLog("【気配】近くの壁から弱い魔力の波動を感じる…");
  }

  // 4. Merchant footsteps/presence (distance <= 2)
  if (minDistMerchant <= senseRange && nearestMerchant) {
    addLog("【気配】近くから静かな衣擦れの音が聞こえる気がする…");
  }

  // 5. Down stairs wind draft (distance <= 2)
  if (minDistDownStairs <= senseRange && nearestDownStairs) {
    addLog("【気配】下へ続く空洞から、冷たい風が流れてきている…");
  }

  // 6. Chest hidden treasure vibe (distance <= 2)
  if (minDistChest <= senseRange && nearestChest) {
    addLog("【気配】この近くに何かが隠されている気がする…");
  }

  // 7. Roaming Flack presence (distance <= 3)
  if (state.roamingMonsters) {
    const currentFlacks = state.roamingMonsters.filter(rm => rm.floor === state.floor);
    let minFlackDist = 999;
    currentFlacks.forEach(flack => {
      const dist = Math.abs(flack.x - px) + Math.abs(flack.y - py);
      if (dist < minFlackDist) {
        minFlackDist = dist;
      }
    });
    if (minFlackDist <= 3) {
      addLog("【⚠️警告】近くから不浄で禍々しい気配が漂ってくる…強敵「フラック」が近くにいる！");
      playSound("miss");
    }
  }
}

export function checkCellEvents(prevX = START_X, prevY = START_Y) {
  // 遺留品の回収チェック
  if (state.remains && state.remains.length > 0) {
    const remainsIdx = state.remains.findIndex(rem => rem.floor === state.floor && rem.x === state.x && rem.y === state.y);
    if (remainsIdx !== -1) {
      const remains = state.remains[remainsIdx];
      addLog(`【遺留品回収】かつて全滅した地点にたどり着いた。遺留品を発見し、回収した！`);
      playSound("gold");
      
      let recoveredCount = 0;
      remains.items.forEach(item => {
        // インベントリに戻す (上限20個を一時的に超過可能)
        state.inventory.push(item);
        recoveredCount++;
      });

      if (recoveredCount > 0) {
        addLog(`遺留品からアイテムを ${recoveredCount} 個回収しました。`);
      } else {
        addLog(`遺留品の中身は空だった。`);
      }

      // 遺留品データを削除
      state.remains.splice(remainsIdx, 1);
      
      saveAutosave();
      updateUI();
    }
  }

  const cell = state.map[state.y][state.x];

  // Stairs Up (exit to town or go to previous floor)
  if (cell.type === "stairs-up") {
    if (state.floor === 1) {
      state.transitioning = true;
      addLog("階段を上がります。お城へ戻る...");
      setTimeout(() => {
        state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);
        state.transitioning = false;
        triggerRunResult("stairs");
      }, 1200);
    } else {
      state.transitioning = true;
      const prevFloor = state.floor - 1;
      addLog(`階段を上がります。地下${prevFloor}階へ...`);
      playSound("move");
      setTimeout(() => {
        state.floor = prevFloor;
        if (state.currentRun) {
          if (!state.currentRun.floorsVisited.includes(prevFloor)) {
            state.currentRun.floorsVisited.push(prevFloor);
          }
          state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, prevFloor);
        }
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
        checkFloorOmenMessage();
        
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
      if (state.currentRun) {
        if (!state.currentRun.floorsVisited.includes(nextFloor)) {
          state.currentRun.floorsVisited.push(nextFloor);
        }
        state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
      }
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
      checkFloorOmenMessage();
      
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
  if (cell.event === EVENT_TYPES.SPRING) {
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.spring.found++;
    }
    openSubmenu(EVENT_TYPES.SPRING, "怪しい泉を見つけた。澄んだ水が湧き出ている…");
    return;
  }

  // Tablet encounter
  if (cell.event === EVENT_TYPES.TABLET) {
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.tablet.found++;
    }
    openSubmenu(EVENT_TYPES.TABLET, "謎の石碑が立っている。古代の文字が刻まれている…");
    return;
  }

  // Merchant encounter
  if (cell.event === EVENT_TYPES.MERCHANT) {
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.merchant.found++;
    }
    openSubmenu(EVENT_TYPES.MERCHANT, "フードを被ったさまよう商人が現れた！");
    return;
  }

  // Random Event (3% chance) on standard cells with cooldown constraint
  // 宝箱はランダム出現させない（固定配置のみ）/ No random chests here, fixed positions only
  const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                        cell.event === EVENT_TYPES.MIDBOSS || cell.event === EVENT_TYPES.BOSS || cell.event === EVENT_TYPES.CHEST ||
                        cell.message;
  const cooldownActive = state.eventCooldownTurns && state.eventCooldownTurns > 0;
  if (!isSpecialCell && !cooldownActive && Math.random() < 0.03) {
    state.eventCooldownTurns = 15; // Set 15 steps cooldown
    const events = [EVENT_TYPES.SPRING, EVENT_TYPES.TABLET, EVENT_TYPES.MERCHANT];
    const chosen = events[Math.floor(Math.random() * events.length)];
    if (chosen === EVENT_TYPES.SPRING) {
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.spring.found++;
      }
      openSubmenu(EVENT_TYPES.SPRING, "怪しい泉を見つけた。澄んだ水が湧き出ている…");
    } else if (chosen === EVENT_TYPES.TABLET) {
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.tablet.found++;
      }
      openSubmenu(EVENT_TYPES.TABLET, "謎の石碑が立っている。古代の文字が刻まれている…");
    } else {
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.merchant.found++;
      }
      openSubmenu(EVENT_TYPES.MERCHANT, "フードを被ったさまよう商人が現れた！");
    }
    return;
  }

  let encounterChance = 0.10;
  if (state.lightPower === "lomilwa") {
    encounterChance = 0.05;
  } else if (state.lightTurns > 0) {
    encounterChance = 0.07;
  }

  // Random Encounter
  if ((!state.repelTurns || state.repelTurns <= 0) && Math.random() < encounterChance) {
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

export function triggerFlameTrap() {
  addLog("【⚠️熱気！】天井から猛烈な火炎ブレスが吹き出した！");
  playSound("chest_trap");
  if (renderer) renderer.triggerShake(10, 400);
  if (renderer && typeof renderer.triggerFlash === "function") {
    renderer.triggerFlash(400);
  }
  state.party.forEach(c => {
    if (c.status !== "dead") {
      const dmg = Math.floor(Math.random() * 9) + 8; // 8-16 damage
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

  const hasLivingMember = state.party.some(c => c.status !== "dead" && c.status !== "ash");
  if (!hasLivingMember) {
    addLog("【警告】生存している冒険者がいません。カント寺院で蘇生するか、訓練場で編成してください。");
    playSound("bump");
    updateUI();
    return;
  }

  if (state.lastReturnedFloor && state.lastReturnedFloor > 1 && state.lastReturnedFloor <= 4) {
    openSubmenu("enter_dungeon_select", "迷宮へ入る準備：");
  } else {
    executeEnterDungeon(1);
  }
}

export function executeEnterDungeon(floor) {
  state.gameState = "explore";
  state.floor = floor;
  state.sessionMaxFloor = floor; // セッション最深階を初期化
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.startedAt = Date.now();
  state.currentRun.startFloor = floor;
  state.currentRun.deepestFloor = floor;
  state.currentRun.floorsVisited = [floor];

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
  checkFloorOmenMessage();
  playSound("move");
  saveAutosave();
  updateUI();
}

export function checkRoamingMonsterEncounter() {
  if (!state.roamingMonsters) return false;
  const flack = state.roamingMonsters.find(
    rm => rm.floor === state.floor && rm.x === state.x && rm.y === state.y
  );
  if (flack) {
    state.transitioning = true;
    addLog(`【⚠️遭遇！】徘徊する強敵「${flack.name}」が目の前に現れた！`);
    playSound("chest_trap");
    setTimeout(() => {
      state.transitioning = false;
      startCombat(false, false, true);
    }, 1000);
    return true;
  }
  return false;
}

export function moveRoamingMonsters() {
  if (!state.roamingMonsters) return;
  const currentFloor = state.floor;
  const grid = state.map;
  if (!grid) return;

  state.roamingMonsters.forEach(monster => {
    if (monster.floor !== currentFloor) return;

    const mx = monster.x;
    const my = monster.y;

    // Determine mode: chase player if Manhattan distance <= 4
    const distToPlayer = Math.abs(mx - state.x) + Math.abs(my - state.y);
    const isChase = distToPlayer <= 4;

    // Find passable neighbors
    const neighbors = [];
    const cell = grid[my][mx];
    for (let dir = 0; dir < 4; dir++) {
      if (!cell.walls[dir]) {
        const nx = mx + DX[dir];
        const ny = my + DY[dir];
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
          // Check if another monster is there
          const isBlockedByMonster = state.roamingMonsters.some(
            rm => rm.floor === currentFloor && rm !== monster && rm.x === nx && rm.y === ny
          );
          // Prevent stepping on stairs, boss, or midboss
          const destCell = grid[ny][nx];
          const isSpecialCell = destCell.type === "stairs-up" || destCell.type === "stairs-down" || 
                                destCell.event === "boss" || destCell.event === "midboss";
          if (!isBlockedByMonster && !isSpecialCell) {
            neighbors.push({ x: nx, y: ny, dir });
          }
        }
      }
    }

    if (neighbors.length === 0) return; // No move possible

    let chosen;
    if (isChase) {
      // Pick neighbor that minimizes distance to player
      let minDist = 999;
      const candidates = [];
      neighbors.forEach(n => {
        const d = Math.abs(n.x - state.x) + Math.abs(n.y - state.y);
        if (d < minDist) {
          minDist = d;
        }
      });
      neighbors.forEach(n => {
        const d = Math.abs(n.x - state.x) + Math.abs(n.y - state.y);
        if (d === minDist) {
          candidates.push(n);
        }
      });
      chosen = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      // Patrol mode: try to avoid backtracking
      let lastDir = monster.lastDir;
      const oppositeDir = lastDir !== undefined ? (lastDir + 2) % 4 : -1;
      const forwardCandidates = neighbors.filter(n => n.dir !== oppositeDir);
      
      if (forwardCandidates.length > 0) {
        chosen = forwardCandidates[Math.floor(Math.random() * forwardCandidates.length)];
      } else {
        chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
      }
    }

    if (chosen) {
      monster.x = chosen.x;
      monster.y = chosen.y;
      monster.lastDir = chosen.dir;
    }
  });
}

export function processExplorationResolution(prevX, prevY) {
  const wiped = applyExplorationPoison();
  if (wiped) return;

  // 1. Check if player stepped onto Flack
  if (checkRoamingMonsterEncounter()) {
    return;
  }

  // 2. Move Flacks if it's their turn
  state.roamingMovementStepCount = (state.roamingMovementStepCount || 0) + 1;
  if (state.roamingMovementStepCount % 2 === 0) {
    moveRoamingMonsters();
    // Check if Flack stepped onto player
    if (checkRoamingMonsterEncounter()) {
      return;
    }
  }

  // 2.5. Check standard traps on standard passage cells
  const cell = state.map[state.y][state.x];
  if (cell.trap && cell.trap.state !== "disabled") {
    const encountered = handleTrapStepCheck(cell.trap, prevX, prevY);
    if (encountered) {
      return;
    }
  }

  // 3. Regular floor events
  const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                        cell.event === "midboss" || cell.event === "boss" || cell.event === "chest" ||
                        cell.message;

  if (state.flameTrapCooldownTurns && state.flameTrapCooldownTurns > 0) {
    state.flameTrapCooldownTurns--;
  }
  const flameCooldownActive = state.flameTrapCooldownTurns && state.flameTrapCooldownTurns > 0;

  if (state.floor === 5 && !isSpecialCell && !flameCooldownActive && Math.random() < 0.05) {
    state.flameTrapCooldownTurns = 5; // 5 steps cooldown to prevent back-to-back triggers
    triggerFlameTrap();
  } else {
    checkCellEvents(prevX, prevY);
  }
}
