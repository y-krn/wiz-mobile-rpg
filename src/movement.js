import { state, saveAutosave, addLog, createDefaultCurrentRun, recordCharDeath } from "./state.js";
import { DIR_N, START_X, START_Y, DX, DY, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES, DIR_NAMES, getPartyMaxAffix, getPartyCoreParams, getCoreLogText, getCharMaxHp, getCharAffixSum } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { checkFloorOmenMessage } from "./systems/omens.js";
import { showFloorEntryStinger, updateUI } from "./ui.js";
import { getFloorTheme, revealFloor } from "./data/floor_themes.js";
import { startCombat, triggerGameOver } from "./combat.js";
import { setupChestState } from "./chest.js";
import { openGuardedSubmenu, openSubmenu } from "./navigation.js";
import { triggerRunResult } from "./result.js";
import { detectAdjacentTrapsByTraceRead, handleTrapStepCheck } from "./systems/traps.js";
import { getPerceptionIntent } from "./systems/warden_perception.js";

const ENCOUNTER_HIGH_STEP_LIMIT = 30;
const ENCOUNTER_HIGH_RATE = 0.10;
const ENCOUNTER_LOW_RATE = 0.04;
const MILWA_ENCOUNTER_REDUCTION = 0.03;
const LOMILWA_ENCOUNTER_REDUCTION = 0.05;

export function recordExplorationSteps(count = 1) {
  if (!state.currentRun) return;
  state.currentRun.steps += count;
  if (!state.currentRun.floorSteps) state.currentRun.floorSteps = {};
  const key = String(state.floor);
  state.currentRun.floorSteps[key] = (state.currentRun.floorSteps[key] || 0) + count;
}

export function getCurrentFloorExplorationSteps() {
  if (!state.currentRun) return 0;
  return state.currentRun.floorSteps?.[String(state.floor)] || 0;
}

export function getEncounterChance() {
  const floorSteps = getCurrentFloorExplorationSteps();
  const baseRate = floorSteps <= ENCOUNTER_HIGH_STEP_LIMIT ? ENCOUNTER_HIGH_RATE : ENCOUNTER_LOW_RATE;
  if (state.lightPower === "lomilwa") {
    return Math.max(0, baseRate - LOMILWA_ENCOUNTER_REDUCTION);
  }
  if (state.lightTurns > 0) {
    return Math.max(0, baseRate - MILWA_ENCOUNTER_REDUCTION);
  }
  return baseRate;
}

