import { state, saveAutosave, addLog, recordCharDeath } from "../state.js";
import { updateUI } from "../ui.js";
import { startCombat } from "../combat_ui/combat_start.js";
import { playSound } from "../audio.js";
import { triggerGameOver } from "../combat.js";
import { dungeonRenderer as renderer } from "../renderer.js";
import { createRng } from "../seed_rng.js";
import { descendToFloor, findCellCoordsByType } from "../movement.js";
import { MAP_WIDTH, MAP_HEIGHT, START_X, START_Y, DX, DY, getPartyMaxAffix } from "../data.js";
import { armControlsGuard } from "../controls_guard.js";
import { clearCharIncapacitationOnDamage } from "../combat_logic/status_effects.js";

const CHEST_TRAP_TIERS = ["poison needle", "flash bomb", "gas bomb", "teleporter"];

export function increaseChestTrapTier(trap, levels = 1) {
  const index = CHEST_TRAP_TIERS.indexOf(trap);
  if (index < 0) return trap;
  return CHEST_TRAP_TIERS[Math.min(CHEST_TRAP_TIERS.length - 1, index + levels)];
}

function getBestDisarmer() {
  return (state.party || []).filter(char => char?.hp > 0 && !["dead", "ash"].includes(char.status))
    .reduce((best, char) => {
      const classBonus = char.class === "Thief" ? char.level * 2 + 15
        : char.class === "Ninja" ? char.level * 1.5 + 10
          : char.class === "Ranger" ? char.level + 5 : 0;
      const score = char.luk + char.agi + classBonus;
      return !best || score > best.score ? { char, score } : best;
    }, null)?.char || null;
}

function awardTrapGold(char) {
  const affix = getPartyMaxAffix(char ? [char] : [], "trapGold");
  if (affix <= 0) return 0;
  const amount = state.floor * 2 + affix;
  state.gold += amount;
  if (state.currentRun) state.currentRun.goldGained += amount;
  addLog(`[罠銭] 罠の機構から${amount}Gを回収した！`);
  return amount;
}

// 罠設定値
export const weakenedModifiers = {
  triggerRate: 0.5,
  effectPower: 0.5,
  difficulty: -20,
};

export const trapPersistenceByDepth = {
  shallow: {
    keepWeakenedRate: 0.85,
    reactivateRate: 0.05,
    permanentDisarmCount: 2,
  },
  middle: {
    keepWeakenedRate: 0.6,
    reactivateRate: 0.2,
    permanentDisarmCount: 3,
  },
  deep: {
    keepWeakenedRate: 0.35,
    reactivateRate: 0.4,
    permanentDisarmCount: Infinity,
  },
};

export function getDepthCategory(floor) {
  if (floor <= 2) return "shallow";
  if (floor <= 4) return "middle";
  return "deep";
}

function addDisarmPersistenceLog(trap) {
  const depth = getDepthCategory(state.floor);
  const nextWeakenLevel = (trap.weakenLevel || 0) + 1;
  if (nextWeakenLevel >= trapPersistenceByDepth[depth].permanentDisarmCount) {
    addLog(trap.type === "pitfall" ? "落とし穴を完全に塞いだ！" : "罠を完全に破壊した！");
  } else {
    addLog(trap.type === "pitfall"
      ? "落とし穴は崩れやすくなったが残っている。"
      : "罠は弱体化して残るかもしれない。");
  }
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
  let baseRate = 50;
  let disarmerSkill = 0;
  
  // 生存しているパーティメンバーから最高スキル値を取得
  const disarmer = getBestDisarmer();
  if (disarmer) {
    let bonus = 0;
    if (disarmer.class === "Thief") bonus = disarmer.level * 2 + 15;
    else if (disarmer.class === "Ninja") bonus = disarmer.level * 1.5 + 10;
    else if (disarmer.class === "Ranger") bonus = disarmer.level + 5;
    disarmerSkill = disarmer.luk + disarmer.agi + bonus;
  }

  let weakenedBonus = 0;
  if (trap.state === "weakened") {
    weakenedBonus = 20; // 解除難度低下(-20)を確率ボーナス(+20%)として表現
  }

  let rate = baseRate + disarmerSkill - trap.difficulty - (state.floor - 1) * 5 + weakenedBonus;
  if (trap.type === "pitfall") {
    rate += 20; // 「縁を伝う」は成功率高なので+20%のボーナス
  }
  return Math.max(10, Math.min(95, rate));
}

export function getExpectedEffectText(trap) {
  let powerText = "";
  if (trap.state === "weakened") {
    powerText = " (弱体化)";
  }
  switch (trap.type) {
    case "damage":
      return `HPダメージ${powerText}`;
    case "mpDrain":
      return `MP減少${powerText}`;
    case "alarm":
      return `警報発報(次回敵強化/遭遇率上昇)${powerText}`;
    case "pitfall":
      return `地下${state.floor + 1}階へ落下${powerText}`;
    default:
      return "不明な効果";
  }
}

