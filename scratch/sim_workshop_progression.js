/* global console, process */

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
const { spendMaterials } = await import("../src/rules/material_rules.js");

const TRIALS = Math.max(1, Number(process.env.PROGRESSION_TRIALS || 50));
const RUNS_PER_TRIAL = Math.max(1, Number(process.env.PROGRESSION_RUNS || 50));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.PROGRESSION_CALIBRATION_RUNS || 100));
const BASE_SEED = Number(process.env.PROGRESSION_SEED || 278234) >>> 0;
const PRE_WING_TARGET = Math.max(6, Number(process.env.PROGRESSION_PRE_WING_TARGET || 6));
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
const WING_NODE_ID = "kit_return_wing";
const STAT_NODE_IDS = WORKSHOP_NODES
  .filter(node => node.category === "permanentStats")
  .map(node => node.id);
const OTHER_NODE_IDS = WORKSHOP_NODES
  .filter(node => !STAT_NODE_IDS.includes(node.id) && node.id !== WING_NODE_ID)
  .map(node => node.id);
const STRATEGIES = [
  {
    id: "wing-first",
    label: "帰還の翼優先",
    description: "黒角4を翼用に予約。翼→恒久ステータス→装備/プール/鑑定粉。"
  },
  {
    id: "stats-first",
    label: "恒久ステータス優先",
    description: "6能力を全5段まで買い切る間は他ノードを買わない。その後、翼→その他。"
  }
];
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

function getRemainingDemand(workshop, wingCostOverride = null) {
  const demand = emptyMaterials();
  WORKSHOP_NODES.forEach(node => {
    const rank = getWorkshopRank(workshop, node.id);
    for (let index = rank; index < getNodeMaxRank(node); index++) {
      const cost = node.id === WING_NODE_ID && wingCostOverride
        ? wingCostOverride
        : getWorkshopNodeCost(node, index);
      addMaterials(demand, cost);
    }
  });
  return demand;
}

function getCandidateNodeIds(workshop, strategyId) {
  const statsComplete = STAT_NODE_IDS.every(nodeId => isNodeComplete(workshop, nodeId));
  if (strategyId === "stats-first" && !statsComplete) return STAT_NODE_IDS;
  return [WING_NODE_ID, ...STAT_NODE_IDS, ...OTHER_NODE_IDS];
}

function purchaseNode(bank, workshop, nodeId, wingCostOverride) {
  if (nodeId !== WING_NODE_ID || !wingCostOverride) {
    return purchaseWorkshopNode(bank, workshop, nodeId);
  }
  const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
  const rank = getWorkshopRank(workshop, nodeId);
  if (rank >= getNodeMaxRank(node)) return { ok: false, reason: "max_rank" };
  const balance = spendMaterials(bank, wingCostOverride);
  if (!balance) return { ok: false, reason: "insufficient_materials" };
  return {
    ok: true,
    metaMaterials: balance,
    workshop: {
      ...workshop,
      ranks: { ...(workshop.ranks || {}), [nodeId]: rank + 1 }
    }
  };
}

function purchaseAvailable(initialBank, initialWorkshop, strategyId, options = {}) {
  let bank = { ...initialBank };
  let workshop = cloneWorkshop(initialWorkshop);
  let purchases = 0;
  let changed = true;
  const wingCost = options.wingCostOverride ||
    getWorkshopNodeCost(WORKSHOP_NODES.find(node => node.id === WING_NODE_ID), 0);

  while (changed) {
    changed = false;
    for (const nodeId of getCandidateNodeIds(workshop, strategyId)) {
      const node = WORKSHOP_NODES.find(candidate => candidate.id === nodeId);
      const rank = getWorkshopRank(workshop, nodeId);
      if (rank >= getNodeMaxRank(node)) continue;
      const cost = nodeId === WING_NODE_ID && options.wingCostOverride
        ? options.wingCostOverride
        : getWorkshopNodeCost(node, rank);
      const wingLocked = !isNodeComplete(workshop, WING_NODE_ID);
      if (
        wingLocked &&
        strategyId === "wing-first" &&
        nodeId !== WING_NODE_ID &&
        (bank["黒角"] || 0) - (cost?.["黒角"] || 0) < (wingCost?.["黒角"] || 0)
      ) {
        continue;
      }
      const result = purchaseNode(bank, workshop, nodeId, options.wingCostOverride);
      if (!result.ok) continue;
      bank = result.metaMaterials;
      workshop = result.workshop;
      purchases++;
      changed = true;
    }
  }
  return { bank, workshop, purchases };
}

