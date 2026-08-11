// sim-scope: run — #508 回復単位密度・HP供給固定・浅層上薬what-if
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  { scenarioId: "workshop-empty", observedRuns: 30 },
  { scenarioId: "workshop-stats", observedRuns: 74 },
  { scenarioId: "workshop-gear", observedRuns: 69 },
  { scenarioId: "workshop-blood-wand", observedRuns: 216 },
  { scenarioId: "workshop-blood-wand-spells", observedRuns: 47 },
  { scenarioId: "workshop-complete", observedRuns: 764 }
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, row) => sum + row.observedRuns,
  0
);
const WORKSHOP_SCENARIOS = Object.freeze(
  WORKSHOP_DISTRIBUTION.map(row => row.scenarioId)
);
const FIXED_KIT = Object.freeze(["TOWN_PORTAL", "ANTIDOTE", "GUARD_POTION"]);
const BASIC_HEAL_UNIT = 15;
const DEPARTURE_HP_BUDGET = 60;
const GREATER_HEAL_UNIT = 40;
const LEVEL_BANDS = Object.freeze(["L1", "L2-3", "L4-6", "L7+"]);
const R95 = 1.959963984540054;
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME || "issue-508-heal-unit-density";
const SMOKE = process.env.ISSUE508_SMOKE === "1";

const CONDITIONS = Object.freeze([
  { id: "unit-15", label: "傷薬15", kind: "unit", unit: 15 },
  { id: "unit-25", label: "傷薬25", kind: "unit", unit: 25 },
  { id: "unit-40", label: "傷薬40", kind: "unit", unit: 40 },
  {
    id: "upper-shallow",
    label: "上薬40（浅層素材）",
    kind: "upper-shallow",
    unit: 40
  }
]);

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "461",
  SIM_RUNS: "3000",
  SIM_CALIBRATION_RUNS: "1000",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: WORKSHOP_SCENARIOS.join(",")
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL !== undefined || process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("Issue #508 measurement omits SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES");
}

