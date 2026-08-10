// sim-scope: run — #481 出発kitを前run bankから購入し、素材型別供給を測る
/* global console, process */

import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

import { MATERIAL_TYPES, createEmptyMaterialBalance } from "../src/data/materials.js";
import { purchaseDepartureCraft } from "../src/systems/workshop.js";

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "481",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  SIM_SCENARIOS: "workshop-complete",
  DEPARTURE_CRAFT_IDS: "",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  FLEE_POLICY: "threshold",
  FLEE_HP_THRESHOLD: "0.35",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_DIAGNOSTICS: "off"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for Issue #481 stateful chains`);
  }
}

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const TARGET_DEPTH = 20;
const INVENTORY_LIMIT = 20;
const FIXED_RECIPE_IDS = Object.freeze([
  "TOWN_PORTAL",
  "ANTIDOTE",
  "GUARD_POTION"
]);
const CANONICAL_HEAL_POTIONS = 4;
const MAX_SAFE_HEAL_POTIONS = INVENTORY_LIMIT - FIXED_RECIPE_IDS.length - 1;
const MATERIAL_SOURCE_IDS = Object.freeze(["combat", "chest", "quest", "other"]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const R95 = 1.959963984540054;

function parseInteger(name, fallback, { min = 0 } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}: ${value}`);
  }
  return value;
}

const SEED = Number(process.env.SIM_SEED) >>> 0;
const CALIBRATION_RUNS = parseInteger(
  "SIM_CALIBRATION_RUNS",
  ENV_DEFAULTS.SIM_CALIBRATION_RUNS,
  { min: 1 }
);
const CHAIN_COUNT = parseInteger("SIM_CHAINS", 50, { min: 1 });
const WARMUP_RUNS = parseInteger("SIM_WARMUP_RUNS", 20);
const MEASURE_RUNS = parseInteger("SIM_MEASURE_RUNS", 10, { min: 1 });
const CHAIN_RUNS = WARMUP_RUNS + MEASURE_RUNS;

if (SIM_CLASSES.length !== BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
}
if (MAX_SAFE_HEAL_POTIONS < 1) {
  throw new Error("inventory limit leaves no safe departure heal potion slot");
}

const BASE_SCENARIO = {
  ...getScenarioById("workshop-complete"),
  identificationPolicy: "powder",
  fleeHpThreshold: 0.35,
  statusCurePolicy: "smart",
  statusCureHpThreshold: 0.35,
  statusCureMerchantPolicy: "missing",
  healPotionMerchantPolicy: "missing",
  trapPolicy: "conservative",
  trapAvoidancePolicy: "ev",
  elitePolicy: "avoid",
  simDiagnosticLevel: "off",
  departureCraft: []
};

function materialBalance(balance = {}) {
  return Object.fromEntries(
    MATERIAL_TYPES.map(material => [
      material,
      Math.max(0, Math.floor(Number(balance[material]) || 0))
    ])
  );
}

function addMaterialBalance(balance, additions) {
  const next = materialBalance(balance);
  MATERIAL_TYPES.forEach(material => {
    next[material] += Math.max(0, Math.floor(Number(additions?.[material]) || 0));
  });
  return next;
}

function totalMaterials(balance) {
  return MATERIAL_TYPES.reduce((sum, material) => sum + (balance?.[material] || 0), 0);
}

function cloneSourceCounts(counts = {}) {
  return Object.fromEntries(
    MATERIAL_SOURCE_IDS.map(source => [source, materialBalance(counts[source])])
  );
}

function sameMaterialBalance(left, right) {
  return MATERIAL_TYPES.every(material =>
    (left?.[material] || 0) === (right?.[material] || 0)
  );
}

function purchaseFor(bank, fixedRecipeIds, healPotions) {
  return purchaseDepartureCraft(
    bank,
    [...fixedRecipeIds, ...Array(healPotions).fill("HEAL_POTION")]
  );
}

function selectAvailableFixedItems(bank) {
  const recipeIds = [];
  let purchase = purchaseDepartureCraft(bank, []);
  for (const recipeId of FIXED_RECIPE_IDS) {
    const candidate = purchaseDepartureCraft(bank, [...recipeIds, recipeId]);
    if (!candidate.ok) continue;
    recipeIds.push(recipeId);
    purchase = candidate;
  }
  return {
    recipeIds,
    purchase,
  };
}

function evaluateAffordableKits(bank) {
  const fixed = purchaseFor(bank, FIXED_RECIPE_IDS, 0);
  const canonical = purchaseFor(bank, FIXED_RECIPE_IDS, CANONICAL_HEAL_POTIONS);
  const availableFixed = selectAvailableFixedItems(bank);
  const canonicalWithAvailableFixed = purchaseFor(
    bank,
    availableFixed.recipeIds,
    CANONICAL_HEAL_POTIONS
  );
  let maximum = 0;
  let maximumPurchase = availableFixed.purchase;
  for (let healPotions = 1; healPotions <= MAX_SAFE_HEAL_POTIONS; healPotions++) {
    const purchase = purchaseFor(bank, availableFixed.recipeIds, healPotions);
    if (!purchase.ok) break;
    maximum = healPotions;
    maximumPurchase = purchase;
  }
  return {
    fixed,
    canonical,
    availableFixed,
    canonicalWithAvailableFixed,
    maximum,
    maximumPurchase
  };
}

function selectMaximumKit(evaluation) {
  return {
    recipeIds: [
      ...evaluation.availableFixed.recipeIds,
      ...Array(evaluation.maximum).fill("HEAL_POTION")
    ],
    healPotions: evaluation.maximum,
    purchase: evaluation.maximumPurchase,
    reason: "maximum-affordable"
  };
}

function selectCanonicalKit(evaluation) {
  if (!evaluation.canonicalWithAvailableFixed.ok) {
    return {
      recipeIds: [...evaluation.availableFixed.recipeIds],
      healPotions: 0,
      purchase: evaluation.availableFixed.purchase,
      reason: "canonical-four-unaffordable"
    };
  }
  return {
    recipeIds: [
      ...evaluation.availableFixed.recipeIds,
      ...Array(CANONICAL_HEAL_POTIONS).fill("HEAL_POTION")
    ],
    healPotions: CANONICAL_HEAL_POTIONS,
    purchase: evaluation.canonicalWithAvailableFixed,
    reason: "canonical-four"
  };
}

function wilson(successes, trials) {
  if (trials <= 0) return { successes, trials, rate: null, ci95: null, status: "未観測" };
  const rate = successes / trials;
  const denominator = 1 + (R95 * R95) / trials;
  const center = (rate + (R95 * R95) / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt(
    (rate * (1 - rate) + (R95 * R95) / (4 * trials)) / trials
  ) / denominator;
  return {
    successes,
    trials,
    rate,
    ci95: [Math.max(0, center - margin), Math.min(1, center + margin)],
    status: trials < 30 ? "未確定" : "監査"
  };
}

function meanInterval(values) {
  const finite = values.filter(Number.isFinite);
  const n = finite.length;
  if (n === 0) return { n: 0, mean: null, ci95: null, status: "未観測" };
  const mean = finite.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { n, mean, ci95: null, status: "未確定" };
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const margin = R95 * Math.sqrt(variance / n);
  return {
    n,
    mean,
    ci95: [mean - margin, mean + margin],
    status: n < 30 ? "未確定" : "監査"
  };
}

function quantile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function quantiles(values) {
  const finite = values.filter(Number.isFinite);
  return {
    n: finite.length,
    p25: quantile(finite, 0.25),
    p50: quantile(finite, 0.5),
    p75: quantile(finite, 0.75),
    status: finite.length < 30 ? "未確定" : "監査"
  };
}

function countRate(rows, predicate) {
  return wilson(rows.filter(predicate).length, rows.length);
}

function summarizeMaterialSources(rows) {
  return Object.fromEntries(
    MATERIAL_SOURCE_IDS.map(source => [
      source,
      Object.fromEntries(MATERIAL_TYPES.map(material => [
        material,
        meanInterval(rows.map(row => row.materialSourceCounts[source][material]))
      ]))
    ])
  );
}

function summarizeBank(rows) {
  const getHealPairReserve = row => Math.min(
    row.bankBeforePurchase["獣の牙"],
    row.bankBeforePurchase["硬い皮"]
  );
  const totals = rows.map(row => totalMaterials(row.bankBeforePurchase));
  const midpoint = Math.floor(rows.length / 2);
  const early = totals.slice(0, midpoint);
  const late = totals.slice(midpoint);
  const firstMeasured = rows.filter(row => row.sample === 0)
    .map(row => totalMaterials(row.bankBeforePurchase));
  const lastMeasured = rows.filter(row => row.sample === MEASURE_RUNS - 1)
    .map(row => totalMaterials(row.bankBeforePurchase));
  const firstHealPair = rows.filter(row => row.sample === 0).map(getHealPairReserve);
  const lastHealPair = rows.filter(row => row.sample === MEASURE_RUNS - 1).map(getHealPairReserve);
  const rowsByChain = new Map();
  rows.forEach(row => {
    const chainRows = rowsByChain.get(row.chain) || [];
    chainRows.push(row);
    rowsByChain.set(row.chain, chainRows);
  });
  const perChainDeltas = [...rowsByChain.values()].map(chainRows => {
    const ordered = [...chainRows].sort((left, right) => left.sample - right.sample);
    return totalMaterials(ordered.at(-1).bankBeforePurchase) -
      totalMaterials(ordered[0].bankBeforePurchase);
  });
  const perChainHealPairDeltas = [...rowsByChain.values()].map(chainRows => {
    const ordered = [...chainRows].sort((left, right) => left.sample - right.sample);
    return getHealPairReserve(ordered.at(-1)) - getHealPairReserve(ordered[0]);
  });
  const byMaterial = Object.fromEntries(MATERIAL_TYPES.map(material => [
    material,
    meanInterval(rows.map(row => row.bankBeforePurchase[material]))
  ]));
  const healPairReserve = rows.map(getHealPairReserve);
  const firstHalf = meanInterval(early);
  const secondHalf = meanInterval(late);
  return {
    bankBeforePurchase: meanInterval(totals),
    bankBeforePurchaseByMaterial: byMaterial,
    healPairReserve: meanInterval(healPairReserve),
    healPairFirstMeasuredSample: meanInterval(firstHealPair),
    healPairLastMeasuredSample: meanInterval(lastHealPair),
    healPairPerChainLastMinusFirst: meanInterval(perChainHealPairDeltas),
    firstMeasuredSample: meanInterval(firstMeasured),
    lastMeasuredSample: meanInterval(lastMeasured),
    perChainLastMinusFirst: meanInterval(perChainDeltas),
    firstHalf: firstHalf,
    secondHalf: secondHalf,
    secondMinusFirst: firstHalf.mean === null || secondHalf.mean === null
      ? null
      : secondHalf.mean - firstHalf.mean
  };
}

function summarizeCondition(rows, id) {
  const affordableMaximum = rows
    .map(row => row.maximumAffordableHealPotions)
    .filter(Number.isFinite);
  const chosenHealCounts = Object.fromEntries(
    Array.from({ length: MAX_SAFE_HEAL_POTIONS + 1 }, (_, healPotions) => [
      healPotions,
      countRate(rows, row => row.chosenHealPotions === healPotions)
    ])
  );
  const materialBanked = Object.fromEntries(MATERIAL_TYPES.map(material => [
    material,
    meanInterval(rows.map(row => row.bankedMaterialCounts[material]))
  ]));
  const healPotionsAcquired = Object.fromEntries(
    Object.keys(rows[0]?.healPotionsAcquiredBySource || {}).map(source => [
      source,
      meanInterval(rows.map(row => row.healPotionsAcquiredBySource[source] || 0))
    ])
  );
  const result = {
    id,
    sample: rows.length,
    purchase: {
      fixedKitAffordable: countRate(rows, row => row.fixedKitAffordable),
      canonicalFourAffordable: countRate(rows, row => row.canonicalFourAffordable),
      maximumAffordableHealPotions: quantiles(affordableMaximum),
      chosenHealPotions: quantiles(rows.map(row => row.chosenHealPotions)),
      chosenHealPotionDistribution: chosenHealCounts,
      selectedKitRate: countRate(rows, row => row.departureRecipeIds.length > 0),
      fixedItemsPurchased: Object.fromEntries(
        Array.from({ length: FIXED_RECIPE_IDS.length + 1 }, (_, count) => [
          count,
          countRate(rows, row => row.fixedItemsPurchased === count)
        ])
      ),
      selectionReasons: Object.fromEntries(
        [...new Set(rows.map(row => row.selectionReason))].map(reason => [
          reason,
          countRate(rows, row => row.selectionReason === reason)
        ])
      )
    },
    inventory: {
      limit: INVENTORY_LIMIT,
      fixedItems: FIXED_RECIPE_IDS.length,
      rawMaximumHealPotions: INVENTORY_LIMIT - FIXED_RECIPE_IDS.length,
      safeMaximumHealPotions: MAX_SAFE_HEAL_POTIONS,
      observedMaximumSlots: Math.max(...rows.map(row => row.inventorySlots), 0),
      overLimitRows: rows.filter(row => row.inventorySlots > INVENTORY_LIMIT).length
    },
    steadyState: summarizeBank(rows),
    materialAcquiredBySource: summarizeMaterialSources(rows),
    materialBankedByType: materialBanked,
    healPotionsAcquiredBySource: healPotionsAcquired,
    endpoint: {
      reachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
      retreat: countRate(rows, row => row.outcome === "retreat"),
      death: countRate(rows, row => row.outcome === "death"),
      b5: {
        entrant: countRate(rows, row => row.reachedFloor >= 5),
        breakthrough: countRate(rows, row => row.reachedFloor > 5),
        death: countRate(rows, row => row.deathFloor === 5)
      },
      b10: {
        entrant: countRate(rows, row => row.reachedFloor >= 10),
        breakthrough: countRate(rows, row => row.reachedFloor > 10),
        death: countRate(rows, row => row.deathFloor === 10)
      }
    },
    consumables: {
      healPotionsUsed: meanInterval(rows.map(row => row.healPotionsUsed)),
      finalHealPotions: meanInterval(rows.map(row => row.finalHealPotions))
    }
  };
  return result;
}

function runCondition({ id, selector, seedOffset, scoringProfile }) {
  resetSimulationRandom(SEED + seedOffset);
  const rows = [];
  for (let chain = 0; chain < CHAIN_COUNT; chain++) {
    let bank = createEmptyMaterialBalance();
    for (let localRun = 0; localRun < CHAIN_RUNS; localRun++) {
      const runIndex = chain * CHAIN_RUNS + localRun;
      const className = BASIC_CLASSES[runIndex % BASIC_CLASSES.length];
      const bankBeforePurchase = materialBalance(bank);
      const evaluation = evaluateAffordableKits(bankBeforePurchase);
      const selection = selector(evaluation);
      const bankAfterPurchase = materialBalance(selection.purchase.metaMaterials);
      const scenario = {
        ...BASE_SCENARIO,
        departureCraft: selection.recipeIds,
        departureCraftMaterials: bankBeforePurchase,
        departureCraftMaterialsAreActualBank: true
      };
      const result = simulateRun({
        className,
        startFloor: 1,
        targetDepth: TARGET_DEPTH,
        runIndex,
        seriesId: `issue-481-${id}`,
        scoringProfile,
        scenario,
        workshop: BASE_SCENARIO.workshop
      });
      if (result.departureCraft.purchaseSource !== "actual-meta-bank") {
        throw new Error(`departure craft did not use actual bank: ${id}/${runIndex}`);
      }
      if (!sameMaterialBalance(result.departureCraft.cost, selection.purchase.cost)) {
        throw new Error(`departure craft cost mismatch: ${id}/${runIndex}`);
      }
      const bankAfterRun = addMaterialBalance(bankAfterPurchase, result.bankedMaterialCounts);
      if (result.departureCraft.items.length !== selection.recipeIds.length) {
        throw new Error(`departure craft item count mismatch: ${id}/${runIndex}`);
      }
      if (result.departureCraft.items.length > INVENTORY_LIMIT) {
        throw new Error(`departure craft exceeds inventory limit: ${id}/${runIndex}`);
      }
      if (localRun >= WARMUP_RUNS) {
        rows.push({
          condition: id,
          chain,
          sample: localRun - WARMUP_RUNS,
          runIndex,
          className,
          bankBeforePurchase,
          bankAfterPurchase,
          bankAfterRun,
          fixedKitAffordable: evaluation.fixed.ok,
          canonicalFourAffordable: evaluation.canonical.ok,
          fixedItemsPurchased: evaluation.availableFixed.recipeIds.length,
          maximumAffordableHealPotions: evaluation.maximum,
          chosenHealPotions: selection.healPotions,
          selectionReason: selection.reason,
          departureRecipeIds: [...selection.recipeIds],
          inventorySlots: result.departureCraft.items.length,
          outcome: result.outcome,
          reachedFloor: result.reachedFloor,
          deathFloor: result.deathFloor,
          materialSourceCounts: cloneSourceCounts(result.materialSourceCounts),
          materialAcquiredBySource: { ...result.materialAcquiredBySource },
          bankedMaterialCounts: materialBalance(result.bankedMaterialCounts),
          healPotionsAcquiredBySource: { ...result.healPotionsAcquiredBySource },
          healPotionsUsed: result.healPotionsUsed,
          finalHealPotions: result.finalHealPotions
        });
      }
      bank = bankAfterRun;
    }
  }
  return rows;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolvedEnvironment() {
  return Object.fromEntries(
    Object.keys(ENV_DEFAULTS).map(key => [key, process.env[key]])
  );
}

function buildSummary(rowsByCondition, calibration, runtime) {
  const allRows = Object.values(rowsByCondition).flat();
  const rawText = allRows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const measurement = {
    seed: SEED,
    targetDepth: TARGET_DEPTH,
    chains: CHAIN_COUNT,
    warmupRunsPerChain: WARMUP_RUNS,
    measureRunsPerChain: MEASURE_RUNS,
    measuredRowsPerCondition: CHAIN_COUNT * MEASURE_RUNS,
    totalMeasuredRows: allRows.length,
    calibrationRuns: CALIBRATION_RUNS,
    conditions: Object.keys(rowsByCondition)
  };
  const envHash = sha256(JSON.stringify({
    environment: resolvedEnvironment(),
    measurement,
    inventoryLimit: INVENTORY_LIMIT,
    fixedRecipeIds: FIXED_RECIPE_IDS,
    canonicalHealPotions: CANONICAL_HEAL_POTIONS,
    maxSafeHealPotions: MAX_SAFE_HEAL_POTIONS
  }));
  const conditionSummaries = Object.fromEntries(
    Object.entries(rowsByCondition).map(([id, conditionRows]) => [
      id,
      summarizeCondition(conditionRows, id)
    ])
  );
  const maxAffordable = conditionSummaries["max-affordable"];
  const fixedFour = conditionSummaries["fixed-4"];
  const base = {
    issue: 481,
    conclusion: "素材制約下の定常出発kit測定。canon変更は未実施。",
    measurement,
    runtime,
    environment: resolvedEnvironment(),
    environmentSha256: envHash,
    purchaseModel: {
      actualBank: true,
      fixedRecipeIds: [...FIXED_RECIPE_IDS],
      fixedKitUnavailablePolicy: "固定3品をレシピ順に個別購入。不足品は省略",
      canonicalFourUnavailablePolicy: "購入できる固定品を購入し、傷薬は0本",
      maximumHealCap: MAX_SAFE_HEAL_POTIONS,
      maximumHealCapReason: "所持20枠 - 固定3品 - 拾得余地1枠",
      deathBankRate: 0.3,
      retreatBankRate: 1
    },
    calibration: calibration,
    conditions: conditionSummaries,
    decisionFrame: {
      canonicalHealPotions: CANONICAL_HEAL_POTIONS,
      maxAffordable: {
        quartiles: maxAffordable.purchase.maximumAffordableHealPotions,
        canonicalFourAvailability: maxAffordable.purchase.canonicalFourAffordable,
        bankHealPairReserve: maxAffordable.steadyState.healPairReserve
      },
      fixedFour: {
        canonicalFourAvailability: fixedFour.purchase.canonicalFourAffordable,
        bankHealPairReserve: fixedFour.steadyState.healPairReserve
      },
      interpretation: maxAffordable.purchase.maximumAffordableHealPotions.p50 < CANONICAL_HEAL_POTIONS
        ? "max-affordableの中央値は現行4本未満。4本canonは素材制約下で常時成立しない。固定4本を使い続ける条件はbank蓄積の影響を別途判定する。"
        : "max-affordableの中央値は現行4本以上。4本canonは素材制約上の候補帯にある。"
    },
    limitations: [
      "GREATER_HEAL（上薬、src/craft.jsの黒角2＋骨片2）は能動使用をモデルしていない。上薬で同枠のsustainが増えるため、傷薬だけの結論は回復供給を過小評価し得る。",
      "定常分布は独立chainごとにwarmup後の連続runを採取。bank残高のchain内ドリフトをsteadyStateへ併記し、厳密な定常性は主張しない。chain内runは独立標本ではなく、CIは記述用。",
      "率・平均のN<30は未確定。CIはWilson 95%（率）または正規近似95%（平均）。",
      "工房買い切り・B20目標行・基本4職。任意の商人購入判断は既存sim方針のまま。"
    ],
    remeasurementTargets: [
      { issue: 264, status: "必須", reason: "傷薬4/8/12/16/32掃引はkit素材を無料供給していた。" },
      { issue: 461, status: "条件付き", reason: "固定4本をcanonとして維持しない場合、基準線の出発kit条件が変わる。" },
      { issue: 468, status: "条件付き", reason: "固定4本を使うtrapBonus露出測定。HP供給変更後のendpoint再確認が必要。" },
      { issue: 470, status: "条件付き", reason: "#461 rawを使う完成ビルド定義。基準線を取り直した場合は再集計対象。" },
      { issue: 471, status: "条件付き", reason: "#461由来のcore装備率監視値。kit canon変更時に再測定。" },
      { issue: 473, status: "条件付き", reason: "固定kitを前提にしたPriest宝箱解除監査。供給変更後に再監査。" },
      { issue: 480, status: "条件付き", reason: "固定kitを前提にした罠方針比較。供給変更後に再比較。" }
    ],
    output: {
      rawRows: allRows.length,
      rawSha256,
      summarySha256Definition: "summarySha256 = SHA-256(JSON.stringify(summary without output.summarySha256, null, 2) + newline)"
    }
  };
  const summarySha256 = sha256(`${JSON.stringify(base, null, 2)}\n`);
  return {
    ...base,
    output: { ...base.output, summarySha256 }
  };
}

export async function runIssue481Measurement() {
  resetSimulationRandom(SEED);
  const calibrationStarted = process.hrtime.bigint();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfile = calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    {
      ...BASE_SCENARIO,
      departureCraft: []
    },
    "powder",
    BASE_SCENARIO.workshop
  );
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = Number(process.hrtime.bigint() - calibrationStarted) / 1e9;
  const calibration = {
    runs: CALIBRATION_RUNS,
    wallClockSeconds: calibrationWallSeconds,
    cpuUserSeconds: calibrationCpu.user / 1e6,
    cpuSystemSeconds: calibrationCpu.system / 1e6,
    cpuTotalSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    model: "B1→B20、departure craftなしのcore scoring calibration"
  };
  const measurementStarted = process.hrtime.bigint();
  const measurementCpuStarted = process.cpuUsage();
  const rowsByCondition = {
    "max-affordable": runCondition({
      id: "max-affordable",
      selector: selectMaximumKit,
      seedOffset: 0,
      scoringProfile
    }),
    "fixed-4": runCondition({
      id: "fixed-4",
      selector: selectCanonicalKit,
      seedOffset: 1,
      scoringProfile
    })
  };
  const measurementCpu = process.cpuUsage(measurementCpuStarted);
  const runtime = {
    wallClockSeconds: Number(process.hrtime.bigint() - measurementStarted) / 1e9,
    cpuUserSeconds: measurementCpu.user / 1e6,
    cpuSystemSeconds: measurementCpu.system / 1e6,
    cpuTotalSeconds: (measurementCpu.user + measurementCpu.system) / 1e6,
    runtimeAvailableParallelism: availableParallelism(),
    resolvedParallelism: 1,
    parallelismReason: "前run bank依存のため条件内runを直列実行。SIM_PARALLEL未指定。"
  };
  const summary = buildSummary(rowsByCondition, calibration, runtime);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runIssue481Measurement();
}
