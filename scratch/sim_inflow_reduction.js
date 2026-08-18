// sim-scope: run — simulates material inflow, workshop, and return-wing scenarios across depths; retained because origin is unknown and no closed-Issue owner was found.
/* global console, process */

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  configurable: true
});

const {
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  REFERENCE_SCENARIOS,
  SIM_CLASSES,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const { MATERIAL_DROP_BALANCE, MATERIAL_TYPES } = await import("../src/data/materials.js");
const { WORKSHOP_NODES } = await import("../src/data/workshop.js");
const {
  getWorkshopNodeCost,
  getWorkshopRank,
  purchaseWorkshopNode
} = await import("../src/systems/workshop.js");
const { canAffordMaterials, spendMaterials } = await import("../src/rules/material_rules.js");

const TRIALS = Math.max(1, Number(process.env.INFLOW_TRIALS || 50));
const RUNS_PER_TRIAL = Math.max(1, Number(process.env.INFLOW_RUNS || 40));
const DEPTH_RUNS = Math.max(1, Number(process.env.INFLOW_DEPTH_RUNS || 120));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.INFLOW_CALIBRATION_RUNS || 100));
const RUN_MODE = String(process.env.INFLOW_MODE || "all");
const BASE_SEED = Number(process.env.INFLOW_SEED || 234275) >>> 0;
const TARGET_DEPTH = 20;
const WING_NODE_ID = "kit_return_wing";
const REPEAT_COST = Object.freeze({ "黒角": 24, "竜鱗": 6 });
const DEPTH_TARGETS = [5, 10, 15, 20];
const BASE_SCENARIO = REFERENCE_SCENARIOS.find(scenario => scenario.id === "workshop-empty");

const SCALES = [0.5, 0.25, 0.1, 0];
const CONDITIONS = [
  {
    id: "baseline",
    label: "×1.0",
    shape: "baseline",
    scale: 1,
    override: null
  },
  ...SCALES.map(scale => ({
    id: `prob-${scale}`,
    label: `確率×${scale}`,
    shape: "probability",
    scale,
    override: {
      id: `prob-${scale}`,
      shape: "probability",
      scale,
      baseChance: MATERIAL_DROP_BALANCE.baseChance * scale,
      depthChancePerFloor: MATERIAL_DROP_BALANCE.depthChancePerFloor * scale,
      maxChance: MATERIAL_DROP_BALANCE.maxChance * scale,
      secondaryChance: MATERIAL_DROP_BALANCE.secondaryChance * scale
    }
  })),
  ...SCALES.map(scale => ({
    id: `quantity-${scale}`,
    label: `数量×${scale}`,
    shape: "quantity",
    scale,
    override: {
      id: `quantity-${scale}`,
      shape: "quantity",
      scale,
      depthQuantityPerFloor: MATERIAL_DROP_BALANCE.depthQuantityPerFloor
    }
  })),
  ...[0.5, 0.25, 0.1, 0].map(scale => ({
    id: `depth-slope-${scale}`,
    label: `深度数量傾斜×${scale}`,
    shape: "depth-slope",
    scale,
    override: {
      id: `depth-slope-${scale}`,
      shape: "depth-slope",
      scale,
      depthQuantityPerFloor: MATERIAL_DROP_BALANCE.depthQuantityPerFloor * scale
    }
  }))
];

const PORTAL_MODES = [
  {
    id: "current",
    label: "現状（永久翼）",
    repeat: false
  },
  {
    id: "repeat-6x",
    label: "finite反復6x",
    repeat: true
  }
];

const STANDARD_NODES = WORKSHOP_NODES.filter(node => node.id !== WING_NODE_ID);

function emptyMaterials() {
  return Object.fromEntries(MATERIAL_TYPES.map(material => [material, 0]));
}

function addMaterials(target, additions) {
  Object.entries(additions || {}).forEach(([material, quantity]) => {
    target[material] = (target[material] || 0) + quantity;
  });
}