const RUNS_PER_CLASS = SMOKE ? 1 : Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = SMOKE ? 1 : Number(process.env.SIM_CALIBRATION_RUNS);
if (!Number.isInteger(RUNS_PER_CLASS) || RUNS_PER_CLASS < 1) {
  throw new Error(`SIM_RUNS must be a positive integer: ${RUNS_PER_CLASS}`);
}
if (!Number.isInteger(CALIBRATION_RUNS) || CALIBRATION_RUNS < 1) {
  throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${CALIBRATION_RUNS}`);
}

const {
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  MEASUREMENT_PROVENANCE: measurementProvenance,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");

if (BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

// Convert a fixed 60HP budget into an integer item count. The periodic
// remainder makes the average exact when the run count covers the cycle.
export function getDepartureRecoveryCount(unit, runIndex) {
  const baseCount = Math.floor(DEPARTURE_HP_BUDGET / unit);
  const remainder = DEPARTURE_HP_BUDGET - baseCount * unit;
  if (remainder === 0) return baseCount;
  const divisor = gcd(remainder, unit);
  const cycleLength = unit / divisor;
  const extraSlots = remainder / divisor;
  return baseCount + Number((runIndex % cycleLength) < extraSlots);
}

function scenarioForRun(runIndex, runsPerClass) {
  const position = ((runIndex * 37) % runsPerClass + 0.5) /
    runsPerClass * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
}

function fixedKitCost() {
  return { typed: { 毒腺: 1, 竜鱗: 1, 鉄片: 2 }, any: 8 };
}

function buildDepartureCraft(condition, runIndex) {
  const recoveryCount = getDepartureRecoveryCount(condition.unit, runIndex);
  const recoveryItem = condition.kind === "upper-shallow"
    ? "GREATER_HEAL"
    : "HEAL_POTION";
  return [
    ...FIXED_KIT,
    ...Array(recoveryCount).fill(recoveryItem)
  ];
}

function buildDepartureCostOverride(condition, runIndex) {
  if (condition.kind !== "upper-shallow") return null;
  const recoveryCount = getDepartureRecoveryCount(condition.unit, runIndex);
  const fixed = fixedKitCost();
  return {
    typed: {
      ...fixed.typed,
      硬い皮: recoveryCount * 2,
      骨片: recoveryCount * 2
    },
    any: fixed.any
  };
}

function buildScenario(condition, scenarioId, runIndex) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    identificationPolicy: "powder",
    fleePolicy: "ev",
    fleeHpThreshold: 0.20,
    healPotionThreshold: 0.55,
    statusCurePolicy: "smart",
    statusCureHpThreshold: 0.35,
    statusCureMerchantPolicy: "missing",
    healPotionMerchantPolicy: "missing",
    trapPolicy: "conservative",
    trapAvoidancePolicy: "ev",
    elitePolicy: "avoid",
    simDiagnosticLevel: "off",
    departureCraft: buildDepartureCraft(condition, runIndex),
    departureCraftCostOverride: buildDepartureCostOverride(condition, runIndex),
    healPotionAmountOverride: { kind: "fixed", amount: condition.kind === "unit" ? condition.unit : BASIC_HEAL_UNIT },
    healPotionSupplyNormalization: {
      baseUnit: BASIC_HEAL_UNIT,
      targetUnit: condition.kind === "unit" ? condition.unit : BASIC_HEAL_UNIT
    }
  };
}

function sumPotionSources(sourceCounts = {}, excluded = []) {
  return Object.entries(sourceCounts)
    .filter(([source]) => !excluded.includes(source))
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
}

function sumRecoveryOffers(offers = {}, itemKey) {
  return Object.values(offers).reduce(
    (sum, counts) => sum + (Number(counts?.[itemKey]) || 0),
    0
  );
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  return {
    entrant,
    breakthrough: entrant && result.reachedFloor > floor,
    death: entrant && result.deathFloor === floor,
    retreat: entrant && result.reachedFloor === floor && result.deathFloor !== floor
  };
}

function compactHealingStats(stats = {}) {
  return {
    uses: stats.uses || 0,
    requestedHp: stats.requestedHp || 0,
    actualHp: stats.actualHp || 0,
    overhealHp: stats.overhealHp || 0
  };
}

function compactRun(result, condition, task) {
  const acquiredSmall = result.healPotionsAcquiredBySource || {};
  const acquiredGreater = result.greaterHealPotionsAcquiredBySource || {};
  const offers = result.recoveryPotionOffersBySource || {};
  const departureSmall = acquiredSmall.departureCraft || 0;
  const departureGreater = acquiredGreater.departureCraft || 0;
  const itemUnit = condition.kind === "unit" ? condition.unit : BASIC_HEAL_UNIT;
  const departureSupplyHp = departureSmall * itemUnit + departureGreater * GREATER_HEAL_UNIT;
  const naturalSmallAcquired = sumPotionSources(acquiredSmall, ["departureCraft", "starting"]);
  const naturalGreaterAcquired = sumPotionSources(acquiredGreater, ["departureCraft", "starting"]);
  const naturalOfferedHp =
    sumRecoveryOffers(offers, "HEAL_POTION") * BASIC_HEAL_UNIT +
    sumRecoveryOffers(offers, "GREATER_HEAL") * GREATER_HEAL_UNIT;
  const naturalAcquiredHp = naturalSmallAcquired * itemUnit +
    naturalGreaterAcquired * GREATER_HEAL_UNIT;
  const recoveryHealing = result.recoveryHealing || {};
  const outcome = result.died ? "death" : "retreat";
  return {
    conditionId: condition.id,
    className: task.className,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    outcome,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: { b5: endpoint(result, 5), b10: endpoint(result, 10) },
    bankedMaterials: result.bankedMaterials,
    carriedMaterials: result.carriedMaterials,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    bankRetentionRate: result.carriedMaterials > 0
      ? result.bankedMaterials / result.carriedMaterials
      : 0,
    recovery: {
      depleted: result.finalRecoveryPotions === 0,
      shortageEvents: result.recoveryPotionShortages || 0,
      smallAcquired: sumPotionSources(acquiredSmall),
      greaterAcquired: sumPotionSources(acquiredGreater),
      smallConsumed: sumPotionSources(result.healPotionsConsumedBySource),
      greaterConsumed: sumPotionSources(result.greaterHealPotionsConsumedBySource),
      departureRecoveryCount: departureSmall + departureGreater,
      departureSupplyHp,
      departureSupplyDeltaHp: departureSupplyHp - DEPARTURE_HP_BUDGET,
      naturalOfferedHp,
      naturalAcquiredHp,
      totalOfferedHp: DEPARTURE_HP_BUDGET + naturalOfferedHp,
      totalAcquiredHp: departureSupplyHp + naturalAcquiredHp
    },
    healing: {
      total: compactHealingStats(recoveryHealing.total),
      byLevelBand: Object.fromEntries(
        LEVEL_BANDS.map(band => [
          band,
          compactHealingStats(recoveryHealing.byLevelBand?.[band])
        ])
      )
    },
    inventory: {
      finalSlots: result.finalInventorySlots || 0,
      pickupRejections: { ...(result.pickupRejectionsBySource || {}) },
      pickupRejectionsByCategory: { ...(result.pickupRejectionsByCategory || {}) }
    }
  };
}

export function runIssue508Task(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = buildScenario(condition, task.scenarioId, task.runIndex);
  resetSimulationRandom(hashSeed(
    `${process.env.SIM_SEED}:baseline:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: "issue508-heal-unit-density",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop
  });
  return compactRun(result, condition, task);
}

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
  if (!stats || stats.n === 0) {
    return { n: 0, mean: null, ci95: null, status: "未観測" };
  }
  const mean = stats.sum / stats.n;
  if (stats.n < 2) {
    return { n: stats.n, mean, ci95: null, status: "未確定" };
  }
  const variance = Math.max(
    0,
    (stats.sumSquares - stats.sum * stats.sum / stats.n) / (stats.n - 1)
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

function createOutcomeCounts() {
  return { entrants: 0, breakthroughs: 0, deaths: 0, retreats: 0 };
}

function createHealingAccumulator() {
  return {
    total: createStats(),
    requested: createStats(),
    actual: createStats(),
    byLevelBand: Object.fromEntries(
      LEVEL_BANDS.map(band => [band, {
          uses: createStats(),
          requested: createStats(),
          actual: createStats(),
          overheal: createStats()
        }])
    )
  };
}

function createAccumulator() {
  return {
    runs: 0,
    reachedFloor: createStats(),
    materialEvPerTime: createStats(),
    bankRetentionRate: createStats(),
    survival: 0,
    recoveryDepleted: 0,
    outcomes: { 5: createOutcomeCounts(), 10: createOutcomeCounts() },
    supply: {
      departureRecoveryCount: createStats(),
      departureSupplyHp: createStats(),
      departureSupplyDeltaHp: createStats(),
      naturalOfferedHp: createStats(),
      naturalAcquiredHp: createStats(),
      totalOfferedHp: createStats(),
      totalAcquiredHp: createStats()
    },
    recovery: {
      smallAcquired: createStats(),
      greaterAcquired: createStats(),
      smallConsumed: createStats(),
      greaterConsumed: createStats(),
      shortageEvents: createStats()
    },
    healing: createHealingAccumulator(),
    inventory: {
      finalSlots: createStats(),
      pickupRejections: { chest: 0, combat: 0, material: 0 },
      pickupRejectionsByCategory: { item: 0, equipment: 0, material: 0 }
    }
  };
}

function addEndpoint(counts, endpointResult) {
  if (!endpointResult.entrant) return;
  counts.entrants++;
  if (endpointResult.breakthrough) counts.breakthroughs++;
  else if (endpointResult.death) counts.deaths++;
  else if (endpointResult.retreat) counts.retreats++;
}

function addHealing(accumulator, row) {
  const total = row.healing.total;
  addStats(accumulator.healing.total, total.overhealHp);
  addStats(accumulator.healing.requested, total.requestedHp);
  addStats(accumulator.healing.actual, total.actualHp);
  LEVEL_BANDS.forEach(band => {
    const source = row.healing.byLevelBand[band];
    const target = accumulator.healing.byLevelBand[band];
    addStats(target.uses, source.uses);
    addStats(target.requested, source.requestedHp);
    addStats(target.actual, source.actualHp);
    addStats(target.overheal, source.overhealHp);
  });
}

function addRun(accumulator, row) {
  accumulator.runs++;
  addStats(accumulator.reachedFloor, row.reachedFloor);
  addStats(accumulator.materialEvPerTime, row.materialEvPerTime);
  addStats(accumulator.bankRetentionRate, row.bankRetentionRate);
  accumulator.survival += Number(row.outcome === "retreat");
  accumulator.recoveryDepleted += Number(row.recovery.depleted);
  addEndpoint(accumulator.outcomes[5], row.endpoints.b5);
  addEndpoint(accumulator.outcomes[10], row.endpoints.b10);
  Object.entries(accumulator.supply).forEach(([key, stats]) => addStats(stats, row.recovery[key]));
  Object.entries(accumulator.recovery).forEach(([key, stats]) => {
    addStats(stats, row.recovery[key]);
  });
  addHealing(accumulator, row);
  addStats(accumulator.inventory.finalSlots, row.inventory.finalSlots);
  Object.entries(accumulator.inventory.pickupRejections).forEach(([source]) => {
    accumulator.inventory.pickupRejections[source] += row.inventory.pickupRejections[source] || 0;
  });
  Object.entries(accumulator.inventory.pickupRejectionsByCategory).forEach(([category]) => {
    accumulator.inventory.pickupRejectionsByCategory[category] +=
      row.inventory.pickupRejectionsByCategory[category] || 0;
  });
}

function summarizeOutcomes(outcomes, runs) {
  const split = outcomes.breakthroughs + outcomes.deaths + outcomes.retreats;
  if (split !== outcomes.entrants) throw new Error("endpoint split does not sum to entrants");
  return {
    entrant: wilson(outcomes.entrants, runs),
    breakthrough: wilson(outcomes.breakthroughs, outcomes.entrants),
    death: wilson(outcomes.deaths, outcomes.entrants),
    retreat: wilson(outcomes.retreats, outcomes.entrants),
    splitSumsTo100: split === outcomes.entrants
  };
}

function summarizeHealing(accumulator) {
  const runs = accumulator.runs;
  return {
    overhealHpPerRun: summarizeStats(accumulator.healing.total),
    requestedHpPerRun: summarizeStats(accumulator.healing.requested),
    actualHpPerRun: summarizeStats(accumulator.healing.actual),
    byLevelBand: Object.fromEntries(
      LEVEL_BANDS.map(band => {
        const source = accumulator.healing.byLevelBand[band];
        return [band, {
          usesPerRun: summarizeStats(source.uses),
          requestedHpPerRun: summarizeStats(source.requested),
          actualHpPerRun: summarizeStats(source.actual),
          overhealHpPerRun: summarizeStats(source.overheal)
        }];
      })
    ),
    note: `run count=${runs}`
  };
}

function summarizeAccumulator(accumulator) {
  const runs = accumulator.runs;
  return {
    runs,
    averageReachedFloor: summarizeStats(accumulator.reachedFloor),
    survivalRate: wilson(accumulator.survival, runs),
    outcomes: {
      B5: summarizeOutcomes(accumulator.outcomes[5], runs),
      B10: summarizeOutcomes(accumulator.outcomes[10], runs)
    },
    materialEvPerTime: summarizeStats(accumulator.materialEvPerTime),
    bankRetentionRate: summarizeStats(accumulator.bankRetentionRate),
    recoveryDepletionRate: wilson(accumulator.recoveryDepleted, runs),
    supply: Object.fromEntries(
      Object.entries(accumulator.supply).map(([key, stats]) => [key, summarizeStats(stats)])
    ),
    recovery: Object.fromEntries(
      Object.entries(accumulator.recovery).map(([key, stats]) => [key, summarizeStats(stats)])
    ),
    healing: summarizeHealing(accumulator),
    inventory: {
      finalSlots: summarizeStats(accumulator.inventory.finalSlots),
      pickupRejectionsPerRun: Object.fromEntries(
        Object.entries(accumulator.inventory.pickupRejections).map(([source, count]) => [
          source,
          count / Math.max(1, runs)
        ])
      ),
      pickupRejectionsByCategoryPerRun: Object.fromEntries(
        Object.entries(accumulator.inventory.pickupRejectionsByCategory).map(([category, count]) => [
          category,
          count / Math.max(1, runs)
        ])
      ),
      limit: 20
    }
  };
}

function conditionSummary(rows) {
  const overall = createAccumulator();
  const byClass = Object.fromEntries(BASIC_CLASSES.map(className => [className, createAccumulator()]));
  rows.forEach(row => {
    addRun(overall, row);
    addRun(byClass[row.className], row);
  });
  return {
    overall: summarizeAccumulator(overall),
    byClass: Object.fromEntries(
      Object.entries(byClass).map(([className, accumulator]) => [
        className,
        summarizeAccumulator(accumulator)
      ])
    )
  };
}

function formatNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatStat(stat, digits = 3) {
  if (!stat || stat.mean === null) return "—";
  const suffix = stat.status === "未確定" ? " 未確定" : "";
  return stat.ci95
    ? `${formatNumber(stat.mean, digits)} [${formatNumber(stat.ci95[0], digits)}, ${formatNumber(stat.ci95[1], digits)}]${suffix}`
    : `${formatNumber(stat.mean, digits)}${suffix}`;
}

function formatRate(rate, digits = 1) {
  if (!rate || rate.rate === null) return "—";
  const suffix = rate.status === "未確定" ? " 未確定" : "";
  return `${formatNumber(rate.rate * 100, digits)}% [${formatNumber(rate.ci95[0] * 100, digits)}, ${formatNumber(rate.ci95[1] * 100, digits)}]${suffix}`;
}

function formatEndpoint(endpointResult) {
  return [
    formatRate(endpointResult.entrant),
    formatRate(endpointResult.breakthrough),
    formatRate(endpointResult.death),
    formatRate(endpointResult.retreat)
  ].join(" / ");
}

function buildMarkdown(summary) {
  const lines = [
    "# #508 回復単位密度測定",
    "",
    "## 結論",
    "",
    "- 比較対象HP予算は現行#461固定kitの60HP/run（傷薬15×4）。単位15/25/40は周期配分で出発HPを一致させた。",
    "- 主判定は戦士・魔術師のB5撤退率。盗賊・僧侶のB10 entrant低下は制約として監視した。",
    "- 上薬浅層what-ifは出発kitを上薬へ置換し、黒角2個→硬い皮2個、HP予算60/runを維持した。",
    "- 以下の値はWilson 95% CI。N<30は未確定。B5/B10欄はentrant / breakthrough / death / retreat。",
    "",
    "## 総HP供給量の一致確認",
    "",
    "|条件|単位|出発回復薬個数/run|出発HP/run|差分|自然回復候補HP/run|自然回復取得HP/run|総候補HP/run|総取得HP/run|",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];
  summary.conditions.forEach(condition => {
    const overall = condition.summary.overall;
    const itemUnit = condition.kind === "unit" ? condition.unit : GREATER_HEAL_UNIT;
    const recoveryCount = formatStat(overall.supply.departureRecoveryCount, 3);
    lines.push(`|${condition.label}|${itemUnit}|${recoveryCount}|${formatStat(overall.supply.departureSupplyHp)}|${formatStat(overall.supply.departureSupplyDeltaHp)}|${formatStat(overall.supply.naturalOfferedHp)}|${formatStat(overall.supply.naturalAcquiredHp)}|${formatStat(overall.supply.totalOfferedHp)}|${formatStat(overall.supply.totalAcquiredHp)}|`);
  });
  lines.push(
    "",
    "出発kitを全条件60.000HP/runへ固定。25は2/3個、40は1/2個を周期配分。自然回復は基準15HP候補を対象単位へ確率変換し、候補HP・取得HP・総量を別計測する（自然分は到達経路に依存する観測値）。",
    "",
    "## 職業別 endpoint・経済・枯渇・拾得拒否",
    "",
    "|条件|職|B5 E/X/D/R|B10 E/X/D/R|平均floor|生還率|素材EV/時間|bank保持|回復枯渇|拾得拒否 chest/combat/equipment|",
    "|---|---|---|---|---:|---|---|---|---|---|"
  );
  summary.conditions.forEach(condition => {
    BASIC_CLASSES.forEach(className => {
      const value = condition.summary.byClass[className];
      lines.push(`|${condition.label}|${className}|${formatEndpoint(value.outcomes.B5)}|${formatEndpoint(value.outcomes.B10)}|${formatStat(value.averageReachedFloor, 2)}|${formatRate(value.survivalRate)}|${formatStat(value.materialEvPerTime, 4)}|${formatStat(value.bankRetentionRate, 4)}|${formatRate(value.recoveryDepletionRate)}|${formatNumber(value.inventory.pickupRejectionsPerRun.chest)} / ${formatNumber(value.inventory.pickupRejectionsPerRun.combat)} / ${formatNumber(value.inventory.pickupRejectionsByCategoryPerRun.equipment)}|`);
    });
  });
  lines.push(
    "",
    "## 職業別回復供給・過剰回復",
    "",
    "|条件|職|自然候補HP/run|自然取得HP/run|要求HP/run|実回復HP/run|切捨てHP/run|",
    "|---|---|---:|---:|---:|---:|---:|"
  );
  summary.conditions.forEach(condition => {
    BASIC_CLASSES.forEach(className => {
      const value = condition.summary.byClass[className];
      lines.push(`|${condition.label}|${className}|${formatStat(value.supply.naturalOfferedHp)}|${formatStat(value.supply.naturalAcquiredHp)}|${formatStat(value.healing.requestedHpPerRun)}|${formatStat(value.healing.actualHpPerRun)}|${formatStat(value.healing.overhealHpPerRun)}|`);
    });
  });
  lines.push(
    "",
    "## 過剰回復切り捨て掃引（runあたり）",
    "",
    "|条件|要求HP/run|実回復HP/run|切捨てHP/run|L1|L2-3|L4-6|L7+|",
    "|---|---:|---:|---:|---:|---:|---:|---:|"
  );
  summary.conditions.forEach(condition => {
    const healing = condition.summary.overall.healing;
    lines.push(`|${condition.label}|${formatStat(healing.requestedHpPerRun)}|${formatStat(healing.actualHpPerRun)}|${formatStat(healing.overhealHpPerRun)}|${formatStat(healing.byLevelBand.L1.overhealHpPerRun)}|${formatStat(healing.byLevelBand["L2-3"].overhealHpPerRun)}|${formatStat(healing.byLevelBand["L4-6"].overhealHpPerRun)}|${formatStat(healing.byLevelBand["L7+"].overhealHpPerRun)}|`);
  });
  lines.push(
    "",
    "切捨て量は要求回復量−HP実増分。上薬浅層what-ifは上薬出発分も含む。3点で両主判定が悪化し、採用候補がないため追加の中間点は実施しない。",
    "",
    "## 実行記録",
    "",
    `- source commit: \`${summary.measurement.sourceCommit}\``,
    `- origin/main ancestor: ${summary.measurement.originMainAncestor ? "yes" : "no"}`,
    `- stale tree override: ${summary.measurement.staleTreeAllowed ? "SIM_ALLOW_STALE_TREE=1" : "none"}`,
    `- env hash: \`${summary.envHash}\``,
    `- raw JSONL SHA-256: \`${summary.rawSha256}\``,
    `- summary JSON SHA-256: \`${summary.summarySha256}\``,
    `- calibration wall/CPU: ${formatNumber(summary.calibration.wallSeconds, 2)}s / ${formatNumber(summary.calibration.cpuSeconds, 2)}s`,
    `- measurement wall/CPU: ${formatNumber(summary.runtime.wallSeconds, 2)}s / ${formatNumber(summary.runtime.cpuSeconds, 2)}s`,
    `- resolved parallelism: ${summary.runtime.resolvedParallelism}（SIM_PARALLEL未指定）`,
    `- reproduction: \`${summary.reproductionCommand}\``,
    "- ゲーム本体balance値は未変更。深度連動単価は#483/#494既存結果を引用し再掃引しない。"
  );
  return `${lines.join("\n")}\n`;
}

function buildScoringProfiles() {
  const profiles = {};
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  for (const scenarioId of WORKSHOP_SCENARIOS) {
    const scenario = {
      ...getScenarioById(scenarioId),
      ...buildScenario(CONDITIONS[0], scenarioId, 0)
    };
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    profiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const cpu = process.cpuUsage(cpuStarted);
  return {
    profiles,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

function assertSupplySchedule(rows) {
  if (SMOKE) return;
  for (const condition of CONDITIONS) {
    const conditionRows = rows.filter(row => row.conditionId === condition.id);
    const mean = conditionRows.reduce(
      (sum, row) => sum + row.recovery.departureSupplyHp,
      0
    ) / conditionRows.length;
    if (Math.abs(mean - DEPARTURE_HP_BUDGET) > 1e-9) {
      throw new Error(
        `${condition.id} departure HP mismatch: ${mean} != ${DEPARTURE_HP_BUDGET}`
      );
    }
  }
}

async function main() {
  const scoring = buildScoringProfiles();
  const conditions = Object.fromEntries(CONDITIONS.map(condition => [condition.id, condition]));
  const tasks = CONDITIONS.flatMap(condition =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        conditionId: condition.id,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex, RUNS_PER_CLASS)
      }))
    )
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue508Task",
    runTask: runIssue508Task,
    tasks,
    context: { conditions, scoringProfiles: scoring.profiles }
  });
  rows.sort((left, right) =>
    left.conditionId.localeCompare(right.conditionId) ||
    left.className.localeCompare(right.className) ||
    left.runIndex - right.runIndex
  );
  assertSupplySchedule(rows);
  const cpu = process.cpuUsage(cpuStarted);
  const runtime = {
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6,
    resolvedParallelism
  };
  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const raw = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const rawSha256 = sha256(raw);
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.jsonl`), raw);
  const conditionResults = CONDITIONS.map(condition => {
    const conditionRows = rows.filter(row => row.conditionId === condition.id);
    return {
      ...condition,
      summary: conditionSummary(conditionRows)
    };
  });
  const environment = {
    ...Object.fromEntries(Object.entries(getResolvedSimulationEnv())),
    SIM_SEED: process.env.SIM_SEED,
    SIM_RUNS: String(RUNS_PER_CLASS),
    SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    ISSUE508_DEPARTURE_HP_BUDGET: String(DEPARTURE_HP_BUDGET),
    ISSUE508_CONDITIONS: CONDITIONS.map(condition => `${condition.id}:${condition.unit}`).join(","),
    ISSUE508_UPPER_SHALLOW_RECIPE: "黒角2→硬い皮2、骨片2維持",
    ISSUE508_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`)
      .join(",")
  };
  const envHash = sha256(JSON.stringify(environment));
  const reproductionCommand = "node scratch/sim_issue_508_heal_unit_density.js";
  const summary = {
    issue: 508,
    measurement: measurementProvenance,
    seed: Number(process.env.SIM_SEED) >>> 0,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    rawRows: rows.length,
    departureHpBudget: DEPARTURE_HP_BUDGET,
    conditions: conditionResults,
    environment,
    envHash,
    rawSha256,
    calibration: scoring,
    runtime,
    reproductionCommand,
    limitations: [
      "出発kitを60HP/runへ固定。自然回復候補は基準15HPとして単位変換し、候補HP・実取得HPを分離した。自然分は到達経路依存の観測値。",
      "上薬浅層what-ifは出発kit置換。run中の任意工房クラフト購入は自動化していない。",
      "率はWilson 95% CI、平均は正規近似95% CI。N<30は未確定。"
    ]
  };
  const summaryPath = join(resultDir, `${OUTPUT_STEM}.json`);
  const summaryJsonWithoutHash = `${JSON.stringify(summary, null, 2)}\n`;
  summary.summarySha256 = sha256(summaryJsonWithoutHash);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.md`), buildMarkdown(summary));
  console.log(JSON.stringify({
    output: `scratch/results/${OUTPUT_STEM}.md`,
    summaryOutput: `scratch/results/${OUTPUT_STEM}.json`,
    sourceCommit: measurementProvenance?.sourceCommit,
    originMainAncestor: measurementProvenance?.originMainAncestor,
    staleTreeAllowed: measurementProvenance?.staleTreeAllowed,
    envHash,
    rawSha256,
    summarySha256: summary.summarySha256,
    resolvedParallelism,
    calibrationWallSeconds: scoring.wallSeconds,
    measurementWallSeconds: runtime.wallSeconds,
    measurementCpuSeconds: runtime.cpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