export function tickExplorationSpellEffects() {
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

function isBlockedByOneWayPassage(x, y, dir) {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  const enterFace = (dir + 2) % 4;
  return Boolean(state.map[ny]?.[nx]?.blockEnter?.[enterFace]);
}

function getClosedSealedGate(x, y, dir) {
  const gate = state.map[y]?.[x]?.sealedGate?.[dir];
  return gate && !gate.open ? gate : null;
}

function blockOneWayMove() {
  playSound("bump");
  if (renderer) renderer.triggerShake(4, 150);
  addLog("見えない力に押し返された。ここは一方通行だ…");
}

function blockSealedGateMove() {
  playSound("bump");
  if (renderer) renderer.triggerShake(5, 180);
  addLog("【封印門】冷たい封印が行く手を阻む。門番を倒さなければ開かない。");
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
    advanceRoamingTurn(false, prevX, prevY);
  } else if (action === "turn-right") {
    state.dir = (state.dir + 1) % 4;
    advanceRoamingTurn(false, prevX, prevY);
  } else if (action === "forward") {
    const currentCell = state.map[state.y][state.x];
    if (currentCell.walls[state.dir]) {
      if (getClosedSealedGate(state.x, state.y, state.dir)) {
        blockSealedGateMove();
      } else {
        playSound("bump");
        if (renderer) renderer.triggerShake(4, 150);
      }
    } else if (isBlockedByOneWayPassage(state.x, state.y, state.dir)) {
      blockOneWayMove();
    } else {
      // Step forward
      state.x += DX[state.dir];
      state.y += DY[state.dir];
      
      recordExplorationSteps();
      
      tickExplorationSpellEffects();
      
      // Mark as visited
      state.visitedMap[state.y][state.x] = true;

      processExplorationResolution(prevX, prevY);
    }
  } else if (action === "backward") {
    const currentCell = state.map[state.y][state.x];
    const backDir = (state.dir + 2) % 4;
    if (currentCell.walls[backDir]) {
      if (getClosedSealedGate(state.x, state.y, backDir)) {
        blockSealedGateMove();
      } else {
        playSound("bump");
        if (renderer) renderer.triggerShake(4, 150);
      }
    } else if (isBlockedByOneWayPassage(state.x, state.y, backDir)) {
      blockOneWayMove();
    } else {
      state.x += DX[backDir];
      state.y += DY[backDir];
      recordExplorationSteps();
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

export function descendToFloor(nextFloor, landingCoord = null, isPitfall = false, onLanding = null) {
  state.transitioning = true;
  
  if (isPitfall) {
    addLog("【⚠️落とし穴】足元が抜けた！暗闇へ落下していく…");
    playSound("chest_trap");
    if (renderer) {
      if (typeof renderer.triggerShake === "function") {
        renderer.triggerShake(10, 400);
      }
      if (typeof renderer.triggerFlash === "function") {
        renderer.triggerFlash(400);
      }
    }
  } else {
    addLog(`階段を下ります。地下${nextFloor}階へ...`);
    playSound("move");
  }

  setTimeout(() => {
    state.floor = nextFloor;
    state.sessionMaxFloor = Math.max(state.sessionMaxFloor, state.floor);
    if (state.currentRun) {
      if (!state.currentRun.floorsVisited.includes(nextFloor)) {
        state.currentRun.floorsVisited.push(nextFloor);
      }
      state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
    }

    const target = landingCoord || findCellCoordsByType(state.maps[nextFloor - 1], "stairs-up");
    state.x = target.x;
    state.y = target.y;
    state.visitedMap[state.y][state.x] = true;

    const theme = getFloorTheme(nextFloor);
    const firstVisit = revealFloor(state, nextFloor);
    if (isPitfall) {
      addLog(`ドスン！地下${nextFloor}階の冷たい床に叩きつけられた！`);
    } else {
      addLog(`【${theme.name}】${firstVisit ? theme.entryText.first : theme.entryText.revisit}`);
    }

    checkFloorOmenMessage();
    
    state.transitioning = false;
    saveAutosave();
    updateUI();
    showFloorEntryStinger(nextFloor, firstVisit);

    if (isPitfall && typeof onLanding === "function") {
      onLanding();
    }
  }, 1200);
}

function checkSensoryAura() {
  const aura = getFloorTheme(state.floor)?.auraLexicon;
  const px = state.x;
  const py = state.y;
  const hearRangeBonus = getPartyMaxAffix(state.party, "hearRange");
  const sneakStep = getPartyCoreParams(state.party, "CORE_SNEAK_STEP");
  const arcaneSense = getPartyMaxAffix(state.party, "arcaneSense");
  const lightSenseRange = state.lightPower === "lomilwa" ? 4 : (state.lightTurns > 0 ? 3 : 2);
  const dumapicSenseRange = state.dumapicTurns > 0 ? 3 : 0;
  const baseSenseRange = Math.max(lightSenseRange, dumapicSenseRange);
  const soundRange = baseSenseRange + hearRangeBonus + (sneakStep?.auraRangeBonus || 0);
  const arcaneRange = baseSenseRange;
  
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

  // 1. Boss / Midboss magic aura
  if (minDistBoss <= Math.max(3, arcaneRange) && nearestBoss) {
    const dy = nearestBoss.y - py;
    const dx = nearestBoss.x - px;
    let dirStr;
    if (Math.abs(dy) > Math.abs(dx)) {
      dirStr = dy < 0 ? "北" : "南";
    } else {
      dirStr = dx < 0 ? "西" : "東";
    }
    addLog(`【気配】${dirStr}の方から${aura?.boss || "ただならぬ魔力の気配を感じる…"}`);
  }

  // 2. Spring water sound
  if (minDistSpring <= soundRange && nearestSpring) {
    addLog(`【気配】${aura?.spring || "近くからかすかに水音が聞こえる…"}`);
  }

  // 3. Tablet magic wave
  if (minDistTablet <= arcaneRange && nearestTablet) {
    if (arcaneSense >= 1) {
      addLog(`【気配】${getRelativeDirectionText(nearestTablet.x, nearestTablet.y, px, py)}に${aura?.tablet || "弱い魔力の波動を感じる…"}`);
    } else {
      addLog(`【気配】${aura?.tablet || "近くの壁から弱い魔力の波動を感じる…"}`);
    }
  }

  // 4. Merchant footsteps/presence
  if (minDistMerchant <= soundRange && nearestMerchant) {
    addLog(`【気配】${aura?.merchant || "近くから静かな衣擦れの音が聞こえる気がする…"}`);
  }

  // 5. Down stairs wind draft
  if (minDistDownStairs <= soundRange && nearestDownStairs) {
    addLog(`【気配】${aura?.stairs || "下へ続く空洞から、冷たい風が流れてきている…"}`);
  }

  // 6. Chest hidden treasure vibe
  if (minDistChest <= baseSenseRange && nearestChest) {
    addLog(`【気配】${aura?.chest || "この近くに何かが隠されている気がする…"}`);
  }

  // 7. Hidden door wall sense
  if (arcaneSense >= 2) {
    const secretDir = getAdjacentHiddenSecretDoorDir();
    if (secretDir !== null) {
      addLog(`【気配】${DIR_NAMES[secretDir]}の壁の向こうに空洞の気配がある…`);
    }
  }

  // 8. Roaming threat presence
  if (state.roamingMonsters) {
    const currentFlacks = state.roamingMonsters.filter(rm => rm.floor === state.floor);
    let minFlackDist = 999;
    let nearest = null;
    currentFlacks.forEach(flack => {
      const dist = Math.abs(flack.x - px) + Math.abs(flack.y - py);
      if (dist < minFlackDist) {
        minFlackDist = dist;
        nearest = flack;
      }
    });
    const roamingRange = nearest?.kind === "warden" ? 5 + hearRangeBonus : 3 + hearRangeBonus;
    if (nearest?.kind === "warden" && minFlackDist <= roamingRange) {
      addLog("【⚠️封印門の気配】近くに桁違いの殺気がある。今は勝ち目が薄い門番だ。");
      playSound("miss");
    } else if (minFlackDist <= roamingRange) {
      addLog("【⚠️警告】近くから不浄で禍々しい気配が漂ってくる…強敵「フラック」が近くにいる！");
      playSound("miss");
    }
  }
}

function getRelativeDirectionText(x, y, px, py) {
  const dy = y - py;
  const dx = x - px;
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? "北" : "南";
  return dx < 0 ? "西" : "東";
}

function getAdjacentHiddenSecretDoorDir() {
  const cell = state.map[state.y]?.[state.x];
  if (!cell?.secretDoor) return null;
  for (let dir = 0; dir < 4; dir++) {
    const nx = state.x + DX[dir];
    const ny = state.y + DY[dir];
    if (!state.map[ny]?.[nx]) continue;
    if (cell.secretDoor[dir] && !cell.secretFound?.[dir]) return dir;
  }
  return null;
}

export function applyStairsHeal(cell) {
  if (!state.currentRun || !["stairs-up", "stairs-down"].includes(cell?.type)) return 0;
  state.currentRun.discoveredStairs ||= [];
  const stairsId = `${state.floor}:${state.x},${state.y}`;
  if (state.currentRun.discoveredStairs.includes(stairsId)) return 0;
  state.currentRun.discoveredStairs.push(stairsId);

  let total = 0;
  state.party.forEach(char => {
    if (!char || char.hp <= 0 || ["dead", "ash"].includes(char.status)) return;
    const amount = getCharAffixSum(char, "stairsHeal");
    if (amount <= 0) return;
    const before = char.hp;
    char.hp = Math.min(getCharMaxHp(char), char.hp + amount);
    total += char.hp - before;
  });
  if (total > 0) addLog(`[踏破の息吹] 階段の発見でHPを${total}回復した！`);
  return total;
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
  applyStairsHeal(cell);

  // Stairs Up (exit to town or go to previous floor)
  if (cell.type === "stairs-up") {
    if (state.floor === 1) {
      state.transitioning = true;
      addLog("階段を上がります。お城へ戻る...");
      setTimeout(() => {
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
        
        const theme = getFloorTheme(prevFloor);
        addLog(`【${theme.name}】${theme.entryText.revisit}`);
        checkFloorOmenMessage();
        
        state.transitioning = false;
        saveAutosave();
        updateUI();
        showFloorEntryStinger(prevFloor, false);
      }, 1200);
    }
    return;
  }

  // Stairs Down (go to next floor)
  if (cell.type === "stairs-down") {
    descendToFloor(state.floor + 1);
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
    const skin = getFloorTheme(state.floor)?.eventSkins.spring || "怪しい泉";
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.spring.found++;
    }
    openGuardedSubmenu(EVENT_TYPES.SPRING, `${skin}を見つけた。水面がかすかに揺れている…`);
    return;
  }

  if (cell.event === EVENT_TYPES.CAMP) {
    const skin = getFloorTheme(state.floor)?.eventSkins.camp || "野営地";
    openGuardedSubmenu(EVENT_TYPES.CAMP, `${skin}。門番の気配を警戒しながら休息場所を確かめる。`);
    return;
  }

  // Tablet encounter
  if (cell.event === EVENT_TYPES.TABLET) {
    const skin = getFloorTheme(state.floor)?.eventSkins.tablet || "謎の石碑";
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.tablet.found++;
    }
    openGuardedSubmenu(EVENT_TYPES.TABLET, `${skin}が残されている。古い文字が刻まれている…`);
    return;
  }

  // Merchant encounter
  if (cell.event === EVENT_TYPES.MERCHANT) {
    const skin = getFloorTheme(state.floor)?.eventSkins.merchant || "さまよう商人";
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      state.codex.events.facilities.merchant.found++;
    }
    openGuardedSubmenu(EVENT_TYPES.MERCHANT, `${skin}が暗がりから姿を現した。`);
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
      const skin = getFloorTheme(state.floor)?.eventSkins.spring || "怪しい泉";
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.spring.found++;
      }
      openGuardedSubmenu(EVENT_TYPES.SPRING, `${skin}を見つけた。水面がかすかに揺れている…`);
    } else if (chosen === EVENT_TYPES.TABLET) {
      const skin = getFloorTheme(state.floor)?.eventSkins.tablet || "謎の石碑";
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.tablet.found++;
      }
      openGuardedSubmenu(EVENT_TYPES.TABLET, `${skin}が残されている。古い文字が刻まれている…`);
    } else {
      const skin = getFloorTheme(state.floor)?.eventSkins.merchant || "さまよう商人";
      if (state.codex && state.codex.events && state.codex.events.facilities) {
        state.codex.events.facilities.merchant.found++;
      }
      openGuardedSubmenu(EVENT_TYPES.MERCHANT, `${skin}が暗がりから姿を現した。`);
    }
    return;
  }

  const encounterChance = getEncounterChance();

  // Random Encounter
  if ((!state.repelTurns || state.repelTurns <= 0) && Math.random() < encounterChance) {
    state.transitioning = true;
    createNoiseEvent(state.x, state.y);
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
        recordCharDeath(state, c, "毒のダメージ");
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
        recordCharDeath(state, c, "火炎の罠");
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

  executeEnterDungeon(1);
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
  state.currentRun.floorSteps = {};
  state.party.forEach(char => {
    char.runTrapAttackBonus = 0;
  });

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
  const theme = getFloorTheme(floor);
  const firstVisit = revealFloor(state, floor);
  addLog(`【${theme.name}】${firstVisit ? theme.entryText.first : theme.entryText.revisit}`);
  checkFloorOmenMessage();
  playSound("move");
  saveAutosave();
  updateUI();
  showFloorEntryStinger(floor, firstVisit);
}

