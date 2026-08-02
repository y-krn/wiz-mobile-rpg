// sim-scope: run
/* global console, process */

import { pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const {
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  DEPTH_SCENARIOS,
  SIM_CLASSES,
  simulateRun,
  DEFAULT_TRAP_POLICY_ID
} = await import("./sim_depth_material_ev.js");
const {
  DEPARTURE_CRAFT_MAX_SLOTS,
  WORKSHOP_NODES
} = await import("../src/data/workshop.js");
const { CRAFT_RECIPES } = await import("../src/craft.js");
const {
  getDepartureCraftCost,
  getWorkshopNodeCost,
  getWorkshopRank,
  getWorkshopGrants,
  purchaseDepartureCraft,
  purchaseWorkshopNode
} = await import("../src/systems/workshop.js");
const { spendMaterials } = await import("../src/rules/material_rules.js");

const TRIALS = Math.max(1, Number(process.env.PROGRESSION_TRIALS || 50));
const RUNS_PER_TRIAL = Math.max(1, Number(process.env.PROGRESSION_RUNS || 50));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.PROGRESSION_CALIBRATION_RUNS || 100)
);
const BASE_SEED = Number(process.env.PROGRESSION_SEED || 278234) >>> 0;
const POST_WING_TARGET = Math.max(6, Number(process.env.PROGRESSION_POST_WING_TARGET || 20));
const MATERIALS = [
  "霊粉",
  "魔石片",
  "獣の牙",
  "硬い皮",
  "毒腺",
  "骨片",
  "呪布",
  "黒角",
  "鉄片",
  "竜鱗"
];
const CRAFT_RECIPE_ORDER = [
  "TOWN_PORTAL",
  "HEAL_POTION",
  "ANTIDOTE",
  "TRAP_KIT",
  "HOLY_WATER",
  "MANA_POTION",
  "GREATER_HEAL",
  "GUARD_POTION"
];
const DEFAULT_SLOT_SWEEP = [3, 4, 5, 6, 8];
const DEFAULT_WING_COST_SWEEP = [6, 8, 10, 11, 12, 14, 16];
const PROGRESSION_POLICIES = new Set([
  "craft-first",
  "workshop-first",
  "workshop-complete"
]);
const PROGRESSION_POLICY = process.env.PROGRESSION_POLICY || "workshop-first";
if (!PROGRESSION_POLICIES.has(PROGRESSION_POLICY)) {
  throw new Error(
    `PROGRESSION_POLICY must be ${[...PROGRESSION_POLICIES].join("|")}: ${PROGRESSION_POLICY}`
  );
}

function parseNumberSweep(value, fallback) {
  const values = (value || fallback.join(","))
    .split(",")
    .map(entry => Math.floor(Number(entry.trim())))
    .filter(Number.isFinite)
    .filter(entry => entry >= 0);
  return [...new Set(values)].sort((left, right) => left - right);
}

const SLOT_SWEEP = parseNumberSweep(
  process.env.PROGRESSION_SLOT_SWEEP,
  DEFAULT_SLOT_SWEEP
);
const WING_COST_SWEEP = parseNumberSweep(
  process.env.PROGRESSION_WING_COSTS,
  DEFAULT_WING_COST_SWEEP
);
const PORTAL_BASE_COST = getDepartureCraftCost(["TOWN_PORTAL"]);
const PORTAL_BASE_TOTAL = totalMaterials(PORTAL_BASE_COST);
const REFERENCE_WING_COST = PORTAL_BASE_TOTAL;

const STAT_NODE_IDS = WORKSHOP_NODES
  .filter(node => node.category === "permanentStats")
  .map(node => node.id);
const OTHER_NODE_IDS = WORKSHOP_NODES
  .filter(node => !STAT_NODE_IDS.includes(node.id))
  .map(node => node.id);
const PROGRESSION_SCENARIO = {
  ...DEPTH_SCENARIOS.find(scenario => scenario.id === "workshop-empty-no-portal"),
  id: "workshop-progression",
  label: "工房進行",
  useTownPortal: true
};

function totalMaterials(materials) {
  return MATERIALS.reduce((sum, material) => sum + (materials?.[material] || 0), 0);
}

function emptyMaterials() {
  return Object.fromEntries(MATERIALS.map(material => [material, 0]));
}

function addMaterials(target, additions) {
  MATERIALS.forEach(material => {
    target[material] = (target[material] || 0) + (additions?.[material] || 0);
  });
  return target;
}

function subtractMaterials(left, right) {
  return Object.fromEntries(MATERIALS.map(material => [
    material,
    Math.max(0, (left?.[material] || 0) - (right?.[material] || 0))
  ]));
}

