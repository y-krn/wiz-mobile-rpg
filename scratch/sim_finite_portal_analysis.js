/* global console, process */

const {
  calibrateCoreScoringProfile,
  resetSimulationRandom,
  SCENARIOS,
  SIM_CLASSES,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const RUNS = Math.max(1, Number(process.env.FINITE_PORTAL_RUNS || 1000));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.FINITE_PORTAL_CALIBRATION_RUNS || 100)
);
const BASE_SEED = Number(process.env.FINITE_PORTAL_SEED || 234277) >>> 0;
const TARGET_DEPTH = Math.max(6, Number(process.env.FINITE_PORTAL_TARGET || 20));
const BASE_SCENARIO = SCENARIOS.find(scenario => scenario.id === "workshop-locked");

const CURRENT_SCENARIO = {
  ...BASE_SCENARIO,
  id: "finite-analysis-current",
  label: "現状（工房永久供給+宝箱+商人）",
  workshopReturnItem: null,
  startingTownPortals: 1,
  startingPortalSource: "workshop-supply",
  ignoreWorkshopReturnItems: true,
  allowChestTownPortal: true,
  buyMerchantTownPortal: true,
  useTownPortal: true
};

const NO_WING_SCENARIO = {
  ...BASE_SCENARIO,
  id: "finite-analysis-no-wing",
  label: "翼全供給なし",
  workshopReturnItem: null,
  startingTownPortals: 0,
  ignoreWorkshopReturnItems: true,
  allowChestTownPortal: true,
  discardChestTownPortal: true,
  buyMerchantTownPortal: false,
  useTownPortal: true
};

const MERCHANT_ONLY_FORCED_PUSH_SCENARIO = {
  ...BASE_SCENARIO,
  id: "finite-analysis-merchant-only-forced-push",
  label: "商人のみ・翼なし強制push",
  workshopReturnItem: null,
  startingTownPortals: 0,
  ignoreWorkshopReturnItems: true,
  allowChestTownPortal: false,
  buyMerchantTownPortal: true,
  useTownPortal: true
};

