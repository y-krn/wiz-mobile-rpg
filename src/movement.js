import { state, saveAutosave, addLog, createDefaultCurrentRun, recordCharDeath, markMapChanged, markMapCellVisited } from "./state.js";
import { trackRunStart } from "./telemetry.js";
import { DIR_N, START_X, START_Y, DX, DY, MAP_WIDTH, MAP_HEIGHT, EVENT_TYPES, DIR_NAMES, getPartyMaxAffix, getPartyCoreParams, getCoreLogText, getCharMaxHp, getCharAffixSum, getPartyFlameTrapWarningAvoidanceChance } from "./data.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { checkFloorOmenMessage } from "./systems/omens.js";
import { showFloorEntryStinger, updateUI } from "./ui.js";
import { getFloorLabel, getFloorTheme, revealFloor } from "./data/floor_themes.js";
import { ensureRunFloor, isUsableFloorCell, resetRunFloors } from "./state/run_floor_state.js";
import { startCombat, triggerGameOver } from "./combat.js";
import { setupChestState } from "./chest.js";
import { menuContext, openGuardedSubmenu, openSubmenu } from "./navigation.js";
import { detectAdjacentTraps, startTrapEncounter, triggerTrap, triggerPitfall } from "./systems/traps.js";
import {
  clearCharIncapacitationOnDamage,
  resolveExplorationPoisonStep
} from "./combat_logic/status_effects.js";
import { getPerceptionIntent } from "./systems/elite_perception.js";
import { ELITE_PATROL_RADIUS } from "./systems/roaming_elites.js";
import { IDENTIFICATION_BALANCE } from "./rules/identification_rules.js";
import { getDepartureCraftGrants, getWorkshopGrants } from "./systems/workshop.js";
import { RUN_QUEST_TEMPLATES } from "./data/run_quests.js";
import { assignRunQuests, createRunQuest, updateRunQuests } from "./systems/run_quests.js";
import { applyTrapGuardToEffect, resolveFlameTrapEffect } from "./rules/trap_effect_rules.js";
import { beginCampEntry, isCampEntryEligible } from "./systems/camp_rest.js";
import { SILENCE_INCENSE_ENCOUNTER_MULTIPLIER } from "./systems/exploration_items.js";
import { isMapDirectionBlocked } from "./rules/map_movement.js";

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

export function calculateEncounterChance(floorStep, { lightPower, lightTurns, silenceTurns } = {}) {
  const baseRate = floorStep <= ENCOUNTER_HIGH_STEP_LIMIT ? ENCOUNTER_HIGH_RATE : ENCOUNTER_LOW_RATE;
  let rate = baseRate;
  if (lightPower === "lomilwa") {
    rate = Math.max(0, rate - LOMILWA_ENCOUNTER_REDUCTION);
  } else if (lightTurns > 0) {
    rate = Math.max(0, rate - MILWA_ENCOUNTER_REDUCTION);
  }
  if (silenceTurns > 0) {
    rate *= SILENCE_INCENSE_ENCOUNTER_MULTIPLIER;
  }
  return rate;
}

export function getEncounterChance() {
  const floorSteps = getCurrentFloorExplorationSteps();
  return calculateEncounterChance(floorSteps, state);
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

  if (state.silenceTurns > 0) {
    state.silenceTurns--;
    if (state.silenceTurns === 0) addLog("静寂の香の効果が切れた。魔物の気配が戻った。");
  }

  if (state.forcedEncounterSteps > 0) state.forcedEncounterSteps--;

  if (state.dumapicTurns > 0) {
    state.dumapicTurns--;
    if (state.dumapicTurns === 0) {
      state.dumapicHint = "";
      addLog("デュマピックの効果が切れた。詳細な座標探知が停止した。");
    }
  }
}

function isBlockedByOneWayPassage(x, y, dir) {
  return isMapDirectionBlocked(state.map, x, y, dir) && !state.map?.[y]?.[x]?.walls?.[dir];
}

function blockOneWayMove() {
  playSound("bump");
  if (renderer) renderer.triggerShake(4, 150);
  addLog("見えない力に押し返された。ここは一方通行だ…");
}