function getTrapRevealLevel(trap) {
  if (Number.isFinite(trap.traceReadLevel)) return trap.traceReadLevel;
  if (trap.state === "discovered" || trap.state === "weakened") return 3;
  return 0;
}

export function startTrapEncounter(trap) {
  const revealLevel = getTrapRevealLevel(trap);
  armControlsGuard();
  state.gameState = "trap_encounter";
  state.activeTrapState = {
    trap,
    successRate: calculateSuccessRate(trap),
    expectedEffect: revealLevel >= 2 ? getExpectedEffectText(trap) : "不明",
    revealLevel
  };
  if (typeof document !== "undefined") updateUI();
}

export function detectAdjacentTrapsByTraceRead() {
  const traceRead = getPartyMaxAffix(state.party, "traceRead");
  if (traceRead <= 0) return false;
  const found = [];
  for (let dir = 0; dir < 4; dir++) {
    const x = state.x + DX[dir];
    const y = state.y + DY[dir];
    const trap = state.map[y]?.[x]?.trap;
    if (!trap || trap.state !== "hidden") continue;
    trap.state = "discovered";
    trap.traceReadLevel = traceRead;
    found.push(trap);
  }
  if (found.length === 0) return false;
  const lead = found[0];
  if (traceRead >= 2) {
    addLog(`【痕跡】近くに${getExpectedEffectText(lead)}の罠の痕跡がある。`);
  } else {
    addLog("【痕跡】近くの床に不自然な傷跡がある。罠かもしれない。");
  }
  playSound("miss");
  return true;
}

export function handleTrapStepCheck(trap) {
  if (trap.state === "hidden") {
    let detectionRate = 0.30;
    const scouts = state.party.filter(c => ["Thief", "Ninja", "Ranger"].includes(c.class) && c.hp > 0);
    if (scouts.length > 0) {
      const bestScout = scouts.sort((a, b) => b.luk - a.luk)[0];
      detectionRate += 0.20 + (bestScout.luk + bestScout.agi) * 0.01;
    }
    detectionRate -= (state.floor - 1) * 0.05;
    detectionRate = Math.max(0.10, Math.min(0.95, detectionRate));

    if (Math.random() < detectionRate) {
      trap.state = "discovered";
      addLog("【⚠️罠発見！】足元に仕掛けられた罠を察知した！");
      playSound("miss");
      startTrapEncounter(trap);
      return true;
    } else {
      if (trap.type === "pitfall") {
        addLog("【⚠️罠発動！】不意に罠を踏み抜いてしまった！");
        triggerPitfall(trap);
        trap.state = "disabled";
        return true; // 落下中なので、このターンの他のイベントを抑止するために true を返す
      } else {
        addLog("【⚠️罠発動！】不意に罠を踏み抜いてしまった！");
        triggerTrap(trap);
        trap.state = "disabled";
        saveAutosave();
        updateUI();
        return false; // 発動した場合はそのまま元の移動処理を進める
      }
    }
  } else {
    // discovered / weakened
    startTrapEncounter(trap);
    return true;
  }
}

