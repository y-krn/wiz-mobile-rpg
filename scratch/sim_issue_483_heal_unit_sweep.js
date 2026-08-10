// sim-scope: run — #483 回復単価と上薬能動使用の到達性・経済掃引
/* global console, process */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "483",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  SIM_SCENARIOS: "workshop-complete",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
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
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL !== undefined || process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES must be omitted for this sequential sweep");
}

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const TARGET_DEPTH = 20;
const KIT_FIXED_ITEMS = Object.freeze(["TOWN_PORTAL", "ANTIDOTE", "GUARD_POTION"]);
const KIT_COUNTS = Object.freeze([3, 4]);
const HEAL_SWEEPS = Object.freeze({
  fixed: Object.freeze([15, 20, 25, 30, 35, 40, 50, 60].map(amount => ({
    id: `fixed-${amount}`,
    label: `固定${amount}`,
    value: amount,
    override: { kind: "fixed", amount }
  }))),
  "max-hp-ratio": Object.freeze([0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50].map(ratio => ({
    id: `max-hp-${Math.round(ratio * 100)}`,
    label: `最大HP${Math.round(ratio * 100)}%`,
    value: ratio,
    override: { kind: "max-hp-ratio", ratio }
  }))),
  "floor-scale": Object.freeze([0, 1, 2, 3, 4, 5, 7].map(perFloor => ({
    id: `floor-plus-${perFloor}`,
    label: `床連動15+${perFloor}×(floor-1)`,
    value: perFloor,
    override: { kind: "floor-scale", base: 15, perFloor }
  })))
});
const R95 = 1.959963984540054;
const RUNS = parseInteger("SIM_RUNS", ENV_DEFAULTS.SIM_RUNS, { min: 1 });
const CALIBRATION_RUNS = parseInteger(
  "SIM_CALIBRATION_RUNS",
  ENV_DEFAULTS.SIM_CALIBRATION_RUNS,
  { min: 1 }
);
const SEED = Number(process.env.SIM_SEED) >>> 0;

if (
  SIM_CLASSES.length !== BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))
) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
}