function cloneWorkshop(workshop) {
  return { ranks: { ...(workshop?.ranks || {}) } };
}

function getNodeMaxRank(node) {
  return node?.maxRank || 1;
}

function isStandardWorkshopComplete(workshop) {
  return WORKSHOP_NODES.every(node =>
    getWorkshopRank(workshop, node.id) >= getNodeMaxRank(node)
  );
}

function getRemainingDemand(workshop) {
  const demand = emptyMaterials();
  WORKSHOP_NODES.forEach(node => {
    const rank = getWorkshopRank(workshop, node.id);
    for (let index = rank; index < getNodeMaxRank(node); index++) {
      addMaterials(demand, getWorkshopNodeCost(node, index));
    }
  });
  return demand;
}

function summarizeWorkshopState(workshop) {
  const ranks = WORKSHOP_NODES
    .map(node => [node.id, getWorkshopRank(workshop, node.id)])
    .filter(([, rank]) => rank > 0);
  const grants = getWorkshopGrants(workshop);
  const totalSteps = WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  );
  const purchasedSteps = ranks.reduce((sum, [, rank]) => sum + rank, 0);
  const phase = purchasedSteps === 0
    ? "empty"
    : purchasedSteps === totalSteps
      ? "complete"
      : grants.spellIds.length > 0
        ? "blood-wand+deep-spells"
        : grants.affixIds.includes("CORE_BLOOD_WAND")
          ? "blood-wand-unlocked"
          : grants.startingGear.length > 0
            ? "starting-gear-unlocked"
            : "stats-in-progress";
  return {
    signature: ranks.map(([nodeId, rank]) => `${nodeId}=${rank}`).join(",") || "empty",
    purchasedSteps,
    phase,
    ranks,
    grants: {
      stats: { ...grants.stats },
      startingGear: [...grants.startingGear],
      affixIds: [...grants.affixIds],
      spellIds: [...grants.spellIds],
      identifyPowder: grants.identifyPowder,
      returnItems: [...grants.returnItems]
    }
  };
}

function getNodeCost(nodeId, workshop) {
  const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
  return node ? getWorkshopNodeCost(node, getWorkshopRank(workshop, nodeId)) : null;
}

function purchaseStandardAvailable(initialBank, initialWorkshop) {
  let bank = { ...initialBank };
  let workshop = cloneWorkshop(initialWorkshop);
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of [...STAT_NODE_IDS, ...OTHER_NODE_IDS]) {
      const cost = getNodeCost(nodeId, workshop);
      if (!cost) continue;
      const result = purchaseWorkshopNode(bank, workshop, nodeId);
      if (!result.ok) continue;
      bank = result.metaMaterials;
      workshop = result.workshop;
      changed = true;
    }
  }
  return { bank, workshop };
}

function scaleCostToTotal(baseCost, targetTotal) {
  const target = Math.max(0, Math.floor(Number(targetTotal) || 0));
  if (target === totalMaterials(baseCost)) return { ...baseCost };
  const entries = Object.entries(baseCost);
  if (entries.length === 0) return {};
  let remaining = target;
  const scaled = {};
  entries.forEach(([material, quantity], index) => {
    if (index === entries.length - 1) {
      scaled[material] = remaining;
      return;
    }
    const amount = Math.max(
      0,
      Math.min(remaining, Math.round((quantity / totalMaterials(baseCost)) * target))
    );
    scaled[material] = amount;
    remaining -= amount;
  });
  return scaled;
}

function getScenarioRecipeIds(scenario) {
  return [...(scenario.recipeIds || [])];
}

function getScenarioCraftCost(scenario) {
  const recipeIds = getScenarioRecipeIds(scenario);
  const baseCost = getDepartureCraftCost(recipeIds);
  if (!scenario.wingCostOverride || !recipeIds.includes("TOWN_PORTAL")) {
    return baseCost;
  }
  const portalCost = scaleCostToTotal(PORTAL_BASE_COST, scenario.wingCostOverride);
  const cost = { ...baseCost };
  Object.entries(PORTAL_BASE_COST).forEach(([material, quantity]) => {
    cost[material] = Math.max(0, (cost[material] || 0) - quantity);
  });
  addMaterials(cost, portalCost);
  return cost;
}

function getSimulationCraftBank(scenario) {
  const recipeIds = getScenarioRecipeIds(scenario);
  const sourceCost = getDepartureCraftCost(recipeIds);
  const scenarioCost = getScenarioCraftCost(scenario);
  const bank = { ...sourceCost };
  MATERIALS.forEach(material => {
    bank[material] = Math.max(bank[material] || 0, scenarioCost[material] || 0);
  });
  return bank;
}

