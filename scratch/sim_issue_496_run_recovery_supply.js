// sim-scope: run — #496 ラン内回復供給・商人購入・宝箱what-if測定
/* global console, process */

import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

import { MATERIAL_TYPES } from "../src/data/materials.js";

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "balance-main",
  SIM_SEED: "496",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  SIM_SCENARIOS: "workshop-complete",
  DEPARTURE_CRAFT_IDS: "",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "never",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_DIAGNOSTICS: "off"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for this sequential measurement`);
  }
}

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getScenarioById,
  getResolvedSimulationEnv,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const TARGET_DEPTH = 20;
const INVENTORY_LIMIT = 20;
const CARRY_IN_HEAL_POTIONS = 3;
const FIXED_DEPARTURE_ITEMS = Object.freeze([
  "TOWN_PORTAL",
  "ANTIDOTE",
  "GUARD_POTION"
]);
const R95 = 1.959963984540054;
const MATERIAL_SOURCES = Object.freeze(["combat", "chest", "quest", "other"]);

function parseInteger(name, fallback, { min = 0, max = Infinity } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer ${min}..${max}: ${value}`);
  }
  return value;
}

function parseIntegerList(name, fallback, { min = 0, max = 20 } = {}) {
  const values = String(process.env[name] ?? fallback)
    .split(",")
    .map(value => Number(value.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (
    values.length === 0 ||
    values.some(value => !Number.isInteger(value) || value < min || value > max)
  ) {
    throw new Error(`${name} must be a comma-separated integer list ${min}..${max}`);
  }
  return values;
}

function parseChanceList(name, fallback) {
  const values = String(process.env[name] ?? fallback)
    .split(",")
    .map(value => Number(value.trim()))
    .filter((value, index, all) => all.indexOf(value) === index);
  if (
    values.length === 0 ||
    values.some(value => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error(`${name} must be a comma-separated chance list 0..1`);
  }
  return values;
}

const RUNS = parseInteger("SIM_RUNS", ENV_DEFAULTS.SIM_RUNS, { min: 1 });
const CALIBRATION_RUNS = parseInteger(
  "SIM_CALIBRATION_RUNS",
  ENV_DEFAULTS.SIM_CALIBRATION_RUNS,
  { min: 1 }
);
const SEED = Number(process.env.SIM_SEED) >>> 0;
const MERCHANT_PURCHASE_CAPS = Object.freeze(
  parseIntegerList("ISSUE496_MERCHANT_PURCHASE_CAPS", "0,1,2,4,8")
);
const MERCHANT_HOLD_CAPS = Object.freeze(
  parseIntegerList("ISSUE496_MERCHANT_HOLD_CAPS", "4,8,16,20")
);
const CHEST_EXTRA_CHANCES = Object.freeze(
  parseChanceList("ISSUE496_CHEST_EXTRA_CHANCES", "0,0.25")
);

if (
  SIM_CLASSES.length !== BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))
) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
}

const BASE_SCENARIO = {
  ...getScenarioById("workshop-complete"),
  identificationPolicy: "powder",
  fleePolicy: process.env.FLEE_POLICY,
  fleeHpThreshold: Number(process.env.FLEE_HP_THRESHOLD),
  healPotionThreshold: Number(process.env.HEAL_POTION_THRESHOLD),
  statusCurePolicy: "smart",
  statusCureHpThreshold: 0.35,
  statusCureMerchantPolicy: "missing",
  healPotionMerchantPolicy: "up-to-0",
  buyMerchantStrengthPotion: true,
  trapPolicy: "conservative",
  trapAvoidancePolicy: "ev",
  elitePolicy: "avoid",
  simDiagnosticLevel: "off",
  departureCraft: [
    ...FIXED_DEPARTURE_ITEMS,
    ...Array(CARRY_IN_HEAL_POTIONS).fill("HEAL_POTION")
  ]
};

function chanceId(chance) {
  return chance === 0 ? "source" : `extra-${Math.round(chance * 100)}pct`;
}

function createConditions() {
  return CHEST_EXTRA_CHANCES.flatMap(chestExtraChance =>
    MERCHANT_PURCHASE_CAPS.flatMap(merchantPurchaseCap =>
      MERCHANT_HOLD_CAPS.map(merchantHoldCap => ({
        id: `merchant-${merchantPurchaseCap}-hold-${merchantHoldCap}-chest-${chanceId(chestExtraChance)}`,
        label: `商人${merchantPurchaseCap}本・保有${merchantHoldCap}・宝箱${chanceId(chestExtraChance)}`,
        merchantPurchaseCap,
        merchantHoldCap,
        chestExtraChance
      }))
    )
  );
}