function increment(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatHistogram(counts, total) {
  return Object.entries(counts)
    .sort(([left], [right]) => {
      const leftNumber = Number(left.replace(/\D/g, ""));
      const rightNumber = Number(right.replace(/\D/g, ""));
      return leftNumber - rightNumber || left.localeCompare(right);
    })
    .map(([key, count]) => `${key}=${count} (${formatRate(count / total)})`)
    .join(", ");
}

function getHpBand(hpRate) {
  if (hpRate <= 0.15) return "HP<=15%";
  if (hpRate <= 0.25) return "HP15-25%";
  return "HP25-35%";
}

function summarizeCounterfactual(events, keySelector) {
  const groups = {};
  events.forEach(event => {
    const key = keySelector(event);
    const group = groups[key] || { uses: 0, counterfactualDeaths: 0 };
    group.uses++;
    group.counterfactualDeaths += Number(event.counterfactualDied);
    groups[key] = group;
  });
  return Object.entries(groups)
    .sort(([left], [right]) => left.localeCompare(right, "ja", { numeric: true }))
    .map(([key, group]) =>
      `${key}: 使用=${group.uses}, 翼なし死亡=${formatRate(
        group.counterfactualDeaths / group.uses
      )}`
    )
    .join("\n");
}

const scoringProfile = calibrateCoreScoringProfile(CALIBRATION_RUNS);
const pairs = [];

for (let runIndex = 0; runIndex < RUNS; runIndex++) {
  const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
  const pairSeed = BASE_SEED + runIndex * 104729;
  const common = {
    className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex,
    seriesId: "finite-portal-decision-pair",
    scoringProfile
  };
  resetSimulationRandom(pairSeed);
  const current = simulateRun({ ...common, scenario: CURRENT_SCENARIO });
  resetSimulationRandom(pairSeed);
  const noWing = simulateRun({ ...common, scenario: NO_WING_SCENARIO });
  resetSimulationRandom(pairSeed);
  const merchantOnlyForcedPush = simulateRun({
    ...common,
    scenario: MERCHANT_ONLY_FORCED_PUSH_SCENARIO
  });
  pairs.push({ current, noWing, merchantOnlyForcedPush });
}

const portalEvents = [];
const portalUsesByFloor = {};
const portalUsesBySituation = {};
const portalUsesBySource = {};
const currentEndFloors = {};
const noWingEndFloors = {};
let currentSurvived = 0;
let noWingSurvived = 0;
let currentMilestoneDecisions = 0;
let currentInsuredDecisions = 0;
let noWingMilestoneDecisions = 0;
let noWingNextLegDeaths = 0;
let runsWithMaterialChoice = 0;
let runsReachingMilestoneWithoutWing = 0;
let merchantOnlySurvived = 0;
let merchantOnlyReached = 0;
let merchantOnlyAttempts = 0;
let merchantOnlyPurchases = 0;
const merchantOnlyPurchaseFloors = {};
const merchantOnlyFailures = {};

pairs.forEach(({ current, noWing, merchantOnlyForcedPush }) => {
  currentSurvived += Number(current.survived);
  noWingSurvived += Number(noWing.survived);
  increment(currentEndFloors, `${current.outcome === "death" ? "死亡" : "撤退"}B${current.reachedFloor}`);
  increment(noWingEndFloors, `${noWing.outcome === "death" ? "死亡" : "撤退"}B${noWing.reachedFloor}`);

  current.portalUseEvents.forEach(event => {
    const paired = {
      ...event,
      counterfactualDied: noWing.died,
      counterfactualReachedFloor: noWing.reachedFloor
    };
    portalEvents.push(paired);
    increment(portalUsesByFloor, `B${event.floor}`);
    increment(portalUsesBySituation, event.situation);
    increment(portalUsesBySource, event.source);
  });

  currentMilestoneDecisions += current.milestoneDecisions.length;
  currentInsuredDecisions += current.milestoneDecisions
    .filter(decision => decision.hasTownPortal)
    .length;
  noWingMilestoneDecisions += noWing.milestoneDecisions.length;
  if (noWing.milestoneDecisions.length > 0) runsReachingMilestoneWithoutWing++;

  let runHadMaterialChoice = false;
  noWing.milestoneDecisions.forEach(decision => {
    const diedBeforeNextMilestone =
      noWing.died &&
      noWing.reachedFloor >= decision.floor &&
      noWing.reachedFloor < decision.floor + 5;
    noWingNextLegDeaths += Number(diedBeforeNextMilestone);
    runHadMaterialChoice ||= diedBeforeNextMilestone;
  });
  runsWithMaterialChoice += Number(runHadMaterialChoice);

  merchantOnlySurvived += Number(merchantOnlyForcedPush.survived);
  merchantOnlyReached += merchantOnlyForcedPush.reachedFloor;
  merchantOnlyAttempts += merchantOnlyForcedPush.merchantWingAttempts;
  merchantOnlyPurchases += merchantOnlyForcedPush.merchantWingsPurchased;
  merchantOnlyForcedPush.merchantPurchaseFloors.forEach(floor => {
    increment(merchantOnlyPurchaseFloors, `B${floor}`);
  });
  Object.entries(merchantOnlyForcedPush.merchantWingFailures).forEach(([reason, count]) => {
    merchantOnlyFailures[reason] = (merchantOnlyFailures[reason] || 0) + count;
  });
});

if (portalEvents.length === 0) {
  throw new Error("portal use event was not observed; increase FINITE_PORTAL_RUNS");
}
if (noWingMilestoneDecisions === 0) {
  throw new Error("milestone decision was not observed");
}

const counterfactualDeaths = portalEvents.filter(event => event.counterfactualDied).length;
const currentBanked = pairs.reduce((sum, pair) => sum + pair.current.bankedMaterials, 0);
const currentCarried = pairs.reduce((sum, pair) => sum + pair.current.carriedMaterials, 0);
const noWingBanked = pairs.reduce((sum, pair) => sum + pair.noWing.bankedMaterials, 0);
const noWingCarried = pairs.reduce((sum, pair) => sum + pair.noWing.carriedMaterials, 0);

console.log("Issue #234 A: 帰還の翼による判断の買い取り定量化");
console.log(
  `試行: paired N=${RUNS}, seed基点=${BASE_SEED}, target=B${TARGET_DEPTH}, ` +
  `core calibration N=${CALIBRATION_RUNS}`
);
console.log(
  "実装経路: generateRunFloor / applyCombatRewards / generateRandomEquipment / " +
  "generateChestMaterials を既存sim経由で実srcから使用。"
);
console.log(
  "反実仮想: 各runを同一seedで現状供給と翼全供給なしに分岐。翼なし側は宝箱の翼を破棄し、" +
  "それ以外の乱数消費数を維持する。商人購入は翼なし側で無効。試算値。"
);
console.log(
  `現状: 生還率=${formatRate(currentSurvived / RUNS)}, ` +
  `bank保持率=${formatRate(currentBanked / currentCarried)}, ` +
  `翼使用run率=${formatRate(portalEvents.length / RUNS)}`
);
console.log(
  `翼全供給なし: 生還率=${formatRate(noWingSurvived / RUNS)}, ` +
  `bank保持率=${formatRate(noWingBanked / noWingCarried)}`
);
console.log(
  `翼がなければ死んでいたrun: ${counterfactualDeaths}/${portalEvents.length} ` +
  `(${formatRate(counterfactualDeaths / portalEvents.length)})`
);

console.log("\n【翼使用率: floor別】");
console.log(formatHistogram(portalUsesByFloor, RUNS));
console.log("\n【翼使用率: 状況別】");
console.log(formatHistogram(portalUsesBySituation, RUNS));
console.log("\n【翼使用率: 入手経路別】");
console.log(formatHistogram(portalUsesBySource, RUNS));

console.log("\n【翼使用時点からの翼なし死亡率: floor別】");
console.log(summarizeCounterfactual(portalEvents, event => `B${event.floor}`));
console.log("\n【翼使用時点からの翼なし死亡率: 状況別】");
console.log(summarizeCounterfactual(portalEvents, event => event.situation));
console.log("\n【翼使用時点からの翼なし死亡率: HP帯別】");
console.log(summarizeCounterfactual(portalEvents, event => getHpBand(event.hpRate)));

console.log("\n【終了floor分布: 現状】");
console.log(formatHistogram(currentEndFloors, RUNS));
console.log("\n【終了floor分布: 翼全供給なし】");
console.log(formatHistogram(noWingEndFloors, RUNS));

console.log("\n【押す/引くの実質選択 代理指標】");
console.log(
  `現状 milestone判断の翼保有率（pushが次のmilestoneまで保険化）: ` +
  `${currentInsuredDecisions}/${currentMilestoneDecisions} ` +
  `(${formatRate(currentInsuredDecisions / currentMilestoneDecisions)})`
);
console.log(
  `翼なしでpushしたmilestone判断の次区間死亡率: ` +
  `${noWingNextLegDeaths}/${noWingMilestoneDecisions} ` +
  `(${formatRate(noWingNextLegDeaths / noWingMilestoneDecisions)})`
);
console.log(
  `翼なしでmilestoneへ到達したrunのうち、少なくとも1回のpush/retreatが生死を分けたrun: ` +
  `${runsWithMaterialChoice}/${runsReachingMilestoneWithoutWing} ` +
  `(${formatRate(runsWithMaterialChoice / runsReachingMilestoneWithoutWing)})`
);

console.log("\n【商人経路 鶏卵診断: 翼なし強制push】");
console.log(
  `平均到達=B${(merchantOnlyReached / RUNS).toFixed(2)}, ` +
  `生還率=${formatRate(merchantOnlySurvived / RUNS)}, ` +
  `商人成立=${merchantOnlyPurchases}/${merchantOnlyAttempts} ` +
  `(${formatRate(merchantOnlyPurchases / merchantOnlyAttempts)}), ` +
  `insufficient=${merchantOnlyFailures.insufficient_materials || 0}, ` +
  `inventory_full=${merchantOnlyFailures.inventory_full || 0}`
);
console.log(
  `購入floor: ${merchantOnlyPurchases > 0
    ? formatHistogram(merchantOnlyPurchaseFloors, merchantOnlyPurchases)
    : "成立なし"}`
);
