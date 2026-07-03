import { state, saveAutosave, addLog } from "../state.js";
import { updateUI } from "../ui.js";
import { startCombat } from "../combat_ui/combat_start.js";
import { playSound } from "../audio.js";
import { triggerGameOver } from "../combat.js";
import { dungeonRenderer as renderer } from "../renderer.js";

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
  },
  middle: {
    keepWeakenedRate: 0.6,
    reactivateRate: 0.2,
  },
  deep: {
    keepWeakenedRate: 0.35,
    reactivateRate: 0.4,
  },
};

export function calculateSuccessRate(trap) {
  let baseRate = 50;
  let disarmerSkill = 0;
  
  // 生存しているパーティメンバーから最高スキル値を取得
  const disarmers = state.party.filter(c => c.hp > 0);
  if (disarmers.length > 0) {
    const skills = disarmers.map(c => {
      let bonus = 0;
      if (c.class === "Thief") bonus = c.level * 2 + 15;
      else if (c.class === "Ninja") bonus = c.level * 1.5 + 10;
      else if (c.class === "Ranger") bonus = c.level * 1.0 + 5;
      return c.luk + c.agi + bonus;
    });
    disarmerSkill = Math.max(...skills);
  }

  let weakenedBonus = 0;
  if (trap.state === "weakened") {
    weakenedBonus = 20; // 解除難度低下(-20)を確率ボーナス(+20%)として表現
  }

  let rate = baseRate + disarmerSkill - trap.difficulty - (state.floor - 1) * 5 + weakenedBonus;
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
    default:
      return "不明な効果";
  }
}

export function startTrapEncounter(trap) {
  state.gameState = "trap_encounter";
  state.activeTrapState = {
    trap,
    successRate: calculateSuccessRate(trap),
    expectedEffect: getExpectedEffectText(trap)
  };
  updateUI();
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
      addLog("【⚠️罠発動！】不意に罠を踏み抜いてしまった！");
      triggerTrap(trap);
      trap.state = "disabled";
      saveAutosave();
      updateUI();
      return false; // 発動した場合はそのまま元の移動処理を進める
    }
  } else {
    // discovered / weakened
    startTrapEncounter(trap);
    return true;
  }
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
        addLog(`[!] ${c.name}は${dmg}のダメージを受けた。`);
        if (c.hp === 0) {
          c.status = "dead";
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
    if (roll < successRate) {
      addLog("[味方] 【解除成功】罠の機能を完全に停止した！");
      playSound("gold");
      trap.state = "disabled";
      if (state.currentRun) {
        state.currentRun.trapsDisarmed++;
      }
      if (state.codex && state.codex.events && state.codex.events.traps) {
        const codexTrapType = trap.type === "damage" ? "poison needle" : (trap.type === "mpDrain" ? "gas bomb" : "flash bomb");
        if (state.codex.events.traps[codexTrapType]) {
          state.codex.events.traps[codexTrapType].disarmed++;
        }
      }
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
      if (state.codex && state.codex.events && state.codex.events.traps) {
        const codexTrapType = trap.type === "damage" ? "poison needle" : (trap.type === "mpDrain" ? "gas bomb" : "flash bomb");
        if (state.codex.events.traps[codexTrapType]) {
          state.codex.events.traps[codexTrapType].triggered++;
        }
      }
      state.gameState = "explore";
      state.activeTrapState = null;
      saveAutosave();
      updateUI();
    }
    return;
  }
}
