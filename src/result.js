import { state, saveGame, saveAutosave } from "./state.js";
import { START_X, START_Y, DIR_N, MAP_WIDTH, MAP_HEIGHT, getItemBaseId, isSpecialOrQuestItem, ITEMS, getItemData } from "./data.js";
import { updateUI } from "./ui.js";
import { checkActiveContract, generateContractsList } from "./contracts.js";
import { trapPersistenceByDepth } from "./systems/traps.js";

export function persistDungeonTraps() {
  if (!state.dungeonMemory) {
    state.dungeonMemory = { traps: {} };
  }

  const getDepthCategory = (floor) => {
    if (floor <= 2) return "shallow";
    if (floor <= 4) return "middle";
    return "deep";
  };

  if (state.maps) {
    for (let f = 1; f <= 5; f++) {
      const grid = state.maps[f - 1];
      if (!grid) continue;
      
      const depth = getDepthCategory(f);
      const conf = trapPersistenceByDepth[depth];

      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const cell = grid[y]?.[x];
          if (cell && cell.trap) {
            const trap = cell.trap;
            const trapId = trap.id;

            if (trap.state === "disabled") {
              if (Math.random() < conf.keepWeakenedRate) {
                const prevLevel = trap.weakenLevel || 0;
                state.dungeonMemory.traps[trapId] = {
                  state: "weakened",
                  weakenLevel: prevLevel + 1,
                  lastUpdatedAt: Date.now()
                };
              } else {
                const reactState = Math.random() < 0.5 ? "hidden" : "discovered";
                state.dungeonMemory.traps[trapId] = {
                  state: reactState,
                  weakenLevel: 0,
                  lastUpdatedAt: Date.now()
                };
              }
            } else if (trap.state === "weakened") {
              if (Math.random() < conf.reactivateRate) {
                const reactState = Math.random() < 0.5 ? "hidden" : "discovered";
                state.dungeonMemory.traps[trapId] = {
                  state: reactState,
                  weakenLevel: 0,
                  lastUpdatedAt: Date.now()
                };
              } else {
                state.dungeonMemory.traps[trapId] = {
                  state: "weakened",
                  weakenLevel: trap.weakenLevel || 1,
                  lastUpdatedAt: Date.now()
                };
              }
            } else if (trap.state === "discovered") {
              if (Math.random() < conf.reactivateRate) {
                state.dungeonMemory.traps[trapId] = {
                  state: "hidden",
                  weakenLevel: 0,
                  lastUpdatedAt: Date.now()
                };
              } else {
                state.dungeonMemory.traps[trapId] = {
                  state: "discovered",
                  lastUpdatedAt: Date.now()
                };
              }
            } else if (trap.state === "hidden") {
              delete state.dungeonMemory.traps[trapId];
            }
          }
        }
      }
    }
  }
}