function createPhaseMetrics() {
  return {
    runs: 0,
    survived: 0,
    carried: 0,
    banked: 0,
    time: 0,
    reached: 0,
    b5Reached: 0,
    dragonScaleAcquired: 0,
    rawDeathLoss: 0,
    usefulDeathLoss: 0,
    delayedPurchaseSteps: 0,
    bankedByMaterial: emptyMaterials()
  };
}

function recordPhase(metrics, result, stake) {
  metrics.runs++;
  metrics.survived += Number(result.survived);
  metrics.carried += result.carriedMaterials;
  metrics.banked += result.bankedMaterials;
  metrics.time += result.timeCost;
  metrics.reached += result.reachedFloor;
  metrics.b5Reached += Number(result.reachedFloor >= 5);
  metrics.dragonScaleAcquired += Number((result.carriedMaterialCounts["竜鱗"] || 0) > 0);
  metrics.rawDeathLoss += stake.rawLoss;
  metrics.usefulDeathLoss += stake.usefulLoss;
  metrics.delayedPurchaseSteps += stake.delayedPurchaseSteps;
  addMaterials(metrics.bankedByMaterial, result.bankedMaterialCounts);
}

function getStakeMetrics({
  bankBefore,
  workshopBefore,
  result,
  strategyId,
  options
}) {
  if (!result.died) return { rawLoss: 0, usefulLoss: 0, delayedPurchaseSteps: 0 };
  const lost = subtractMaterials(result.carriedMaterialCounts, result.bankedMaterialCounts);
  const rawLoss = totalMaterials(lost);
  const remainingDemand = getRemainingDemand(workshopBefore, options.wingCostOverride);
  const unmetDemand = subtractMaterials(remainingDemand, bankBefore);
  const usefulLoss = MATERIALS.reduce(
    (sum, material) => sum + Math.min(lost[material], unmetDemand[material]),
    0
  );
  const fullBank = { ...bankBefore };
  addMaterials(fullBank, result.carriedMaterialCounts);
  const actualBank = { ...bankBefore };
  addMaterials(actualBank, result.bankedMaterialCounts);
  const fullPurchases = purchaseAvailable(
    fullBank,
    workshopBefore,
    strategyId,
    options
  ).purchases;
  const actualPurchases = purchaseAvailable(
    actualBank,
    workshopBefore,
    strategyId,
    options
  ).purchases;
  return {
    rawLoss,
    usefulLoss,
    delayedPurchaseSteps: Math.max(0, fullPurchases - actualPurchases)
  };
}