function emptyCraftPurchase() {
  return { purchased: false, cost: {}, balance: null, recipeIds: [] };
}

function purchaseCraftFromBank(bank, scenario) {
  const recipeIds = getScenarioRecipeIds(scenario);
  if (recipeIds.length === 0) {
    return { purchased: false, cost: {}, balance: { ...bank }, recipeIds: [] };
  }
  const slotLimit = Math.max(0, Math.floor(Number(scenario.slotLimit)));
  const sourceCost = getDepartureCraftCost(recipeIds);
  const validation = purchaseDepartureCraft(sourceCost, recipeIds, slotLimit);
  if (!validation.ok) {
    throw new Error(`craft sweep recipe validation failed: ${validation.reason}`);
  }
  const cost = getScenarioCraftCost(scenario);
  const balance = spendMaterials(bank, cost);
  if (!balance) {
    return { purchased: false, cost, balance: { ...bank }, recipeIds: [] };
  }
  return {
    purchased: true,
    cost,
    balance,
    recipeIds: validation.recipeIds
  };
}

function createScenarioList() {
  const scenarios = [
    {
      id: "craft-off",
      label: "出発クラフトなし（宝箱・商人のみ）",
      recipeIds: [],
      slotLimit: 0,
      allowChestTownPortal: true
    },
    {
      id: "merchant-only",
      label: "出発クラフトなし（商人のみ）",
      recipeIds: [],
      slotLimit: 0,
      allowChestTownPortal: false
    }
  ];
  SLOT_SWEEP.forEach(slotLimit => {
    const recipeIds = CRAFT_RECIPE_ORDER.slice(0, Math.min(slotLimit, CRAFT_RECIPE_ORDER.length));
    scenarios.push({
      id: `slots-${slotLimit}`,
      label: `出発クラフト 総枠N=${slotLimit}`,
      recipeIds,
      slotLimit,
      allowChestTownPortal: true,
      sweep: "slots",
      isReference: slotLimit === DEPARTURE_CRAFT_MAX_SLOTS
    });
  });
  WING_COST_SWEEP.forEach(wingCost => {
    scenarios.push({
      id: `wing-${wingCost}`,
      label: `出発クラフト 翼コスト=${wingCost}`,
      recipeIds: CRAFT_RECIPE_ORDER.slice(0, DEPARTURE_CRAFT_MAX_SLOTS),
      slotLimit: DEPARTURE_CRAFT_MAX_SLOTS,
      wingCostOverride: wingCost,
      allowChestTownPortal: true,
      sweep: "wing-cost",
      isReference: wingCost === REFERENCE_WING_COST
    });
  });
  return scenarios;
}

const FINITE_PORTAL_SCENARIOS = createScenarioList();

function getFiniteStake(result, bank, workshop, scenario) {
  if (!result.died) return { raw: 0, useful: 0 };
  const lost = subtractMaterials(result.carriedMaterialCounts, result.bankedMaterialCounts);
  const unmet = subtractMaterials(getRemainingDemand(workshop), bank);
  Object.keys(getScenarioCraftCost(scenario)).forEach(material => {
    unmet[material] = Number.POSITIVE_INFINITY;
  });
  return {
    raw: totalMaterials(lost),
    useful: MATERIALS.reduce(
      (sum, material) => sum + Math.min(lost[material], unmet[material]),
      0
    )
  };
}

function createFiniteTotals() {
  return {
    runs: 0,
    survived: 0,
    carried: 0,
    banked: 0,
    time: 0,
    reached: 0,
    reachedB10: 0,
    reachedB15: 0,
    rawDeathLoss: 0,
    usefulDeathLoss: 0,
    steadyRuns: 0,
    steadyRawDeathLoss: 0,
    steadyUsefulDeathLoss: 0,
    portalUses: 0,
    portalAcquisitions: {
      departureCraft: 0,
      workshop: 0,
      workshopSupply: 0,
      chest: 0,
      merchant: 0
    },
    portalUsesBySource: {},
    merchantAttempts: 0,
    merchantPurchases: 0,
    merchantFailures: {},
    craftPurchases: 0,
    craftMaterialSpent: 0,
    craftSpentByMaterial: emptyMaterials(),
    healPotionsAcquired: 0,
    healPotionsConsumed: 0,
    healPotionsAcquiredBySource: {},
    healPotionsConsumedBySource: {},
    trapKitsAcquired: 0,
    trapKitsUsed: 0,
    trapKitsAcquiredBySource: {},
    trapKitsConsumedBySource: {},
    identificationPowderAcquired: 0,
    identificationPowderUsed: 0,
    identificationPowderAcquiredBySource: {},
    milestoneDecisions: 0,
    insuredMilestoneDecisions: 0,
    endingBankTotal: 0,
    surplusPerRun: 0,
    firstMerchantPurchaseRuns: [],
    standardCompleteRuns: [],
    workshopStepCounts: {},
    workshopStateCounts: {},
    workshopPhaseCounts: {},
    workshopPhaseSamples: {}
  };
}