const CONDITIONS = Object.freeze(createConditions());

function createStats() {
  return { n: 0, sum: 0, sumSquares: 0 };
}

function addStats(stats, value) {
  if (!Number.isFinite(value)) return;
  stats.n++;
  stats.sum += value;
  stats.sumSquares += value * value;
}

function summarizeStats(stats) {
  if (stats.n === 0) {
    return { n: 0, mean: null, ci95: null, status: "未観測" };
  }
  const mean = stats.sum / stats.n;
  if (stats.n < 2) {
    return { n: stats.n, mean, ci95: null, status: "未確定" };
  }
  const variance = Math.max(
    0,
    (stats.sumSquares - (stats.sum * stats.sum) / stats.n) / (stats.n - 1)
  );
  const margin = R95 * Math.sqrt(variance / stats.n);
  return {
    n: stats.n,
    mean,
    ci95: [mean - margin, mean + margin],
    status: stats.n < 30 ? "未確定" : "監査"
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { successes, trials, rate: null, ci95: null, status: "未観測" };
  }
  const rate = successes / trials;
  const z2 = R95 * R95;
  const denominator = 1 + z2 / trials;
  const center = (rate + z2 / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt(
    (rate * (1 - rate) + z2 / (4 * trials)) / trials
  ) / denominator;
  return {
    successes,
    trials,
    rate,
    ci95: [Math.max(0, center - margin), Math.min(1, center + margin)],
    status: trials < 30 ? "未確定" : "監査"
  };
}

function createMaterialStats() {
  return Object.fromEntries(MATERIAL_TYPES.map(material => [material, createStats()]));
}

function createMaterialSourceStats() {
  return Object.fromEntries(
    MATERIAL_SOURCES.map(source => [source, createMaterialStats()])
  );
}

function addMaterialStats(target, values = {}) {
  MATERIAL_TYPES.forEach(material => addStats(target[material], values[material] || 0));
}

function summarizeMaterialStats(stats) {
  return Object.fromEntries(
    MATERIAL_TYPES.map(material => [material, summarizeStats(stats[material])])
  );
}

function mergeCounts(target, values = {}) {
  Object.entries(values).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + value;
  });
}

function createOutcomeCounts() {
  return { entrants: 0, breakthroughs: 0, deaths: 0, retreats: 0 };
}

function createAccumulator() {
  return {
    runs: 0,
    reachedFloor: createStats(),
    bankedMaterials: createStats(),
    materialAcquired: createStats(),
    materialConsumed: createStats(),
    timeCost: createStats(),
    materialEvPerTime: createStats(),
    bankRetentionRate: createStats(),
    materialSourceCounts: createMaterialSourceStats(),
    materialConsumedByMerchant: createMaterialStats(),
    carriedMaterialCounts: createMaterialStats(),
    bankedMaterialCounts: createMaterialStats(),
    outcomes: { 5: createOutcomeCounts(), 10: createOutcomeCounts() },
    retreats: 0,
    deaths: 0,
    healPotionsAcquiredBySource: {},
    healPotionsConsumedBySource: {},
    healPotionsAcquired: createStats(),
    healPotionsConsumed: createStats(),
    recoveryPotionsUsed: createStats(),
    recoveryPotionShortages: createStats(),
    finalHealPotions: createStats(),
    finalRecoveryPotions: createStats(),
    healPotionDepleted: 0,
    recoveryDepleted: 0,
    merchantAttempts: createStats(),
    merchantPurchased: createStats(),
    merchantHoldLimitHits: 0,
    merchantHoldLimitRuns: 0,
    inventoryFullFailureRuns: 0,
    merchantFailures: {},
    statusCureFailures: {},
    wingFailures: {},
    statusCuresPurchased: createStats(),
    wingsPurchased: createStats(),
    strengthAttempts: createStats(),
    strengthPurchased: createStats(),
    strengthFailures: {},
    chestExtraGenerated: createStats(),
    finalInventorySlots: createStats(),
    departureSlots: createStats()
  };
}

function classifyFloor(result, floor, output) {
  if (result.reachedFloor < floor) return;
  output.entrants++;
  if (result.deathFloor === floor) output.deaths++;
  else if (result.reachedFloor > floor) output.breakthroughs++;
  else output.retreats++;
}