function beginRoamingMonsterCombat(monster) {
  state.transitioning = true;
  const isWarden = monster.kind === "warden";
  addLog(isWarden
    ? `【⚠️封印門の門番】${monster.name}が立ちはだかった！`
    : `【⚠️遭遇！】徘徊する強敵「${monster.name}」が目の前に現れた！`);
  playSound("chest_trap");
  setTimeout(() => {
    state.transitioning = false;
    startCombat(false, false, true, monster);
  }, 1000);
}

export function challengePendingWarden() {
  const pending = state.pendingWardenEncounter;
  const monster = state.roamingMonsters?.find(rm => rm.id === pending?.monsterId);
  state.pendingWardenEncounter = null;
  if (!monster) {
    state.gameState = "explore";
    updateUI();
    return;
  }
  beginRoamingMonsterCombat(monster);
}

export function retreatPendingWarden() {
  const pending = state.pendingWardenEncounter;
  if (pending) {
    state.x = pending.prevX;
    state.y = pending.prevY;
  }
  state.pendingWardenEncounter = null;
  state.gameState = "explore";
  addLog("門番から距離を取った。今は挑むべき相手ではない。");
  saveAutosave();
  updateUI();
}

export function checkRoamingMonsterEncounter({ forced = false, prevX = state.prevX, prevY = state.prevY } = {}) {
  if (!state.roamingMonsters) return false;
  const flack = state.roamingMonsters.find(
    rm => rm.floor === state.floor && rm.x === state.x && rm.y === state.y
  );
  if (flack) {
    if (flack.kind === "warden" && !forced) {
      state.pendingWardenEncounter = { monsterId: flack.id, prevX, prevY };
      addLog("【⚠️封印門の門番】圧倒的な殺気が行く手を塞ぐ。挑む前に覚悟が必要だ。");
      openSubmenu("warden_confirm", "封印門の門番: 勝ち目は薄い");
    } else {
      beginRoamingMonsterCombat(flack);
    }
    return true;
  }
  return false;
}