function addSourceCounts(target, additions) {
  Object.entries(additions || {}).forEach(([source, amount]) => {
    target[source] = (target[source] || 0) + amount;
  });
}

function addCraftSpend(totals, cost) {
  totals.craftMaterialSpent += totalMaterials(cost);
  addMaterials(totals.craftSpentByMaterial, cost);
}

function simulateFinitePortalTrial(trial, scenario, scoringProfile) {
  resetSimulationRandom(BASE_SEED + trial * 104729);
  let bank = emptyMaterials();
  let workshop = { ranks: {} };
  let pendingCraftPurchase = emptyCraftPurchase();
  let standardCompleteRun = null;
  let firstMerchantPurchaseRun = null;
  const bankTimeline = [];
  const events = [];

  for (let run = 1; run <= RUNS_PER_TRIAL; run++) {
    const workshopAtStart = cloneWorkshop(workshop);
    const workshopStateAtStart = summarizeWorkshopState(workshopAtStart);
    const standardCompleteAtStart = isStandardWorkshopComplete(workshop);
    const craftPurchase = pendingCraftPurchase;
    pendingCraftPurchase = emptyCraftPurchase();
    const className = SIM_CLASSES[(trial * RUNS_PER_TRIAL + run - 1) % SIM_CLASSES.length];
    const craftScenario = craftPurchase.purchased
      ? {
          departureCraft: craftPurchase.recipeIds,
          departureCraftSlotLimit: scenario.slotLimit,
          departureCraftCostOverride: craftPurchase.cost,
          // 外側で実bankから支払済み。ここはsimulateRun内の購入API検証用。
          departureCraftMaterials: getSimulationCraftBank(scenario)
        }
      : {
          departureCraft: [],
          departureCraftSlotLimit: scenario.slotLimit,
          departureCraftMaterials: {}
        };
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: POST_WING_TARGET,
      runIndex: trial * RUNS_PER_TRIAL + run,
      seriesId: `finite-craft-${scenario.id}`,
      scoringProfile,
      scenario: {
        ...PROGRESSION_SCENARIO,
        id: scenario.id,
        allowChestTownPortal: scenario.allowChestTownPortal,
        buyMerchantTownPortal: true,
        retreatAtMilestoneWithoutTownPortal: true,
        ignoreWorkshopReturnItems: true,
        ...craftScenario
      },
      workshop
    });
    const stake = getFiniteStake(result, bank, workshop, scenario);
    if (firstMerchantPurchaseRun === null && result.merchantWingsPurchased > 0) {
      firstMerchantPurchaseRun = run;
    }

    addMaterials(bank, result.bankedMaterialCounts);
    if (run < RUNS_PER_TRIAL) {
      if (PROGRESSION_POLICY === "craft-first") {
        pendingCraftPurchase = purchaseCraftFromBank(bank, scenario);
        if (pendingCraftPurchase.purchased) bank = pendingCraftPurchase.balance;
      }

      const purchaseResult = purchaseStandardAvailable(bank, workshop);
      bank = purchaseResult.bank;
      workshop = purchaseResult.workshop;

      const canCraftAfterWorkshop = PROGRESSION_POLICY === "workshop-first" ||
        (PROGRESSION_POLICY === "workshop-complete" && isStandardWorkshopComplete(workshop));
      if (canCraftAfterWorkshop) {
        pendingCraftPurchase = purchaseCraftFromBank(bank, scenario);
        if (pendingCraftPurchase.purchased) bank = pendingCraftPurchase.balance;
      }
    }
    if (standardCompleteRun === null && isStandardWorkshopComplete(workshop)) {
      standardCompleteRun = run;
    }
    bankTimeline.push(totalMaterials(bank));
    events.push({
      standardCompleteAtStart,
      craftPurchase,
      workshop: workshopAtStart,
      workshopState: workshopStateAtStart,
      stake,
      result: {
        survived: result.survived,
        carriedMaterials: result.carriedMaterials,
        bankedMaterials: result.bankedMaterials,
        timeCost: result.timeCost,
        reachedFloor: result.reachedFloor,
        townPortalsUsed: result.townPortalsUsed,
        portalAcquisitions: result.portalAcquisitions,
        portalUsesBySource: result.portalUsesBySource,
        merchantWingAttempts: result.merchantWingAttempts,
        merchantWingsPurchased: result.merchantWingsPurchased,
        merchantWingFailures: result.merchantWingFailures,
        milestoneDecisions: result.milestoneDecisions,
        healPotionsAcquiredBySource: result.healPotionsAcquiredBySource,
        healPotionsConsumedBySource: result.healPotionsConsumedBySource,
        trapKitsAcquired: result.trapKitsAcquired,
        trapKitsUsed: result.trapKitsUsed,
        trapKitsAcquiredBySource: result.trapKitsAcquiredBySource,
        trapKitsConsumedBySource: result.trapKitsConsumedBySource,
        identificationPowderAcquired: result.identificationPowderAcquired,
        identificationPowderUsed: result.identificationPowderUsed,
        identificationPowderAcquiredBySource: result.identificationPowderAcquiredBySource
      }
    });
  }

  const halfway = Math.floor(RUNS_PER_TRIAL / 2);
  const halfwayBalance = halfway > 0 ? bankTimeline[halfway - 1] : 0;
  return {
    events,
    surplusPerRun:
      (bankTimeline.at(-1) - halfwayBalance) / Math.max(1, RUNS_PER_TRIAL - halfway),
    endingBankTotal: bankTimeline.at(-1),
    firstMerchantPurchaseRun,
    standardCompleteRun
  };
}