function addRun(accumulator, result) {
  accumulator.runs++;
  addStats(accumulator.reachedFloor, result.reachedFloor);
  addStats(accumulator.bankedMaterials, result.bankedMaterials);
  addStats(accumulator.materialAcquired, result.materialAcquired);
  addStats(accumulator.materialConsumed, result.materialConsumed);
  addStats(accumulator.timeCost, result.timeCost);
  addStats(
    accumulator.materialEvPerTime,
    result.timeCost > 0 ? result.bankedMaterials / result.timeCost : 0
  );
  addStats(
    accumulator.bankRetentionRate,
    result.carriedMaterials > 0 ? result.bankedMaterials / result.carriedMaterials : 0
  );
  classifyFloor(result, 5, accumulator.outcomes[5]);
  classifyFloor(result, 10, accumulator.outcomes[10]);
  accumulator.retreats += Number(result.outcome === "retreat");
  accumulator.deaths += Number(result.outcome === "death");

  MATERIAL_SOURCES.forEach(source => {
    addMaterialStats(
      accumulator.materialSourceCounts[source],
      result.materialSourceCounts?.[source]
    );
  });
  addMaterialStats(accumulator.materialConsumedByMerchant, result.materialConsumedByMerchant);
  addMaterialStats(accumulator.carriedMaterialCounts, result.carriedMaterialCounts);
  addMaterialStats(accumulator.bankedMaterialCounts, result.bankedMaterialCounts);

  const healAcquired = Object.values(result.healPotionsAcquiredBySource || {})
    .reduce((sum, value) => sum + value, 0);
  const healConsumed = Object.values(result.healPotionsConsumedBySource || {})
    .reduce((sum, value) => sum + value, 0);
  addStats(accumulator.healPotionsAcquired, healAcquired);
  addStats(accumulator.healPotionsConsumed, healConsumed);
  addStats(accumulator.recoveryPotionsUsed, result.recoveryPotionsUsed || 0);
  addStats(accumulator.recoveryPotionShortages, result.recoveryPotionShortages || 0);
  addStats(accumulator.finalHealPotions, result.finalHealPotions);
  addStats(accumulator.finalRecoveryPotions, result.finalRecoveryPotions);
  accumulator.healPotionDepleted += Number(result.finalHealPotions === 0);
  accumulator.recoveryDepleted += Number(result.finalRecoveryPotions === 0);
  addStats(accumulator.merchantAttempts, result.healPotionMerchantAttempts || 0);
  addStats(accumulator.merchantPurchased, result.healPotionMerchantPurchased || 0);
  accumulator.merchantHoldLimitHits += result.healPotionMerchantHoldLimitHits || 0;
  accumulator.merchantHoldLimitRuns += Number(
    (result.healPotionMerchantHoldLimitHits || 0) > 0
  );
  mergeCounts(accumulator.merchantFailures, result.healPotionMerchantFailures);
  accumulator.inventoryFullFailureRuns += Number(
    (result.healPotionMerchantFailures?.inventory_full || 0) > 0
  );
  mergeCounts(accumulator.statusCureFailures, result.statusCureMerchantFailures);
  mergeCounts(accumulator.wingFailures, result.merchantWingFailures);
  addStats(
    accumulator.statusCuresPurchased,
    Object.values(result.statusCureItemsAcquired?.merchant || {})
      .reduce((sum, value) => sum + value, 0)
  );
  addStats(accumulator.wingsPurchased, result.merchantWingsPurchased || 0);
  addStats(accumulator.strengthAttempts, result.strPotionMerchantAttempts || 0);
  addStats(accumulator.strengthPurchased, result.strPotionsPurchased || 0);
  mergeCounts(accumulator.strengthFailures, result.strPotionMerchantFailures);
  addStats(
    accumulator.chestExtraGenerated,
    result.chestHealPotionExtraGenerated || 0
  );
  addStats(accumulator.finalInventorySlots, result.finalInventorySlots || 0);
  addStats(accumulator.departureSlots, result.departureCraft?.items?.length || 0);
  mergeCounts(accumulator.healPotionsAcquiredBySource, result.healPotionsAcquiredBySource);
  mergeCounts(accumulator.healPotionsConsumedBySource, result.healPotionsConsumedBySource);
}

