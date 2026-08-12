// sim-scope: run — Issue #534 Mage death-source and survivability sweep
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { CLASS_PASSIVES } from "../src/data/classes.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE534_SMOKE === "1";
const DEFAULT_RUNS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS = SMOKE ? 2 : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const TARGET_DEPTH = 21;
const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師"
});
const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce((sum, [, count]) => sum + count, 0);
const ENDPOINTS = Object.freeze(["b5", "b10"]);
const DAMAGE_SOURCES = Object.freeze([
  "floor-trap",
  "chest-trap",
  "normal",
  "elite",
  "midboss",
  "boss"
]);
const SOURCE_LABELS = Object.freeze({
  "floor-trap": "床罠",
  "chest-trap": "宝箱罠",
  normal: "通常戦闘",
  elite: "エリート",
  midboss: "中ボス",
  boss: "boss"
});
const ORIGINAL_MAGE_KILL_HEAL = CLASS_PASSIVES.Mage.bonuses.killHeal;

// Keep the sweep anchored to the #532 pre-change Mage (HP 19, growth 3..5)
// even when this script is rerun after the adopted source values are present.
function mageHpScenario(baseBonus = 0, growthBonus = 0, extra = {}) {
  return {
    hpBaseBonus: baseBonus - 2,
    hpGrowthBonus: growthBonus - 1,
    ...extra
  };
}

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: String(SEED),
  SIM_RUNS: String(RUNS),
  SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
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
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (!SMOKE && JSON.stringify(SIM_CLASSES) !== JSON.stringify(CLASSES)) {
  throw new Error(`unexpected SIM_CLASSES: ${SIM_CLASSES.join(",")}`);
}

const CASES = Object.freeze([
  { id: "current", label: "現行", targetClass: null, scenario: {}, killHeal: ORIGINAL_MAGE_KILL_HEAL },
  ...[6, 8, 10].map(value => ({
    id: `mage-killheal-${value}`,
    label: `魔術師 killHeal +${value}`,
    targetClass: "Mage",
    scenario: {},
    killHeal: value
  })),
  ...[1, 2, 3, 4, 6].map(value => ({
    id: `mage-base-hp-${value}`,
    label: `魔術師 base HP +${value}`,
    targetClass: "Mage",
    scenario: mageHpScenario(value),
    killHeal: ORIGINAL_MAGE_KILL_HEAL
  })),
  ...[1, 2].map(value => ({
    id: `mage-growth-hp-${value}`,
    label: `魔術師 level HP成長 +${value}`,
    targetClass: "Mage",
    scenario: mageHpScenario(0, value),
    killHeal: ORIGINAL_MAGE_KILL_HEAL
  })),
  {
    id: "mage-base-hp-2-growth-1",
    label: "魔術師 base HP +2 / level成長 +1",
    targetClass: "Mage",
    scenario: mageHpScenario(2, 1),
    killHeal: ORIGINAL_MAGE_KILL_HEAL
  },
  ...[60, 70, 100].map(value => ({
    id: `mage-trapguard-${value}`,
    label: `魔術師 trapGuard ${value}%`,
    targetClass: "Mage",
    scenario: { trapGuardOverride: { className: "Mage", value } },
    killHeal: ORIGINAL_MAGE_KILL_HEAL
  })),
  {
    id: "mage-combat-short-arch-wand",
    label: "魔術師 戦闘短縮（ARCH_WAND）",
    targetClass: "Mage",
    scenario: mageHpScenario(0, 0, { startingGearChoice: "ARCH_WAND" }),
    killHeal: ORIGINAL_MAGE_KILL_HEAL
  },
  ...[0.4, 0.6].map(value => ({
    id: `mage-extra-camp-${String(value).replace(".", "")}`,
    label: `魔術師 非撃破回復（追加camp ${value * 100}%）`,
    targetClass: "Mage",
    scenario: mageHpScenario(0, 0, {
      extraCampFloors: [1, 3],
      extraCampRecoveryRate: value
    }),
    killHeal: ORIGINAL_MAGE_KILL_HEAL
  }))
]);

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

