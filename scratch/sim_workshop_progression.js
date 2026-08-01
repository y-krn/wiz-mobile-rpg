// sim-scope: run
/* global console, process */

import { pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const {
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  SCENARIOS,
  SIM_CLASSES,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const { WORKSHOP_NODES } = await import("../src/data/workshop.js");
const {
  getWorkshopNodeCost,
  getWorkshopRank,
  purchaseWorkshopNode
} = await import("../src/systems/workshop.js");
const { spendAnyMaterials } = await import("../src/rules/material_rules.js");
const { DEPARTURE_KIT } = await import("../src/data/workshop.js");

const TRIALS = Math.max(1, Number(process.env.PROGRESSION_TRIALS || 50));
const RUNS_PER_TRIAL = Math.max(1, Number(process.env.PROGRESSION_RUNS || 50));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.PROGRESSION_CALIBRATION_RUNS || 100));
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
const STAT_NODE_IDS = WORKSHOP_NODES
  .filter(node => node.category === "permanentStats")
  .map(node => node.id);
const OTHER_NODE_IDS = WORKSHOP_NODES
  .filter(node => !STAT_NODE_IDS.includes(node.id))
  .map(node => node.id);
const PROGRESSION_SCENARIO = {
  ...SCENARIOS.find(scenario => scenario.id === "workshop-locked"),
  id: "workshop-progression",
  label: "工房進行",
  workshopReturnItem: null,
  useTownPortal: true
};

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

function totalMaterials(materials) {
  return MATERIALS.reduce((sum, material) => sum + (materials?.[material] || 0), 0);
}

function cloneWorkshop(workshop) {
  return { ranks: { ...(workshop?.ranks || {}) } };
}

function getNodeMaxRank(node) {
  return node.maxRank || 1;
}

function isNodeComplete(workshop, nodeId) {
  const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
  return getWorkshopRank(workshop, nodeId) >= getNodeMaxRank(node);
}

function isWorkshopComplete(workshop) {
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

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

const FINITE_PORTAL_SCENARIOS = [
  {
    id: "kit-off",
    label: "出発準備なし（宝箱・商人のみ）",
    kitCost: 0,
    allowChestTownPortal: true
  },
  {
    id: "merchant-only",
    label: "商人のみ",
    kitCost: 0,
    allowChestTownPortal: false
  },
  // 出発準備は種別を問わない総量課金。種別固定のコストでは需要のない素材が
  // 無価値のまま残り、stakeが戻らない（#234 の掃引で確認済み）。
  ...[20, 40, DEPARTURE_KIT.materialCost, 80].map(kitCost => ({
    id: `kit-${kitCost}`,
    label: kitCost === DEPARTURE_KIT.materialCost
      ? `出発準備 素材${kitCost}個（実装値）`
      : `出発準備 素材${kitCost}個`,
    kitCost,
    allowChestTownPortal: true
  }))
];


// 出発準備は工房ノードではなくなったため、工房需要は全ノードが対象（#234）。
const STANDARD_WORKSHOP_NODES = WORKSHOP_NODES;

function isStandardWorkshopComplete(workshop) {
  return STANDARD_WORKSHOP_NODES.every(node =>
    getWorkshopRank(workshop, node.id) >= getNodeMaxRank(node)
  );
}

function getStandardRemainingDemand(workshop) {
  const demand = emptyMaterials();
  STANDARD_WORKSHOP_NODES.forEach(node => {
    const rank = getWorkshopRank(workshop, node.id);
    for (let index = rank; index < getNodeMaxRank(node); index++) {
      addMaterials(demand, getWorkshopNodeCost(node, index));
    }
  });
  return demand;
}

function canSpendAndKeepReserve(bank, cost, reserve) {
  return MATERIALS.every(material =>
    (bank[material] || 0) - (cost?.[material] || 0) >= (reserve?.[material] || 0)
  );
}

function purchaseStandardAvailable(initialBank, initialWorkshop, reserve = null) {
  let bank = { ...initialBank };
  let workshop = cloneWorkshop(initialWorkshop);
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of [...STAT_NODE_IDS, ...OTHER_NODE_IDS]) {
      const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
      const rank = getWorkshopRank(workshop, nodeId);
      if (rank >= getNodeMaxRank(node)) continue;
      const cost = getWorkshopNodeCost(node, rank);
      if (reserve && !canSpendAndKeepReserve(bank, cost, reserve)) continue;
      const result = purchaseWorkshopNode(bank, workshop, nodeId);
      if (!result.ok) continue;
      bank = result.metaMaterials;
      workshop = result.workshop;
      changed = true;
    }
  }
  return { bank, workshop };
}

