import { state, saveAutosave, addLog, addEventLog, resolveEventObservation, recordCharDeath, formatCharDeathLog, markMapChanged, markMapCellVisited } from "../state.js";
import { applyExplorationRecovery } from "./exploration_recovery.js";
import { updateUI } from "../ui.js";
import { playSound } from "../audio.js";
import { triggerGameOver } from "../combat.js";
import { dungeonRenderer as renderer } from "../renderer_runtime.js";
import { createRng } from "../seed_rng.js";
import { descendToFloor, findCellCoordsByType } from "../movement.js";
import { DX, DY, getCharAffixSum, getCharTrapBonus } from "../data.js";
import { getFloorTrapCodexId } from "../state/codex_trap_ids.js";
import { armControlsGuard } from "../controls_guard.js";
import { clearCharIncapacitationOnDamage } from "../combat_logic/status_effects.js";
import {
  calculateDetectRate,
  calculateFloorTrapSuccessRate,
  resolveTrapAction
} from "../rules/trap_rules.js";
import { applyTrapGuardToEffect, resolveFloorTrapEffect } from "../rules/trap_effect_rules.js";
import { ensureRunFloor } from "../state/run_floor_state.js";
import { collectNaturallyReachableKeys } from "../rules/traversal_gimmicks.js";
import { trackTrapResolution } from "../telemetry.js";
import { getDungeonFloor } from "../rules/dungeons.js";
import { addNoise } from "./dungeon_noise.js";

const CHEST_TRAP_TIERS = ["poison needle", "flash bomb", "corrosion", "teleporter"];

function getTrapObservationKey(trap) {
  return trap?.position
    ? `trap:${state.floor}:${trap.position.x}:${trap.position.y}`
    : null;
}

export function increaseChestTrapTier(trap, levels = 1) {
  const index = CHEST_TRAP_TIERS.indexOf(trap);
  if (index < 0) return trap;
  return CHEST_TRAP_TIERS[Math.min(CHEST_TRAP_TIERS.length - 1, index + levels)];
}

// The game is solo; the run keeps its one character at state.party[0].
function getSoloCharacter() {
  return state.party?.[0] ?? null;
}

function getActiveCharacter() {
  const character = getSoloCharacter();
  return character?.hp > 0 && !["dead", "ash"].includes(character.status) ? character : null;
}

// Apply a floor trap's HP damage to the solo character. Returns true when the
// character is dead afterwards.
function applyFloorTrapDamage(effect, { cause, source, deathMessage, damageMessage }) {
  const character = getSoloCharacter();
  const dmg = effect.damage;
  if (character && dmg > 0) {
    character.hp = Math.max(0, character.hp - dmg);
    clearCharIncapacitationOnDamage(character);
    addLog(damageMessage(character, dmg));
    if (character.hp === 0) {
      character.status = "dead";
      const deathLog = recordCharDeath(state, character, cause, { type: "trap", source });
      if (deathLog) addLog(formatCharDeathLog(deathLog));
      addLog(deathMessage(character));
    }
  }
  return !character || character.status === "dead";
}

function resolveSoloFloorTrapEffect(trap, weakened) {
  const character = getSoloCharacter();
  return applyTrapGuardToEffect(resolveFloorTrapEffect({
    trap,
    floor: state.floor,
    character,
    weakened,
    rng: Math.random
  }), {
    trapGuard: getCharAffixSum(character, "trapGuard")
  });
}

function recordTrapCodex(type, field) {
  const record = state.codex?.events?.traps?.[getFloorTrapCodexId(type)];
  if (!record) return;
  record[field]++;
  if (record.firstFloor === 0) {
    record.firstFloor = state.floor;
  }
}

export function calculateSuccessRate(trap) {
  const char = getActiveCharacter();
  if (!char) return 0;

  return calculateFloorTrapSuccessRate({
    trap,
    floor: state.floor,
    // 罠解除は宝箱罠と共通ステータス。getCharTrapBonus は 0.1 = 10% の小数を返すため、
    // 0〜100 スケールの calculateDisarmRate 用に整数パーセントへ戻す。
    affixBonus: Math.round(getCharTrapBonus(char) * 100)
  });
}

export function getExpectedEffectText(trap) {
  switch (trap.type) {
    case "damage":
      return "HPダメージ";
    case "mpDrain":
      return "MP減少";
    case "alarm":
      return "警報";
    case "pitfall":
      return `地下${getDungeonFloor(state.floor + 1)}階へ落下`;
    default:
      return "不明な効果";
  }
}