function summarizeOutcomes(outcomes, runs) {
  const split = outcomes.breakthroughs + outcomes.deaths + outcomes.retreats;
  if (split !== outcomes.entrants) {
    throw new Error(`endpoint split does not sum to entrants: ${split}/${outcomes.entrants}`);
  }
  return {
    entrant: wilson(outcomes.entrants, runs),
    breakthrough: wilson(outcomes.breakthroughs, outcomes.entrants),
    death: wilson(outcomes.deaths, outcomes.entrants),
    retreat: wilson(outcomes.retreats, outcomes.entrants),
    splitSumsTo100: split === outcomes.entrants
  };
}

function summarizeSourceCounts(counts, runs) {
  return Object.fromEntries(
    Object.entries(counts).map(([source, materials]) => [
      source,
      Object.fromEntries(
        MATERIAL_TYPES.map(material => [material, summarizeStats(materials[material])])
      )
    ])
  );
}

function summarizeFailureCounts(counts, runs) {
  return Object.fromEntries(
    Object.entries(counts).map(([reason, count]) => [
      reason,
      { count, perRun: count / Math.max(1, runs) }
    ])
  );
}

function summarizeAccumulator(accumulator) {
  const runs = accumulator.runs;
  return {
    runs,
    averageReachedFloor: summarizeStats(accumulator.reachedFloor),
    survivalRate: wilson(accumulator.retreats, runs),
    overallDeathRate: wilson(accumulator.deaths, runs),
    averageBankedMaterials: summarizeStats(accumulator.bankedMaterials),
    materialAcquired: summarizeStats(accumulator.materialAcquired),
    materialConsumed: summarizeStats(accumulator.materialConsumed),
    timeCost: summarizeStats(accumulator.timeCost),
    materialEvPerTime: summarizeStats(accumulator.materialEvPerTime),
    bankRetentionRate: summarizeStats(accumulator.bankRetentionRate),
    outcomes: {
      B5: summarizeOutcomes(accumulator.outcomes[5], runs),
      B10: summarizeOutcomes(accumulator.outcomes[10], runs)
    },
    recovery: {
      healPotionsAcquired: summarizeStats(accumulator.healPotionsAcquired),
      healPotionsConsumed: summarizeStats(accumulator.healPotionsConsumed),
      recoveryPotionsUsed: summarizeStats(accumulator.recoveryPotionsUsed),
      recoveryPotionShortages: summarizeStats(accumulator.recoveryPotionShortages),
      healPotionDepletionRate: wilson(accumulator.healPotionDepleted, runs),
      recoveryDepletionRate: wilson(accumulator.recoveryDepleted, runs),
      acquiredBySource: Object.fromEntries(
        Object.entries(accumulator.healPotionsAcquiredBySource).map(([source, count]) => [
          source,
          count / Math.max(1, runs)
        ])
      ),
      consumedBySource: Object.fromEntries(
        Object.entries(accumulator.healPotionsConsumedBySource).map(([source, count]) => [
          source,
          count / Math.max(1, runs)
        ])
      ),
      finalHealPotions: summarizeStats(accumulator.finalHealPotions),
      finalRecoveryPotions: summarizeStats(accumulator.finalRecoveryPotions)
    },
    materials: {
      acquiredBySource: summarizeSourceCounts(accumulator.materialSourceCounts, runs),
      consumedByMerchant: summarizeMaterialStats(accumulator.materialConsumedByMerchant),
      carriedBalanceByType: summarizeMaterialStats(accumulator.carriedMaterialCounts),
      bankedBalanceByType: summarizeMaterialStats(accumulator.bankedMaterialCounts)
    },
    merchant: {
      healPotionAttempts: summarizeStats(accumulator.merchantAttempts),
      healPotionsPurchased: summarizeStats(accumulator.merchantPurchased),
      holdLimitHits: accumulator.merchantHoldLimitHits,
      holdLimitRunRate: wilson(accumulator.merchantHoldLimitRuns, runs),
      failureCounts: summarizeFailureCounts(accumulator.merchantFailures, runs),
      inventoryFullFailureRate: wilson(
        accumulator.inventoryFullFailureRuns,
        runs
      ),
      otherCrafts: {
        statusCuresPurchased: summarizeStats(accumulator.statusCuresPurchased),
        statusCureFailureCounts: summarizeFailureCounts(accumulator.statusCureFailures, runs),
        wingsPurchased: summarizeStats(accumulator.wingsPurchased),
        wingFailureCounts: summarizeFailureCounts(accumulator.wingFailures, runs)
      },
      strengthPotionAttempts: summarizeStats(accumulator.strengthAttempts),
      strengthPotionsPurchased: summarizeStats(accumulator.strengthPurchased),
      strengthFailureCounts: summarizeFailureCounts(accumulator.strengthFailures, runs)
    },
    inventory: {
      departureSlots: summarizeStats(accumulator.departureSlots),
      finalSlots: summarizeStats(accumulator.finalInventorySlots),
      limit: INVENTORY_LIMIT
    },
    chest: {
      extraHealPotionsGenerated: summarizeStats(accumulator.chestExtraGenerated)
    }
  };
}