export function getCurrentExplorationCell() {
  let cell = state.map?.[state.y]?.[state.x];
  if (isUsableFloorCell(cell)) return cell;

  if (state.currentRun?.runSeed) {
    try {
      ensureRunFloor(state, state.floor);
    } catch (error) {
      addLog(error?.userMessage || "マップデータを安全に復旧できないため、探索を続行できません。セーブデータは保持されています。");
      state.gameState = "town";
      return null;
    }
    cell = state.map?.[state.y]?.[state.x];
    if (!cell) {
      const fallback = findCellCoordsByType(state.map, "stairs-up");
      state.x = fallback.x;
      state.y = fallback.y;
      state.prevX = fallback.x;
      state.prevY = fallback.y;
      cell = state.map?.[state.y]?.[state.x];
    }
    if (isUsableFloorCell(cell)) {
      addLog("探索位置のマップデータが欠落していたため、安全な地点へ復旧しました。");
      return cell;
    }
  }

  addLog("マップデータを読み込めないため、探索を続行できません。街へ戻ってください。");
  state.gameState = "town";
  return null;
}

export function handleMove(action) {
  if (state.transitioning || state.gameState !== "explore") return;
  playSound("move");
  
  state.prevX = state.x;
  state.prevY = state.y;
  
  const prevX = state.x;
  const prevY = state.y;

  const currentCell = getCurrentExplorationCell();
  if (!currentCell) {
    saveAutosave();
    updateUI();
    return;
  }
  
  if (action === "turn-left") {
    state.dir = (state.dir + 3) % 4;
    advanceRoamingTurn(false);
  } else if (action === "turn-right") {
    state.dir = (state.dir + 1) % 4;
    advanceRoamingTurn(false);
  } else if (action === "forward") {
    if (currentCell.walls[state.dir]) {
      playSound("bump");
      if (renderer) renderer.triggerShake(4, 150);
    } else if (isBlockedByOneWayPassage(state.x, state.y, state.dir)) {
      blockOneWayMove();
    } else {
      // Step forward
      // Traps are route obstacles: decide before entering the cell, so that
      // backing out costs nothing.
      const nextX = state.x + DX[state.dir];
      const nextY = state.y + DY[state.dir];
      const nextTrap = state.map[nextY]?.[nextX]?.trap;
      if (nextTrap && nextTrap.state === "discovered") {
        startTrapEncounter(nextTrap, { x: nextX, y: nextY });
        saveAutosave();
        updateUI();
        return;
      }
      state.x = nextX;
      state.y = nextY;
      
      recordExplorationSteps();
      
      tickExplorationSpellEffects();
      
      // Mark as visited
      markMapCellVisited(state.x, state.y);

      processExplorationResolution(prevX, prevY);
    }
  } else if (action === "backward") {
    const backDir = (state.dir + 2) % 4;
    if (currentCell.walls[backDir]) {
      playSound("bump");
      if (renderer) renderer.triggerShake(4, 150);
    } else if (isBlockedByOneWayPassage(state.x, state.y, backDir)) {
      blockOneWayMove();
    } else {
      const backX = state.x + DX[backDir];
      const backY = state.y + DY[backDir];
      const backTrap = state.map[backY]?.[backX]?.trap;
      if (backTrap && backTrap.state === "discovered") {
        startTrapEncounter(backTrap, { x: backX, y: backY });
        saveAutosave();
        updateUI();
        return;
      }
      state.x = backX;
      state.y = backY;
      recordExplorationSteps();
      tickExplorationSpellEffects();
      markMapCellVisited(state.x, state.y);
      
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
    ensureRunFloor(state, nextFloor);
    state.floor = nextFloor;
    state.sessionMaxFloor = Math.max(state.sessionMaxFloor, state.floor);
    if (state.currentRun) {
      if (!state.currentRun.floorsVisited.includes(nextFloor)) {
        state.currentRun.floorsVisited.push(nextFloor);
      }
      state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
      updateRunQuests(state.currentRun, getPartyMaxAffix(state.party, "contractReward")).forEach(quest => {
        addLog(`【ランクエスト達成】${quest.name}：素材ボーナスを獲得した。`);
      });
    }

    const target = landingCoord || findCellCoordsByType(state.maps[nextFloor - 1], "stairs-up");
    state.x = target.x;
    state.y = target.y;
    markMapCellVisited(state.x, state.y);

    const theme = getFloorTheme(nextFloor);
    const firstVisit = revealFloor(state, nextFloor);
    applyFloorTransitionHeal();
    if (isPitfall) {
      addLog(`ドスン！地下${nextFloor}階の冷たい床に叩きつけられた！`);
    } else {
      addLog(`【${theme.name}】${firstVisit ? theme.entryText.first : theme.entryText.revisit}`);
    }

    checkFloorOmenMessage();
    
    state.transitioning = false;
    startCampEntryIfEligible(nextFloor);
    saveAutosave();
    updateUI();
    showFloorEntryStinger(nextFloor, firstVisit);

    if (isPitfall && typeof onLanding === "function") {
      onLanding();
    }
  }, 1200);
}