function getLatestNoise() {
  return state.noiseEvents?.filter(event => event.floor === state.floor && event.ttl > 0).at(-1) ?? null;
}

export function createNoiseEvent(x, y, ttl = 4) {
  if (!state.noiseEvents) state.noiseEvents = [];
  state.noiseEvents.push({ floor: state.floor, x, y, ttl });
}

function getPassableNeighbors(monster, targetActive) {
  const grid = state.map;
  const neighbors = [];
  const cell = grid[monster.y]?.[monster.x];
  if (!cell) return neighbors;
  const patrolRadius = monster.kind === "warden" ? 5 : Infinity;
  const currentHomeDist = Math.abs(monster.x - (monster.homeX ?? monster.x)) + Math.abs(monster.y - (monster.homeY ?? monster.y));
  for (let dir = 0; dir < 4; dir++) {
    if (cell.walls[dir]) continue;
    const x = monster.x + DX[dir];
    const y = monster.y + DY[dir];
    const destCell = grid[y]?.[x];
    if (!destCell) continue;
    const blocked = state.roamingMonsters.some(rm => rm.floor === state.floor && rm !== monster && rm.x === x && rm.y === y);
    const special = destCell.type === "stairs-up" || destCell.type === "stairs-down" || destCell.event === "boss" || destCell.event === "midboss";
    const oneWay = Boolean(destCell.blockEnter?.[(dir + 2) % 4]);
    const homeDist = Math.abs(x - (monster.homeX ?? monster.x)) + Math.abs(y - (monster.homeY ?? monster.y));
    if (!blocked && !special && !oneWay && (targetActive || homeDist <= patrolRadius || currentHomeDist > patrolRadius)) {
      neighbors.push({ x, y, dir });
    }
  }
  return neighbors;
}