// What the trap panel says happens when the trap goes off. The short noun
// form above is for log lines ("...の罠がある").
export function getTrapConsequenceText(trap) {
  switch (trap.type) {
    case "damage":
      return "HPを削られる";
    case "mpDrain":
      return "MPを奪われる";
    case "alarm":
      return "警報が鳴り、魔物が集まって手強くなる";
    case "pitfall":
      return `地下${getDungeonFloor(state.floor + 1)}階へ落ちる`;
    default:
      return "何が起こるか分からない";
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
    consequence: revealLevel >= 2 ? getTrapConsequenceText(trap) : "何が起こるか分からない",
    revealLevel
  };
  if (typeof document !== "undefined") updateUI();
}

// 罠はルート選択の障害物なので、察知はクラス非依存で全員に配る。
// 壁越しは察知しない（行けない場所の情報でマップが汚れるため）。
// 1つの罠につき判定は生涯1回（引き直せると判定が作業に化けるため）。
export function detectAdjacentTraps() {
  const rate = calculateDetectRate();
  const reader = getSoloCharacter();
  const traceRead = reader && reader.hp > 0 && reader.status !== "dead"
    ? Math.max(0, getCharAffixSum(reader, "traceRead"))
    : 0;
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
    trackTrapResolution("observed", {
      state,
      character: getActiveCharacter(),
      source: "floor",
      trap,
      action: "detect",
      identified: traceRead >= 2,
      x,
      y
    });
    found.push(trap);
  }

  if (found.length === 0) return false;
  markMapChanged();

  const lead = found[0];
  if (traceRead >= 2) {
    addEventLog(`【痕跡】隣接する床に${getExpectedEffectText(lead)}の罠がある。`, {
      key: getTrapObservationKey(lead),
      scope: `trap:${state.floor}`
    });
  } else {
    addEventLog("【痕跡】隣接する床に罠の気配がある。", {
      key: getTrapObservationKey(lead),
      scope: `trap:${state.floor}`
    });
  }
  playSound("miss");
  return true;
}

