import { state, saveAutosave, addLog, recordCharDeath, markMapChanged, markMapCellVisited } from "../state.js";
import { updateUI } from "../ui.js";
import { playSound } from "../audio.js";
import { triggerGameOver } from "../combat.js";
import { dungeonRenderer as renderer } from "../renderer.js";
import { createRng } from "../seed_rng.js";
import { descendToFloor, findCellCoordsByType } from "../movement.js";
import { MAP_WIDTH, MAP_HEIGHT, DX, DY, getPartyMaxAffix } from "../data.js";
import { armControlsGuard } from "../controls_guard.js";
import { clearCharIncapacitationOnDamage } from "../combat_logic/status_effects.js";
import {
  calculateDisarmRate,
  calculateDetectRate,
  PITFALL_EDGE_BONUS,
  PARTIAL_SUCCESS_BAND,
  FORCE_DAMAGE_MULTIPLIER
} from "../rules/trap_rules.js";

const CHEST_TRAP_TIERS = ["poison needle", "flash bomb", "gas bomb", "teleporter"];

export function increaseChestTrapTier(trap, levels = 1) {
  const index = CHEST_TRAP_TIERS.indexOf(trap);
  if (index < 0) return trap;
  return CHEST_TRAP_TIERS[Math.min(CHEST_TRAP_TIERS.length - 1, index + levels)];
}

function getActiveCharacter() {
  return (state.party || []).find(
    char => char?.hp > 0 && !["dead", "ash"].includes(char.status)
  ) || null;
}

function recordTrapCodex(type, field) {
  const record = state.codex?.events?.traps?.[type];
  if (!record) return;
  record[field]++;
  if (record.firstFloor === 0) {
    record.firstFloor = state.floor;
  }
}

export function calculateSuccessRate(trap) {
  const char = getActiveCharacter();
  if (!char) return 0;

  const rate = calculateDisarmRate({
    className: char.class,
    level: char.level,
    floor: state.floor,
    affixBonus: getPartyMaxAffix(state.party, "disarmBonus") || 0
  });

  return trap.type === "pitfall" ? Math.min(100, rate + PITFALL_EDGE_BONUS) : rate;
}

export function getExpectedEffectText(trap) {
  switch (trap.type) {
    case "damage":
      return "HPダメージ";
    case "mpDrain":
      return "MP減少";
    case "alarm":
      return "警報発報(次回敵強化/遭遇率上昇)";
    case "pitfall":
      return `地下${state.floor + 1}階へ落下`;
    default:
      return "不明な効果";
  }
}

function getTrapRevealLevel(trap) {
  if (Number.isFinite(trap.traceReadLevel)) return trap.traceReadLevel;
  if (trap.state === "discovered") return 3;
  return 0;
}

export function startTrapEncounter(trap, pendingMove) {
  const revealLevel = getTrapRevealLevel(trap);
  armControlsGuard();
  state.gameState = "trap_encounter";
  state.activeTrapState = {
    trap,
    pendingMove,
    successRate: calculateSuccessRate(trap),
    expectedEffect: revealLevel >= 2 ? getExpectedEffectText(trap) : "不明",
    revealLevel
  };
  if (typeof document !== "undefined") updateUI();
}

// 罠はルート選択の障害物なので、察知はクラス非依存で全員に配る。
// 壁越しは察知しない（行けない場所の情報でマップが汚れるため）。
// 1つの罠につき判定は生涯1回（引き直せると判定が作業に化けるため）。
export function detectAdjacentTraps() {
  const rate = calculateDetectRate({ floor: state.floor });
  const traceRead = getPartyMaxAffix(state.party, "traceRead");
  const found = [];

  for (let dir = 0; dir < 4; dir++) {
    const cell = state.map[state.y]?.[state.x];
    if (!cell || cell.walls[dir]) continue;

    const x = state.x + DX[dir];
    const y = state.y + DY[dir];
    const trap = state.map[y]?.[x]?.trap;
    if (!trap || trap.state !== "hidden" || trap.detectRolled) continue;

    trap.detectRolled = true;
    if (Math.random() >= rate) continue;

    trap.state = "discovered";
    if (traceRead > 0) trap.traceReadLevel = traceRead;
    found.push(trap);
  }

  if (found.length === 0) return false;
  markMapChanged();

  const lead = found[0];
  if (traceRead >= 2) {
    addLog(`【痕跡】隣接する床に${getExpectedEffectText(lead)}の罠がある。`);
  } else {
    addLog("【痕跡】隣接する床に罠の気配がある。");
  }
  playSound("miss");
  return true;
}

