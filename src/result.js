import { state, saveGame, addLog, finalizeRunRecords, recordCharDeath, formatCharDeathLog, normalizeDeathSource, HISTORY_LIMIT } from "./state.js";
import { START_X, START_Y, DIR_N, getItemBaseId, getPartyMaxAffix } from "./data.js";
import { updateUI } from "./ui.js";
import { bankRunMaterials } from "./rules/material_rules.js";
import { settleRunFeats } from "./systems/feats.js";
import { normalizeRunFeatResult } from "./state/feats_state.js";
import { settleRunFragments } from "./systems/guidebook.js";
import { isFacilityNodeBought, settleFacilityOrders } from "./systems/facilities.js";
import {
  normalizeFacilitiesState,
  normalizeRunGraveResult,
  normalizeRunOfferedMaterials,
  normalizeRunOrderResult
} from "./state/facilities_state.js";
import { CHAPEL_GRAVE_LIMIT, CHAPEL_GRAVE_RATE } from "./data/facilities.js";
import { MATERIAL_TYPES } from "./data/materials.js";
import { getGraveMaterials } from "./rules/special_rooms.js";
import { normalizeRunGuideResult } from "./state/guidebook_state.js";
import { findMapCellByType } from "./rules/map_queries.js";
import { trackCombatEnd, trackLootStakeSnapshot, trackRunEnd } from "./telemetry.js";
import { processRunReturn } from "./systems/run_return.js";
import { buildDeathNearMiss } from "./rules/near_miss.js";
import { normalizeRunRecordResult } from "./state/run_record_result.js";
import { normalizeStartingKitId } from "./state/starting_kit.js";
import { carriesOutRepeatedTreasure, settleDungeonClears } from "./systems/dungeon_progress.js";
import { settleCoreFamilyRedraw } from "./systems/core_families.js";
import { normalizeDeathHistory, normalizeDeathHistoryEntry } from "./state/death_logs.js";
import {
  normalizeRunFirstKillsBefore,
  normalizeRunKeyItemsBefore,
  normalizeRunCodexDiscoveries,
  normalizeRunWorkshopDiscoveries
} from "./state/run_discovery_state.js";