function getFiniteStake(result, bank, workshop, scenario) {
  if (!result.died) return { raw: 0, useful: 0 };
  const lost = subtractMaterials(result.carriedMaterialCounts, result.bankedMaterialCounts);
  const raw = totalMaterials(lost);
  const remaining = getStandardRemainingDemand(workshop);
  const unmet = subtractMaterials(remaining, bank);
  // 出発準備は需要が尽きない恒常シンク。総量課金なので全種が支払いに使える。
  if (scenario.kitCost > 0) {
    MATERIALS.forEach(material => {
      unmet[material] = Number.POSITIVE_INFINITY;
    });
  }
  const useful = MATERIALS.reduce(
    (sum, material) => sum + Math.min(lost[material], unmet[material]),
    0
  );
  return { raw, useful };
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
    portalAcquisitions: { workshopSupply: 0, chest: 0, merchant: 0 },
    merchantAttempts: 0,
    merchantPurchases: 0,
    merchantFailures: {},
    kitMaterialSpent: 0,
    kitSpentByMaterial: emptyMaterials(),
    milestoneDecisions: 0,
    insuredMilestoneDecisions: 0,
    endingBankTotal: 0,
    surplusPerRun: 0,
    firstMerchantPurchaseRuns: [],
    standardCompleteRuns: []
  };
}

function addKitSpend(totals, cost) {
  totals.kitMaterialSpent += totalMaterials(cost);
  addMaterials(totals.kitSpentByMaterial, cost);
}