function getCampEntryTitle(floor) {
  const skin = getFloorTheme(floor)?.eventSkins.camp || "野営地";
  return `${skin}。腰を落ち着けられる場所を確かめる。`;
}

export function startCampEntryIfEligible(floor = state.floor) {
  if (!isCampEntryEligible(state, floor)) return false;
  if (!beginCampEntry(state, floor)) return false;
  openGuardedSubmenu(EVENT_TYPES.CAMP, getCampEntryTitle(floor));
  return true;
}

export function resumePendingCampEntry() {
  const floor = state.currentRun?.pendingCampEntryFloor;
  if (state.gameState !== "explore" || !Number.isInteger(floor) || floor !== state.floor) {
    return false;
  }
  if (!isCampEntryEligible(state, floor)) return false;
  openGuardedSubmenu(EVENT_TYPES.CAMP, getCampEntryTitle(floor));
  return true;
}

export function applyFloorTransitionHeal() {
  const char = state.party[0];
  if (!char || char.hp <= 0 || char.status === "dead") return 0;
  const maxHp = getCharMaxHp(char);
  const healed = Math.min(maxHp - char.hp, Math.max(1, Math.floor(maxHp * 0.15)));
  if (healed <= 0) return 0;
  char.hp += healed;
  addLog(`階層移動の小休止でHPが${healed}回復した。`);
  return healed;
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
    const roamingRange = nearest?.kind === "elite" ? 5 + hearRangeBonus : 3 + hearRangeBonus;
    if (nearest && minFlackDist <= roamingRange) {
      addLog(`【⚠️警告】近くから桁違いの殺気が漂ってくる…強敵「${nearest.name}」が近くにいる！`);
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
  const cell = state.map[state.y][state.x];
  applyStairsHeal(cell);

  // Floors are one-way during a run. The entrance stairs never return upward.
  if (cell.type === "stairs-up") {
    addLog("上り階段は崩れ、前のフロアには戻れない。");
    playSound("bump");
    return;
  }

  // Stairs Down (ask before descending so corridors stay walkable)
  if (cell.type === "stairs-down") {
    if (state.floor % 5 === 0 && !state.currentRun?.defeatedMilestones?.includes(state.floor)) {
      addLog("階層守護者を倒すまで下り階段は封じられている。");
      playSound("bump");
      return;
    }
    openGuardedSubmenu("stairs_down", `${getFloorLabel(state, state.floor + 1)}への下り階段`);
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
    const milestoneBoss = cell.milestoneFloor === state.floor;
    if (!milestoneBoss && !state.inventory.includes("DRAGON_KEY")) {
      addLog("扉は閉ざされている。「竜の鍵」がなければ開かないようだ…");
      playSound("bump");
      if (renderer) renderer.triggerShake(4, 150);
      state.x = prevX;
      state.y = prevY;
      return;
    }
    state.transitioning = true;
    if (!milestoneBoss) addLog("竜の鍵を使って頑丈な扉を開けた！");
    addLog(`警告：B${state.floor}Fの階層守護者が立ちふさがる！戦闘準備！`);
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
    playSound("item");
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
    openGuardedSubmenu(EVENT_TYPES.CAMP, `${skin}。腰を落ち着けられる場所を確かめる。`);
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
    if (!state.currentRun?.defeatedMilestones?.includes(state.floor)) {
      addLog("深層商人は守護者を退けるまで取引に応じない。");
      return;
    }
    state.currentRun.visitedMilestoneMerchants ||= [];
    if (!state.currentRun.visitedMilestoneMerchants.includes(state.floor)) {
      state.currentRun.visitedMilestoneMerchants.push(state.floor);
      state.codex.events.facilities.merchant.found++;
    }
    const skin = getFloorTheme(state.floor)?.eventSkins.merchant || "深層商人";
    openGuardedSubmenu("milestone_merchant", `${skin}：素材で補給する`);
    return;
  }

  if (cell.event === EVENT_TYPES.RETURN_PORTAL) {
    if (!state.currentRun?.defeatedMilestones?.includes(state.floor)) {
      addLog("帰還の門は階層守護者の力で封じられている。");
      return;
    }
    openGuardedSubmenu("milestone_portal", `B${state.floor}F 帰還の門`);
    return;
  }

  const encounterChance = getEncounterChance();

  // Random Encounter
  const forcedEncounter = state.forcedEncounterSteps > 0;
  if (forcedEncounter) state.forcedEncounterSteps = 0;
  if (
    forcedEncounter ||
    ((!state.repelTurns || state.repelTurns <= 0) && Math.random() < encounterChance)
  ) {
    state.transitioning = true;
    createNoiseEvent(state.x, state.y);
    addLog(forcedEncounter ? "鳴らし玉に誘われ、通常の魔物が現れた！" : "モンスターが暗闇から襲いかかってきた！");
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
      const result = resolveExplorationPoisonStep(c);
      if (result.damage > 0) {
        addLog(`[!] 毒のダメージ！${c.name}は${result.damage}のダメージを受けた。`);
        tookDamage = true;
      }
      if (c.hp === 0) {
        c.status = "dead";
        recordCharDeath(state, c, "毒のダメージ", { type: "status", source: "毒" });
        addLog(`[!] ${c.name}は毒で力尽きた！`);
      } else if (result.naturalCure) {
        addLog(`[!] ${c.name}の毒が自然に消えた。`);
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
  addLog("【⚠️熱気の気配】周囲に熱気が走った！");
  playSound("chest_trap");
  if (renderer) renderer.triggerShake(10, 400);
  if (renderer && typeof renderer.triggerFlash === "function") {
    renderer.triggerFlash(400);
  }

  const warningAvoidanceChance = getPartyFlameTrapWarningAvoidanceChance(state.party);
  if (warningAvoidanceChance > 0 && Math.random() < warningAvoidanceChance) {
    addLog("熱気の気配を感じ、とっさに身をかわした！");
    saveAutosave();
    updateUI();
    return;
  }

  addLog("天井から猛烈な火炎ブレスが吹き出した！");
  const effect = applyTrapGuardToEffect(resolveFlameTrapEffect({
    party: state.party,
    rng: Math.random
  }), {
    trapGuardByParty: state.party.map(char => getCharAffixSum(char, "trapGuard"))
  });
  state.party.forEach((c, index) => {
    const dmg = effect.partyDamage[index];
    if (dmg > 0) {
      c.hp = Math.max(0, c.hp - dmg);
      clearCharIncapacitationOnDamage(c);
      addLog(`${c.name}は${dmg}の炎ダメージを受けた。`);
      if (c.hp === 0) {
        c.status = "dead";
        recordCharDeath(state, c, "火炎の罠", { type: "trap", source: "火炎の罠" });
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
  openSubmenu("solo_start", "クラスを選択：潜行ごとにLv1から開始");
}

function assignSelectedRunQuests(run, templateIds) {
  const selected = [...new Set(templateIds)]
    .map(id => RUN_QUEST_TEMPLATES.find(template => template.id === id))
    .filter(Boolean)
    .slice(0, 2);
  if (selected.length === 0) {
    assignRunQuests(run);
    return;
  }
  run.quests = selected.map(template => createRunQuest(template, run.startFloor || 1));
  run.defeatsByRole ||= {};
  updateRunQuests(run);
}

export function executeEnterDungeon(floor, { departureCraft = [], runQuestTemplateIds = null } = {}) {
  state.party = state.party.slice(0, 1);
  state.gameState = "explore";
  menuContext.prevGameState = null;
  state.floor = floor;
  state.sessionMaxFloor = floor; // セッション最深階を初期化
  state.currentRun = createDefaultCurrentRun();
  state.silenceTurns = 0;
  state.forcedEncounterSteps = 0;
  state.currentRun.startedAt = Date.now();
  state.currentRun.runSeed = `${state.seed}:run:${state.currentRun.startedAt}`;
  state.currentRun.startFloor = floor;
  state.currentRun.deepestFloor = floor;
  state.currentRun.characterClass = state.party[0]?.class || null;
  state.currentRun.floorsVisited = [floor];
  state.currentRun.floorSteps = {};
  if (Array.isArray(runQuestTemplateIds) && runQuestTemplateIds.length > 0) {
    assignSelectedRunQuests(state.currentRun, runQuestTemplateIds);
  } else {
    assignRunQuests(state.currentRun);
  }
  resetRunFloors(state);
  ensureRunFloor(state, floor);
  if (floor > 1) {
    state.currentRun.defeatedMilestones = [floor];
    let removedBoss = false;
    state.maps[floor - 1].flat().forEach(cell => {
      if (cell.event === EVENT_TYPES.BOSS && cell.milestoneFloor === floor) {
        cell.event = null;
        removedBoss = true;
      }
    });
    if (removedBoss) markMapChanged();
  }
  const workshopGrants = getWorkshopGrants(state.workshop);
  const craftGrants = getDepartureCraftGrants(departureCraft);
  state.identifyTickets = IDENTIFICATION_BALANCE.startingPowder +
    workshopGrants.identifyPowder + craftGrants.identifyPowder;
  state.inventory = [
    ...workshopGrants.returnItems,
    ...craftGrants.items
  ];
  state.party.forEach(char => {
    char.runTrapAttackBonus = 0;
  });

  const target = findCellCoordsByType(state.maps[floor - 1], "stairs-up");
  state.x = target.x;
  state.y = target.y;

  state.dir = DIR_N;
  markMapCellVisited(state.x, state.y);
  trackRunStart(state.currentRun, state.party[0], state);
  const theme = getFloorTheme(floor);
  const firstVisit = revealFloor(state, floor);
  addLog(`【${theme.name}】${firstVisit ? theme.entryText.first : theme.entryText.revisit}`);
  addLog(`鑑定粉を${state.identifyTickets}個持って潜行を開始した。`);
  addLog(`ランクエスト：${state.currentRun.quests.map(quest => quest.name).join(" / ")}`);
  checkFloorOmenMessage();
  playSound("move");
  saveAutosave();
  updateUI();
  showFloorEntryStinger(floor, firstVisit);
}

function beginRoamingMonsterCombat(monster) {
  state.transitioning = true;
  addLog(`【⚠️遭遇！】徘徊する強敵「${monster.name}」が目の前に現れた！`);
  playSound("chest_trap");
  setTimeout(() => {
    state.transitioning = false;
    startCombat(false, false, true, monster);
  }, 1000);
}

export function checkRoamingMonsterEncounter() {
  if (!state.roamingMonsters) return false;
  const elite = state.roamingMonsters.find(
    rm => rm.floor === state.floor && rm.x === state.x && rm.y === state.y
  );
  if (elite) {
    beginRoamingMonsterCombat(elite);
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
  const patrolRadius = ELITE_PATROL_RADIUS;
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
  if (homeDistance > ELITE_PATROL_RADIUS) {
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

export function advanceRoamingTurn(playerMoved) {
  state.noiseEvents = (state.noiseEvents || [])
    .map(event => ({ ...event, ttl: event.ttl - 1 }))
    .filter(event => event.ttl > 0);
  state.roamingMovementStepCount = (state.roamingMovementStepCount || 0) + 1;
  if (state.roamingMovementStepCount % 2 !== 0) return false;
  moveRoamingMonsters(playerMoved);
  return checkRoamingMonsterEncounter();
}

export function processExplorationResolution(prevX, prevY) {
  const wiped = applyExplorationPoison();
  if (wiped) return;

  // 1. Check if player stepped onto Flack
  if (checkRoamingMonsterEncounter()) {
    return;
  }

  // 2. Move Flacks if it's their turn
  if (advanceRoamingTurn(true)) return;

  // 2.5. Detect traps on adjacent cells. Stepping onto a trap is intercepted
  // before the move happens (see handleMove), so there is no step check here.
  const cell = getCurrentExplorationCell();
  if (!cell) return;
  // A trap that was never spotted fires without offering a choice.
  const steppedTrap = cell.trap;
  if (steppedTrap && steppedTrap.state === "hidden") {
    addLog("【⚠️罠発動！】不意に罠を踏み抜いてしまった！");
    steppedTrap.state = "disabled";
    markMapChanged();
    if (state.currentRun) state.currentRun.trapsTriggered++;
    if (steppedTrap.type === "pitfall") {
      triggerPitfall(steppedTrap, false);
      return;
    }
    if (triggerTrap(steppedTrap, false)) return;
  }
  detectAdjacentTraps();

  // 3. Regular floor events
  const isSpecialCell = cell.type === "stairs-up" || cell.type === "stairs-down" || 
                        cell.event === "midboss" || cell.event === "boss" || cell.event === "chest" ||
                        cell.event === EVENT_TYPES.MERCHANT || cell.event === EVENT_TYPES.RETURN_PORTAL ||
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