export function triggerRunResult(reason) {
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
  // Round-trip prototype (#2066): the treasure only leaves the dungeon on foot.
  if (run.roundTrip && reason !== "surface") run.roundTrip.treasure = false;
  // A run that comes home clears the dungeons whose guardian it beat (#2060).
  const repeatedTreasure = isSuccess && carriesOutRepeatedTreasure(state, run);
  run.openedDungeons = isSuccess ? settleDungeonClears(state, run) : [];
  // A run that reached the third floor redraws the likely Core families,
  // whatever the outcome (#2061).
  run.coreFamilyRedraw = settleCoreFamilyRedraw(state, run, { treasure: repeatedTreasure });
  const objectLootOutcome = reason === "escape_scroll"
    ? "wing"
    : isSuccess ? "retreat" : "loss";
  // Capture the death facts before settlement clears the bag and before the
  // records absorb this run, so the gap is measured against the prior best.
  run.nearMiss = isDeath
    ? buildDeathNearMiss({
      floor: state.floor,
      deepestFloor: run.deepestFloor,
      previousBestFloor: state.records?.personalBests?.deepestFloor,
      defeatedMilestones: run.defeatedMilestones,
      deathLog: run.deathLogs?.at(-1) || null,
      combat: state.combatState,
      inventory: state.inventory
    })
    : null;
  const settlementSnapshotPoint = "terminal_settlement_before";
  trackLootStakeSnapshot(settlementSnapshotPoint, {
    state,
    settlementOutcome: objectLootOutcome === "loss" ? outcome : objectLootOutcome
  });
  processRunReturn(state, objectLootOutcome);
  trackLootStakeSnapshot("terminal_settlement_after", {
    state,
    settlementOutcome: objectLootOutcome === "loss" ? outcome : objectLootOutcome
  });
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
  const previousFirstKills = new Set(normalizeRunFirstKillsBefore(run.firstKillsBefore));
  run.codexDiscoveries = normalizeRunCodexDiscoveries(
    normalizeRunFirstKillsBefore(state.firstKills).filter(name => !previousFirstKills.has(name))
  );
  const previousKeyItems = new Set(normalizeRunKeyItemsBefore(run.keyItemsBefore));
  run.workshopDiscoveries = normalizeRunWorkshopDiscoveries(
    normalizeRunKeyItemsBefore(state.keyItems).filter(keyItem => !previousKeyItems.has(keyItem))
  );
  // A chapel offering sent these home during the run (#2018): they count as
  // found and as banked whatever the outcome, and are never at stake.
  const offered = normalizeRunOfferedMaterials(run.offeredMaterials);
  const addOffered = balance => {
    const total = { ...(balance || {}) };
    Object.entries(offered).forEach(([name, quantity]) => {
      total[name] = (total[name] || 0) + quantity;
    });
    return total;
  };
  run.materialsBeforeBanking = addOffered(run.materials);
  run.goldEarned = Number(run.goldEarned ?? run.gold) || 0;
  run.lootCount = Number(run.lootCount) || Object.values(run.materialsBeforeBanking)
    .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
  // A broken oath (#2021) banks none of the carried materials.
  const oathBroken = run.oath === true && isDeathLike;
  const banking = bankRunMaterials(
    state.metaMaterials,
    oathBroken ? {} : run.materials,
    outcome
  );
  state.metaMaterials = addOffered(banking.balance);
  run.bankedMaterials = addOffered(banking.banked);
  // The chapel grave (#2018) keeps part of what a death lost, for a later run
  // to take back at the chapel altar. It stays until taken and fills up to
  // its limit across deaths.
  if (isDeath && isFacilityNodeBought(state.facilities, "chapel_grave")) {
    const facilities = normalizeFacilitiesState(state.facilities);
    const lost = Object.fromEntries(MATERIAL_TYPES.map(name => [
      name,
      (Number(run.materials?.[name]) || 0) - (Number(banking.banked?.[name]) || 0)
    ]));
    const held = Object.values(facilities.grave).reduce((sum, quantity) => sum + quantity, 0);
    const added = getGraveMaterials(lost, CHAPEL_GRAVE_RATE, CHAPEL_GRAVE_LIMIT - held);
    const grave = { ...facilities.grave };
    Object.entries(added).forEach(([name, quantity]) => {
      grave[name] = (grave[name] || 0) + quantity;
    });
    state.facilities = { ...facilities, grave };
    run.graveResult = normalizeRunGraveResult(added);
  }
  const recordResult = finalizeRunRecords(
    state.records,
    run,
    outcome
  );
  state.records = recordResult.records;
  run.recordResult = normalizeRunRecordResult(recordResult);
  // Feats count what happened whatever the outcome, and their one-time
  // rewards are paid in full: they are not part of the run's haul.
  const featSettlement = settleRunFeats(
    state.feats,
    run,
    outcome,
    recordResult.runNumber,
    getPartyMaxAffix(state.party, "contractReward")
  );
  state.feats = featSettlement.feats;
  run.featResult = normalizeRunFeatResult(featSettlement.result);
  Object.entries(run.featResult?.rewards || {}).forEach(([name, quantity]) => {
    state.metaMaterials[name] = (state.metaMaterials[name] || 0) + quantity;
  });
  // Orders placed at a facility are finished by a safe return (#2014). This
  // runs after the run's unused supplies went back, so those keep their room.
  const orderSettlement = settleFacilityOrders(state.facilities, state.storage, state.storageMax, outcome);
  state.facilities = orderSettlement.facilities;
  state.storage = orderSettlement.storage;
  run.orderResult = normalizeRunOrderResult(orderSettlement.result);
  // Guidebook fragments come home only with the adventurer (#2013).
  const fragmentSettlement = settleRunFragments(state.guidebook, run, outcome);
  state.guidebook = fragmentSettlement.guidebook;
  run.guideResult = normalizeRunGuideResult(fragmentSettlement.result);
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

    const deathEntry = normalizeDeathHistoryEntry({
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
        ? { name: state.party[0].name, level: state.party[0].level }
        : null,
      lostItems: Object.entries(run.lostMaterials)
        .filter(([, quantity]) => quantity > 0)
        .map(([name, quantity]) => `${name}x${quantity}`),
      deepestFloor: run.deepestFloor,
      kills: run.kills,
      chestsOpened: run.chestsOpened,
    });
    state.deathLogs = normalizeDeathHistory([deathEntry, ...normalizeDeathHistory(state.deathLogs)]).slice(0, 20);
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
    startingKit: normalizeStartingKitId(run.startingKit || state.party[0]?.startingKit),
    result: isSuccess ? "returned" : "failed",
    deepestFloor: run.deepestFloor,
    kills: run.kills,
    chestsOpened: run.chestsOpened,
    goldEarned: run.goldEarned || run.gold || 0,
    lootCount: run.lootCount || Object.values(run.materialsBeforeBanking || {})
      .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0),
    dangerRank: danger.rank,
    // Includes what a chapel offering sent home during the run (#2018).
    bankedMaterials: run.bankedMaterials,
    lostUnidentifiedCount: isDeathLike ? run.equipmentFound.length : 0,
    // Carried-in supplies the settlement lost or returned; the town summary
    // mentions them only when there were some.
    lostSupplyCount: run.lostTownItems?.length || 0,
    returnedSupplyCount: run.returnedTownItems?.length || 0,
    itemCount: run.itemsFound.length + run.equipmentFound.length,
    returnReason: reason,
    outcome,
    milestones: recordResult.milestones,
    recordUpdates: recordResult.updates,
    representativeItem: run.representativeItem,
    meaningfulItemHistory: run.meaningfulItemHistory,
    codexInsights: run.codexInsights,
    workshopUnlocks: run.workshopUnlocks,
    returnProcessing: run.returnProcessing,
    deathCause: run.deathLogs?.at(-1)?.type && run.deathLogs?.at(-1)?.source
      ? {
        floor: run.deathLogs.at(-1).floor,
        type: run.deathLogs.at(-1).type,
        source: normalizeDeathSource(run.deathLogs.at(-1).source)
      }
      : null
  };
  runSummary.foundItems = [...(run.itemsFound || []), ...(run.equipmentFound || [])]
    .map(item => ({
      baseId: getItemBaseId(item),
      kind: typeof item === "object" ? item.kind || "equipment" : "item",
      identified: typeof item === "object" ? item.identified !== false : true
    }))
    .filter(item => item.baseId);
  runSummary.codexDiscoveries = normalizeRunCodexDiscoveries(run.codexDiscoveries);
  runSummary.workshopDiscoveries = normalizeRunWorkshopDiscoveries(run.workshopDiscoveries);
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
  else if (score >= 55) { rank = "A"; label = "危険な冒険"; }
  else if (score >= 35) { rank = "B"; label = "深部探索"; }
  else if (score >= 20) { rank = "C"; label = "通常探索"; }
  else if (score >= 10) { rank = "D"; label = "小規模探索"; }
  
  return { score, rank, label };
}