function scenarioFor(condition) {
  return {
    ...BASE_SCENARIO,
    healPotionMerchantPolicy: `up-to-${condition.merchantPurchaseCap}`,
    healPotionMerchantHoldLimit: condition.merchantHoldCap,
    chestHealPotionExtraChance: condition.chestExtraChance
  };
}

function updateRawHash(rawHash, condition, className, runIndex, result) {
  rawHash.update(`${JSON.stringify({
    condition: condition.id,
    className,
    runIndex,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    outcome: result.outcome,
    bankedMaterials: result.bankedMaterials,
    carriedMaterialCounts: result.carriedMaterialCounts,
    materialSourceCounts: result.materialSourceCounts,
    materialConsumedByMerchant: result.materialConsumedByMerchant,
    timeCost: result.timeCost,
    healPotionsAcquiredBySource: result.healPotionsAcquiredBySource,
    healPotionsConsumedBySource: result.healPotionsConsumedBySource,
    healPotionMerchantPurchased: result.healPotionMerchantPurchased,
    healPotionMerchantFailures: result.healPotionMerchantFailures,
    statusCureMerchantFailures: result.statusCureMerchantFailures,
    merchantWingFailures: result.merchantWingFailures,
    strPotionsPurchased: result.strPotionsPurchased,
    strPotionMerchantFailures: result.strPotionMerchantFailures,
    chestHealPotionExtraGenerated: result.chestHealPotionExtraGenerated,
    finalHealPotions: result.finalHealPotions,
    finalRecoveryPotions: result.finalRecoveryPotions
  })}\n`);
}