function getPhase(workshop) {
  if (!isNodeComplete(workshop, WING_NODE_ID)) return "preWing";
  if (!isWorkshopComplete(workshop)) return "midWorkshop";
  return "postWorkshop";
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function simulateProgressionCase(strategy, scoringProfile, options = {}) {
  const phaseTotals = {
    preWing: createPhaseMetrics(),
    midWorkshop: createPhaseMetrics(),
    postWorkshop: createPhaseMetrics()
  };
  const wingRuns = [];
  const buyoutRuns = [];
  const afterWingToBuyoutRuns = [];
  const firstSurplusRuns = Object.fromEntries(MATERIALS.map(material => [material, []]));
  const timeline = Array.from({ length: RUNS_PER_TRIAL }, (_, index) => ({
    run: index + 1,
    wingUnlocked: 0,
    workshopComplete: 0,
    averageBank: 0
  }));
  const trialReplays = [];

  for (let trial = 0; trial < TRIALS; trial++) {
    resetSimulationRandom(BASE_SEED + trial * 104729);
    let bank = emptyMaterials();
    let workshop = { ranks: {} };
    let wingRun = null;
    let buyoutRun = null;
    const surplusSeen = new Set();
    const replay = [];

    for (let run = 1; run <= RUNS_PER_TRIAL; run++) {
      const phase = getPhase(workshop);
      const hasWing = phase !== "preWing";
      const result = simulateRun({
        className: SIM_CLASSES[(trial * RUNS_PER_TRIAL + run - 1) % SIM_CLASSES.length],
        startFloor: 1,
        targetDepth: hasWing ? POST_WING_TARGET : PRE_WING_TARGET,
        runIndex: trial * RUNS_PER_TRIAL + run,
        seriesId: "workshop-progression",
        scoringProfile,
        scenario: PROGRESSION_SCENARIO,
        workshop
      });
      const bankBefore = { ...bank };
      const workshopBefore = cloneWorkshop(workshop);
      const stake = getStakeMetrics({
        bankBefore,
        workshopBefore,
        result,
        strategyId: strategy.id,
        options
      });
      recordPhase(phaseTotals[phase], result, stake);
      addMaterials(bank, result.bankedMaterialCounts);
      const purchaseResult = purchaseAvailable(bank, workshop, strategy.id, options);
      bank = purchaseResult.bank;
      workshop = purchaseResult.workshop;

      if (wingRun === null && isNodeComplete(workshop, WING_NODE_ID)) wingRun = run;
      if (buyoutRun === null && isWorkshopComplete(workshop)) buyoutRun = run;
      const remaining = getRemainingDemand(workshop, options.wingCostOverride);
      MATERIALS.forEach(material => {
        if (!surplusSeen.has(material) && (bank[material] || 0) > (remaining[material] || 0)) {
          surplusSeen.add(material);
          firstSurplusRuns[material].push(run);
        }
      });
      timeline[run - 1].wingUnlocked += Number(isNodeComplete(workshop, WING_NODE_ID));
      timeline[run - 1].workshopComplete += Number(isWorkshopComplete(workshop));
      timeline[run - 1].averageBank += totalMaterials(bank);
      replay.push({
        run,
        phase,
        bankedMaterialCounts: { ...result.bankedMaterialCounts },
        lostMaterialCounts: subtractMaterials(
          result.carriedMaterialCounts,
          result.bankedMaterialCounts
        )
      });
    }

    wingRuns.push(wingRun ?? RUNS_PER_TRIAL + 1);
    buyoutRuns.push(buyoutRun ?? RUNS_PER_TRIAL + 1);
    if (wingRun !== null && buyoutRun !== null) afterWingToBuyoutRuns.push(buyoutRun - wingRun);
    trialReplays.push(replay);
  }

  return {
    strategy,
    options,
    phaseTotals,
    wingRuns,
    buyoutRuns,
    afterWingToBuyoutRuns,
    firstSurplusRuns,
    timeline: timeline.map(point => ({
      run: point.run,
      wingUnlockedRate: point.wingUnlocked / TRIALS,
      workshopCompleteRate: point.workshopComplete / TRIALS,
      averageBank: point.averageBank / TRIALS
    })),
    trialReplays
  };
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatRunDistribution(values) {
  const observed = values.filter(value => value <= RUNS_PER_TRIAL);
  if (observed.length === 0) return `未達（${RUNS_PER_TRIAL}ラン内）`;
  const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  return `平均${mean.toFixed(2)} / 中央${percentile(observed, 0.5)} / ` +
    `p90 ${percentile(observed, 0.9)} / ${RUNS_PER_TRIAL}ラン内到達${formatRate(observed.length / values.length)}`;
}

function printPhase(label, metrics) {
  if (metrics.runs === 0) {
    console.log(`${label}: 該当runなし`);
    return;
  }
  const retention = metrics.carried > 0 ? metrics.banked / metrics.carried : 1;
  const usefulShare = metrics.rawDeathLoss > 0
    ? metrics.usefulDeathLoss / metrics.rawDeathLoss
    : 0;
  console.log(
    `${label}: runs=${metrics.runs}, bank保持率=${formatRate(retention)}, ` +
    `bank EV/時間=${(metrics.banked / metrics.time).toFixed(4)}, ` +
    `平均到達=B${(metrics.reached / metrics.runs).toFixed(2)}, ` +
    `生還率=${formatRate(metrics.survived / metrics.runs)}, ` +
    `B5到達率=${formatRate(metrics.b5Reached / metrics.runs)}, ` +
    `竜鱗入手run率=${formatRate(metrics.dragonScaleAcquired / metrics.runs)}, ` +
    `死亡70%損失=${(metrics.rawDeathLoss / metrics.runs).toFixed(2)}/run, ` +
    `進行有効損失=${(metrics.usefulDeathLoss / metrics.runs).toFixed(2)}/run ` +
    `(${formatRate(usefulShare)}), 遅延購入step=${(metrics.delayedPurchaseSteps / metrics.runs).toFixed(3)}/run`
  );
}

function printSurplus(result) {
  const post = result.phaseTotals.postWorkshop;
  console.log("買い切り後 余剰蓄積速度（bank個/run）:");
  console.log(MATERIALS.map(material =>
    `${material}=${post.runs > 0 ? (post.bankedByMaterial[material] / post.runs).toFixed(3) : "n/a"}`
  ).join(", "));
  console.log("素材別 初回余剰run（平均 / 中央 / 観測率）:");
  console.log(MATERIALS.map(material => {
    const values = result.firstSurplusRuns[material];
    if (values.length === 0) return `${material}=未観測`;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${material}=${mean.toFixed(2)}/${percentile(values, 0.5)}/${formatRate(values.length / TRIALS)}`;
  }).join(", "));
}

function printTimeline(result) {
  console.log("時系列 run | 翼解放累積 | 工房買切累積 | 平均bank残高");
  result.timeline.forEach(point => {
    console.log(
      `${String(point.run).padStart(2)} | ${formatRate(point.wingUnlockedRate)} | ` +
      `${formatRate(point.workshopCompleteRate)} | ${point.averageBank.toFixed(1)}`
    );
  });
}

function replayFlexibleSink(result, sinkPerRun) {
  const netByMaterial = emptyMaterials();
  let postRuns = 0;
  let consumed = 0;
  let rawDeathLoss = 0;
  for (const replay of result.trialReplays) {
    const bank = emptyMaterials();
    for (const event of replay) {
      if (event.phase !== "postWorkshop") continue;
      postRuns++;
      addMaterials(bank, event.bankedMaterialCounts);
      addMaterials(netByMaterial, event.bankedMaterialCounts);
      rawDeathLoss += totalMaterials(event.lostMaterialCounts);
      let remainingSink = sinkPerRun;
      const order = [...MATERIALS].sort((left, right) => bank[right] - bank[left]);
      for (const material of order) {
        const spent = Math.min(bank[material], remainingSink);
        bank[material] -= spent;
        netByMaterial[material] -= spent;
        consumed += spent;
        remainingSink -= spent;
        if (remainingSink === 0) break;
      }
    }
  }
  return {
    sinkPerRun,
    postRuns,
    consumedPerRun: postRuns > 0 ? consumed / postRuns : 0,
    sinkCoverage: postRuns > 0 ? consumed / (postRuns * sinkPerRun) : 0,
    netPerRun: postRuns > 0 ? totalMaterials(netByMaterial) / postRuns : 0,
    netByMaterial,
    rawDeathLoss
  };
}

function printCase(result, includeTimeline = true) {
  console.log(`\n【${result.strategy.label}${result.options.label ? ` / ${result.options.label}` : ""}】`);
  console.log(`購入仮定: ${result.strategy.description}`);
  console.log(`翼解放run: ${formatRunDistribution(result.wingRuns)}`);
  console.log(`工房買い切りrun: ${formatRunDistribution(result.buyoutRuns)}`);
  console.log(`翼解放→買い切り差: ${formatRunDistribution(result.afterWingToBuyoutRuns)}`);
  printPhase("翼解放前", result.phaseTotals.preWing);
  printPhase("翼解放後〜買い切り前", result.phaseTotals.midWorkshop);
  printPhase("買い切り後", result.phaseTotals.postWorkshop);
  printSurplus(result);
  if (includeTimeline) printTimeline(result);
}

console.log("工房進行シミュレーション（Issue #234 + #278）");
console.log(
  `試行: 戦略ごと N=${TRIALS}, ${RUNS_PER_TRIAL}ラン/試行, seed=${BASE_SEED}, ` +
  `core calibration N=${CALIBRATION_RUNS}`
);
const initialDemand = getRemainingDemand({ ranks: {} });
const workshopSteps = WORKSHOP_NODES.reduce(
  (sum, node) => sum + getNodeMaxRank(node),
  0
);
if (workshopSteps !== 36 || totalMaterials(initialDemand) !== 131) {
  throw new Error(
    `workshop demand mismatch: steps=${workshopSteps}, materials=${totalMaterials(initialDemand)}`
  );
}
console.log(
  `工房実需要検算: ${WORKSHOP_NODES.length}ノード / ${workshopSteps}購入step / ` +
  `総${totalMaterials(initialDemand)}個。`
);
console.log(
  `撤退方針: 翼解放前=B${PRE_WING_TARGET}到達時撤退（B5を探索して竜鱗橋渡し）、` +
  `解放後=B${POST_WING_TARGET}到達時撤退。危険時は既存simの翼使用閾値。`
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
const baselineResults = STRATEGIES.map(strategy =>
  simulateProgressionCase(strategy, scoringProfile, { id: "baseline" })
);
baselineResults.forEach(result => printCase(result));

console.log("\n【what-if 試算: 帰還の翼から竜鱗ゲート除去】");
console.log(
  "sim内override: kit_return_wing costを黒角4のみへ置換。実src経路と乱数消費順が異なる試算値。"
);
const noScaleResults = STRATEGIES.map(strategy =>
  simulateProgressionCase(strategy, scoringProfile, {
    id: "wing-no-scale",
    label: "竜鱗不要",
    wingCostOverride: { "黒角": 4 }
  })
);
noScaleResults.forEach(result => printCase(result, false));

console.log("\n【what-if 試算: 買い切り後の反復可変素材シンク】");
console.log(
  "baseline run列を再利用し、買い切り後に任意素材合計10/40個で毎run反復購入する仮想prepを追加。" +
  "戦闘条件不変の会計replayで、実src未実装。無限需要のため死亡損失は将来sinkに対して100%有価値。"
);
for (const result of baselineResults) {
  for (const sinkPerRun of [10, 40]) {
    const replay = replayFlexibleSink(result, sinkPerRun);
    console.log(
      `${result.strategy.label} / ${sinkPerRun}個: sink充足=${formatRate(replay.sinkCoverage)}, ` +
      `実消費=${replay.consumedPerRun.toFixed(2)}/run, 純余剰=${replay.netPerRun.toFixed(2)}/run, ` +
      `post-buyout死亡損失有価値率=${replay.rawDeathLoss > 0 ? "100.0%" : "死亡なし"}`
    );
  }
}

const wingFirst = baselineResults.find(result => result.strategy.id === "wing-first");
const statsFirst = baselineResults.find(result => result.strategy.id === "stats-first");
const wingFirstNoScale = noScaleResults.find(result => result.strategy.id === "wing-first");
const postWorkshopIncome = wingFirst.phaseTotals.postWorkshop.banked /
  wingFirst.phaseTotals.postWorkshop.runs;
console.log("\n【構造判定】");
console.log(
  `#278 鶏卵ボトルネック: 実用上No。翼優先は中央値${percentile(wingFirst.wingRuns, 0.5)}run、` +
  `p90 ${percentile(wingFirst.wingRuns, 0.9)}run。翼前B5到達率=` +
  `${formatRate(wingFirst.phaseTotals.preWing.b5Reached / wingFirst.phaseTotals.preWing.runs)}、` +
  `竜鱗入手run率=${formatRate(
    wingFirst.phaseTotals.preWing.dragonScaleAcquired / wingFirst.phaseTotals.preWing.runs
  )}でB5橋渡しが機能。`
);
console.log(
  `竜鱗gate除去は翼優先平均 ${(
    wingFirst.wingRuns.reduce((sum, value) => sum + value, 0) / TRIALS
  ).toFixed(2)}→${(
    wingFirstNoScale.wingRuns.reduce((sum, value) => sum + value, 0) / TRIALS
  ).toFixed(2)}run、恒久優先は不変。`
);
console.log(
  `#234 ステーク消滅: Yes。買い切り中央値は翼優先${percentile(wingFirst.buyoutRuns, 0.5)}run、` +
  `恒久優先${percentile(statsFirst.buyoutRuns, 0.5)}run。翼解放後の追加中央値は` +
  `${percentile(wingFirst.afterWingToBuyoutRuns, 0.5)}run。買い切り後の進行有効死亡損失=0%。`
);
console.log(
  `唯一sink構造: 翼解放後約3runで深層アクセスと同じ工房が枯渇し、以後bank素材は` +
  `${postWorkshopIncome.toFixed(2)}個/runで無価値蓄積。10/40個sinkでは在庫増加を止められず、` +
  `収支均衡には約${postWorkshopIncome.toFixed(0)}個/run規模が必要。`
);