function totalMaterials(materials) {
  return Object.values(materials || {}).reduce((sum, quantity) => sum + quantity, 0);
}

function cloneWorkshop(workshop) {
  return { ranks: { ...(workshop.ranks || {}) } };
}

function getNodeMaxRank(node) {
  return node.maxRank || node.costs?.length || 1;
}

function isNodeComplete(workshop, node) {
  return getWorkshopRank(workshop, node.id) >= getNodeMaxRank(node);
}

function getNodesForMode(mode) {
  return mode.repeat ? STANDARD_NODES : WORKSHOP_NODES;
}

function isWorkshopComplete(workshop, mode) {
  return getNodesForMode(mode).every(node => isNodeComplete(workshop, node));
}

function getRemainingDemand(workshop, mode) {
  const remaining = emptyMaterials();
  getNodesForMode(mode).forEach(node => {
    for (
      let rank = getWorkshopRank(workshop, node.id);
      rank < getNodeMaxRank(node);
      rank++
    ) {
      addMaterials(remaining, getWorkshopNodeCost(node, rank));
    }
  });
  return remaining;
}

function getPurchaseOrder(workshop, mode) {
  const nodes = getNodesForMode(mode);
  if (mode.repeat) return nodes.map(node => node.id);
  return [
    WING_NODE_ID,
    ...nodes.filter(node => node.id !== WING_NODE_ID).map(node => node.id)
  ];
}

function canSpendKeepingReserve(bank, cost, reserve) {
  const spent = spendMaterials(bank, cost);
  return Boolean(spent && canAffordMaterials(spent, reserve));
}

function purchaseAvailable(initialBank, initialWorkshop, mode) {
  let bank = { ...initialBank };
  let workshop = cloneWorkshop(initialWorkshop);
  let purchases = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of getPurchaseOrder(workshop, mode)) {
      const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
      const rank = getWorkshopRank(workshop, nodeId);
      if (!node || rank >= getNodeMaxRank(node)) continue;
      const cost = getWorkshopNodeCost(node, rank);
      if (
        mode.repeat &&
        !canSpendKeepingReserve(bank, cost, REPEAT_COST)
      ) {
        continue;
      }
      const result = purchaseWorkshopNode(bank, workshop, nodeId);
      if (!result.ok) continue;
      bank = result.metaMaterials;
      workshop = result.workshop;
      purchases++;
      changed = true;
    }
  }
  return { bank, workshop, purchases };
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function mean(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function formatNumber(value, digits = 2) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);
}

function formatRate(value) {
  return `${(100 * value).toFixed(1)}%`;
}

function getUsefulLoss(result, bankBefore, workshopBefore, mode) {
  const demand = getRemainingDemand(workshopBefore, mode);
  if (mode.repeat) addMaterials(demand, REPEAT_COST);
  let raw = 0;
  let useful = 0;
  MATERIAL_TYPES.forEach(material => {
    const lost = Math.max(
      0,
      (result.carriedMaterialCounts[material] || 0) -
      (result.bankedMaterialCounts[material] || 0)
    );
    const unmet = Math.max(0, (demand[material] || 0) - (bankBefore[material] || 0));
    raw += lost;
    useful += Math.min(lost, unmet);
  });
  return { raw, useful };
}

function createTotals() {
  return {
    runs: 0,
    survived: 0,
    carried: 0,
    banked: 0,
    time: 0,
    reached: 0,
    b10: 0,
    b15: 0,
    merchantAttempts: 0,
    merchantPurchases: 0,
    merchantFailures: {},
    materialRuns: 0,
    materialRawLoss: 0,
    materialUsefulLoss: 0,
    materialRunsWithRawLoss: 0,
    materialRunsWithUsefulLoss: 0,
    postRuns: 0,
    postNetSurplus: 0,
    repeatWingPurchases: 0,
    repeatWingMaterialsSpent: 0,
    materialSources: {
      chest: 0,
      combat: 0,
      quest: 0,
      other: 0
    },
    buyoutRuns: [],
    firstNodeRuns: []
  };
}