export function triggerPitfall(trap, isPartialSuccess = false, action = "trigger") {
  resolveEventObservation(getTrapObservationKey(trap));
  trackTrapResolution("triggered", {
    state,
    character: getActiveCharacter(),
    source: "floor",
    trap,
    action,
    partialSuccess: isPartialSuccess,
    x: trap?.position?.x,
    y: trap?.position?.y
  });
  const nextFloor = state.floor + 1;
  const nextMap = ensureRunFloor(state, nextFloor);
  
  const candidates = [];
  // Never drop the player into a pocket they cannot walk out of (a sealed
  // branch or past unresolved rubble).
  const reachableFromEntry = collectNaturallyReachableKeys(nextMap, findCellCoordsByType(nextMap, "stairs-up"));
  for (let y = 1; y < nextMap.length - 1; y++) {
    const rowWidth = nextMap[y]?.length ?? 0;
    for (let x = 1; x < rowWidth - 1; x++) {
      const cell = nextMap[y]?.[x];
      if (!cell) continue;
      const isPassable = cell.walls && cell.walls.some(w => !w);
      const isNotStairs = cell.type !== "stairs-up" && cell.type !== "stairs-down";
      const hasNoEvent = !cell.event;
      const hasNoTrap = !cell.trap;
      
      if (isPassable && isNotStairs && hasNoEvent && hasNoTrap && reachableFromEntry.has(`${x},${y}`)) {
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
    const effect = resolveSoloFloorTrapEffect(trap, isPartialSuccess);
    const characterDead = applyFloorTrapDamage(effect, {
      cause: "落とし穴トラップ",
      source: "落とし穴",
      damageMessage: (c, dmg) => `${c.name}は落下で${dmg}のダメージを受けた。`,
      deathMessage: c => `${c.name}は力尽きた！`
    });

    if (state.currentRun) {
      state.currentRun.pitfallsFallen = (state.currentRun.pitfallsFallen || 0) + 1;
      state.currentRun.trapsTriggered++;
    }

    recordTrapCodex("pitfall", "triggered");

    if (characterDead) {
      triggerGameOver();
      return;
    }
    
    saveAutosave();
    updateUI();
  };

  descendToFloor(nextFloor, landingCoord, true, onLanding);
}

export function triggerTrap(trap, isPartialSuccess = false, action = "trigger") {
  resolveEventObservation(getTrapObservationKey(trap));
  trackTrapResolution("triggered", {
    state,
    character: getActiveCharacter(),
    source: "floor",
    trap,
    action,
    partialSuccess: isPartialSuccess,
    x: trap?.position?.x,
    y: trap?.position?.y
  });
  const effect = resolveSoloFloorTrapEffect(trap, isPartialSuccess);

  playSound("chest_trap");
  
  if (renderer) {
    if (typeof renderer.triggerFlash === "function") {
      renderer.triggerFlash(400);
    }
  }

  if (trap.type === "damage") {
    const characterDead = applyFloorTrapDamage(effect, {
      cause: "仕掛けられた罠",
      source: "床のダメージ罠",
      damageMessage: (c, dmg) => `${c.name}は${dmg}のダメージを受けた。`,
      deathMessage: c => `${c.name}は力尽きた！`
    });
    if (characterDead) {
      triggerGameOver();
      return true;
    }
  } else if (trap.type === "mpDrain") {
    const character = getSoloCharacter();
    const drain = effect.mpDrain;
    if (character && drain > 0) {
      character.mp = Math.max(0, character.mp - drain);
      addLog(`${character.name}のMPが${drain}減少した。`);
    }
  } else if (trap.type === "alarm") {
    state.alarmActive = true;
    state.alarmWeakened = effect.alarmWeakened;
    addNoise(state, state.x, state.y, 4, { source: "alarm" });
    addLog("けたたましい警報音が響き渡った！");
  }

  return false;
}

function completePendingMove() {
  const move = state.activeTrapState?.pendingMove;
  if (!move) return;
  state.x = move.x;
  state.y = move.y;
  if (markMapCellVisited(move.x, move.y)) applyExplorationRecovery(state);
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

  if (action === "force") {
    const resolution = resolveTrapAction({
      action,
      trap,
      successRate,
      rng: Math.random
    });
    if (trap.type === "pitfall") {
      addLog("意を決して落とし穴へ飛び込んだ！");
      trap.state = "disabled";
      markMapChanged();
      state.gameState = "explore";
      state.activeTrapState = null;
      triggerPitfall(trap, resolution.partialSuccess, "force");
      return;
    }

    // 強行は必ず通れる。チョーク罠でフロア突破不能にしないための保証。
    addLog("罠を承知で強引に駆け抜けた！");
    trap.state = "disabled";
    markMapChanged();
    if (triggerTrap(trap, resolution.partialSuccess, "force")) return;
    completePendingMove();
    endTrapEncounter();
    return;
  }

  if (action === "disarm") {
    const resolution = resolveTrapAction({
      action,
      trap,
      successRate,
      rng: Math.random
    });

    if (trap.type === "pitfall") {
      if (resolution.outcome === "disarmed") {
        addLog("慎重に縁を伝い、落とし穴を渡りきった！");
        playSound("item");
        trap.state = "disabled";
        resolveEventObservation(getTrapObservationKey(trap));
        markMapChanged();
        if (state.currentRun) state.currentRun.trapsDisarmed++;
        recordTrapCodex("pitfall", "disarmed");
        trackTrapResolution("disarmed", {
          state,
          character: getActiveCharacter(),
          source: "floor",
          trap,
          action: "disarm",
          successRate,
          x: trap?.position?.x,
          y: trap?.position?.y
        });
        completePendingMove();
        endTrapEncounter();
      } else {
        addLog("バランスを崩して落とし穴に落ちてしまった！");
        trap.state = "disabled";
        markMapChanged();
        if (state.currentRun) state.currentRun.trapsTriggered++;
        recordTrapCodex("pitfall", "triggered");
        state.gameState = "explore";
        state.activeTrapState = null;
        triggerPitfall(trap, false, "disarm");
      }
      return;
    }

    const codexTrapType = trap.type;

    if (resolution.outcome === "disarmed") {
      addLog("罠を解除した。仕掛けは完全に止まった。");
      playSound("item");
      if (state.currentRun) state.currentRun.trapsDisarmed++;
      recordTrapCodex(codexTrapType, "disarmed");
      trackTrapResolution("disarmed", {
        state,
        character: getActiveCharacter(),
        source: "floor",
        trap,
        action: "disarm",
        successRate,
        x: trap?.position?.x,
        y: trap?.position?.y
      });
    } else if (resolution.partialSuccess) {
      addLog("完全には解除できなかったが、被害を最小限に抑えた！");
      if (state.currentRun) state.currentRun.trapsTriggered++;
      recordTrapCodex(codexTrapType, "triggered");
      trap.state = "disabled";
      markMapChanged();
      if (triggerTrap(trap, true, "disarm")) return;
    } else {
      addLog("解除に失敗し、仕掛けが暴発した！");
      if (state.currentRun) state.currentRun.trapsTriggered++;
      recordTrapCodex(codexTrapType, "triggered");
      trap.state = "disabled";
      markMapChanged();
      if (triggerTrap(trap, false, "disarm")) return;
    }

    // 解除は成功・部分成功・失敗のいずれでも罠を使い切って通過する。
    // 同じ罠を再度踏んで判定を引き直せる状態を残さない。
    trap.state = "disabled";
    resolveEventObservation(getTrapObservationKey(trap));
    markMapChanged();
    completePendingMove();
    endTrapEncounter();
    return;
  }
}