export function triggerPitfall(trap, isPartialSuccess = false) {
  const nextFloor = state.floor + 1;
  const nextMap = state.maps[nextFloor - 1];
  
  const candidates = [];
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const cell = nextMap[y]?.[x];
      if (!cell) continue;
      const isPassable = cell.walls && cell.walls.some(w => !w);
      const isNotStairs = cell.type !== "stairs-up" && cell.type !== "stairs-down";
      const hasNoEvent = !cell.event;
      const hasNoTrap = !cell.trap;
      
      if (isPassable && isNotStairs && hasNoEvent && hasNoTrap) {
        candidates.push({ x, y });
      }
    }
  }
  
  let landingCoord;
  if (candidates.length > 0) {
    const seed = state.seed;
    const pitfallRng = createRng(`${seed}:pitfall:B${state.floor}:${trap.position.x}_${trap.position.y}`);
    const index = Math.floor(pitfallRng() * candidates.length);
    landingCoord = candidates[index];
  } else {
    const stairsUp = findCellCoordsByType(nextMap, "stairs-up");
    const directions = [
      { dx: 0, dy: -1, wallIndex: 0 },
      { dx: 1, dy: 0, wallIndex: 1 },
      { dx: 0, dy: 1, wallIndex: 2 },
      { dx: -1, dy: 0, wallIndex: 3 }
    ];
    let found = false;
    for (const d of directions) {
      const nx = stairsUp.x + d.dx;
      const ny = stairsUp.y + d.dy;
      const stairsUpCell = nextMap[stairsUp.y]?.[stairsUp.x];
      if (stairsUpCell && !stairsUpCell.walls[d.wallIndex]) {
        landingCoord = { x: nx, y: ny };
        found = true;
        break;
      }
    }
    if (!found) {
      landingCoord = stairsUp;
    }
  }

  const onLanding = () => {
    let powerMultiplier = isPartialSuccess ? FORCE_DAMAGE_MULTIPLIER : 1;
    
    const hasScout = state.party.some(c => ["Thief", "Ninja"].includes(c.class) && c.hp > 0);
    if (hasScout) {
      powerMultiplier *= 0.7;
      addLog("[味方] 盗賊の素早い身のこなしにより、着地時の衝撃が和らいだ！");
    }
    
    state.party.forEach(c => {
      if (c.status !== "dead") {
        const baseDmg = state.floor * 2;
        const randDmg = Math.floor(Math.random() * 7) + 4; // 4..10
        const rawDmg = baseDmg + randDmg;
        const dmg = Math.max(1, Math.floor(rawDmg * powerMultiplier));
        
        c.hp = Math.max(0, c.hp - dmg);
        clearCharIncapacitationOnDamage(c);
        addLog(`[!] ${c.name}は落下で${dmg}のダメージを受けた。`);
        
        if (c.hp === 0) {
          c.status = "dead";
          recordCharDeath(state, c, "落とし穴トラップ");
          addLog(`[!] ${c.name}は力尽きた！`);
        }
      }
    });

    if (state.currentRun) {
      state.currentRun.pitfallsFallen = (state.currentRun.pitfallsFallen || 0) + 1;
      state.currentRun.trapsTriggered++;
    }

    recordTrapCodex("pitfall", "triggered");

    const allPartyDead = state.party.every(c => c.status === "dead");
    if (allPartyDead) {
      triggerGameOver();
      return;
    }
    
    saveAutosave();
    updateUI();
  };

  descendToFloor(nextFloor, landingCoord, true, onLanding);
}

export function triggerTrap(trap, isPartialSuccess = false) {
  let powerMultiplier = isPartialSuccess ? FORCE_DAMAGE_MULTIPLIER : 1;

  // 探索能力に応じた失敗時の被害軽減（ThiefやNinjaが生存していると30%軽減）
  const hasScout = state.party.some(c => ["Thief", "Ninja"].includes(c.class) && c.hp > 0);
  if (hasScout && !isPartialSuccess) {
    powerMultiplier *= 0.7;
    addLog("[味方] 盗賊の素早い身のこなしにより、罠の被害が抑えられた！");
  }

  playSound("chest_trap");
  
  if (renderer) {
    if (typeof renderer.triggerShake === "function") {
      renderer.triggerShake(10, 400);
    }
    if (typeof renderer.triggerFlash === "function") {
      renderer.triggerFlash(400);
    }
  }

  if (trap.type === "damage") {
    const baseMin = 6 + state.floor * 2;
    const baseMax = 12 + state.floor * 4;
    const dmgRange = baseMax - baseMin + 1;
    
    state.party.forEach(c => {
      if (c.status !== "dead") {
        const rawDmg = Math.floor(Math.random() * dmgRange) + baseMin;
        const dmg = Math.max(1, Math.floor(rawDmg * powerMultiplier));
        c.hp = Math.max(0, c.hp - dmg);
        clearCharIncapacitationOnDamage(c);
        addLog(`[!] ${c.name}は${dmg}のダメージを受けた。`);
        if (c.hp === 0) {
          c.status = "dead";
          recordCharDeath(state, c, "仕掛けられた罠");
          addLog(`[!] ${c.name}は力尽きた！`);
        }
      }
    });

    const allPartyDead = state.party.every(c => c.status === "dead");
    if (allPartyDead) {
      triggerGameOver();
      return;
    }
  } else if (trap.type === "mpDrain") {
    const baseMin = 1;
    const baseMax = Math.max(2, Math.floor(state.floor * 1.2));
    const drainRange = baseMax - baseMin + 1;

    state.party.forEach(c => {
      if (c.status !== "dead" && c.maxMp > 0) {
        const rawDrain = Math.floor(Math.random() * drainRange) + baseMin;
        const drain = Math.max(1, Math.floor(rawDrain * powerMultiplier));
        c.mp = Math.max(0, c.mp - drain);
        addLog(`[!] ${c.name}のMPが${drain}減少した。`);
      }
    });
  } else if (trap.type === "alarm") {
    state.alarmActive = true;
    state.alarmWeakened = isPartialSuccess;
    if (!state.noiseEvents) state.noiseEvents = [];
    state.noiseEvents.push({ floor: state.floor, x: state.x, y: state.y, ttl: 4 });
    addLog("【⚠️警報】けたたましい警報音が響き渡った！");
  }
}