function simulateGridCase(condition, mode, scoringProfile) {
  const totals = createTotals();
  for (let trial = 0; trial < TRIALS; trial++) {
    resetSimulationRandom(BASE_SEED + trial * 104729);
    let bank = emptyMaterials();
    let workshop = { ranks: {} };
    let buyoutRun = null;
    let firstNodeRun = null;

    for (let run = 1; run <= RUNS_PER_TRIAL; run++) {
      const completeAtStart = isWorkshopComplete(workshop, mode);
      const bankAtStart = totalMaterials(bank);
      let startingTownPortals = 0;

      if (mode.repeat) {
        const paid = spendMaterials(bank, REPEAT_COST);
        if (paid) {
          bank = paid;
          startingTownPortals = 1;
          totals.repeatWingPurchases++;
          totals.repeatWingMaterialsSpent += totalMaterials(REPEAT_COST);
        }
      } else if (isNodeComplete(
        workshop,
        WORKSHOP_NODES.find(node => node.id === WING_NODE_ID)
      )) {
        startingTownPortals = 1;
      }

      const result = simulateRun({
        className: SIM_CLASSES[(trial * RUNS_PER_TRIAL + run - 1) % SIM_CLASSES.length],
        startFloor: 1,
        targetDepth: TARGET_DEPTH,
        runIndex: trial * RUNS_PER_TRIAL + run,
        seriesId: `inflow-grid-${mode.id}`,
        scoringProfile,
        scenario: {
          ...BASE_SCENARIO,
          id: `inflow-${condition.id}-${mode.id}`,
          ignoreWorkshopReturnItems: true,
          startingTownPortals,
          startingPortalSource: "workshop-supply",
          allowChestTownPortal: true,
          buyMerchantTownPortal: true,
          retreatAtMilestoneWithoutTownPortal: true,
          materialDropOverride: condition.override
        },
        workshop
      });

      totals.runs++;
      totals.survived += Number(result.survived);
      totals.carried += result.carriedMaterials;
      totals.banked += result.bankedMaterials;
      totals.time += result.timeCost;
      totals.reached += result.reachedFloor;
      totals.b10 += Number(result.reachedFloor >= 10);
      totals.b15 += Number(result.reachedFloor >= 15);
      totals.merchantAttempts += result.merchantWingAttempts;
      totals.merchantPurchases += result.merchantWingsPurchased;
      addMaterials(totals.materialSources, result.materialSources);
      Object.entries(result.merchantWingFailures).forEach(([reason, count]) => {
        totals.merchantFailures[reason] =
          (totals.merchantFailures[reason] || 0) + count;
      });

      if (!completeAtStart) {
        const stake = getUsefulLoss(result, bank, workshop, mode);
        totals.materialRuns++;
        totals.materialRawLoss += stake.raw;
        totals.materialUsefulLoss += stake.useful;
        totals.materialRunsWithRawLoss += Number(stake.raw > 0);
        totals.materialRunsWithUsefulLoss += Number(stake.useful > 0);
      }

      addMaterials(bank, result.bankedMaterialCounts);
      const purchaseResult = purchaseAvailable(bank, workshop, mode);
      bank = purchaseResult.bank;
      workshop = purchaseResult.workshop;
      if (firstNodeRun === null && purchaseResult.purchases > 0) firstNodeRun = run;
      if (buyoutRun === null && isWorkshopComplete(workshop, mode)) buyoutRun = run;

      if (completeAtStart) {
        totals.postRuns++;
        totals.postNetSurplus += totalMaterials(bank) - bankAtStart;
      }
    }

    if (buyoutRun !== null) totals.buyoutRuns.push(buyoutRun);
    if (firstNodeRun !== null) totals.firstNodeRuns.push(firstNodeRun);
  }
  return { condition, mode, totals };
}