function aggregateFinitePortalScenario(scenario, trialResults) {
  const totals = createFiniteTotals();
  for (const trialResult of trialResults) {
    trialResult.events.forEach(event => {
      const { result, stake } = event;
      totals.runs++;
      totals.survived += Number(result.survived);
      totals.carried += result.carriedMaterials;
      totals.banked += result.bankedMaterials;
      totals.time += result.timeCost;
      totals.reached += result.reachedFloor;
      totals.reachedB10 += Number(result.reachedFloor >= 10);
      totals.reachedB15 += Number(result.reachedFloor >= 15);
      totals.rawDeathLoss += stake.raw;
      totals.usefulDeathLoss += stake.useful;
      if (event.standardCompleteAtStart) {
        totals.steadyRuns++;
        totals.steadyRawDeathLoss += stake.raw;
        totals.steadyUsefulDeathLoss += stake.useful;
      }
      totals.portalUses += result.townPortalsUsed;
      addSourceCounts(totals.portalUsesBySource, result.portalUsesBySource);
      Object.entries(result.portalAcquisitions).forEach(([source, amount]) => {
        totals.portalAcquisitions[source] =
          (totals.portalAcquisitions[source] || 0) + amount;
      });
      totals.merchantAttempts += result.merchantWingAttempts;
      totals.merchantPurchases += result.merchantWingsPurchased;
      Object.entries(result.merchantWingFailures).forEach(([reason, count]) => {
        totals.merchantFailures[reason] = (totals.merchantFailures[reason] || 0) + count;
      });
      totals.milestoneDecisions += result.milestoneDecisions.length;
      totals.insuredMilestoneDecisions += result.milestoneDecisions
        .filter(decision => decision.hasTownPortal)
        .length;
      if (event.craftPurchase.purchased) {
        totals.craftPurchases++;
        addCraftSpend(totals, event.craftPurchase.cost);
      }
      const acquiredHeal = Object.values(result.healPotionsAcquiredBySource)
        .reduce((sum, amount) => sum + amount, 0);
      const consumedHeal = Object.values(result.healPotionsConsumedBySource)
        .reduce((sum, amount) => sum + amount, 0);
      totals.healPotionsAcquired += acquiredHeal;
      totals.healPotionsConsumed += consumedHeal;
      addSourceCounts(totals.healPotionsAcquiredBySource, result.healPotionsAcquiredBySource);
      addSourceCounts(totals.healPotionsConsumedBySource, result.healPotionsConsumedBySource);
      totals.trapKitsAcquired += result.trapKitsAcquired;
      totals.trapKitsUsed += result.trapKitsUsed;
      addSourceCounts(totals.trapKitsAcquiredBySource, result.trapKitsAcquiredBySource);
      addSourceCounts(totals.trapKitsConsumedBySource, result.trapKitsConsumedBySource);
      totals.identificationPowderAcquired += result.identificationPowderAcquired;
      totals.identificationPowderUsed += result.identificationPowderUsed;
      addSourceCounts(
        totals.identificationPowderAcquiredBySource,
        result.identificationPowderAcquiredBySource
      );
      totals.workshopStepCounts[event.workshopState.purchasedSteps] =
        (totals.workshopStepCounts[event.workshopState.purchasedSteps] || 0) + 1;
      totals.workshopPhaseCounts[event.workshopState.phase] =
        (totals.workshopPhaseCounts[event.workshopState.phase] || 0) + 1;
      if (!totals.workshopPhaseSamples[event.workshopState.phase]) {
        totals.workshopPhaseSamples[event.workshopState.phase] = [];
      }
      totals.workshopPhaseSamples[event.workshopState.phase].push({
        workshop: event.workshop,
        state: event.workshopState
      });
      const stateTotal = totals.workshopStateCounts[event.workshopState.signature] || {
        ...event.workshopState,
        workshop: event.workshop,
        count: 0
      };
      stateTotal.count++;
      totals.workshopStateCounts[event.workshopState.signature] = stateTotal;
    });
    totals.surplusPerRun += trialResult.surplusPerRun;
    totals.endingBankTotal += trialResult.endingBankTotal;
    if (trialResult.firstMerchantPurchaseRun !== null) {
      totals.firstMerchantPurchaseRuns.push(trialResult.firstMerchantPurchaseRun);
    }
    if (trialResult.standardCompleteRun !== null) {
      totals.standardCompleteRuns.push(trialResult.standardCompleteRun);
    }
  }
  return { scenario, totals };
}

