import {
  generateRandomEquipment, getItemData, checkCharLevelUp
} from "../data.js";
import { determineMonsterDrop } from "./drops.js";
import { addInventoryItemToState } from "../state/inventory_state.js";

export function applyCombatRewards(state, monsters, logQueue) {
  const nonFledMonsters = monsters.filter(m => !m.fled);
  const totalExp = nonFledMonsters.reduce((sum, m) => sum + m.exp, 0);
  const totalGold = nonFledMonsters.reduce((sum, m) => {
    const g = m.isBoss || m.isRare ? m.gold : Math.max(1, Math.round(m.gold * 0.15));
    return sum + g;
  }, 0);
  const livingChars = state.party.filter(c => c.status !== "dead");

  // Check First Kill Bonuses
  let bonusExp = 0;
  let bonusGold = 0;
  const firstKilledNames = [];
  
  nonFledMonsters.forEach(m => {
    const baseName = m.name.replace(/\s[A-Z]$/, "");
    if (state.firstKills && !state.firstKills.includes(baseName)) {
      if (!state.firstKills) state.firstKills = [];
      state.firstKills.push(baseName);
      firstKilledNames.push(baseName);
      const baseGold = m.isBoss || m.isRare ? m.gold : Math.max(1, Math.round(m.gold * 0.15));
      bonusExp += Math.round(m.exp * 0.5);
      bonusGold += Math.round(baseGold * 0.5);
    }
  });

  if (state.codex) {
    if (!state.codex.stats) {
      state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    }
    state.codex.stats.totalKills += nonFledMonsters.length;
    
    if (!state.codex.monsters) state.codex.monsters = {};
    nonFledMonsters.forEach(m => {
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (!state.codex.monsters[baseName]) {
        state.codex.monsters[baseName] = { encountered: 1, killed: 0, firstKilled: false };
      }
      state.codex.monsters[baseName].killed++;
      if (firstKilledNames.includes(baseName)) {
        state.codex.monsters[baseName].firstKilled = true;
      }
      
      if (state.activeContract && state.activeContract.type === "kill" && state.activeContract.targetMonsterName === baseName) {
        state.activeContract.currentValue = (state.activeContract.currentValue || 0) + 1;
      }
    });
  }

  const expShare = livingChars.length > 0 ? Math.round(totalExp / livingChars.length) : 0;
  const bonusExpShare = (livingChars.length > 0 && bonusExp > 0) ? Math.round(bonusExp / livingChars.length) : 0;

  if (state.currentRun) {
    state.currentRun.kills += nonFledMonsters.length;
    state.currentRun.goldGained += (totalGold + bonusGold);
    state.currentRun.expGained += (expShare + bonusExpShare);
    if (state.combatState.isBoss) {
      state.currentRun.bossesKilled += nonFledMonsters.length;
    } else if (state.combatState.isMidboss || state.combatState.isRoamingFlack) {
      state.currentRun.elitesKilled += nonFledMonsters.length;
    } else {
      nonFledMonsters.forEach(m => {
        if (m.isRare) {
          state.currentRun.elitesKilled++;
        }
      });
    }
  }

  // 素材ドロップの実行
  const runMats = {};
  nonFledMonsters.forEach(m => {
    const drops = determineMonsterDrop(m, state.floor);
    Object.entries(drops).forEach(([mat, qty]) => {
      runMats[mat] = (runMats[mat] || 0) + qty;
      
      if (!state.materials) state.materials = {};
      state.materials[mat] = (state.materials[mat] || 0) + qty;
      
      if (state.currentRun) {
        if (!state.currentRun.materialsFound) {
          state.currentRun.materialsFound = {};
        }
        state.currentRun.materialsFound[mat] = (state.currentRun.materialsFound[mat] || 0) + qty;
      }
    });
  });

  logQueue.push({ msg: "======================================" });
  if (nonFledMonsters.length > 0) {
    let msg = "戦闘に勝利した！";
    if (expShare > 0 && totalGold > 0) {
      msg += `パーティは${totalGold}ゴールドを獲得した。`;
    } else if (expShare > 0) {
      msg += `パーティは戦闘経験を積んだ。`;
    } else if (totalGold > 0) {
      msg += `パーティは${totalGold}ゴールドを獲得した。`;
    }
    logQueue.push({
      msg,
      sound: "level_up"
    });

    if (Object.keys(runMats).length > 0) {
      const matStr = Object.entries(runMats).map(([mat, qty]) => `${mat} x${qty}`).join(", ");
      logQueue.push({
        msg: `  -> 素材を獲得した: [${matStr}]`,
        sound: "gold"
      });
    }

    if (firstKilledNames.length > 0) {
      logQueue.push({
        msg: `🎉【初回討伐ボーナス！】初めて [${firstKilledNames.join(", ")}] を討伐した！`,
        sound: "gold"
      });
      logQueue.push({
        msg: `  -> 初討伐の追加報酬：パーティ +${bonusGold} ゴールド / 成長値 +${bonusExpShare}`
      });
    }
  } else {
    logQueue.push({
      msg: `敵がすべて逃げ出し、戦闘が終了した。`,
      sound: "miss"
    });
  }

  if (nonFledMonsters.length === 0) {
    logQueue.push({ msg: "======================================" });
    logQueue.push({
      msg: "周囲に静寂が戻った。",
      endCombat: true
    });
    return true; // ended
  }

  state.gold += totalGold + bonusGold;

  livingChars.forEach(c => {
    c.exp += (expShare + bonusExpShare);
    const lvlUp = checkCharLevelUp(c);
    if (lvlUp) {
      logQueue.push({
        msg: `[★] レベルアップ！${c.name}はレベル${c.level}になった！`,
        sound: "level_up",
        flash: true,
        floatText: "LEVEL UP!",
        floatColor: "#ffb300"
      });
    }
  });

  logQueue.push({ msg: "======================================" });

  // 敵撃破時の未鑑定装備ドロップ判定
  let dropEquipment = null;
  if (state.combatState.isBoss) {
    dropEquipment = generateRandomEquipment(state.floor, "epic", Math.random, state.party);
  } else if (state.combatState.isMidboss) {
    const rarity = Math.random() < 0.25 ? "epic" : "rare";
    dropEquipment = generateRandomEquipment(state.floor, rarity, Math.random, state.party);
  } else if (state.combatState.isRoamingFlack) {
    const rarity = Math.random() < 0.30 ? "epic" : "rare";
    dropEquipment = generateRandomEquipment(state.floor, rarity, Math.random, state.party);
  } else {
    const isRare = state.combatState.monsters && state.combatState.monsters.some(m => m.isRare);
    const chance = isRare ? 0.55 : 0.14;
    if (Math.random() < chance) {
      dropEquipment = generateRandomEquipment(state.floor, null, Math.random, state.party);
    }
  }

  if (dropEquipment) {
    const added = addInventoryItemToState(state, dropEquipment);
    if (added) {
      if (state.currentRun) {
        state.currentRun.equipmentFound.push(dropEquipment);
      }
      const eqData = getItemData(dropEquipment);
      logQueue.push({
        msg: `モンスターの骸から [${eqData.name}] を手に入れた！`,
        sound: "gold"
      });
    } else {
      logQueue.push({
        msg: `モンスターは何かを落としたが、バッグが満杯で拾えなかった！`,
        sound: "miss"
      });
    }
  }

  if (state.combatState.isBoss) {
    logQueue.push({
      msg: "ついに伝説の [浮遊石 (クリスタル)] を手に入れた！おしろに持ち帰ろう！",
      sound: "gold",
      giveCrystal: true
    });
  } else if (state.combatState.isMidboss) {
    logQueue.push({
      msg: "デーモンガードの骸から [竜の鍵] を手に入れた！これであの扉を開けられるはずだ！",
      sound: "gold",
      giveKey: true
    });
  } else if (state.combatState.isRoamingFlack) {
    // Remove Flack from state.roamingMonsters
    state.roamingMonsters = state.roamingMonsters.filter(
      rm => !(rm.floor === state.floor && rm.x === state.x && rm.y === state.y)
    );
    logQueue.push({
      msg: "強敵「フラック」を見事に撃破した！",
      sound: "gold"
    });
    logQueue.push({
      msg: "フラックの残骸の影に宝箱を見つけた！",
      triggerChest: true
    });
    if (state.floorChestsTotal) {
      state.floorChestsTotal[state.floor - 1] = (state.floorChestsTotal[state.floor - 1] ?? 0) + 1;
    }
  } else {
    if (Math.random() < 0.20) {
      logQueue.push({
        msg: "モンスターが宝箱を残していった！",
        triggerChest: true
      });
      if (state.floorChestsTotal) {
        state.floorChestsTotal[state.floor - 1] = (state.floorChestsTotal[state.floor - 1] ?? 0) + 1;
      }
    } else {
      logQueue.push({
        msg: "周囲に静寂が戻った。",
        endCombat: true
      });
    }
  }

  return false;
}