function summarizeGridResult(result) {
  const { totals } = result;
  return {
    buyoutMean: mean(totals.buyoutRuns),
    buyoutMedian: percentile(totals.buyoutRuns, 0.5),
    buyoutP90: percentile(totals.buyoutRuns, 0.9),
    buyoutRate: totals.buyoutRuns.length / TRIALS,
    firstNodeMean: mean(totals.firstNodeRuns),
    firstNodeMedian: percentile(totals.firstNodeRuns, 0.5),
    firstNodeP90: percentile(totals.firstNodeRuns, 0.9),
    usefulLossPerRun: totals.materialUsefulLoss / Math.max(1, totals.materialRuns),
    usefulLossRate: totals.materialUsefulLoss / Math.max(1, totals.materialRawLoss),
    usefulStakeRunRate:
      totals.materialRunsWithUsefulLoss / Math.max(1, totals.materialRuns),
    surplusPerRun: totals.postNetSurplus / Math.max(1, totals.postRuns),
    averageReached: totals.reached / totals.runs,
    survivalRate: totals.survived / totals.runs,
    evPerTime: totals.banked / totals.time,
    b10Rate: totals.b10 / totals.runs,
    b15Rate: totals.b15 / totals.runs,
    merchantRate: totals.merchantPurchases / Math.max(1, totals.merchantAttempts),
    merchantPurchases: totals.merchantPurchases,
    merchantAttempts: totals.merchantAttempts,
    insufficient: totals.merchantFailures.insufficient_materials || 0,
    repeatWingRate: totals.repeatWingPurchases / totals.runs,
    repeatWingSpend: totals.repeatWingMaterialsSpent / totals.runs
  };
}

function simulateDepthAdvantage(condition, scoringProfile) {
  return DEPTH_TARGETS.map(targetDepth => {
    resetSimulationRandom(BASE_SEED + 65537);
    let banked = 0;
    let time = 0;
    let combatMaterials = 0;
    let combatEvents = 0;
    let combatHitEvents = 0;
    for (let runIndex = 0; runIndex < DEPTH_RUNS; runIndex++) {
      const result = simulateRun({
        className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
        startFloor: 1,
        targetDepth,
        runIndex,
        seriesId: "inflow-depth-paired",
        scoringProfile,
        scenario: {
          ...BASE_SCENARIO,
          id: `inflow-depth-${condition.id}`,
          useTownPortal: true,
          buyMerchantTownPortal: false,
          retreatAtMilestoneWithoutTownPortal: false,
          materialDropOverride: condition.override
        }
      });
      banked += result.bankedMaterials;
      time += result.timeCost;
      combatMaterials += result.materialSources.combat;
      combatEvents += result.combatMaterialEvents;
      combatHitEvents += result.combatMaterialHitEvents;
    }
    return {
      targetDepth,
      bankedEv: banked / DEPTH_RUNS,
      evPerTime: banked / time,
      combatMaterialsPerRun: combatMaterials / DEPTH_RUNS,
      combatHitRate: combatHitEvents / Math.max(1, combatEvents)
    };
  });
}

function simulateMerchantOnly(condition, scoringProfile) {
  const totals = {
    runs: 0,
    reached: 0,
    survived: 0,
    attempts: 0,
    purchases: 0,
    insufficient: 0
  };
  resetSimulationRandom(BASE_SEED + 999983);
  for (let runIndex = 0; runIndex < DEPTH_RUNS; runIndex++) {
    const result = simulateRun({
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: "inflow-merchant-only-paired",
      scoringProfile,
      scenario: {
        ...BASE_SCENARIO,
        id: `merchant-only-${condition.id}`,
        workshopReturnItem: null,
        ignoreWorkshopReturnItems: true,
        startingTownPortals: 0,
        allowChestTownPortal: false,
        discardChestTownPortal: true,
        buyMerchantTownPortal: true,
        retreatAtMilestoneWithoutTownPortal: false,
        materialDropOverride: condition.override
      }
    });
    totals.runs++;
    totals.reached += result.reachedFloor;
    totals.survived += Number(result.survived);
    totals.attempts += result.merchantWingAttempts;
    totals.purchases += result.merchantWingsPurchased;
    totals.insufficient += result.merchantWingFailures.insufficient_materials || 0;
  }
  return { condition, totals };
}