export function triggerPitfall(trap, isWeakenedOverride = null, isPartialSuccess = false) {
  const isWeakened = isWeakenedOverride !== null ? isWeakenedOverride : (trap.state === "weakened");
  
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
      const isNotStart = !(x === START_X && y === START_Y);
      
      if (isPassable && isNotStairs && hasNoEvent && hasNoTrap && isNotStart) {
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
    let powerMultiplier = 1.0;
    if (isWeakened) powerMultiplier *= weakenedModifiers.effectPower;
    if (isPartialSuccess) powerMultiplier *= 0.5;
    
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

export function triggerTrap(trap, isWeakenedOverride = null, isPartialSuccess = false) {
  const isWeakened = isWeakenedOverride !== null ? isWeakenedOverride : (trap.state === "weakened");
  
  let powerMultiplier = 1.0;
  if (isWeakened) powerMultiplier *= weakenedModifiers.effectPower; // 0.5
  if (isPartialSuccess) powerMultiplier *= 0.5;

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
    state.alarmWeakened = isWeakened || isPartialSuccess;
    if (!state.noiseEvents) state.noiseEvents = [];
    state.noiseEvents.push({ floor: state.floor, x: state.x, y: state.y, ttl: 4 });
    addLog("【⚠️警報】けたたましい警報音が響き渡った！");
  }
}

export function handleTrapAction(action) {
  if (!state.activeTrapState) return;
  const { trap, successRate } = state.activeTrapState;
  
  if (action === "back") {
    state.x = state.prevX;
    state.y = state.prevY;
    addLog("罠を前にして、元のマスに引き返した。");
    state.gameState = "explore";
    state.activeTrapState = null;
    playSound("move");
    saveAutosave();
    updateUI();
    return;
  }
  
  if (action === "bypass") {
    if (state.currentRun) {
      state.currentRun.steps += 5;
      if (!state.currentRun.floorSteps) state.currentRun.floorSteps = {};
      const key = String(state.floor);
      state.currentRun.floorSteps[key] = (state.currentRun.floorSteps[key] || 0) + 5;
    }
    
    if (Math.random() < 0.25) {
      addLog("遠回りして迂回を試みたが、途中で魔物と遭遇してしまった！");
      state.gameState = "explore";
      state.activeTrapState = null;
      playSound("chest_trap");
      startCombat(false, false);
    } else {
      addLog("時間はかかったが、慎重に罠を迂回した。");
      state.gameState = "explore";
      state.activeTrapState = null;
      playSound("move");
      saveAutosave();
      updateUI();
    }
    return;
  }
  
  if (action === "force") {
    if (trap.type === "pitfall") {
      addLog("助走をつけて落とし穴を一気に飛び越える！");
      const roll = Math.random() * 100;
      const jumpSuccessRate = successRate - 20; // 飛び越える際は「縁を伝う」の+20%ボーナスを除く
      if (roll < jumpSuccessRate) {
        addLog("[味方] 【跳躍成功】見事に落とし穴を飛び越えた！");
        playSound("move");
        trap.state = "disabled";
        state.gameState = "explore";
        state.activeTrapState = null;
        saveAutosave();
        updateUI();
      } else {
        addLog("【跳躍失敗】向こう岸に届かず、奈落へと落下した！");
        triggerPitfall(trap, trap.state === "weakened", false);
        trap.state = "disabled";
        state.gameState = "explore";
        state.activeTrapState = null;
      }
      return;
    }

    addLog("罠を顧みず、強引に駆け抜けた！");
    triggerTrap(trap, false, false);
    trap.state = "disabled";
    
    state.gameState = "explore";
    state.activeTrapState = null;
    saveAutosave();
    updateUI();
    return;
  }
  
  if (action === "disarm") {
    const roll = Math.random() * 100;
    if (trap.type === "pitfall") {
      if (roll < successRate) {
        addLog("[味方] 【回避成功】慎重に縁を伝い、落とし穴を渡りきった！");
        playSound("gold");
        trap.state = "disabled";
        addDisarmPersistenceLog(trap);
        if (state.currentRun) {
          state.currentRun.steps += 3;
          if (!state.currentRun.floorSteps) state.currentRun.floorSteps = {};
          const key = String(state.floor);
          state.currentRun.floorSteps[key] = (state.currentRun.floorSteps[key] || 0) + 3;
          state.currentRun.trapsDisarmed++;
        }
        recordTrapCodex("pitfall", "disarmed");
        awardTrapGold(getBestDisarmer());
        state.gameState = "explore";
        state.activeTrapState = null;
        saveAutosave();
        updateUI();
      } else if (roll < successRate + 15) {
        addLog("[味方] 【部分成功】足が滑った！しかし身を乗り出して衝撃を緩和した！");
        triggerPitfall(trap, trap.state === "weakened", true);
        trap.state = "disabled";
        state.gameState = "explore";
        state.activeTrapState = null;
      } else {
        addLog("【失敗】バランスを崩して落とし穴に真っ逆さまに落ちてしまった！");
        triggerPitfall(trap, trap.state === "weakened", false);
        trap.state = "disabled";
        state.gameState = "explore";
        state.activeTrapState = null;
      }
      return;
    }

    if (roll < successRate) {
      addLog("[味方] 【解除成功】罠の機能を完全に停止した！");
      playSound("gold");
      trap.state = "disabled";
      addDisarmPersistenceLog(trap);
      if (state.currentRun) {
        state.currentRun.trapsDisarmed++;
      }
      const codexTrapType = trap.type === "damage" ? "poison needle" : (trap.type === "mpDrain" ? "gas bomb" : "flash bomb");
      recordTrapCodex(codexTrapType, "disarmed");
      awardTrapGold(getBestDisarmer());
      state.gameState = "explore";
      state.activeTrapState = null;
      saveAutosave();
      updateUI();
    } else if (roll < successRate + 15) {
      addLog("[味方] 【部分成功】完全に解除できなかったが、被害を最小限に抑えた！");
      triggerTrap(trap, trap.state === "weakened", true);
      trap.state = "discovered";
      state.gameState = "explore";
      state.activeTrapState = null;
      saveAutosave();
      updateUI();
    } else {
      addLog("【解除失敗】仕掛けが暴発した！");
      triggerTrap(trap, trap.state === "weakened", false);
      trap.state = "disabled";
      if (state.currentRun) {
        state.currentRun.trapsTriggered++;
      }
      const codexTrapType = trap.type === "damage" ? "poison needle" : (trap.type === "mpDrain" ? "gas bomb" : "flash bomb");
      recordTrapCodex(codexTrapType, "triggered");
      state.gameState = "explore";
      state.activeTrapState = null;
      saveAutosave();
      updateUI();
    }
    return;
  }
}