function pickStep(monster, neighbors, target) {
  if (target) {
    const min = Math.min(...neighbors.map(n => Math.abs(n.x - target.x) + Math.abs(n.y - target.y)));
    const candidates = neighbors.filter(n => Math.abs(n.x - target.x) + Math.abs(n.y - target.y) === min);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  const homeDistance = Math.abs(monster.x - (monster.homeX ?? monster.x)) + Math.abs(monster.y - (monster.homeY ?? monster.y));
  if (monster.kind === "warden" && homeDistance > 5) {
    const min = Math.min(...neighbors.map(n => Math.abs(n.x - monster.homeX) + Math.abs(n.y - monster.homeY)));
    return neighbors.find(n => Math.abs(n.x - monster.homeX) + Math.abs(n.y - monster.homeY) === min);
  }
  const opposite = monster.lastDir === undefined ? -1 : (monster.lastDir + 2) % 4;
  const forward = neighbors.filter(n => n.dir !== opposite);
  const candidates = forward.length ? forward : neighbors;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function moveRoamingMonsters(playerMoved = true) {
  if (!state.roamingMonsters) return;
  const currentFloor = state.floor;
  const grid = state.map;
  if (!grid) return;
  const sneakStep = getPartyCoreParams(state.party, "CORE_SNEAK_STEP");
  if (sneakStep && state.currentRun) {
    state.currentRun.loggedCoreActivations ||= [];
    if (!state.currentRun.loggedCoreActivations.includes("CORE_SNEAK_STEP")) {
      state.currentRun.loggedCoreActivations.push("CORE_SNEAK_STEP");
      addLog(getCoreLogText("CORE_SNEAK_STEP"));
    }
  }

  state.roamingMonsters.forEach(monster => {
    if (monster.floor !== currentFloor) return;

    const intent = getPerceptionIntent({
      monster,
      player: { x: state.x, y: state.y, dir: state.dir, dx: DX, dy: DY },
      noise: getLatestNoise(),
      playerMoved,
      grid,
      rangeMultiplier: sneakStep?.detectionRangeMultiplier || 1
    });
    monster.detected = intent.detected;
    for (let step = 0; step < intent.speed; step++) {
      const neighbors = getPassableNeighbors(monster, Boolean(intent.target));
      if (!neighbors.length) break;
      const chosen = pickStep(monster, neighbors, intent.target);
      if (!chosen) break;
      monster.x = chosen.x;
      monster.y = chosen.y;
      monster.lastDir = chosen.dir;
      if (monster.x === state.x && monster.y === state.y) break;
    }
  });
}

export function advanceRoamingTurn(playerMoved, prevX = state.x, prevY = state.y) {
  state.noiseEvents = (state.noiseEvents || [])
    .map(event => ({ ...event, ttl: event.ttl - 1 }))
    .filter(event => event.ttl > 0);
  state.roamingMovementStepCount = (state.roamingMovementStepCount || 0) + 1;
  if (state.roamingMovementStepCount % 2 !== 0) return false;
  moveRoamingMonsters(playerMoved);
  return checkRoamingMonsterEncounter({ forced: true, prevX, prevY });
}

export function processExplorationResolution(prevX, prevY) {
  const wiped = applyExplorationPoison();
  if (wiped) return;

  // 1. Check if player stepped onto Flack
  if (checkRoamingMonsterEncounter({ prevX, prevY })) {
    return;
  }

  // 2. Move Flacks if it's their turn
  if (advanceRoamingTurn(true, prevX, prevY)) return;

  // 2.5. Check standard traps on standard passage cells
  const cell = state.map[state.y][state.x];
  if (cell.trap && cell.trap.state !== "disabled") {
    const encountered = handleTrapStepCheck(cell.trap);
    if (encountered) {
      return;
    }
  } else {
    detectAdjacentTrapsByTraceRead();
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
