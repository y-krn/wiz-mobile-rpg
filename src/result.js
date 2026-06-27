import { state, loadGame, saveGame, saveAutosave } from "./state.js";
import { START_X, START_Y, DIR_N } from "./data.js";
import { updateUI } from "./ui.js";
import { closeSubmenu } from "./navigation.js";
import { checkActiveContract, generateContractsList } from "./contracts.js";

export function triggerRunResult(reason) {
  if (!state.currentRun) {
    state.currentRun = {
      startedAt: Date.now(),
      startFloor: state.floor,
      deepestFloor: state.floor,
      steps: 0,
      battles: 0,
      kills: 0,
      elitesKilled: 0,
      bossesKilled: 0,
      chestsOpened: 0,
      trapsTriggered: 0,
      trapsDisarmed: 0,
      goldGained: 0,
      expGained: 0,
      itemsFound: [],
      equipmentFound: [],
      firstKills: [],
      floorsVisited: [state.floor],
      dangerScore: 0,
      returnReason: reason
    };
  }
  
  state.currentRun.returnReason = reason;
  const isSuccess = reason !== "gameover";
  
  const danger = calculateDangerScore();
  state.currentRun.dangerScore = danger.score;
  state.currentRun.dangerRank = danger.rank;
  state.currentRun.dangerLabel = danger.label;

  let lostGold = 0;
  let lostUnidentifiedCount = 0;
  const lostItemsNames = [];
  if (!isSuccess) {
    lostGold = state.currentRun.goldGained;
    lostUnidentifiedCount = state.currentRun.equipmentFound.length;
    state.currentRun.equipmentFound.forEach(item => {
      lostItemsNames.push(item.name || "未鑑定装備");
    });

    // 死亡履歴登録
    let cause = "不測の罠またはダメージ";
    if (state.combatState && state.combatState.monsters) {
      const activeEnemies = state.combatState.monsters.filter(m => m.hp > 0);
      if (activeEnemies.length > 0) {
        cause = activeEnemies[0].name.replace(/\s[A-Z]$/, "") + "との戦闘";
      }
    }
    const deathEntry = {
      id: "death_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      endedAt: Date.now(),
      floor: state.floor,
      x: state.x,
      y: state.y,
      seed: state.seed,
      cause: cause,
      partyLevelAvg: state.party.length > 0 ? Math.round(state.party.reduce((sum, c) => sum + c.level, 0) / state.party.length) : 1,
      deepestFloor: state.currentRun.deepestFloor,
      kills: state.currentRun.kills,
      chestsOpened: state.currentRun.chestsOpened,
      lostItems: lostItemsNames,
      note: "リルガミンの蘇生費用に注意"
    };
    if (!state.deathLogs) state.deathLogs = [];
    state.deathLogs.unshift(deathEntry);
    if (state.deathLogs.length > 20) {
      state.deathLogs.pop();
    }
  }

  // 図鑑スタッツの更新
  if (state.codex) {
    if (!state.codex.stats) {
      state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    }
    state.codex.stats.totalRuns++;
    if (!isSuccess) {
      state.codex.stats.totalDeaths++;
    }
    state.codex.stats.deepestFloor = Math.max(state.codex.stats.deepestFloor || 1, state.currentRun.deepestFloor);
    state.codex.stats.totalChests += state.currentRun.chestsOpened;
  }

  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.floor = 1;
  state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);

  const runSummary = {
    id: "run_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    endedAt: Date.now(),
    result: isSuccess ? "returned" : "failed",
    deepestFloor: state.currentRun.deepestFloor,
    kills: state.currentRun.kills,
    chestsOpened: state.currentRun.chestsOpened,
    dangerRank: danger.rank,
    goldGained: isSuccess ? state.currentRun.goldGained : 0,
    lostGold: lostGold,
    lostUnidentifiedCount: lostUnidentifiedCount,
    itemCount: state.currentRun.itemsFound.length + state.currentRun.equipmentFound.length,
    returnReason: reason
  };
  
  if (!state.runHistory) state.runHistory = [];
  state.runHistory.unshift(runSummary);
  if (state.runHistory.length > 20) {
    state.runHistory.pop();
  }

  // 契約の判定
  let contractResult = null;
  if (state.activeContract) {
    contractResult = checkActiveContract(state, state.currentRun, isSuccess);
  } else {
    if (!state.contracts || state.contracts.length === 0) {
      state.contracts = generateContractsList(state);
    }
  }
  if (state.currentRun) {
    state.currentRun.contractResult = contractResult;
  }

  if (!isSuccess) {
    persistGameoverRollback();
    return;
  }

  state.gameState = "result";
  
  saveGame();
  saveAutosave();
  updateUI();
}

function persistGameoverRollback() {
  const saveKey = "mobile_wiz_rpg_save";
  const autosaveKey = "mobile_wiz_rpg_autosave";
  const rawCastleSave = localStorage.getItem(saveKey);

  if (!rawCastleSave) {
    state.gameState = "result";
    saveAutosave();
    updateUI();
    return;
  }

  try {
    const castleSave = JSON.parse(rawCastleSave);
    const mergedCastleSave = {
      ...castleSave,
      materials: state.materials,
      cleared: state.cleared,
      runHistory: state.runHistory,
      deathLogs: state.deathLogs,
      codex: state.codex,
      contracts: state.contracts,
      activeContract: state.activeContract,
      completedContracts: state.completedContracts,
      storage: state.storage,
      storageMax: state.storageMax,
      identifyTickets: state.identifyTickets,
      currentRun: null,
      logs: state.logs.slice(-30)
    };

    const resultAutosave = {
      ...mergedCastleSave,
      currentRun: state.currentRun,
      gameState: "result",
      combatState: null,
      chestState: null,
      transitioning: false
    };

    localStorage.setItem(saveKey, JSON.stringify(mergedCastleSave));
    localStorage.setItem(autosaveKey, JSON.stringify(resultAutosave));
    loadGame();
  } catch (err) {
    console.error("Gameover rollback failed", err);
    state.gameState = "result";
    saveAutosave();
  }

  updateUI();
}

export function calculateDangerScore() {
  if (!state.currentRun) return { score: 0, rank: "E", label: "安全な偵察" };
  let score = 0;
  score += state.currentRun.deepestFloor * 8;
  score += state.currentRun.battles * 2;
  score += state.currentRun.elitesKilled * 5;
  score += state.currentRun.bossesKilled * 15;
  score += state.currentRun.chestsOpened * 3;
  score += state.currentRun.trapsTriggered * 4;
  
  let deadCount = 0;
  let anomalyCount = 0;
  state.party.forEach(c => {
    if (c.status === "dead") deadCount++;
    else if (c.status !== "ok") anomalyCount++;
  });
  score += deadCount * 10;
  score += anomalyCount * 5;

  let rank = "E";
  let label = "安全な偵察";
  if (score >= 80) { rank = "S"; label = "無謀なる踏破"; }
  else if (score >= 55) { rank = "A"; label = "危険な遠征"; }
  else if (score >= 35) { rank = "B"; label = "深部探索"; }
  else if (score >= 20) { rank = "C"; label = "通常探索"; }
  else if (score >= 10) { rank = "D"; label = "小規模探索"; }
  
  return { score, rank, label };
}