function scenarioForRun(runIndex) {
  const position = ((runIndex * 37) % RUNS + 0.5) / RUNS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function getCase(caseId) {
  const candidate = CASES.find(item => item.id === caseId);
  if (!candidate) throw new Error(`unknown case: ${caseId}`);
  return candidate;
}

function applyCasePatch(caseInfo) {
  CLASS_PASSIVES.Mage.bonuses.killHeal = caseInfo.killHeal;
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  const outcome = !entrant
    ? null
    : result.reachedFloor > floor
      ? "breakthrough"
      : result.deathFloor === floor
        ? "death"
        : "retreat";
  return {
    entrant,
    outcome,
    breakthrough: outcome === "breakthrough",
    death: outcome === "death",
    retreat: outcome === "retreat"
  };
}

function projectResult(result, task) {
  const caseInfo = getCase(task.caseId);
  const intervention = caseInfo.targetClass === task.className ? caseInfo.scenario : {};
  return {
    caseId: task.caseId,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    intervention,
    outcome: result.outcome,
    survived: result.survived,
    died: result.died,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: Object.fromEntries(ENDPOINTS.map(endpointId => [
      endpointId,
      endpoint(result, Number(endpointId.slice(1)))
    ])),
    damageHpBySource: { ...(result.damageHpBySource || {}) },
    deathEncounterType: result.deathEncounterType || null,
    deathCause: result.deathCause || null,
    deathSnapshot: result.deathSnapshot ? { ...result.deathSnapshot } : null,
    killHeal: { ...(result.killHeal || {}) },
    combatRounds: result.combatRounds || 0,
    combatDamageHp: result.combatDamageHp || 0,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost
  };
}

export function generateSharedRunFloor(args) {
  return simulationModule.generateSharedRunFloor(args);
}

export function runIssue534Task(task, context) {
  const caseInfo = getCase(task.caseId);
  applyCasePatch(caseInfo);
  resetSimulationRandom(hashSeed(
    `${SEED}:issue534:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const baseScenario = getScenarioById(task.scenarioId);
  const magePreChangeBaseline = task.className === "Mage" ? mageHpScenario() : {};
  const intervention = caseInfo.targetClass === task.className ? caseInfo.scenario : {};
  const scenario = { ...baseScenario, ...magePreChangeBaseline, ...intervention };
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue534:${task.scenarioId}`,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false
  });
  return projectResult(result, task);
}

function wilson(successes, trials) {
  if (trials <= 0) return { estimate: null, low: null, high: null, trials, uncertain: true };
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials) / denominator;
  return {
    estimate: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    trials,
    uncertain: trials < 30
  };
}

function meanStats(values) {
  if (!values.length) return { mean: null, low: null, high: null, trials: 0, uncertain: true };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { mean, low: null, high: null, trials: values.length, uncertain: true };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const margin = 1.959963984540054 * Math.sqrt(variance / values.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: values.length,
    uncertain: values.length < 30
  };
}

function fmtRate(stat, digits = 1) {
  if (!stat || stat.estimate === null) return "未観測";
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${(stat.estimate * 100).toFixed(digits)}% [${(stat.low * 100).toFixed(digits)},${(stat.high * 100).toFixed(digits)}; N=${stat.trials}]${suffix}`;
}

function fmtMean(stat, digits = 2) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.low === null) return `${stat.mean.toFixed(digits)} [未確定; N=${stat.trials}]`;
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${stat.mean.toFixed(digits)} [${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; N=${stat.trials}]${suffix}`;
}

function endpointStats(rows, endpointId) {
  const entrants = rows.filter(row => row.endpoints[endpointId].entrant);
  return {
    entrant: wilson(entrants.length, rows.length),
    breakthrough: wilson(entrants.filter(row => row.endpoints[endpointId].breakthrough).length, entrants.length),
    death: wilson(entrants.filter(row => row.endpoints[endpointId].death).length, entrants.length),
    retreat: wilson(entrants.filter(row => row.endpoints[endpointId].retreat).length, entrants.length)
  };
}

