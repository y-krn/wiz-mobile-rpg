import { state, saveGame, saveAutosave } from "./state.js";
import { START_X, START_Y, DIR_N, MAP_WIDTH, MAP_HEIGHT } from "./data.js";
import { updateUI } from "./ui.js";
import { getDepthCategory, trapPersistenceByDepth } from "./systems/traps.js";
import { bankRunMaterials } from "./rules/material_rules.js";

export function persistDungeonTraps() {
  if (!state.dungeonMemory) {
    state.dungeonMemory = { traps: {}, mapFragments: {}, visitedFloors: [1] };
  }

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
            const persistedTrap = state.dungeonMemory.traps[trapId];

            if (persistedTrap?.state === "disabled") {
              continue;
            }

            if (trap.state === "disabled") {
              const nextWeakenLevel = (trap.weakenLevel || 0) + 1;
              if (nextWeakenLevel >= conf.permanentDisarmCount) {
                state.dungeonMemory.traps[trapId] = {
                  state: "disabled",
                  weakenLevel: nextWeakenLevel,
                  lastUpdatedAt: Date.now()
                };
                continue;
              }

              if (Math.random() < conf.keepWeakenedRate) {
                state.dungeonMemory.traps[trapId] = {
                  state: "weakened",
                  weakenLevel: nextWeakenLevel,
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
  if (!state.currentRun) return;

  persistDungeonTraps();
  state.party.forEach(char => {
    char.runTrapAttackBonus = 0;
  });

  const run = state.currentRun;
  run.returnReason = reason;
  const isSuccess = reason !== "gameover";
  const banking = bankRunMaterials(
    state.metaMaterials,
    run.materials,
    isSuccess ? "retreat" : "death"
  );
  state.metaMaterials = banking.balance;
  run.bankedMaterials = banking.banked;
  const danger = calculateDangerScore();
  run.dangerScore = danger.score;
  run.dangerRank = danger.rank;
  run.dangerLabel = danger.label;

  if (!isSuccess) {
    state.party.forEach(char => {
      char.status = "dead";
      char.hp = 0;
    });

    let cause = "不測の罠またはダメージ";
    const latestDeath = run.deathLogs?.at(-1);
    if (latestDeath) {
      cause = latestDeath.cause;
    } else {
      const activeEnemy = state.combatState?.monsters?.find(monster => monster.hp > 0);
      if (activeEnemy) cause = `${activeEnemy.name.replace(/\\s[A-Z]$/, "")}との戦闘`;
    }

    run.lostMaterials = Object.fromEntries(Object.entries(run.materials || {}).map(([name, found]) => [
      name,
      found - (banking.banked[name] || 0)
    ]));
    run.wipedFloor = state.floor;

    const deathEntry = {
      id: `death_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      endedAt: Date.now(),
      floor: state.floor,
      x: state.x,
      y: state.y,
      seed: state.seed,
      cause,
      character: state.party[0]
        ? { name: state.party[0].name, class: state.party[0].class, level: state.party[0].level }
        : null,
      deepestFloor: run.deepestFloor,
      kills: run.kills,
      chestsOpened: run.chestsOpened,
    };
    state.deathLogs ||= [];
    state.deathLogs.unshift(deathEntry);
    state.deathLogs = state.deathLogs.slice(0, 20);
  }

  if (state.codex) {
    state.codex.stats ||= { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    state.codex.stats.totalRuns++;
    if (!isSuccess) state.codex.stats.totalDeaths++;
    state.codex.stats.deepestFloor = Math.max(state.codex.stats.deepestFloor || 1, run.deepestFloor);
    state.codex.stats.totalChests += run.chestsOpened;
  }

  const runSummary = {
    id: `run_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    endedAt: Date.now(),
    result: isSuccess ? "returned" : "failed",
    deepestFloor: run.deepestFloor,
    kills: run.kills,
    chestsOpened: run.chestsOpened,
    dangerRank: danger.rank,
    bankedMaterials: banking.banked,
    lostUnidentifiedCount: isSuccess ? 0 : run.equipmentFound.length,
    itemCount: run.itemsFound.length + run.equipmentFound.length,
    returnReason: reason,
  };
  state.runHistory ||= [];
  state.runHistory.unshift(runSummary);
  state.runHistory = state.runHistory.slice(0, 20);

  run.contractResult = null;

  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.floor = 1;
  state.gameState = "result";
  saveGame();
  saveAutosave();
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