export function runWorkshopTrialTask(task, { scoringProfile }) {
  const scenario = FINITE_PORTAL_SCENARIOS.find(candidate => candidate.id === task.scenarioId);
  if (!scenario) throw new Error(`unknown workshop scenario: ${task.scenarioId}`);
  return simulateFinitePortalTrial(task.trial, scenario, scoringProfile);
}

function average(total, totals) {
  return total / Math.max(1, totals.runs);
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function sourceAverage(totals, field, source) {
  return average(totals[field][source] || 0, totals);
}

function formatFiniteResult(result) {
  const { scenario, totals } = result;
  const usefulRate = totals.steadyRawDeathLoss > 0
    ? totals.steadyUsefulDeathLoss / totals.steadyRawDeathLoss
    : 0;
  const merchantSuccessRate = totals.merchantAttempts > 0
    ? totals.merchantPurchases / totals.merchantAttempts
    : 0;
  const firstMerchant = totals.firstMerchantPurchaseRuns.length > 0
    ? `中央run ${percentile(totals.firstMerchantPurchaseRuns, 0.5)}`
    : "期間内なし";
  return (
    `[${PROGRESSION_POLICY}] ${scenario.label}: 平均到達=B${average(totals.reached, totals).toFixed(2)}, ` +
    `生還率=${formatRate(average(totals.survived, totals))}, ` +
    `EV/時間=${(totals.banked / Math.max(1, totals.time)).toFixed(4)}, ` +
    `B10/B15到達率=${formatRate(average(totals.reachedB10, totals))}/` +
    `${formatRate(average(totals.reachedB15, totals))}, ` +
    `クラフト成立率=${formatRate(totals.craftPurchases / Math.max(1, totals.runs))}, ` +
    `素材消費=${average(totals.craftMaterialSpent, totals).toFixed(2)}/run, ` +
    `買切後有効損失=${(totals.steadyUsefulDeathLoss / Math.max(1, totals.steadyRuns)).toFixed(2)}/run, ` +
    `買切後損失有価値率=${formatRate(usefulRate)}, ` +
    `翼入手(出発/宝箱/商人)=${sourceAverage(totals, "portalAcquisitions", "departureCraft").toFixed(3)}/` +
    `${sourceAverage(totals, "portalAcquisitions", "chest").toFixed(3)}/` +
    `${sourceAverage(totals, "portalAcquisitions", "merchant").toFixed(3)}, ` +
    `翼使用=${formatRate(totals.portalUses / Math.max(1, totals.runs))}, ` +
    `傷薬入手/消費=${average(totals.healPotionsAcquired, totals).toFixed(2)}/` +
    `${average(totals.healPotionsConsumed, totals).toFixed(2)}, ` +
    `罠kit入手/消費=${average(totals.trapKitsAcquired, totals).toFixed(2)}/` +
    `${average(totals.trapKitsUsed, totals).toFixed(2)}, ` +
    `鑑定粉入手/消費=${average(totals.identificationPowderAcquired, totals).toFixed(2)}/` +
    `${average(totals.identificationPowderUsed, totals).toFixed(2)}, ` +
    `商人成立=${totals.merchantPurchases}/${totals.merchantAttempts} ` +
    `(${formatRate(merchantSuccessRate)}, ${firstMerchant}), ` +
    `工房買切trial=${totals.standardCompleteRuns.length}/${TRIALS}, ` +
    `余剰蓄積=${(totals.surplusPerRun / TRIALS).toFixed(2)}/run, ` +
    `終了bank=${(totals.endingBankTotal / TRIALS).toFixed(1)}`
  );
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function printSweepTable(results, sweep, label, keyLabel) {
  console.log(`\n【${label} / 測定値】`);
  console.log(
    `${keyLabel} | 生還率 | 平均到達 | B10 | B15 | EV/時間 | ` +
    "クラフト成立 | 翼入手/消費 | 傷薬入手/消費 | 罠kit入手/消費 | 粉入手/消費"
  );
  results
    .filter(result => result.scenario.sweep === sweep)
    .forEach(result => {
      const { scenario, totals } = result;
      const key = sweep === "slots"
        ? scenario.slotLimit
        : scenario.wingCostOverride;
      console.log(
        `${String(key).padStart(2)} | ${formatRate(average(totals.survived, totals)).padStart(6)} | ` +
        `B${average(totals.reached, totals).toFixed(2).padStart(5)} | ` +
        `${formatRate(average(totals.reachedB10, totals)).padStart(5)} | ` +
        `${formatRate(average(totals.reachedB15, totals)).padStart(5)} | ` +
        `${(totals.banked / Math.max(1, totals.time)).toFixed(4).padStart(8)} | ` +
        `${formatRate(totals.craftPurchases / Math.max(1, totals.runs)).padStart(10)} | ` +
        `${sourceAverage(totals, "portalAcquisitions", "departureCraft").toFixed(2)}/` +
        `${((totals.portalUsesBySource["departure-craft"] || 0) / Math.max(1, totals.runs)).toFixed(2)} | ` +
        `${sourceAverage(totals, "healPotionsAcquiredBySource", "departureCraft").toFixed(2)}/` +
        `${sourceAverage(totals, "healPotionsConsumedBySource", "departureCraft").toFixed(2)} | ` +
        `${sourceAverage(totals, "trapKitsAcquiredBySource", "departureCraft").toFixed(2)}/` +
        `${sourceAverage(totals, "trapKitsConsumedBySource", "departureCraft").toFixed(2)} | ` +
        `${average(totals.identificationPowderAcquired, totals).toFixed(2)}/` +
        `${average(totals.identificationPowderUsed, totals).toFixed(2)}`
      );
    });
}

function formatWorkshopState(state) {
  const ranks = state.ranks.map(([nodeId, rank]) => `${nodeId}=${rank}`).join(",") || "-";
  const grants = state.grants;
  const statGrant = Object.entries(grants.stats)
    .map(([stat, amount]) => `${stat}+${amount}`)
    .join(",") || "-";
  return `step=${state.purchasedSteps}/${WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  )}, nodes=${ranks}, stats=${statGrant}, gear=${grants.startingGear.join(",") || "-"}, ` +
    `affix=${grants.affixIds.join(",") || "-"}, spell=${grants.spellIds.join(",") || "-"}, ` +
    `powder=${grants.identifyPowder}, return=${grants.returnItems.join(",") || "-"}`;
}

function printWorkshopStateDistribution(result) {
  if (!result.scenario.isReference || result.scenario.sweep !== "slots") return;
  const { totals } = result;
  console.log(
    `\n【工房状態分布 / ${result.scenario.label}】` +
    `（${RUNS_PER_TRIAL}ラン×${TRIALS}試行、各run開始時点）`
  );
  const stepDistribution = Object.entries(totals.workshopStepCounts)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([step, count]) => `${step}step=${formatRate(count / totals.runs)}`)
    .join(" / ");
  console.log(`購入step分布: ${stepDistribution}`);
  const phaseLabels = {
    empty: "空",
    "stats-in-progress": "ステータス投資中",
    "starting-gear-unlocked": "初期装備解放済み",
    "blood-wand-unlocked": "血杖解放済み",
    "blood-wand+deep-spells": "血杖+深層呪文解放済み",
    complete: "買い切り済み"
  };
  Object.entries(phaseLabels)
    .filter(([phase]) => totals.workshopPhaseCounts[phase])
    .forEach(([phase, label]) => {
      const samples = totals.workshopPhaseSamples[phase];
      const meanSteps = samples.reduce(
        (sum, sample) => sum + sample.state.purchasedSteps,
        0
      ) / samples.length;
      const representative = samples
        .slice()
        .sort((left, right) =>
          Math.abs(left.state.purchasedSteps - meanSteps) -
          Math.abs(right.state.purchasedSteps - meanSteps)
        )[0];
      const count = totals.workshopPhaseCounts[phase];
      console.log(
        `  ${label}: ${formatRate(count / totals.runs)} ` +
        `(${count}/${totals.runs}), 平均step=${meanSteps.toFixed(1)}, ` +
        `代表 ${formatWorkshopState(representative.state)}`
      );
    });
  console.log("上位の完全一致state:");
  Object.values(totals.workshopStateCounts)
    .sort((left, right) => right.count - left.count || left.purchasedSteps - right.purchasedSteps)
    .slice(0, 8)
    .forEach(state => {
      console.log(
        `  ${formatRate(state.count / totals.runs)} (${state.count}/${totals.runs}): ` +
        formatWorkshopState(state)
      );
    });
}

export async function runWorkshopProgressionSimulation() {
  console.log("工房進行シミュレーション（Issue #348: 出発クラフト）");
  console.log(
    `試行: 条件ごと N=${TRIALS}, ${RUNS_PER_TRIAL}ラン/試行, seed=${BASE_SEED}, ` +
    `core calibration N=${CALIBRATION_RUNS}`
  );
  console.log(
    `工房/クラフト優先方針: ${PROGRESSION_POLICY} ` +
    "（craft-first=クラフト→工房 / workshop-first=工房→クラフト / " +
    "workshop-complete=工房買切り後のみクラフト）"
  );
  const initialDemand = getRemainingDemand({ ranks: {} });
  const workshopSteps = WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  );
  if (workshopSteps !== 34 || totalMaterials(initialDemand) !== 119) {
    throw new Error(
      `workshop demand mismatch: steps=${workshopSteps}, materials=${totalMaterials(initialDemand)}`
    );
  }
  console.log(
    `工房実需要検算: ${WORKSHOP_NODES.length}ノード / ${workshopSteps}購入step / ` +
    `総${totalMaterials(initialDemand)}個。`
  );
  console.log(
    `出発クラフト実装値: N=${DEPARTURE_CRAFT_MAX_SLOTS}, ` +
    `翼コスト合計=${REFERENCE_WING_COST}, ` +
    `レシピ=${CRAFT_RECIPE_ORDER.slice(0, DEPARTURE_CRAFT_MAX_SLOTS).join(",")}`
  );
  console.log(
    "実装経路: generateRunFloor / applyCombatRewards / generateRandomEquipment / " +
    "bankRunMaterials / purchaseWorkshopNode / purchaseDepartureCraft を実srcから使用。"
  );
  console.log(
    "クラフト支払: 各run終了後、実bankから次run分を支払。simulateRunへ渡すbankは " +
    "外側支払済みレシピのAPI検証用であり、素材無料注入ではない。"
  );
  console.log(
    `罠モデル: simulateRun内でgenerateRunFloor経由、宝箱/フロア罠、傷薬、罠kit、翼、鑑定粉を ` +
    `入手数・消費数付きで集計。TRAP_POLICY=${DEFAULT_TRAP_POLICY_ID}。`
  );
  console.log(
    "N/翼コストの表はsim内what-if。最終値は実srcのレシピ変更後に同じrun経路で再測定し、" +
    "乱数消費順の違いによる閾値合わせはしない。"
  );

  const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
  const finiteTasks = FINITE_PORTAL_SCENARIOS.flatMap(scenario =>
    Array.from({ length: TRIALS }, (_, trial) => ({
      kind: "finite",
      scenarioId: scenario.id,
      trial
    }))
  );
  const taskResults = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runWorkshopTrialTask",
    runTask: runWorkshopTrialTask,
    tasks: finiteTasks,
    context: { scoringProfile }
  });
  let resultOffset = 0;
  const finiteResults = FINITE_PORTAL_SCENARIOS.map(scenario => {
    const trialResults = taskResults.slice(resultOffset, resultOffset + TRIALS);
    resultOffset += TRIALS;
    return aggregateFinitePortalScenario(scenario, trialResults);
  });

  console.log("\n【出発クラフト条件別の測定値】");
  finiteResults.forEach(result => console.log(formatFiniteResult(result)));
  printSweepTable(finiteResults, "slots", "総枠N sweep", "N");
  printSweepTable(finiteResults, "wing-cost", "帰還の翼コスト sweep", "cost");
  finiteResults.forEach(printWorkshopStateDistribution);

  console.log("\n【素材コスト集計】");
  finiteResults
    .filter(result => result.scenario.isReference)
    .forEach(result => {
      console.log(
        `${result.scenario.label}: ` +
        `spent=${JSON.stringify(Object.fromEntries(
          Object.entries(result.totals.craftSpentByMaterial)
            .map(([material, amount]) => [material, amount / Math.max(1, result.totals.craftPurchases)])
        ))}`
      );
    });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWorkshopProgressionSimulation();
}