function completePendingMove() {
  const move = state.activeTrapState?.pendingMove;
  if (!move) return;
  state.x = move.x;
  state.y = move.y;
  markMapCellVisited(move.x, move.y);
}

function endTrapEncounter() {
  state.gameState = "explore";
  state.activeTrapState = null;
  saveAutosave();
  updateUI();
}

export function handleTrapAction(action) {
  if (!state.activeTrapState) return;
  const { trap, successRate } = state.activeTrapState;

  if (action === "back") {
    addLog("罠を前にして、その場に留まった。");
    playSound("move");
    endTrapEncounter();
    return;
  }

  if (action === "force") {
    if (trap.type === "pitfall") {
      addLog("意を決して落とし穴へ飛び込んだ！");
      trap.state = "disabled";
      markMapChanged();
      state.gameState = "explore";
      state.activeTrapState = null;
      triggerPitfall(trap, true);
      return;
    }

    // 強行は必ず通れる。チョーク罠でフロア突破不能にしないための保証。
    addLog("罠を承知で強引に駆け抜けた！");
    triggerTrap(trap, true);
    trap.state = "disabled";
    markMapChanged();
    completePendingMove();
    endTrapEncounter();
    return;
  }

  if (action === "disarm") {
    const roll = Math.random() * 100;

    if (trap.type === "pitfall") {
      if (roll < successRate) {
        addLog("[味方] 【回避成功】慎重に縁を伝い、落とし穴を渡りきった！");
        playSound("item");
        trap.state = "disabled";
        markMapChanged();
        if (state.currentRun) state.currentRun.trapsDisarmed++;
        recordTrapCodex("pitfall", "disarmed");
        completePendingMove();
        endTrapEncounter();
      } else {
        addLog("【失敗】バランスを崩して落とし穴に落ちてしまった！");
        trap.state = "disabled";
        markMapChanged();
        if (state.currentRun) state.currentRun.trapsTriggered++;
        recordTrapCodex("pitfall", "triggered");
        state.gameState = "explore";
        state.activeTrapState = null;
        triggerPitfall(trap, false);
      }
      return;
    }

    const codexTrapType = trap.type === "damage"
      ? "poison needle"
      : (trap.type === "mpDrain" ? "gas bomb" : "flash bomb");

    if (roll < successRate) {
      addLog("[味方] 【解除成功】罠の機能を完全に停止した！");
      playSound("item");
      if (state.currentRun) state.currentRun.trapsDisarmed++;
      recordTrapCodex(codexTrapType, "disarmed");
    } else if (roll < successRate + PARTIAL_SUCCESS_BAND) {
      addLog("[味方] 【部分成功】完全には解除できなかったが、被害を最小限に抑えた！");
      triggerTrap(trap, true);
      if (state.currentRun) state.currentRun.trapsTriggered++;
      recordTrapCodex(codexTrapType, "triggered");
    } else {
      addLog("【解除失敗】仕掛けが暴発した！");
      triggerTrap(trap, false);
      if (state.currentRun) state.currentRun.trapsTriggered++;
      recordTrapCodex(codexTrapType, "triggered");
    }

    // 解除は成功・部分成功・失敗のいずれでも罠を使い切って通過する。
    // 同じ罠を再度踏んで判定を引き直せる状態を残さない。
    trap.state = "disabled";
    markMapChanged();
    completePendingMove();
    endTrapEncounter();
    return;
  }
}