function simulateFinitePortalTrial(trial, scenario, scoringProfile) {
  resetSimulationRandom(BASE_SEED + trial * 104729);
  let bank = emptyMaterials();
  let workshop = { ranks: {} };
  let standardCompleteRun = null;
  let firstMerchantPurchaseRun = null;
  const bankTimeline = [];
  const events = [];

  for (let run = 1; run <= RUNS_PER_TRIAL; run++) {
    const standardCompleteAtStart = isStandardWorkshopComplete(workshop);
    const kitSpend = emptyMaterials();
    let startingTownPortals = 0;
    // 出発準備は潜行のたびに素材を支払う。払えた run だけ翼を持って出発する。
    if (scenario.kitCost > 0) {
      const paid = spendAnyMaterials(bank, scenario.kitCost);
      if (paid) {
        bank = paid.balance;
        startingTownPortals = 1;
        addMaterials(kitSpend, paid.spent);
      }
    }

    const result = simulateRun({
      className: SIM_CLASSES[(trial * RUNS_PER_TRIAL + run - 1) % SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: POST_WING_TARGET,
      runIndex: trial * RUNS_PER_TRIAL + run,
      seriesId: `finite-portal-${scenario.id}`,
      scoringProfile,
      scenario: {
        ...PROGRESSION_SCENARIO,
        id: scenario.id,
        ignoreWorkshopReturnItems: true,
        startingTownPortals,
        startingPortalSource: "workshop-supply",
        allowChestTownPortal: scenario.allowChestTownPortal,
        buyMerchantTownPortal: true,
        retreatAtMilestoneWithoutTownPortal: true
      },
      workshop
    });

    const stake = getFiniteStake(result, bank, workshop, scenario);
    if (firstMerchantPurchaseRun === null && result.merchantWingsPurchased > 0) {
      firstMerchantPurchaseRun = run;
    }

    addMaterials(bank, result.bankedMaterialCounts);
    // 出発準備は種別を問わない総量課金なので、特定素材の取り置きでは表現できない。
    // 工房の恒久ノードが先に銀行を吸うぶん、買い切りが終わるまでは翼を落とす run が出る。
    const purchaseResult = purchaseStandardAvailable(bank, workshop, null);
    bank = purchaseResult.bank;
    workshop = purchaseResult.workshop;

    if (standardCompleteRun === null && isStandardWorkshopComplete(workshop)) {
      standardCompleteRun = run;
    }
    bankTimeline.push(totalMaterials(bank));
    events.push({
      standardCompleteAtStart,
      startingTownPortals,
      kitSpend,
      stake,
      result: {
        survived: result.survived,
        carriedMaterials: result.carriedMaterials,
        bankedMaterials: result.bankedMaterials,
        timeCost: result.timeCost,
        reachedFloor: result.reachedFloor,
        townPortalsUsed: result.townPortalsUsed,
        portalAcquisitions: result.portalAcquisitions,
        merchantWingAttempts: result.merchantWingAttempts,
        merchantWingsPurchased: result.merchantWingsPurchased,
        merchantWingFailures: result.merchantWingFailures,
        milestoneDecisions: result.milestoneDecisions
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
      totals.portalAcquisitions.workshopSupply += event.startingTownPortals;
      totals.portalAcquisitions.chest += result.portalAcquisitions.chest;
      totals.portalAcquisitions.merchant += result.portalAcquisitions.merchant;
      totals.merchantAttempts += result.merchantWingAttempts;
      totals.merchantPurchases += result.merchantWingsPurchased;
      Object.entries(result.merchantWingFailures).forEach(([reason, count]) => {
        totals.merchantFailures[reason] = (totals.merchantFailures[reason] || 0) + count;
      });
      totals.milestoneDecisions += result.milestoneDecisions.length;
      totals.insuredMilestoneDecisions += result.milestoneDecisions
        .filter(decision => decision.hasTownPortal)
        .length;
      addKitSpend(totals, event.kitSpend);
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
  return simulateFinitePortalTrial(task.trial, scenario, scoringProfile);
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
    : "50run内なし";
  return (
    `${scenario.label}: 平均到達=B${(totals.reached / totals.runs).toFixed(2)}, ` +
    `生還率=${formatRate(totals.survived / totals.runs)}, ` +
    `EV/時間=${(totals.banked / totals.time).toFixed(4)}, ` +
    `bank保持率=${formatRate(totals.banked / totals.carried)}, ` +
    `B10/B15到達率=${formatRate(totals.reachedB10 / totals.runs)}/` +
    `${formatRate(totals.reachedB15 / totals.runs)}, ` +
    `買切後進行有効損失=${(
      totals.steadyUsefulDeathLoss / Math.max(1, totals.steadyRuns)
    ).toFixed(2)}/run, ` +
    `買切後死亡損失有価値率=${formatRate(usefulRate)}, ` +
    `出発準備素材消費=${(totals.kitMaterialSpent / totals.runs).toFixed(2)}/run, ` +
    `余剰蓄積=${(totals.surplusPerRun / TRIALS).toFixed(2)}/run, ` +
    `翼入手 工房/宝箱/商人=${(totals.portalAcquisitions.workshopSupply / totals.runs).toFixed(3)}/` +
    `${(totals.portalAcquisitions.chest / totals.runs).toFixed(3)}/` +
    `${(totals.portalAcquisitions.merchant / totals.runs).toFixed(3)}/run, ` +
    `商人成立=${totals.merchantPurchases}/${totals.merchantAttempts} ` +
    `(${formatRate(merchantSuccessRate)}, ${firstMerchant}), ` +
    `翼使用率=${formatRate(totals.portalUses / totals.runs)}, ` +
    `insured push=${formatRate(
      totals.milestoneDecisions > 0
        ? totals.insuredMilestoneDecisions / totals.milestoneDecisions
        : 0
    )}`
  );
}

export async function runWorkshopProgressionSimulation() {
  console.log("工房進行シミュレーション（Issue #234: 出発準備の恒常シンク）");
  console.log(
    `試行: 条件ごと N=${TRIALS}, ${RUNS_PER_TRIAL}ラン/試行, seed=${BASE_SEED}, ` +
    `core calibration N=${CALIBRATION_RUNS}`
  );
  const initialDemand = getRemainingDemand({ ranks: {} });
  const workshopSteps = WORKSHOP_NODES.reduce(
    (sum, node) => sum + getNodeMaxRank(node),
    0
  );
  // 工房ノードが変わったら測定前提が崩れるので落とす。出発準備の撤去分を反映済み。
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
    `撤退方針: B${POST_WING_TARGET}到達時撤退。危険時は既存simの翼使用閾値。` +
    `翼を持たずにmilestoneへ着いたら100% bank撤退する。`
  );
  console.log(
    "実装経路: generateRunFloor / applyCombatRewards / generateRandomEquipment / " +
    "bankRunMaterials / purchaseWorkshopNode / applyWorkshopToCharacter を実srcから使用。"
  );
  console.log(
    "grants反映: 恒久stat、affix/spell pool、鑑定粉、帰還item。初期装備は職適合かつ現装備よりatkが高い候補を選択。"
  );
  console.log(
    "stake代理指標: 死亡で失う70%のうち、run開始時bank控除後の未購入工房需要に充当可能な個数。" +
    "遅延購入stepは同runを100%bankした反実仮想との差。買い切り後は有限工房需要ゼロ。"
  );
  console.log(
    "非モデル化: マイルストーン商人、罠状態被害、任意装備/クラス選択の最適化、run間codex継承、" +
    "プレイヤー可変撤退判断。既存sim同様、固定閾値・round-robin職で代理。"
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
  const finitePortalResults = FINITE_PORTAL_SCENARIOS.map(scenario => {
    const trialResults = taskResults.slice(resultOffset, resultOffset + TRIALS);
    resultOffset += TRIALS;
    return aggregateFinitePortalScenario(scenario, trialResults);
  });

  console.log("\n【Issue #234 出発準備の価格比較】");
  console.log(
    "sim内override。実src経路と乱数消費順が異なる試算値。各runはB20を目標とし、" +
    "B5/B10/B15 milestoneで翼を持たなければ100% bank撤退。翼があれば次のmilestoneへpushする。"
  );
  console.log(
    "商人は実purchaseMilestoneStockを各milestone探索後に呼び、currentRun.materialsのみで" +
    "黒角36+呪布27を支払う。宝箱・戦闘drop・装備生成・mapは既存実src経路を維持。"
  );
  console.log(
    "余剰蓄積は各trial後半25runのbank純増。進行有効損失は未購入の通常工房需要、" +
    "反復購入条件では将来の翼費用に使える素材を有価値と数える。" +
    "比較値は通常工房買い切り済みrunだけを集計する。"
  );
  finitePortalResults.forEach(result => console.log(formatFiniteResult(result)));

  console.log("\n【finite供給 商人経路判定】");
  finitePortalResults.forEach(({ scenario, totals }) => {
    console.log(
      `${scenario.label}: insufficient=${totals.merchantFailures.insufficient_materials || 0}, ` +
      `inventory_full=${totals.merchantFailures.inventory_full || 0}, ` +
      `成立trial=${totals.firstMerchantPurchaseRuns.length}/${TRIALS}, ` +
      `通常工房買切trial=${totals.standardCompleteRuns.length}/${TRIALS}, ` +
      `終了bank平均=${(totals.endingBankTotal / TRIALS).toFixed(1)}`
    );
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWorkshopProgressionSimulation();
}