function isMonotonic(points, key) {
  return points.every((point, index) =>
    index === 0 || point[key] >= points[index - 1][key]
  );
}

function printOverrideDefinitions() {
  console.log("【A: sim内 override 定義】");
  console.log(
    "baseline src MATERIAL_DROP_BALANCE: " +
    `baseChance=${MATERIAL_DROP_BALANCE.baseChance}, ` +
    `depthChancePerFloor=${MATERIAL_DROP_BALANCE.depthChancePerFloor}, ` +
    `maxChance=${MATERIAL_DROP_BALANCE.maxChance}, ` +
    `secondaryChance=${MATERIAL_DROP_BALANCE.secondaryChance}, ` +
    `depthQuantityPerFloor=${MATERIAL_DROP_BALANCE.depthQuantityPerFloor}`
  );
  CONDITIONS.forEach(condition => {
    if (!condition.override) {
      console.log(`${condition.label}: 実src値、overrideなし`);
      return;
    }
    if (condition.shape === "probability") {
      const override = condition.override;
      console.log(
        `${condition.label}: baseChance=${override.baseChance.toFixed(5)}, ` +
        `depthChancePerFloor=${override.depthChancePerFloor.toFixed(5)}, ` +
        `maxChance=${override.maxChance.toFixed(5)}, ` +
        `secondaryChance=${override.secondaryChance.toFixed(5)}`
      );
    } else if (condition.shape === "quantity") {
      console.log(
        `${condition.label}: combat drop個数を単位ごとにkeep=${condition.scale}; ` +
        `depthQuantityPerFloor=${MATERIAL_DROP_BALANCE.depthQuantityPerFloor}維持`
      );
    } else {
      console.log(
        `${condition.label}: depthQuantityPerFloor=` +
        `${condition.override.depthQuantityPerFloor.toFixed(5)}`
      );
    }
  });
}

function printGrid(results) {
  console.log("\n【B/C: 流入削減 × 翼供給 格子】");
  console.log(
    "条件 | 翼 | 買切 平均/中央/p90/到達率 | 素材期 有効損失/run/有価値率/stake有run率 | " +
    "買切後余剰/run | 到達/生還/EV時間/B10/B15 | 商人成立 | 反復翼 購入率/素材消費"
  );
  results.forEach(result => {
    const summary = summarizeGridResult(result);
    console.log(
      `${result.condition.label} | ${result.mode.label} | ` +
      `${formatNumber(summary.buyoutMean)}/${summary.buyoutMedian ?? "n/a"}/` +
      `${summary.buyoutP90 ?? "n/a"}/${formatRate(summary.buyoutRate)} | ` +
      `${formatNumber(summary.usefulLossPerRun)}/${formatRate(summary.usefulLossRate)}/` +
      `${formatRate(summary.usefulStakeRunRate)} | ` +
      `${formatNumber(summary.surplusPerRun)} | ` +
      `B${formatNumber(summary.averageReached)}/${formatRate(summary.survivalRate)}/` +
      `${summary.evPerTime.toFixed(4)}/${formatRate(summary.b10Rate)}/` +
      `${formatRate(summary.b15Rate)} | ` +
      `${summary.merchantPurchases}/${summary.merchantAttempts} ` +
      `(${formatRate(summary.merchantRate)}, insufficient=${summary.insufficient}) | ` +
      `${formatRate(summary.repeatWingRate)}/${formatNumber(summary.repeatWingSpend)}`
    );
  });
}

