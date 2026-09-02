import { state, saveGame, saveAutosave, addLog, finalizeRunRecords, recordCharDeath, formatCharDeathLog, normalizeDeathSource, HISTORY_LIMIT } from "./state.js";
import { START_X, START_Y, DIR_N, getPartyMaxAffix } from "./data.js";
import { updateUI } from "./ui.js";
import { bankRunMaterials } from "./rules/material_rules.js";
import { updateRunQuests } from "./systems/run_quests.js";
import { findMapCellByType } from "./rules/map_queries.js";
import { trackCombatEnd, trackRunEnd } from "./telemetry.js";
import { settleRunObjectLoot } from "./state/run_loot.js";

export function triggerRunResult(reason, { salvageIds = null } = {}) {
  if (!state.currentRun || state.gameState === "result" || state.currentRun.returnReason) return;

  state.party.forEach(char => {
    char.runTrapAttackBonus = 0;
  });

  const run = state.currentRun;
  const isDeath = reason === "gameover";
  const outcome = isDeath ? "death" : reason === "abandon" ? "abandon" : "retreat";
  const isSuccess = outcome === "retreat";
  const isDeathLike = outcome === "death" || outcome === "abandon";
  run.returnReason = reason;
  run.outcome = outcome;
  const objectLootOutcome = reason === "escape_scroll"
    ? "wing"
    : isSuccess ? "retreat" : "loss";
  settleRunObjectLoot(state, objectLootOutcome, salvageIds);
  if (isDeath && !run.deathLogs?.at(-1)) {
    const activeEnemy = state.combatState?.monsters?.find(monster => monster.hp > 0);
    if (activeEnemy && state.party[0]) {
      const deathLog = recordCharDeath(
        state,
        state.party[0],
        `${activeEnemy.name.replace(/\\s[A-Z]$/, "")}との戦闘`,
        { type: "combat", source: activeEnemy.name }
      );
      if (deathLog) addLog(formatCharDeathLog(deathLog));
    }
  }
  updateRunQuests(run, getPartyMaxAffix(state.party, "contractReward"));
  run.materialsBeforeBanking = { ...(run.materials || {}) };
  run.goldEarned = Number(run.goldEarned ?? run.gold) || 0;
  run.lootCount = Number(run.lootCount) || Object.values(run.materialsBeforeBanking)
    .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
  const banking = bankRunMaterials(
    state.metaMaterials,
    run.materials,
    outcome
  );
  state.metaMaterials = banking.balance;
  run.bankedMaterials = banking.banked;
  const recordResult = finalizeRunRecords(
    state.records,
    run,
    outcome,
    run.characterClass || state.party[0]?.class
  );
  state.records = recordResult.records;
  run.recordResult = recordResult;
  const danger = calculateDangerScore();
  run.dangerScore = danger.score;
  run.dangerRank = danger.rank;
  run.dangerLabel = danger.label;

  if (isDeathLike) {
    run.lostMaterials = Object.fromEntries(Object.entries(run.materials || {}).map(([name, found]) => [
      name,
      found - (banking.banked[name] || 0)
    ]));
  }

  if (isDeath) {
    state.party.forEach(char => {
      char.status = "dead";
      char.hp = 0;
    });

    let latestDeath = run.deathLogs?.at(-1);
    const cause = latestDeath?.cause || "原因未記録";

    run.wipedFloor = state.floor;

    const deathEntry = {
      id: `death_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      endedAt: Date.now(),
      floor: state.floor,
      x: state.x,
      y: state.y,
      seed: state.seed,
      cause,
      type: latestDeath?.type || null,
      source: latestDeath?.source ? normalizeDeathSource(latestDeath.source) : null,
      character: state.party[0]
        ? { name: state.party[0].name, class: state.party[0].class, level: state.party[0].level }
        : null,
      lostItems: Object.entries(run.lostMaterials)
        .filter(([, quantity]) => quantity > 0)
        .map(([name, quantity]) => `${name}x${quantity}`),
      deepestFloor: run.deepestFloor,
      kills: run.kills,
      chestsOpened: run.chestsOpened,
    };
    state.deathLogs ||= [];
    state.deathLogs.unshift(deathEntry);
    state.deathLogs = state.deathLogs.slice(0, 20);
  }

  if (isDeath) {
    trackCombatEnd("gameover", {
      floor: state.floor,
      turns: state.combatState?.roundNumber,
      player: state.party[0],
      monsters: state.combatState?.monsters,
      isRoamingFlack: state.combatState?.isRoamingFlack
    }, state);
  }
  trackRunEnd(run, outcome, state);

  state.combatState = null;
  state.party.forEach(char => {
    delete char.buffs;
  });

  if (state.codex) {
    state.codex.stats ||= { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    state.codex.stats.totalRuns = state.records.totalRuns;
    if (isDeath) state.codex.stats.totalDeaths++;
    state.codex.stats.deepestFloor = Math.max(state.codex.stats.deepestFloor || 1, run.deepestFloor);
    state.codex.stats.totalChests += run.chestsOpened;
  }

  const runSummary = {
    id: `run_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    endedAt: Date.now(),
    runNumber: recordResult.runNumber,
    className: run.characterClass || state.party[0]?.class || null,
    result: isSuccess ? "returned" : "failed",
    deepestFloor: run.deepestFloor,
    kills: run.kills,
    chestsOpened: run.chestsOpened,
    goldEarned: run.goldEarned || run.gold || 0,
    lootCount: run.lootCount || Object.values(run.materialsBeforeBanking || {})
      .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0),
    dangerRank: danger.rank,
    bankedMaterials: banking.banked,
    lostUnidentifiedCount: isDeathLike ? run.equipmentFound.length : 0,
    itemCount: run.itemsFound.length + run.equipmentFound.length,
    returnReason: reason,
    outcome,
    milestones: recordResult.milestones,
    recordUpdates: recordResult.updates,
    deathCause: run.deathLogs?.at(-1)?.type && run.deathLogs?.at(-1)?.source
      ? {
        floor: run.deathLogs.at(-1).floor,
        type: run.deathLogs.at(-1).type,
        source: normalizeDeathSource(run.deathLogs.at(-1).source)
      }
      : null
  };
  state.runHistory ||= [];
  state.runHistory.unshift(runSummary);
  state.runHistory = state.runHistory.slice(0, HISTORY_LIMIT);

  const start = findMapCellByType(state.maps?.[0], "stairs-up") || { x: START_X, y: START_Y };
  state.x = start.x;
  state.y = start.y;
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