function summarizeClass(rows, caseId, className) {
  const selected = rows.filter(row => row.caseId === caseId && row.className === className);
  const deaths = selected.filter(row => row.died);
  const deathSnapshots = deaths.map(row => row.deathSnapshot).filter(Boolean);
  const deathSourceCounts = Object.fromEntries(DAMAGE_SOURCES.map(source => [source, 0]));
  deaths.forEach(row => {
    const source = row.deathSnapshot?.source || row.deathEncounterType;
    if (source && source in deathSourceCounts) deathSourceCounts[source]++;
  });
  const deathCauseCounts = {};
  deaths.forEach(row => {
    if (row.deathCause) deathCauseCounts[row.deathCause] = (deathCauseCounts[row.deathCause] || 0) + 1;
  });
  return {
    caseId,
    className,
    runs: selected.length,
    b5: endpointStats(selected, "b5"),
    b10: endpointStats(selected, "b10"),
    averageFloor: meanStats(selected.map(row => row.reachedFloor)),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    combatRounds: meanStats(selected.map(row => row.combatRounds)),
    combatDamageHp: meanStats(selected.map(row => row.combatDamageHp)),
    damageBySource: Object.fromEntries(DAMAGE_SOURCES.map(source => [
      source,
      meanStats(selected.map(row => row.damageHpBySource[source] || 0))
    ])),
    deathSource: Object.fromEntries(DAMAGE_SOURCES.map(source => [
      source,
      wilson(deathSourceCounts[source], deaths.length)
    ])),
    deathCauseCounts,
    lastDamage: {
      damage: meanStats(deathSnapshots.map(snapshot => snapshot.damage || 0)),
      damageMaxHpRate: meanStats(deathSnapshots.map(snapshot => snapshot.damageMaxHpRate || 0)),
      hits: meanStats(deathSnapshots.map(snapshot => snapshot.hits || 0)),
      hpBefore: meanStats(deathSnapshots.map(snapshot => snapshot.hpBefore || 0)),
      maxHp: meanStats(deathSnapshots.map(snapshot => snapshot.maxHp || 0))
    },
    killHeal: {
      activationsPerRun: meanStats(selected.map(row => row.killHeal.killHealActivations || 0)),
      recoveredHpPerRun: meanStats(selected.map(row => row.killHeal.killHealRecoveredHp || 0)),
      potentialHpPerRun: meanStats(selected.map(row => row.killHeal.killHealPotentialHp || 0)),
      activationsBeforeDeath: meanStats(deaths.map(row => row.deathSnapshot?.killHealActivationsBeforeDeath || 0)),
      zeroActivationDeathRate: wilson(
        deaths.filter(row => (row.deathSnapshot?.killHealActivationsBeforeDeath || 0) === 0).length,
        deaths.length
      )
    }
  };
}

function renderEndpoint(stats) {
  return `E ${fmtRate(stats.entrant)} / X ${fmtRate(stats.breakthrough)} / D ${fmtRate(stats.death)} / R ${fmtRate(stats.retreat)}`;
}