function printEarlyEffects(results) {
  console.log("\n【副作用: 工房1ノード目・商人価格】");
  console.log("条件 | 翼 | 1ノード目 平均/中央/p90/到達率 | 商人成立");
  results.forEach(result => {
    const summary = summarizeGridResult(result);
    console.log(
      `${result.condition.label} | ${result.mode.label} | ` +
      `${formatNumber(summary.firstNodeMean)}/${summary.firstNodeMedian ?? "n/a"}/` +
      `${summary.firstNodeP90 ?? "n/a"}/` +
      `${formatRate(result.totals.firstNodeRuns.length / TRIALS)} | ` +
      `${summary.merchantPurchases}/${summary.merchantAttempts} ` +
      `(${formatRate(summary.merchantRate)})`
    );
  });
}

function printSourceBreakdown(results) {
  console.log("\n【流入内訳: carried素材/run】");
  console.log("条件 | 翼 | combat / chest / combat中quest / その他quest等 / 合計");
  results.forEach(result => {
    const sources = result.totals.materialSources;
    console.log(
      `${result.condition.label} | ${result.mode.label} | ` +
      `${(sources.combat / result.totals.runs).toFixed(2)} / ` +
      `${(sources.chest / result.totals.runs).toFixed(2)} / ` +
      `${(sources.quest / result.totals.runs).toFixed(2)} / ` +
      `${(sources.other / result.totals.runs).toFixed(2)} / ` +
      `${(result.totals.carried / result.totals.runs).toFixed(2)}`
    );
  });
}

function printMerchantOnly(results) {
  console.log("\n【商人経路: 翼なし強制push】");
  console.log("条件 | 平均到達 | 生還 | 成立/試行 | insufficient");
  results.forEach(({ condition, totals }) => {
    console.log(
      `${condition.label} | B${(totals.reached / totals.runs).toFixed(2)} | ` +
      `${formatRate(totals.survived / totals.runs)} | ` +
      `${totals.purchases}/${totals.attempts} ` +
      `(${formatRate(totals.purchases / Math.max(1, totals.attempts))}) | ` +
      `${totals.insufficient}`
    );
  });
}

function printDepthAdvantage(depthResults) {
  console.log("\n【深層優位: bank素材EV 深度単調性】");
  console.log("条件 | bank素材EV B5/B10/B15/B20 | 単調 | EV/時間 B5/B10/B15/B20 | 単調");
  depthResults.forEach(({ condition, points }) => {
    console.log(
      `${condition.label} | ${points.map(point => point.bankedEv.toFixed(2)).join("/")} | ` +
      `${isMonotonic(points, "bankedEv") ? "Yes" : "No"} | ` +
      `${points.map(point => point.evPerTime.toFixed(4)).join("/")} | ` +
      `${isMonotonic(points, "evPerTime") ? "Yes" : "No"}`
    );
  });
  console.log("\n【確率絞り vs 数量絞り: B20戦闘drop体験】");
  console.log("条件 | combat素材/run | 戦闘drop非空率");
  depthResults.forEach(({ condition, points }) => {
    const b20 = points.find(point => point.targetDepth === 20);
    console.log(
      `${condition.label} | ${b20.combatMaterialsPerRun.toFixed(2)} | ` +
      `${formatRate(b20.combatHitRate)}`
    );
  });
}