export function triggerRunResult(reason) {
  persistDungeonTraps();

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

  // ==========================================
  // 【全滅時の処理】
  // ==========================================
  if (!isSuccess) {
    // 1. パーティ全員を死亡状態にする
    state.party.forEach(c => {
      c.status = "dead";
      c.hp = 0;
      const rc = state.roster.find(r => r.name === c.name);
      if (rc) {
        rc.status = "dead";
        rc.hp = 0;
      }
    });

    // 死亡履歴登録用の原因特定
    let cause = "不測の罠またはダメージ";
    if (state.combatState && state.combatState.monsters) {
      const activeEnemies = state.combatState.monsters.filter(m => m.hp > 0);
      if (activeEnemies.length > 0) {
        cause = activeEnemies[0].name.replace(/\s[A-Z]$/, "") + "との戦闘";
      }
    }

    // 2. 救出費 (現在の総所持金の25%を失う。小数切り捨て)
    const lostGold = Math.floor(state.gold * 0.25);
    state.gold = Math.max(0, state.gold - lostGold);

    // 3. 遺留品 (Remains) の生成
    const remainsItems = [];

    // 重要品 (Quest) は 100% 遺留品へ (遠征で得たものも含む)
    const inventoryForScan = [...state.inventory];
    state.inventory = [];
    const regularItems = [];

    inventoryForScan.forEach(item => {
      const itemId = getItemBaseId(item);
      if (isSpecialOrQuestItem(itemId)) {
        remainsItems.push(item);
      } else {
        regularItems.push(item);
      }
    });

    // 今回の遠征で得た未確定戦利品 (重要品以外) は全喪失 (regularItems から削除)
    const eqFoundIds = (state.currentRun?.equipmentFound || []).map(e => e.id);
    const itemsFoundIds = (state.currentRun?.itemsFound || []).map(i => typeof i === "string" ? i : i.baseId);

    const preExpItems = [];
    regularItems.forEach(item => {
      if (typeof item === "object" && eqFoundIds.includes(item.id)) {
        return;
      }
      const itemId = typeof item === "string" ? item : item.baseId;
      const foundIdx = itemsFoundIds.indexOf(itemId);
      if (foundIdx !== -1) {
        itemsFoundIds.splice(foundIdx, 1);
        return;
      }
      preExpItems.push(item);
    });

    // 遠征中に手に入れたマテリアルの破棄
    if (state.currentRun && state.currentRun.materialsFound && state.materials) {
      for (const mat in state.currentRun.materialsFound) {
        const count = state.currentRun.materialsFound[mat] || 0;
        if (state.materials[mat]) {
          state.materials[mat] = Math.max(0, state.materials[mat] - count);
        }
      }
    }

    // 街から持って行ったアイテムの 50% を遺留品にする
    // 優先度：消耗品を優先
    const getPriority = (item) => {
      const itemId = getItemBaseId(item);
      const itemData = ITEMS[itemId];
      if (itemData && itemData.type === "usable") return 2; // 消耗品
      return 1; // 装備品など
    };

    preExpItems.sort((a, b) => getPriority(b) - getPriority(a));

    const numToLeave = Math.ceil(preExpItems.length * 0.5);
    const toLeave = preExpItems.slice(0, numToLeave);
    const toKeep = preExpItems.slice(numToLeave);

    remainsItems.push(...toLeave);
    state.inventory = toKeep; // 保持したものはインベントリに戻す

    // 既存の未回収遺留品を劣化させる
    if (state.remains && state.remains.length > 0) {
      state.remains.forEach(rem => {
        const numToKeep = Math.floor(rem.items.length * 0.5);
        const shuffled = [...rem.items].sort(() => Math.random() - 0.5);
        rem.items = shuffled.slice(0, numToKeep);
      });
      state.remains = state.remains.filter(rem => rem.items.length > 0);
    } else {
      state.remains = [];
    }

    // 新しい遺留品を生成
    const newRemains = {
      id: "remains_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      floor: state.floor,
      x: state.x,
      y: state.y,
      items: remainsItems,
      goldLost: lostGold,
      timestamp: Date.now()
    };
    if (newRemains.items.length > 0) {
      state.remains.push(newRemains);
    }

    // 4. 全滅ログの作成
    const lostItemsNames = [];
    if (state.currentRun && state.currentRun.equipmentFound) {
      state.currentRun.equipmentFound.forEach(item => {
        lostItemsNames.push(item.name || "未鑑定装備");
      });
    }
    remainsItems.forEach(item => {
      const itData = getItemData(item);
      lostItemsNames.push(itData?.name || (typeof item === "string" ? item : item.baseId));
    });

    const deathEntry = {
      id: "death_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      endedAt: Date.now(),
      floor: state.floor,
      x: state.x,
      y: state.y,
      seed: state.seed,
      cause: cause,
      party: state.party.map(c => ({ name: c.name, class: c.class, level: c.level })),
      partyLevelAvg: state.party.length > 0 ? Math.round(state.party.reduce((sum, c) => sum + c.level, 0) / state.party.length) : 1,
      deepestFloor: state.currentRun.deepestFloor,
      kills: state.currentRun.kills,
      chestsOpened: state.currentRun.chestsOpened,
      lostItems: lostItemsNames,
      note: "リルガミンの蘇生費用に注意",
      lostGold: lostGold,
      lostItemsCount: remainsItems.length, // 遺留品になったアイテム数
      remainsId: newRemains.items.length > 0 ? newRemains.id : null,
      outcomes: {} // 蘇生結果的用
    };
    state.party.forEach(c => {
      deathEntry.outcomes[c.name] = "死亡";
    });

    if (!state.deathLogs) state.deathLogs = [];
    state.deathLogs.unshift(deathEntry);
    if (state.deathLogs.length > 20) {
      state.deathLogs.pop();
    }

    // currentRun に遺留品情報などを一時保存して結果画面に渡す
    state.currentRun.lostGold = lostGold;
    state.currentRun.remainsItemCount = remainsItems.length;
    state.currentRun.wipedFloor = state.floor;
    state.currentRun.wipedX = state.x;
    state.currentRun.wipedY = state.y;
    state.currentRun.remainsId = newRemains.items.length > 0 ? newRemains.id : null;

    // 5. 街へ強制帰還させる
    state.x = START_X;
    state.y = START_Y;
    state.dir = DIR_N;
    state.floor = 1;
    state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);

    // 図鑑スタッツの更新
    if (state.codex) {
      if (!state.codex.stats) {
        state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
      }
      state.codex.stats.totalRuns++;
      state.codex.stats.totalDeaths++;
      state.codex.stats.deepestFloor = Math.max(state.codex.stats.deepestFloor || 1, state.currentRun.deepestFloor);
      state.codex.stats.totalChests += state.currentRun.chestsOpened;
    }

    const runSummary = {
      id: "run_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      endedAt: Date.now(),
      result: "failed",
      deepestFloor: state.currentRun.deepestFloor,
      kills: state.currentRun.kills,
      chestsOpened: state.currentRun.chestsOpened,
      dangerRank: state.currentRun.dangerRank,
      goldGained: 0,
      lostGold: lostGold,
      lostUnidentifiedCount: remainsItems.length,
      itemCount: remainsItems.length,
      returnReason: reason
    };
    if (!state.runHistory) state.runHistory = [];
    state.runHistory.unshift(runSummary);
    if (state.runHistory.length > 20) {
      state.runHistory.pop();
    }

    // 契約の失敗
    if (state.activeContract) {
      checkActiveContract(state, state.currentRun, false);
    }

    state.gameState = "result";
    saveAutosave();
    updateUI();
    return;
  }

  // ==========================================
  // 【成功時（無事帰還）の処理】
  // ==========================================
  // 図鑑スタッツの更新
  if (state.codex) {
    if (!state.codex.stats) {
      state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    }
    state.codex.stats.totalRuns++;
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
    result: "returned",
    deepestFloor: state.currentRun.deepestFloor,
    kills: state.currentRun.kills,
    chestsOpened: state.currentRun.chestsOpened,
    dangerRank: danger.rank,
    goldGained: state.currentRun.goldGained,
    lostGold: 0,
    lostUnidentifiedCount: 0,
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
    contractResult = checkActiveContract(state, state.currentRun, true);
  } else {
    if (!state.contracts || state.contracts.length === 0) {
      state.contracts = generateContractsList(state);
    }
  }
  if (state.currentRun) {
    state.currentRun.contractResult = contractResult;
  }

  state.gameState = "result";
  
  saveGame();
  saveAutosave();
  updateUI();
}

// persistGameoverRollback は廃止されました。

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