function renderMarkdown({ rows, summaries, measurement, rawSha256, summarySha256, provenance }) {
  const summary = (caseId, className) => summaries[`${caseId}:${className}`];
  const baseline = Object.fromEntries(CLASSES.map(className => [className, summary("current", className)]));
  const mageBaseline = baseline.Mage;
  const mageKillHeal10 = summary("mage-killheal-10", "Mage");
  const mageAdopted = summary("mage-base-hp-2-growth-1", "Mage");
  const topDeathSource = [...DAMAGE_SOURCES]
    .sort((left, right) => (mageBaseline.deathSource[right].estimate || 0) - (mageBaseline.deathSource[left].estimate || 0))[0];
  const lines = [
    "# Issue #534 魔術師死亡律速 測定結果",
    "",
    "## 結論",
    "",
    `- 現行魔術師 B5死亡率: ${fmtRate(mageBaseline.b5.death)}。死亡時直前被害源最多: ${SOURCE_LABELS[topDeathSource]}。`,
    `- ` +
      `killHeal 発動は魔術師 ${fmtMean(mageBaseline.killHeal.activationsPerRun)}回/run、実回復 ${fmtMean(mageBaseline.killHeal.recoveredHpPerRun)}HP/run。死亡runの発動0率 ${fmtRate(mageBaseline.killHeal.zeroActivationDeathRate)}。`,
    `- 死亡run直前1ターン被害 ${fmtMean(mageBaseline.lastDamage.damage)}、最大HP比 ${fmtMean(mageBaseline.lastDamage.damageMaxHpRate, 3)}、被害hit数 ${fmtMean(mageBaseline.lastDamage.hits)}。`,
    "- 採用: Mage 初期HP+2 / level HP成長+1（初期HP21、成長4..6）。採用後のN=3000基準線は `scratch/results/issue-461-baseline.md`。",
    "",
    "## 採用判定（レビュー対応）",
    "",
    `- killHeal+10 はB10到達率${fmtRate(mageKillHeal10.b10.entrant)}まで改善する有効な候補。初期仮説は「killHeal増量では解けない」から「撃破前死亡には効かない」へ限定修正する。死亡runの発動0率${fmtRate(mageKillHeal10.killHeal.zeroActivationDeathRate)}だが、撃破後まで生き残るrunでは回復が累積し、killHeal+6/+8/+10でB10到達率14.8%/21.0%/26.2%と単調に伸びた。`,
    `- killHeal+10 の長所は深度（平均floor${fmtMean(mageKillHeal10.averageFloor)}）とB10到達、短所はB5死亡${fmtRate(mageKillHeal10.b5.death)}、戦闘${fmtMean(mageKillHeal10.combatRounds)}turn/run、素材EV/時間${fmtMean(mageKillHeal10.materialEvPerTime, 4)}。初期HP+2/成長+1はB5死亡${fmtRate(mageAdopted.b5.death)}、平均floor${fmtMean(mageAdopted.averageFloor)}、戦闘${fmtMean(mageAdopted.combatRounds)}turn/run、素材EV/時間${fmtMean(mageAdopted.materialEvPerTime, 4)}で、深度以外の主指標が優位。`,
    "- 両候補ともMage-only overrideで、他3職B10 entrant差は戦士/盗賊/僧侶すべて0.0pt。killHeal+10は汎用support基準値2、Fighter+2、Mage+4に対して突出したclass passive値（Mage現行の2.5倍）となる。初期HP+2/成長+1は撃破triggerを増幅せず、撃破前から効く静的耐久で死亡律速を直接緩和し、将来職のHP成長設計にも適用しやすい。このため採用点は変更せず、killHeal=4を維持する。",
    "",
    "## 基準線（現行）",
    "",
    "| 職 | B5 E/X/D/R | B10 E/X/D/R | 平均floor | 生還率 | 素材EV/時間 | 戦闘turn/run |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const className of CLASSES) {
    const value = baseline[className];
    lines.push(`| ${CLASS_LABELS[className]} | ${renderEndpoint(value.b5)} | ${renderEndpoint(value.b10)} | ${fmtMean(value.averageFloor)} | ${fmtRate(value.survivalRate)} | ${fmtMean(value.materialEvPerTime, 4)} | ${fmtMean(value.combatRounds)} |`);
  }
  lines.push(
    "",
    "E=entrant（全run分母）、X/D/Rはentrant分母。X/D/R合計100%。率=Wilson 95% CI、平均=正規近似95% CI。N<30は未確定。",
    "",
    "## 死亡原因・killHeal実績（現行）",
    "",
    "| 職 | 死亡run内 source | 累積HP/run: 床罠 | 宝箱罠 | 通常戦闘 | エリート | boss | 死亡直前HP | 被害 | 最大HP比 | hit数 | 発動0率 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |"
  );
  for (const className of CLASSES) {
    const value = baseline[className];
    const sourceText = DAMAGE_SOURCES
      .filter(source => value.deathSource[source].estimate > 0)
      .map(source => `${SOURCE_LABELS[source]} ${fmtRate(value.deathSource[source])}`)
      .join(" / ") || "未観測";
    lines.push(`| ${CLASS_LABELS[className]} | ${sourceText} | ${fmtMean(value.damageBySource["floor-trap"])} | ${fmtMean(value.damageBySource["chest-trap"])} | ${fmtMean(value.damageBySource.normal)} | ${fmtMean(value.damageBySource.elite)} | ${fmtMean(value.damageBySource.boss)} | ${fmtMean(value.lastDamage.hpBefore)} | ${fmtMean(value.lastDamage.damage)} | ${fmtMean(value.lastDamage.damageMaxHpRate, 3)} | ${fmtMean(value.lastDamage.hits)} | ${fmtRate(value.killHeal.zeroActivationDeathRate)} |`);
  }
  lines.push(
    "",
    "## 候補 sweep",
    "",
    "| 候補 | 魔術師 B5 E/X/D/R | 魔術師 B10 E/X/D/R | 平均floor | 戦闘turn/run | 死亡直前被害/最大HP | killHeal発動0死亡 | 素材EV/時間 | 他職B10 entrant Δ（戦/盗/僧） |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- | --- |"
  );
  for (const candidate of CASES) {
    const mage = summary(candidate.id, "Mage");
    const deltas = ["Fighter", "Thief", "Priest"].map(className => {
      const current = baseline[className].b10.entrant.estimate;
      const value = summary(candidate.id, className).b10.entrant.estimate;
      return `${((value - current) * 100).toFixed(1)}pt`;
    }).join(" / ");
    lines.push(`| ${candidate.label} | ${renderEndpoint(mage.b5)} | ${renderEndpoint(mage.b10)} | ${fmtMean(mage.averageFloor)} | ${fmtMean(mage.combatRounds)} | ${fmtMean(mage.lastDamage.damageMaxHpRate, 3)} | ${fmtRate(mage.killHeal.zeroActivationDeathRate)} | ${fmtMean(mage.materialEvPerTime, 4)} | ${deltas} |`);
  }
  lines.push(
    "",
    "## killHeal発動量",
    "",
    "| 候補 | Mage 発動/run | 実回復HP/run | 潜在HP/run | 死亡run 発動回数 |",
    "| --- | ---: | ---: | ---: | ---: |"
  );
  for (const candidate of CASES) {
    const mage = summary(candidate.id, "Mage");
    lines.push(`| ${candidate.label} | ${fmtMean(mage.killHeal.activationsPerRun)} | ${fmtMean(mage.killHeal.recoveredHpPerRun)} | ${fmtMean(mage.killHeal.potentialHpPerRun)} | ${fmtMean(mage.killHeal.activationsBeforeDeath)} |`);
  }
  lines.push(
    "",
    "## 測定条件・再現",
    "",
    `- seed=${SEED}、各候補・職 N=${RUNS}、calibration N=${CALIBRATION_RUNS}、target depth=${TARGET_DEPTH}、工房6状態分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}`,
    "- 現行条件: 出発kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、EV逃走、conservative罠、EV罠回避、smart状態治療、商人購入なし。",
    "- 候補介入は Mage の sim-only override。採用値はゲーム側へ実装済み。各候補は同じ初期seed系列（scenario/class/run）から開始するが、候補適用後の分岐軌跡は同一とは解釈しない。Mageのsweepは#532時点（HP19、成長3..5）へsim-only補正している。",
    `- source commit: ${provenance.sourceCommit}`,
    `- origin/main ancestor: ${provenance.originMainAncestor}`,
    `- stale tree allowed: ${provenance.staleTreeAllowed}`,
    `- env hash: ${measurement.envHash}`,
    `- resolved parallelism: ${measurement.resolvedParallelism}`,
    `- calibration wall-clock: ${measurement.calibrationWallSeconds.toFixed(3)}s / simulation wall-clock: ${measurement.simulationWallSeconds.toFixed(3)}s / total CPU: ${measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256（未追跡）: ${rawSha256}`,
    `- summary JSON SHA-256（未追跡）: ${summarySha256}`,
    "- `damageHpBySource` はrun全体の累積被害。死亡sourceは死亡runの最後の被害イベント。死亡直前被害は最後の戦闘roundまたは罠1回の被害。",
    "- Wilson 95% CI。N<30セルは未確定として結論に使わない。",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_534_mage_death.js",
    "ISSUE534_SMOKE=1 node scratch/sim_issue_534_mage_death.js",
    "node scratch/sim_issue_534_mage_death.js",
    "```",
    ""
  );
  return lines.join("\n");
}