function printTargetCandidates(results, depthResults) {
  console.log("\n【D: 買い切り10/20/30ラン候補】");
  for (const mode of PORTAL_MODES) {
    const modeResults = results
      .filter(result => result.mode.id === mode.id)
      .map(result => ({ result, summary: summarizeGridResult(result) }))
      .filter(entry => entry.summary.buyoutMedian !== null);
    for (const target of [10, 20, 30]) {
      const exactCandidates = modeResults.filter(entry =>
        Math.abs(entry.summary.buyoutMedian - target) <= 2
      );
      if (exactCandidates.length === 0) {
        const slowest = [...modeResults].sort((left, right) =>
          right.summary.buyoutMedian - left.summary.buyoutMedian
        )[0];
        console.log(
          `${mode.label} / ${target}ラン相当: 該当なし。最遅=` +
          `${slowest.result.condition.label} 中央${slowest.summary.buyoutMedian}run ` +
          `(平均${formatNumber(slowest.summary.buyoutMean)}, ` +
          `p90 ${slowest.summary.buyoutP90})`
        );
        continue;
      }
      const nearest = [...exactCandidates].sort((left, right) =>
        Math.abs(left.summary.buyoutMedian - target) -
        Math.abs(right.summary.buyoutMedian - target)
      )[0];
      const depth = depthResults.find(entry =>
        entry.condition.id === nearest.result.condition.id
      );
      console.log(
        `${mode.label} / ${target}ラン相当: ${nearest.result.condition.label}, ` +
        `買切=${formatNumber(nearest.summary.buyoutMean)}/` +
        `${nearest.summary.buyoutMedian}/${nearest.summary.buyoutP90}, ` +
        `到達=B${formatNumber(nearest.summary.averageReached)}, ` +
        `生還=${formatRate(nearest.summary.survivalRate)}, ` +
        `EV/時間=${nearest.summary.evPerTime.toFixed(4)}, ` +
        `B10/B15=${formatRate(nearest.summary.b10Rate)}/` +
        `${formatRate(nearest.summary.b15Rate)}, ` +
        `bankEV単調=${isMonotonic(depth.points, "bankedEv") ? "Yes" : "No"}, ` +
        `時間EV単調=${isMonotonic(depth.points, "evPerTime") ? "Yes" : "No"}`
      );
    }
  }
}

console.log("Issue #234 流入削減 診断sim");
console.log(
  `格子: N=${TRIALS}, ${RUNS_PER_TRIAL}run/試行, 深度比較 N=${DEPTH_RUNS}/点, ` +
  `seed=${BASE_SEED}, core calibration N=${CALIBRATION_RUNS}`
);
console.log(
  "実装経路: generateRunFloor / applyCombatRewards / generateRandomEquipment / " +
  "generateChestMaterials / bankRunMaterials / purchaseWorkshopNode を既存sim経由で実srcから使用。"
);
console.log(
  "what-if試算: applyCombatRewards後の戦闘drop差分だけsim内override。宝箱素材・新規quest報酬は非対象。" +
  "確率絞りはmaterial種類×戦闘バッチ単位、数量絞りは1個単位。override専用乱数を使うため、" +
  "実src経路と乱数消費順・分布は一致しない。BANKING_RATESは実srcのretreat=1/death=0.3固定。"
);
console.log(
  "finite反復6x: 毎run開始時に黒角24+竜鱗6で翼1個を購入可能なら購入。" +
  "標準11ノード買切を有限工房完了と定義し、翼費用を予約して購入。"
);

printOverrideDefinitions();
const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
const gridResults = RUN_MODE === "depth"
  ? []
  : CONDITIONS.flatMap(condition =>
    PORTAL_MODES.map(mode => simulateGridCase(condition, mode, scoringProfile))
  );
const depthResults = CONDITIONS.map(condition => ({
  condition,
  points: simulateDepthAdvantage(condition, scoringProfile)
}));
const merchantResults = RUN_MODE === "depth"
  ? []
  : CONDITIONS.map(condition => simulateMerchantOnly(condition, scoringProfile));

if (RUN_MODE !== "depth") {
  printGrid(gridResults);
  printEarlyEffects(gridResults);
  printSourceBreakdown(gridResults);
  printMerchantOnly(merchantResults);
}
printDepthAdvantage(depthResults);
if (RUN_MODE !== "depth") printTargetCandidates(gridResults, depthResults);

if (RUN_MODE !== "depth") {
  const baselineCurrent = gridResults.find(result =>
    result.condition.id === "baseline" && result.mode.id === "current"
  );
  if (!baselineCurrent || baselineCurrent.totals.buyoutRuns.length === 0) {
    throw new Error("baseline current workshop did not complete");
  }
}
if (depthResults.some(result => result.points.length !== DEPTH_TARGETS.length)) {
  throw new Error("depth advantage measurement incomplete");
}