function parseInteger(name, fallback, { min = 0 } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}: ${value}`);
  }
  return value;
}

function createOutcomeCounts() {
  return { entrants: 0, breakthroughs: 0, deaths: 0, retreats: 0 };
}

function createAccumulator() {
  return {
    runs: 0,
    reachedFloor: { sum: 0, sumSquares: 0 },
    bankedMaterials: { sum: 0, sumSquares: 0 },
    materialEvPerTime: { sum: 0, sumSquares: 0 },
    bankedMaterialsTotal: 0,
    timeCostTotal: 0,
    materialAcquiredBySource: { combat: 0, chest: 0, quest: 0 },
    outcomes: { 5: createOutcomeCounts(), 10: createOutcomeCounts() },
    healPotionsAcquired: 0,
    healPotionsConsumed: 0,
    greaterHealsAcquired: 0,
    greaterHealsConsumed: 0,
    recoveryPotionsUsed: 0,
    recoveryShortageRuns: 0,
    recoveryShortageEvents: 0,
    healPotionExhaustionRuns: 0,
    recoveryExhaustionRuns: 0,
    greaterHealAcquiredBySource: {},
    greaterHealConsumedBySource: {},
    healPotionAcquiredBySource: {},
    healPotionConsumedBySource: {}
  };
}

function addMeanSample(stats, value) {
  stats.sum += value;
  stats.sumSquares += value * value;
}

function addSourceCounts(target, additions = {}) {
  Object.entries(additions).forEach(([source, amount]) => {
    target[source] = (target[source] || 0) + amount;
  });
}

function classifyFloor(result, floor, outcome) {
  if (result.reachedFloor < floor) return;
  outcome.entrants++;
  if (result.deathFloor === floor) outcome.deaths++;
  else if (result.reachedFloor > floor) outcome.breakthroughs++;
  else outcome.retreats++;
}

function addRun(accumulator, result) {
  accumulator.runs++;
  addMeanSample(accumulator.reachedFloor, result.reachedFloor);
  const materialEvPerTime = result.timeCost > 0
    ? result.bankedMaterials / result.timeCost
    : 0;
  addMeanSample(accumulator.bankedMaterials, result.bankedMaterials);
  addMeanSample(accumulator.materialEvPerTime, materialEvPerTime);
  accumulator.bankedMaterialsTotal += result.bankedMaterials;
  accumulator.timeCostTotal += result.timeCost;
  Object.entries(result.materialAcquiredBySource || {}).forEach(([source, amount]) => {
    accumulator.materialAcquiredBySource[source] =
      (accumulator.materialAcquiredBySource[source] || 0) + amount;
  });
  classifyFloor(result, 5, accumulator.outcomes[5]);
  classifyFloor(result, 10, accumulator.outcomes[10]);
  accumulator.healPotionsAcquired += sumValues(result.healPotionsAcquiredBySource);
  accumulator.healPotionsConsumed += sumValues(result.healPotionsConsumedBySource);
  accumulator.greaterHealsAcquired += sumValues(result.greaterHealPotionsAcquiredBySource);
  accumulator.greaterHealsConsumed += sumValues(result.greaterHealPotionsConsumedBySource);
  accumulator.recoveryPotionsUsed += result.recoveryPotionsUsed || 0;
  accumulator.recoveryShortageRuns += Number((result.recoveryPotionShortages || 0) > 0);
  accumulator.recoveryShortageEvents += result.recoveryPotionShortages || 0;
  accumulator.healPotionExhaustionRuns += Number(result.finalHealPotions === 0);
  accumulator.recoveryExhaustionRuns += Number(result.finalRecoveryPotions === 0);
  addSourceCounts(accumulator.healPotionAcquiredBySource, result.healPotionsAcquiredBySource);
  addSourceCounts(accumulator.healPotionConsumedBySource, result.healPotionsConsumedBySource);
  addSourceCounts(accumulator.greaterHealAcquiredBySource, result.greaterHealPotionsAcquiredBySource);
  addSourceCounts(accumulator.greaterHealConsumedBySource, result.greaterHealPotionsConsumedBySource);
}

function sumValues(values = {}) {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function meanInterval(stats, trials, digits = 2) {
  if (trials <= 0) return "未観測";
  const mean = stats.sum / trials;
  if (trials < 2) return `${mean.toFixed(digits)} [未確定; N=${trials}]`;
  const variance = Math.max(
    0,
    (stats.sumSquares - (stats.sum * stats.sum) / trials) / (trials - 1)
  );
  const margin = R95 * Math.sqrt(variance / trials);
  const uncertain = trials < 30 ? " 未確定" : "";
  return `${mean.toFixed(digits)} [${(mean - margin).toFixed(digits)},` +
    `${(mean + margin).toFixed(digits)}; N=${trials}]${uncertain}`;
}

function wilsonInterval(successes, trials) {
  if (trials <= 0) return null;
  const z2 = R95 * R95;
  const rate = successes / trials;
  const denominator = 1 + z2 / trials;
  const center = (rate + z2 / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt((rate * (1 - rate) + z2 / (4 * trials)) / trials) /
    denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function formatRate(successes, trials) {
  if (trials <= 0) return "未観測 [N=0; CIなし]";
  const [low, high] = wilsonInterval(successes, trials);
  const uncertain = trials < 30 ? " 未確定" : "";
  return `${(successes / trials * 100).toFixed(1)}% [` +
    `${(low * 100).toFixed(1)}%,${(high * 100).toFixed(1)}%; N=${trials}]${uncertain}`;
}

function summarizeOutcomes(outcomes, runs) {
  const entrants = outcomes.entrants;
  if (outcomes.breakthroughs + outcomes.deaths + outcomes.retreats !== entrants) {
    throw new Error("B5/B10 entrant outcome split does not sum to 100%");
  }
  return {
    entrant: formatRate(entrants, runs),
    entrantRuns: entrants,
    breakthrough: formatRate(outcomes.breakthroughs, entrants),
    breakthroughRuns: outcomes.breakthroughs,
    death: formatRate(outcomes.deaths, entrants),
    deathRuns: outcomes.deaths,
    retreat: formatRate(outcomes.retreats, entrants),
    retreatRuns: outcomes.retreats,
    splitSumsTo100: outcomes.breakthroughs + outcomes.deaths + outcomes.retreats === entrants
  };
}

function summarizeAccumulator(accumulator) {
  const runs = accumulator.runs;
  const averageMaterialEvPerTime = accumulator.timeCostTotal > 0
    ? accumulator.bankedMaterialsTotal / accumulator.timeCostTotal
    : 0;
  return {
    runs,
    averageReachedFloor: meanInterval(accumulator.reachedFloor, runs),
    averageBankedMaterials: meanInterval(accumulator.bankedMaterials, runs),
    materialEvPerTime: averageMaterialEvPerTime,
    materialEvPerTimeMean95CI: meanInterval(accumulator.materialEvPerTime, runs, 4),
    materialAcquiredBySource: Object.fromEntries(
      Object.entries(accumulator.materialAcquiredBySource).map(([source, amount]) => [
        source,
        amount / runs
      ])
    ),
    outcomes: {
      B5: summarizeOutcomes(accumulator.outcomes[5], runs),
      B10: summarizeOutcomes(accumulator.outcomes[10], runs)
    },
    recovery: {
      healPotionAcquiredPerRun: accumulator.healPotionsAcquired / runs,
      healPotionConsumedPerRun: accumulator.healPotionsConsumed / runs,
      greaterHealAcquiredPerRun: accumulator.greaterHealsAcquired / runs,
      greaterHealConsumedPerRun: accumulator.greaterHealsConsumed / runs,
      recoveryUsedPerRun: accumulator.recoveryPotionsUsed / runs,
      recoveryShortageRate: formatRate(accumulator.recoveryShortageRuns, runs),
      recoveryShortageEventsPerRun: accumulator.recoveryShortageEvents / runs,
      healPotionExhaustionRate: formatRate(accumulator.healPotionExhaustionRuns, runs),
      recoveryExhaustionRate: formatRate(accumulator.recoveryExhaustionRuns, runs),
      healPotionAcquiredBySource: divideSources(accumulator.healPotionAcquiredBySource, runs),
      healPotionConsumedBySource: divideSources(accumulator.healPotionConsumedBySource, runs),
      greaterHealAcquiredBySource: divideSources(accumulator.greaterHealAcquiredBySource, runs),
      greaterHealConsumedBySource: divideSources(accumulator.greaterHealConsumedBySource, runs)
    }
  };
}

function divideSources(values, runs) {
  return Object.fromEntries(Object.entries(values).map(([source, amount]) => [source, amount / runs]));
}

function buildClassSummary(classAccumulators) {
  return Object.fromEntries(Object.entries(classAccumulators).map(([className, accumulator]) => [
    className,
    summarizeAccumulator(accumulator)
  ]));
}

function createScenario(kitCount, healSweep) {
  return {
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
    departureCraft: [
      ...KIT_FIXED_ITEMS,
      ...Array(kitCount).fill("HEAL_POTION")
    ],
    healPotionAmountOverride: healSweep.override
  };
}

function runCondition({ kitCount, sweep, scoringProfile, rawHash }) {
  const accumulator = createAccumulator();
  const classAccumulators = Object.fromEntries(
    SIM_CLASSES.map(className => [className, createAccumulator()])
  );
  const scenario = createScenario(kitCount, sweep);
  resetSimulationRandom(SEED);
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    const result = simulateRun({
      className,
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: "issue-483",
      scoringProfile,
      scenario,
      workshop: scenario.workshop
    });
    addRun(accumulator, result);
    addRun(classAccumulators[className], result);
    rawHash.update(`${JSON.stringify({
      kitCount,
      condition: sweep.id,
      className,
      runIndex,
      reachedFloor: result.reachedFloor,
      deathFloor: result.deathFloor,
      outcome: result.outcome,
      bankedMaterials: result.bankedMaterials,
      timeCost: result.timeCost,
      materialAcquiredBySource: result.materialAcquiredBySource,
      healPotionsAcquiredBySource: result.healPotionsAcquiredBySource,
      healPotionsConsumedBySource: result.healPotionsConsumedBySource,
      greaterHealPotionsAcquiredBySource: result.greaterHealPotionsAcquiredBySource,
      greaterHealPotionsConsumedBySource: result.greaterHealPotionsConsumedBySource,
      recoveryPotionsUsed: result.recoveryPotionsUsed,
      recoveryPotionShortages: result.recoveryPotionShortages,
      finalHealPotions: result.finalHealPotions,
      finalGreaterHeals: result.finalGreaterHeals,
      finalRecoveryPotions: result.finalRecoveryPotions
    })}\n`);
  }
  return {
    kitCount,
    kitLabel: `kit-${kitCount}`,
    condition: sweep,
    summary: summarizeAccumulator(accumulator),
    byClass: buildClassSummary(classAccumulators)
  };
}

function findKnee(rows) {
  if (rows.length < 3) return null;
  const points = rows.map(row => ({
    value: row.condition.value,
    averageReachedFloor: Number.parseFloat(row.summary.averageReachedFloor)
  }));
  const marginals = points.slice(1).map((point, index) => {
    const previous = points[index];
    const delta = point.value - previous.value;
    return delta > 0 ? (point.averageReachedFloor - previous.averageReachedFloor) / delta : 0;
  });
  let best = null;
  for (let index = 1; index < marginals.length; index++) {
    const drop = marginals[index - 1] - marginals[index];
    if (drop > (best?.drop ?? 0)) {
      best = {
        boundary: rows[index + 1].condition.id,
        label: rows[index + 1].condition.label,
        marginalBefore: marginals[index - 1],
        marginalAfter: marginals[index],
        drop
      };
    }
  }
  return best && best.drop > 0 ? best : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolvedEnvironment() {
  return Object.fromEntries(
    Object.entries(getResolvedSimulationEnv()).map(([key, value]) => [key, value])
  );
}

function summarizeKnees(rows) {
  const grouped = {};
  rows.forEach(row => {
    const key = `${row.kitLabel}:${row.condition.family}`;
    (grouped[key] ||= []).push(row);
  });
  return Object.fromEntries(Object.entries(grouped).map(([key, familyRows]) => [
    key,
    findKnee(familyRows.sort((left, right) => left.condition.value - right.condition.value))
  ]));
}

export function runIssue483Measurement() {
  const rawHash = createHash("sha256");
  const calibrationStarted = process.hrtime.bigint();
  const calibrationCpuStarted = process.cpuUsage();
  const calibration = {};
  const profiles = {};
  for (const kitCount of KIT_COUNTS) {
    const scenario = createScenario(kitCount, HEAL_SWEEPS.fixed[0]);
    profiles[kitCount] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  calibration.wallClockSeconds = Number(process.hrtime.bigint() - calibrationStarted) / 1e9;
  calibration.cpuUserSeconds = calibrationCpu.user / 1e6;
  calibration.cpuSystemSeconds = calibrationCpu.system / 1e6;
  calibration.cpuTotalSeconds = (calibrationCpu.user + calibrationCpu.system) / 1e6;
  calibration.runsPerKit = CALIBRATION_RUNS;
  calibration.model = "B1→B20、kit別、上薬能動使用・固定15のcore scoring calibration";

  const measurementStarted = process.hrtime.bigint();
  const measurementCpuStarted = process.cpuUsage();
  const rows = [];
  for (const kitCount of KIT_COUNTS) {
    for (const [family, sweeps] of Object.entries(HEAL_SWEEPS)) {
      for (const sweep of sweeps) {
        rows.push({
          ...runCondition({
            kitCount,
            sweep: { ...sweep, family },
            scoringProfile: profiles[kitCount],
            rawHash
          })
        });
      }
    }
  }
  const measurementCpu = process.cpuUsage(measurementCpuStarted);
  const runtime = {
    wallClockSeconds: Number(process.hrtime.bigint() - measurementStarted) / 1e9,
    cpuUserSeconds: measurementCpu.user / 1e6,
    cpuSystemSeconds: measurementCpu.system / 1e6,
    cpuTotalSeconds: (measurementCpu.user + measurementCpu.system) / 1e6,
    availableParallelism: availableParallelism(),
    resolvedParallelism: 1,
    parallelismReason: "同一seedの条件比較を直列実行。SIM_PARALLEL未指定。"
  };
  const measurement = {
    seed: SEED,
    targetDepth: TARGET_DEPTH,
    runsPerCondition: RUNS,
    totalConditions: rows.length,
    totalMeasuredRuns: rows.length * RUNS,
    classes: [...SIM_CLASSES],
    kits: KIT_COUNTS.map(kitCount => ({
      kitCount,
      recipeIds: [...KIT_FIXED_ITEMS, ...Array(kitCount).fill("HEAL_POTION")]
    })),
    sweeps: Object.fromEntries(
      Object.entries(HEAL_SWEEPS).map(([family, sweeps]) => [
        family,
        sweeps.map(({ id, label, value, override }) => ({ id, label, value, override }))
      ])
    )
  };
  const environment = resolvedEnvironment();
  const envHash = sha256(JSON.stringify({ environment, measurement }));
  const base = {
    issue: 483,
    conclusion: "回復単価what-if。ゲーム本体のbalance値は変更していない。",
    measurement,
    runtime,
    calibration,
    environment,
    environmentSha256: envHash,
    outputSha256: rawHash.digest("hex"),
    conditions: rows,
    knees: summarizeKnees(rows),
    interpretation: {
      b10Entrant: "条件別B10 entrantを出力し、固定15との差分を確認する。非変動は前提にしない。",
      outcomeSplit: "entrant内で突破・死亡・撤退を分類し、3分割合計100%をassertする。",
      knee: "平均到達階の単位入力あたり限界値が隣接区間で最大低下する境界をknee候補とする。",
      upperHeal: "GREATER_HEALは宝箱から入手後、傷薬より優先してHP<=35%で使用。回復量は実装値40。",
      floorScale: "傷薬量 = min(maxHP, 15 + perFloor × (floor - 1))。B1は現行15。"
    },
    limitations: [
      "N<30の率は未確定。率はWilson 95% CI、平均は正規近似95% CI。",
      "kit本数は#481のP50=3と#461比較条件4を固定。素材bank定常状態は本測定へ混ぜない。",
      "#264の他レバー、所持枠・スタック変更、ゲーム本体balance値変更は行っていない。",
      "上薬の素材コストは胸報酬経路で入手する実プレイモデル。上薬の工房クラフト反復は任意行動のため自動化していない。"
    ],
    remeasurementTargets: [
      { issue: 264, status: "必須", reason: "旧4/8/12/16/32掃引は回復単価・上薬能動使用を含まない。" },
      { issue: 461, status: "条件付き", reason: "kit4固定をcanonへ残す場合も、回復モデル追加後に基準線を取り直す。" },
      { issue: 468, status: "条件付き", reason: "固定kit前提のtrapBonus露出測定。回復供給変更後のendpoint再確認が必要。" },
      { issue: 470, status: "条件付き", reason: "#461由来の完成ビルド集計。基準線を取り直した場合は再集計対象。" },
      { issue: 471, status: "条件付き", reason: "#461由来のcore装備率監視値。kit/回復canon変更時に再測定。" },
      { issue: 473, status: "条件付き", reason: "固定kit前提のPriest宝箱解除監査。供給変更後に再監査。" },
      { issue: 480, status: "条件付き", reason: "固定kit前提の罠方針比較。供給変更後に再比較。" }
    ]
  };
  const summarySha256 = sha256(`${JSON.stringify(base, null, 2)}\n`);
  return { ...base, summarySha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = `${JSON.stringify(runIssue483Measurement(), null, 2)}\n`;
  if (process.env.SIM_RESULT_PATH) writeFileSync(process.env.SIM_RESULT_PATH, output);
  else console.log(output);
}