async function main() {
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;
  const tasks = CASES.flatMap(candidate => CLASSES.flatMap(className =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      caseId: candidate.id,
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  ));
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(new URL(import.meta.url).pathname).href,
    exportName: "runIssue534Task",
    runTask: runIssue534Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const env = {
    ...ENV_DEFAULTS,
    ISSUE534_MODE: SMOKE ? "smoke" : "measurement",
    ISSUE534_CASES: CASES.map(candidate => candidate.id).join(","),
    ISSUE534_CLASSES: CLASSES.join(","),
    ISSUE534_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE534_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(","),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>"
  };
  const envCanonical = Object.entries(env).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  const measurement = {
    envHash: sha256(envCanonical),
    resolvedParallelism,
    calibrationWallSeconds,
    simulationWallSeconds,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system + simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const summaries = Object.fromEntries(CASES.flatMap(candidate =>
    CLASSES.map(className => [`${candidate.id}:${className}`, summarizeClass(rows, candidate.id, className)])
  ));
  const provenance = simulationModule.MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const summary = { measurement, env, cases: CASES, summaries, provenance };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const rawPath = new URL("issue-534-mage-death.jsonl", resultDir);
  const summaryPath = new URL("issue-534-mage-death.json", resultDir);
  const markdownPath = new URL("issue-534-mage-death.md", resultDir);
  writeFileSync(rawPath, rawText);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  writeFileSync(markdownPath, renderMarkdown({ rows, summaries, measurement, rawSha256, summarySha256, provenance }));
  console.log(JSON.stringify({
    output: "scratch/results/issue-534-mage-death.md",
    envHash: measurement.envHash,
    rawSha256,
    summarySha256,
    sourceCommit: provenance.sourceCommit,
    originMainAncestor: provenance.originMainAncestor,
    cases: CASES.length,
    runsPerCaseClass: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