function runCondition(condition, scoringProfile, rawHash, conditionIndex) {
  const scenario = scenarioFor(condition);
  const accumulator = createAccumulator();
  const byClass = Object.fromEntries(
    BASIC_CLASSES.map(className => [className, createAccumulator()])
  );
  resetSimulationRandom(SEED + conditionIndex);
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const className = BASIC_CLASSES[runIndex % BASIC_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: `issue-496-${condition.id}`,
      scoringProfile,
      scenario,
      workshop: scenario.workshop
    });
    addRun(accumulator, result);
    addRun(byClass[className], result);
    updateRawHash(rawHash, condition, className, runIndex, result);
  }
  return {
    ...condition,
    summary: summarizeAccumulator(accumulator),
    byClass: Object.fromEntries(
      Object.entries(byClass).map(([className, classAccumulator]) => [
        className,
        summarizeAccumulator(classAccumulator)
      ])
    )
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolvedEnvironment() {
  return {
    SIM_PRESET: process.env.SIM_PRESET,
    ...Object.fromEntries(
      Object.entries(getResolvedSimulationEnv()).map(([key, value]) => [key, value])
    ),
    ISSUE496_MERCHANT_PURCHASE_CAPS: MERCHANT_PURCHASE_CAPS.join(","),
    ISSUE496_MERCHANT_HOLD_CAPS: MERCHANT_HOLD_CAPS.join(","),
    ISSUE496_CHEST_EXTRA_CHANCES: CHEST_EXTRA_CHANCES.join(",")
  };
}

function buildSummary(results, calibration, runtime, rawSha256) {
  const measurement = {
    seed: SEED,
    targetDepth: TARGET_DEPTH,
    runsPerCondition: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    classes: [...BASIC_CLASSES],
    carryInHealPotions: CARRY_IN_HEAL_POTIONS,
    fixedDepartureItems: [...FIXED_DEPARTURE_ITEMS],
    inventoryLimit: INVENTORY_LIMIT,
    conditions: CONDITIONS.map(({ id, merchantPurchaseCap, merchantHoldCap, chestExtraChance }) => ({
      id,
      merchantPurchaseCap,
      merchantHoldCap,
      chestExtraChance
    }))
  };
  const environment = resolvedEnvironment();
  const environmentSha256 = sha256(JSON.stringify({ environment, measurement }));
  const base = {
    issue: 496,
    conclusion: "ラン内回復供給what-if。ゲーム側のmerchant価格・宝箱抽選・所持枠canonは変更していない。",
    measurement,
    runtime,
    calibration,
    environment,
    environmentSha256,
    purchaseModel: {
      healPotionPolicy: "up-to-N = 1ラン内の総購入数上限。傷薬購入後、剛力の薬を1個試行。",
      purchaseApi: "src/systems/milestone_merchant.js: purchaseMilestoneStock",
      merchantOrder: ["return_wing", "status_cures", "heal_potion", "str_potion"],
      holdLimit: "傷薬個数上限。超過時は購入せず、実APIのinventory_fullも別記録。",
      inventoryLimit: INVENTORY_LIMIT,
      deathBankRate: 0.3,
      retreatBankRate: 1
    },
    conditions: results,
    chestWhatIf: results
      .filter(result => result.merchantPurchaseCap === 4 && result.merchantHoldCap === 16)
      .map(result => ({
        id: result.id,
        merchantPurchaseCap: result.merchantPurchaseCap,
        merchantHoldCap: result.merchantHoldCap,
        chestExtraChance: result.chestExtraChance,
        chest: result.summary.chest,
        recovery: result.summary.recovery,
        outcomes: result.summary.outcomes,
        materialEvPerTime: result.summary.materialEvPerTime
      })),
    limitations: [
      "N=30未満の率・平均は未確定。率はWilson 95% CI、平均は正規近似95% CI。",
      "出発kitは#481で観測されたP50=3本を固定。素材bankからの出発購入可否は本Issueの主軸ではない。",
      "商人の傷薬購入は傷薬→剛力の薬の順。優先順位を逆にした別方針は未測定。",
      "宝箱what-ifは既存の宝箱抽選に追加スロットを加えるsim専用反実仮想。ゲーム側抽選率は変更していない。",
      "上薬は既存simの能動使用モデルに含む。商人購入は傷薬・剛力の薬のみ追加。",
      "素材EV/時間はbankedMaterials / timeCost。素材型別収支は終了時run残高・商人消費・bank残高を併記。",
      "各条件は独立run。条件間CIはpaired差として解釈しない。"
    ],
    canon: {
      changed: false,
      reason: "測定専用のsim policy/what-ifのみ。採用値・ゲーム本体価格・宝箱抽選は未変更。"
    },
    output: {
      rawRows: CONDITIONS.length * RUNS,
      rawSha256,
      summarySha256Definition: "summarySha256 = SHA-256(JSON.stringify(summary without output.summarySha256, null, 2) + newline)"
    }
  };
  return {
    ...base,
    output: {
      ...base.output,
      summarySha256: sha256(`${JSON.stringify(base, null, 2)}\n`)
    }
  };
}

export function runIssue496Measurement() {
  const calibrationStarted = process.hrtime.bigint();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfile = calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    BASE_SCENARIO,
    "powder",
    BASE_SCENARIO.workshop
  );
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibration = {
    runs: CALIBRATION_RUNS,
    wallClockSeconds: Number(process.hrtime.bigint() - calibrationStarted) / 1e9,
    cpuUserSeconds: calibrationCpu.user / 1e6,
    cpuSystemSeconds: calibrationCpu.system / 1e6,
    cpuTotalSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    model: "B1→B20、出発kit 3本、商人購入なしの共通core scoring calibration"
  };

  const rawHash = createHash("sha256");
  const measurementStarted = process.hrtime.bigint();
  const measurementCpuStarted = process.cpuUsage();
  const results = CONDITIONS.map((condition, conditionIndex) =>
    runCondition(condition, scoringProfile, rawHash, conditionIndex)
  );
  const measurementCpu = process.cpuUsage(measurementCpuStarted);
  const runtime = {
    wallClockSeconds: Number(process.hrtime.bigint() - measurementStarted) / 1e9,
    cpuUserSeconds: measurementCpu.user / 1e6,
    cpuSystemSeconds: measurementCpu.system / 1e6,
    cpuTotalSeconds: (measurementCpu.user + measurementCpu.system) / 1e6,
    availableParallelism: availableParallelism(),
    resolvedParallelism: 1,
    parallelismReason: "条件ごとの比較を直列実行。SIM_PARALLEL未指定。"
  };
  return buildSummary(results, calibration, runtime, rawHash.digest("hex"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(runIssue496Measurement(), null, 2));
}
