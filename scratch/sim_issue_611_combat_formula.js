// sim-scope: run — Issue #611 combat formula measurement
/* global console, process */

import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE611_SMOKE === "1";
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASSES = Object.freeze([
  ...BASIC_CLASSES,
  "Samurai",
  "Bishop",
  "Ranger",
  "Ninja"
]);
const CLASS_LABELS = Object.freeze({
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師",
  Samurai: "侍",
  Bishop: "司祭",
  Ranger: "野伏",
  Ninja: "忍者"
});
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce((sum, [, count]) => sum + count, 0);
const FULL_SCENARIO_IDS = Object.freeze(WORKSHOP_DISTRIBUTION.map(([id]) => id));
const SCENARIO_IDS = Object.freeze(
  SMOKE ? ["workshop-complete"] : FULL_SCENARIO_IDS
);
const TARGET_DEPTH = 11;
const RUNS_PER_CLASS = SMOKE ? 1 : 5000;
const CALIBRATION_RUNS = SMOKE ? 1 : 100;
const TARGET_FLOORS = Object.freeze(Array.from({ length: 10 }, (_, index) => index + 1));
const R95 = 1.959963984540054;
const RESULT_BASENAME = "issue-611-combat-formula";
const TELEMETRY_ARRAYS = Object.freeze([
  "physicalPlayerHits",
  "physicalMonsterHits",
  "spellHits",
  "spellMonsterHits",
  "mitigations",
  "mitigationCalls",
  "targetedBonuses"
]);
const MITIGATION_TYPES = Object.freeze([
  "guardian",
  "spellGuard",
  "mabarrier",
  "physGuard",
  "antiDragon",
  "magicVulnerable",
  "thinIcePact"
]);
const TARGETED_TYPES = Object.freeze([
  "antiUndead",
  "antiDragon",
  "antiDemon",
  "coreAffix"
]);

for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES", "SIM_SKIP_PROVENANCE"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for Issue #611 measurement`);
  }
}
for (const key of [
  "SIM_DIALMA_CANDIDATE",
  "SIM_MADI_CANDIDATE",
  "SIM_MADI_HEAL_MIN",
  "SIM_MADI_HEAL_MAX",
  "SIM_MADI_COST"
]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must remain unset for Issue #611 measurement`);
  }
}

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "461",
  SIM_RUNS: String(RUNS_PER_CLASS),
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
  SIM_INDEPENDENT_RUN_RANDOM: "0",
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
    continue;
  }
  if (process.env[key] !== value) {
    throw new Error(`Issue #611 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
  generateSharedRunFloor: generateSharedRunFloorSource,
  getResolvedSimulationEnv,
  getScenarioById,
  MEASUREMENT_PROVENANCE,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
}
if (CLASSES.length !== 8 || new Set(CLASSES).size !== CLASSES.length) {
  throw new Error(`Issue #611 class set mismatch: ${CLASSES.join(",")}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeRawJsonl(rows, rawPath) {
  const hash = createHash("sha256");
  async function* lines() {
    for (const row of rows) {
      const line = `${JSON.stringify(row)}\n`;
      hash.update(line);
      yield line;
    }
  }

  await pipeline(lines(), createWriteStream(fileURLToPath(rawPath)));
  return hash.digest("hex");
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
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

export function generateSharedRunFloor(args) {
  return generateSharedRunFloorSource(args);
}

function exact(actual, expected) {
  return Object.is(actual, expected);
}

function assertExact(actual, expected, label) {
  if (!exact(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertTelemetryShape(telemetry, runLabel) {
  if (!telemetry) throw new Error(`missing combatFormula telemetry: ${runLabel}`);
  for (const key of TELEMETRY_ARRAYS) {
    if (!Array.isArray(telemetry[key])) {
      throw new Error(`missing telemetry array ${key}: ${runLabel}`);
    }
  }
}

function assertFormulaTelemetry(telemetry, runLabel) {
  telemetry.physicalPlayerHits.forEach((hit, index) => {
    const label = `${runLabel} player physical #${index}`;
    const weaponTerm = hit.weaponAtk * 1.5;
    const buffTerm = hit.buffAtk * 1.5;
    const strTerm = hit.str - 10;
    const randTerm = hit.randRoll;
    const defTerm = -Math.floor(hit.def / 2);
    const listedSum = weaponTerm + buffTerm + strTerm + randTerm + defTerm;
    const sourceGrouping = (hit.weaponAtk + hit.buffAtk) * 1.5 +
      strTerm + randTerm + defTerm;
    assertExact(listedSum, sourceGrouping, `${label} additive decomposition`);
    assertExact(listedSum * hit.meleeMod, hit.formulaRaw, `${label} formulaRaw`);
    assertExact(Math.max(1, Math.floor(hit.formulaRaw)), hit.formulaDmg, `${label} formulaDmg`);
  });

  telemetry.physicalMonsterHits.forEach((hit, index) => {
    const label = `${runLabel} monster physical #${index}`;
    assertExact(hit.finalAtk - hit.finalDef, hit.formulaRaw, `${label} formulaRaw`);
    assertExact(Math.max(1, hit.formulaRaw), hit.formulaDmg, `${label} formulaDmg`);
    if (hit.preDefDmg !== undefined) {
      assertExact(hit.finalAtk, hit.preDefDmg, `${label} preDefDmg`);
    }
  });

  telemetry.spellHits.forEach((hit, index) => {
    const label = `${runLabel} player spell #${index}`;
    if (!Number.isFinite(hit.damageBeforeMagicResist)) {
      throw new Error(`${label} missing damageBeforeMagicResist`);
    }
    if (!Number.isFinite(hit.damage)) {
      throw new Error(`${label} missing damage`);
    }
  });

  telemetry.spellMonsterHits.forEach((hit, index) => {
    const label = `${runLabel} monster spell #${index}`;
    if (!Number.isFinite(hit.damageBeforeMitigation) || !Number.isFinite(hit.damage)) {
      throw new Error(`${label} missing before/after damage`);
    }
    const call = telemetry.mitigationCalls.find(callItem => callItem.id === hit.callId);
    if (!call) throw new Error(`${label} missing mitigation call ${hit.callId}`);
    assertExact(hit.damageBeforeMitigation, call.before, `${label} before`);
    assertExact(hit.damage, call.after, `${label} after`);
  });
}

export function runIssue611Task(task, context) {
  const scenario = getScenarioById(task.scenarioId);
  const scoringProfile = context.scoringProfiles[task.scenarioId];
  if (!scoringProfile) throw new Error(`missing scoring profile: ${task.scenarioId}`);

  const randomSequenceId = `${task.scenarioId}:${task.className}:${task.runIndex}`;
  resetSimulationRandom(hashSeed(`${process.env.SIM_SEED}:issue611:${randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue611-combat-formula",
    scoringProfile,
    scenario,
    workshop: scenario.workshop,
    collectCombatFormula: true
  });
  const combatFormula = result.combatFormula;
  const runLabel = `${task.scenarioId}:${task.className}:${task.runIndex}`;
  assertTelemetryShape(combatFormula, runLabel);
  assertFormulaTelemetry(combatFormula, runLabel);

  return {
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    combatFormula
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { successes, trials, estimate: null, low: null, high: null, status: "未観測" };
  }
  const p = successes / trials;
  const denominator = 1 + R95 ** 2 / trials;
  const center = (p + R95 ** 2 / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    p * (1 - p) / trials + R95 ** 2 / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    status: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function numericSummary(values) {
  if (values.length === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const mean = sum / values.length;
  const variance = values.reduce(
    (total, value) => total + (value - mean) ** 2,
    0
  ) / values.length;
  return {
    count: values.length,
    min,
    max,
    mean,
    p10: quantile(values, 0.10),
    p50: quantile(values, 0.50),
    p90: quantile(values, 0.90),
    standardDeviation: Math.sqrt(variance),
    cv: mean === 0 ? null : Math.sqrt(variance) / Math.abs(mean)
  };
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatRate(stat, reached = null) {
  if (stat.estimate === null) return "未観測（N=0; CIなし）";
  const status = reached !== null && reached < 30
    ? "; 未確定（到達run N<30）"
    : stat.status === "確定" ? "" : `; ${stat.status}`;
  return `${(stat.estimate * 100).toFixed(1)}% ` +
    `[${(stat.low * 100).toFixed(1)}, ${(stat.high * 100).toFixed(1)}] ` +
    `(${stat.successes}/${stat.trials})${status}`;
}

function sampleStatus(count, reached = null) {
  if (reached === 0) return "到達しない（観測N=0）";
  if (reached !== null && reached < 30) return "未確定（到達run N<30）";
  return count < 30 ? "未確定（N<30）" : "確定";
}

function ratioStatus(leftCount, rightCount, reached = null) {
  if (reached === 0) return "到達しない（観測N=0）";
  if (reached !== null && reached < 30) return "未確定（到達run N<30）";
  return leftCount < 30 || rightCount < 30
    ? "未確定（N<30）"
    : "確定";
}

function classRowsByName(rows) {
  return Object.fromEntries(
    CLASSES.map(className => [className, rows.filter(row => row.className === className)])
  );
}

function runsAtFloor(rows, className, floor) {
  const classRows = rows[className];
  return {
    all: classRows.length,
    reached: classRows.filter(row => row.reachedFloor >= floor).length
  };
}

function eventsAt(rows, className, floor, property, eventClassKey = null) {
  const events = [];
  for (const row of rows[className]) {
    for (const event of row.combatFormula[property]) {
      if (event.floor !== floor) continue;
      if (eventClassKey && event[eventClassKey] !== className) continue;
      events.push(event);
    }
  }
  return events;
}

function allEventsAt(rows, floor, property, eventClassKey = null) {
  return CLASSES.flatMap(className =>
    eventsAt(rows, className, floor, property, eventClassKey)
  );
}

function summarizeDamageEvents(events, valueKey = "damage") {
  return numericSummary(events.map(event => event[valueKey]));
}

function renderReachabilityTable(lines, rows) {
  lines.push(
    "## 到達率（N設計の根拠）",
    "",
    "到達runは `reachedFloor >= 階層`。到達run=0は「N不足」ではなく、この測定条件で観測上到達しないと表記する。到達runが1以上で30未満のセルは未確定のまま残す。",
    "",
    "| 階層 | 職業 | 全run N | 到達run N | 到達率（Wilson 95% CI） | 判定 |",
    "| --- | --- | ---: | ---: | --- | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of CLASSES) {
      const denominator = runsAtFloor(rows, className, floor);
      const status = denominator.reached === 0
        ? "到達しない（観測N=0）"
        : denominator.reached < 30
          ? "未確定（到達run N<30）"
          : "到達run N≥30";
      lines.push(
        `| B${floor} | ${CLASS_LABELS[className]} | ${denominator.all} | ${denominator.reached} | ` +
        `${formatRate(wilson(denominator.reached, denominator.all))} | ${status} |`
      );
    }
  }
  lines.push("");
}

function renderDamageTable(lines, rows, title, property, eventClassKey, valueKey) {
  lines.push(
    `### ${title}`,
    "",
    "各セルは同じ `simulateRun` の計装結果。全run分母・到達run分母・攻撃回数分母を分離し、平均にp10/p50/p90/CVを併記する。",
    "",
    "| 階層 | 職業 | 全run N | 到達run N | 攻撃 N | 平均 | p10 | p50（中央値） | p90 | CV | 判定 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of CLASSES) {
      const denominator = runsAtFloor(rows, className, floor);
      const events = eventsAt(rows, className, floor, property, eventClassKey);
      const stats = summarizeDamageEvents(events, valueKey);
      lines.push(
        `| B${floor} | ${CLASS_LABELS[className]} | ${denominator.all} | ${denominator.reached} | ${events.length} | ` +
        `${formatNumber(stats?.mean)} | ${formatNumber(stats?.p10)} | ${formatNumber(stats?.p50)} | ` +
        `${formatNumber(stats?.p90)} | ${formatNumber(stats?.cv, 3)} | ` +
        `${sampleStatus(events.length, denominator.reached)} |`
      );
    }
  }
  lines.push("");
}

function playerDefObservation(hit) {
  const withoutDefRaw = (hit.weaponAtk + hit.buffAtk) * 1.5 +
    (hit.str - 10) + hit.randRoll;
  const withoutDef = Math.max(1, Math.floor(withoutDefRaw * hit.meleeMod));
  return {
    before: withoutDef,
    after: hit.formulaDmg,
    ratio: hit.formulaDmg / withoutDef
  };
}

function playerSpellObservation(hit) {
  return {
    before: hit.damageBeforeMagicResist,
    after: hit.damage,
    ratio: hit.damageBeforeMagicResist > 0
      ? hit.damage / hit.damageBeforeMagicResist
      : null
  };
}

function monsterDefObservation(hit) {
  const withoutDef = Math.max(1, hit.finalAtk);
  return {
    before: withoutDef,
    after: hit.formulaDmg,
    ratio: hit.formulaDmg / withoutDef
  };
}

function monsterSpellObservation(hit) {
  return {
    before: hit.damageBeforeMitigation,
    after: hit.damage,
    ratio: hit.damageBeforeMitigation > 0
      ? hit.damage / hit.damageBeforeMitigation
      : null
  };
}

function renderDefTable(
  lines,
  rows,
  title,
  property,
  eventClassKey,
  observation,
  description
) {
  lines.push(
    `### ${title}`,
    "",
    description,
    "",
    "| 階層 | 職業 | 全run N | 到達run N | 攻撃 N | 軽減前平均 | 軽減後平均 | 軽減後/前 | 実効軽減率 | 判定 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of CLASSES) {
      const denominator = runsAtFloor(rows, className, floor);
      const observations = eventsAt(rows, className, floor, property, eventClassKey)
        .map(observation);
      const before = numericSummary(observations.map(value => value.before));
      const after = numericSummary(observations.map(value => value.after));
      const ratio = numericSummary(
        observations
          .map(value => value.ratio)
          .filter(Number.isFinite)
      );
      lines.push(
        `| B${floor} | ${CLASS_LABELS[className]} | ${denominator.all} | ${denominator.reached} | ${observations.length} | ` +
        `${formatNumber(before?.mean)} | ${formatNumber(after?.mean)} | ${formatNumber(ratio?.mean, 3)} | ` +
        `${formatNumber(ratio ? 1 - ratio.mean : null, 3)} | ` +
        `${sampleStatus(observations.length, denominator.reached)} |`
      );
    }
  }
  lines.push("");
}

function renderDamageRatioTable(lines, rows) {
  lines.push(
    "## 3. 物理と魔法の実ダメージ比",
    "",
    "比は同階層・同職の平均実ダメージ `魔法/物理`。物理N・魔法Nは攻撃回数分母、全run/到達runも併記する。",
    "",
    "| 階層 | 職業 | 全run N | 到達run N | 物理 N | 魔法 N | 物理平均 | 魔法平均 | 魔法/物理 | 判定 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of CLASSES) {
      const denominator = runsAtFloor(rows, className, floor);
      const physical = summarizeDamageEvents(
        eventsAt(rows, className, floor, "physicalPlayerHits", "className")
      );
      const magic = summarizeDamageEvents(
        eventsAt(rows, className, floor, "spellHits", "casterClass")
      );
      const ratio = physical?.mean > 0 && magic
        ? magic.mean / physical.mean
        : null;
      lines.push(
        `| B${floor} | ${CLASS_LABELS[className]} | ${denominator.all} | ${denominator.reached} | ` +
        `${physical?.count || 0} | ${magic?.count || 0} | ${formatNumber(physical?.mean)} | ` +
        `${formatNumber(magic?.mean)} | ${formatNumber(ratio, 3)} | ` +
        `${ratioStatus(physical?.count || 0, magic?.count || 0, denominator.reached)} |`
      );
    }
  }
  lines.push(
    "",
    "### 魔術師: 通常攻撃 vs 呪文",
    "",
    "上表の Mage 行を、比較対象が一意になるよう再掲する。",
    "",
    "| 階層 | 全run N | 到達run N | 通常攻撃N | 呪文N | 通常攻撃平均 | 呪文平均 | 呪文/通常攻撃 | 判定 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    const denominator = runsAtFloor(rows, "Mage", floor);
    const physical = summarizeDamageEvents(
      eventsAt(rows, "Mage", floor, "physicalPlayerHits", "className")
    );
    const magic = summarizeDamageEvents(
      eventsAt(rows, "Mage", floor, "spellHits", "casterClass")
    );
    const ratio = physical?.mean > 0 && magic ? magic.mean / physical.mean : null;
    lines.push(
      `| B${floor} | ${denominator.all} | ${denominator.reached} | ${physical?.count || 0} | ` +
      `${magic?.count || 0} | ${formatNumber(physical?.mean)} | ${formatNumber(magic?.mean)} | ` +
      `${formatNumber(ratio, 3)} | ` +
      `${ratioStatus(physical?.count || 0, magic?.count || 0, denominator.reached)} |`
    );
  }
  lines.push("");
}

function renderMagicBoltTable(lines, rows) {
  lines.push(
    "### magicBolt の実発動",
    "",
    "分母は Mage/Bishop の通常物理攻撃回数。`magicBoltUsed` は下駄が式ダメージを実際に上回った回数で、Wilson 95% CIを付ける。",
    "",
    "| 階層 | 職業 | 全run N | 到達run N | 物理攻撃 N | 発動 N | 発動率（Wilson 95% CI） |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of ["Mage", "Bishop"]) {
      const denominator = runsAtFloor(rows, className, floor);
      const hits = eventsAt(rows, className, floor, "physicalPlayerHits", "className");
      const boltCount = hits.filter(hit => hit.magicBoltUsed).length;
      lines.push(
        `| B${floor} | ${CLASS_LABELS[className]} | ${denominator.all} | ${denominator.reached} | ` +
        `${hits.length} | ${boltCount} | ${formatRate(wilson(boltCount, hits.length), denominator.reached)} |`
      );
    }
  }
  lines.push("");
}

function contributionFor(hit) {
  const terms = {
    weapon: hit.weaponAtk * 1.5,
    buff: hit.buffAtk * 1.5,
    str: hit.str - 10,
    rand: hit.randRoll,
    def: -Math.floor(hit.def / 2)
  };
  return { ...terms, formulaRaw: hit.formulaRaw };
}

function renderContributionTable(lines, rows) {
  lines.push(
    "## 4. 物理ダメージの項別寄与",
    "",
    "値は計装された通常物理攻撃の式の加算項平均。`buffAtk*1.5` は現行式に存在するため併記し、`meleeMod` は別表で確認する。攻撃Nは各セルの分母。",
    "",
    "| 階層 | 職業 | 攻撃 N | weaponAtk×1.5 | buffAtk×1.5 | str−10 | randRoll | −floor(def/2) | formulaRaw | 判定 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of CLASSES) {
      const events = eventsAt(rows, className, floor, "physicalPlayerHits", "className");
      const denominator = runsAtFloor(rows, className, floor);
      const contributions = events.map(contributionFor);
      const summaries = Object.fromEntries(
        ["weapon", "buff", "str", "rand", "def", "formulaRaw"].map(key => [
          key,
          numericSummary(contributions.map(value => value[key]))
        ])
      );
      lines.push(
        `| B${floor} | ${CLASS_LABELS[className]} | ${events.length} | ` +
        `${formatNumber(summaries.weapon?.mean)} | ${formatNumber(summaries.buff?.mean)} | ` +
        `${formatNumber(summaries.str?.mean)} | ${formatNumber(summaries.rand?.mean)} | ` +
        `${formatNumber(summaries.def?.mean)} | ${formatNumber(summaries.formulaRaw?.mean)} | ` +
        `${sampleStatus(events.length, denominator.reached)} |`
      );
    }
  }
  lines.push(
    "",
    "### meleeMod 実測値",
    "",
    "分母は通常物理攻撃回数。点推定が1.00に一致する場合は「差が無い」ではなく、測定条件で職業効果が発生していないと読む。",
    "",
    "| 職業 | 攻撃 N | 平均 | 観測値（重複除外） | 判定 |",
    "| --- | ---: | ---: | --- | --- |"
  );
  for (const className of CLASSES) {
    const events = TARGET_FLOORS.flatMap(floor =>
      eventsAt(rows, className, floor, "physicalPlayerHits", "className")
    );
    const summary = numericSummary(events.map(event => event.meleeMod));
    const observed = [...new Set(events.map(event => event.meleeMod))]
      .sort((left, right) => left - right)
      .map(value => formatNumber(value, 3))
      .join(", ") || "—";
    lines.push(
      `| ${CLASS_LABELS[className]} | ${events.length} | ${formatNumber(summary?.mean, 3)} | ${observed} | ` +
      `${sampleStatus(events.length)} |`
    );
  }
  lines.push("");
}

function renderCriticalTable(lines, rows) {
  lines.push(
    "## 5. 会心・特効・軽減の発動",
    "",
    "### 忍者の会心",
    "",
    "分母は非ボスで会心判定を実行した通常物理攻撃回数（`criticalChance !== null`）。",
    "",
    "| 階層 | 会心判定N | 会心N | 会心率（Wilson 95% CI） |",
    "| --- | ---: | ---: | --- |"
  );
  for (const floor of TARGET_FLOORS) {
    const denominator = runsAtFloor(rows, "Ninja", floor);
    const hits = eventsAt(rows, "Ninja", floor, "physicalPlayerHits", "className")
      .filter(hit => hit.criticalChance !== null);
    const criticals = hits.filter(hit => hit.isCritical).length;
    lines.push(
      `| B${floor} | ${hits.length} | ${criticals} | ` +
      `${formatRate(wilson(criticals, hits.length), denominator.reached)} |`
    );
  }
  lines.push("");
}

function renderTargetedBonusTable(lines, rows) {
  lines.push(
    "### applyTargetedDamageBonus（タグ特効・コアaffix）",
    "",
    "分母は同階層・同職の通常物理攻撃回数。特効Nは実際にダメージが変化して記録された発動回数。deltaはafter−beforeの合計。",
    "",
    "| 階層 | 職業 | 種別 | 攻撃N | 発動N | 発動率（Wilson 95% CI） | delta合計 |",
    "| --- | --- | --- | ---: | ---: | --- | ---: |"
  );
  for (const floor of TARGET_FLOORS) {
    for (const className of CLASSES) {
      const denominator = runsAtFloor(rows, className, floor);
      const attacks = eventsAt(rows, className, floor, "physicalPlayerHits", "className");
      const bonuses = eventsAt(rows, className, floor, "targetedBonuses")
        .filter(event => TARGETED_TYPES.includes(event.type));
      for (const type of TARGETED_TYPES) {
        const events = bonuses.filter(event => event.type === type);
        const delta = events.reduce((sum, event) => sum + event.after - event.before, 0);
        lines.push(
          `| B${floor} | ${CLASS_LABELS[className]} | ${type} | ${attacks.length} | ${events.length} | ` +
          `${formatRate(wilson(events.length, attacks.length), denominator.reached)} | ${delta} |`
        );
      }
    }
  }
  lines.push("");
}

function renderMitigationTable(lines, rows) {
  lines.push(
    "### reduceIncomingDamage 各段",
    "",
    "分母は `reduceIncomingDamage` 呼出し回数。段のdeltaはその段の観測before−after合計。spellGuardとmabarrierが同時発動した場合、実装は合算して1回だけ変換するため、両行のdeltaは同じ合算段を示す。全段の合計は下のcall単位表で重複を除く。",
    "",
    "| 階層 | 段 | reduce呼出しN | 発動N | 発動率（Wilson 95% CI） | 観測delta合計 |",
    "| --- | --- | ---: | ---: | --- | ---: |"
  );
  for (const floor of TARGET_FLOORS) {
    const calls = allEventsAt(rows, floor, "mitigationCalls");
    const reached = CLASSES.reduce(
      (sum, className) => sum + runsAtFloor(rows, className, floor).reached,
      0
    );
    for (const type of MITIGATION_TYPES) {
      const events = allEventsAt(rows, floor, "mitigations")
        .filter(event => event.type === type);
      const delta = events.reduce((sum, event) => sum + event.before - event.after, 0);
      lines.push(
        `| B${floor} | ${type} | ${calls.length} | ${events.length} | ` +
        `${formatRate(wilson(events.length, calls.length), reached)} | ${formatNumber(delta)} |`
      );
    }
  }
  lines.push(
    "",
    "### reduceIncomingDamage の実軽減量（call単位）",
    "",
    "同一呼出し内の各段を重複計上しない。`増加` はmagicVulnerable/thinIcePact等のbefore−afterが負の観測値。",
    "",
    "| 階層 | reduce呼出しN | 軽減が起きたcall N | 実軽減量合計 | 増加量合計 |",
    "| --- | ---: | ---: | ---: | ---: |"
  );
  for (const floor of TARGET_FLOORS) {
    const calls = allEventsAt(rows, floor, "mitigationCalls");
    const reductions = calls.filter(call => call.after < call.before);
    const reduction = calls.reduce(
      (sum, call) => sum + Math.max(0, call.before - call.after),
      0
    );
    const increase = calls.reduce(
      (sum, call) => sum + Math.max(0, call.after - call.before),
      0
    );
    lines.push(
      `| B${floor} | ${calls.length} | ${reductions.length} | ${reduction} | ${increase} |`
    );
  }
  lines.push("");
}

function canonicalEnvironment(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

function environmentForHash() {
  return {
    ...getResolvedSimulationEnv(),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_SKIP_PROVENANCE: "<omitted>",
    ISSUE611_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE611_RUNS_PER_CLASS: String(RUNS_PER_CLASS),
    ISSUE611_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    ISSUE611_CLASSES: CLASSES.join(","),
    ISSUE611_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([scenarioId, count]) => `${scenarioId}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    ISSUE611_SCENARIOS: SCENARIO_IDS.join(","),
    ISSUE611_MANUAL_RANDOM_SEQUENCE: "hash(SIM_SEED:issue611:scenarioId:className:runIndex)",
    ISSUE611_TELEMETRY: TELEMETRY_ARRAYS.join(",")
  };
}

function buildTasks() {
  return CLASSES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  );
}

function calibrateProfiles() {
  const scoringProfiles = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return scoringProfiles;
}

async function measure(scoringProfiles) {
  const tasks = buildTasks();
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue611Task",
    runTask: runIssue611Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const cpu = process.cpuUsage(cpuStarted);
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const keys = new Set();
  rows.forEach(row => {
    const key = `${row.className}:${row.runIndex}:${row.scenarioId}`;
    if (keys.has(key)) throw new Error(`duplicate run key: ${key}`);
    keys.add(key);
    if (Number(row.survived) + Number(row.died) !== 1) {
      throw new Error(`non-terminal run result: ${JSON.stringify(row)}`);
    }
  });
  return {
    rows,
    resolvedParallelism,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

function renderMarkdown({
  rows,
  environment,
  envHash,
  provenance,
  calibration,
  measurement,
  rawPath,
  rawSha256
}) {
  const classRows = classRowsByName(rows);
  const lines = [
    "# Issue #611 戦闘計算式の実態測定",
    "",
    `実行モード: ${SMOKE ? "smoke（8職×N=1、workshop-completeのみ）" : "full（8職×N=5,000）"}。`,
    `target depth: B${TARGET_DEPTH}（出力対象B1〜B10）。各メトリクスは同一runの計装から集計し、メトリクスごとの回し直しはしない。`,
    "設計変更・バランス変更は行わない。基準線はPR #607以降。",
    "N<30のセル（平均・比・率・内訳）は未確定として結論に使わない。点推定がビット単位で一致する場合は「効果が発生していない」と読む。",
    ""
  ];

  renderReachabilityTable(lines, classRows);
  lines.push("## 1. プレイヤー→敵のダメージ分布", "");
  renderDamageTable(
    lines,
    classRows,
    "物理ダメージ（通常物理攻撃）",
    "physicalPlayerHits",
    "className",
    "damage"
  );
  renderDamageTable(
    lines,
    classRows,
    "魔法ダメージ（攻撃呪文）",
    "spellHits",
    "casterClass",
    "damage"
  );

  lines.push("## 2. def・魔法耐性の実効軽減率", "");
  renderDefTable(
    lines,
    classRows,
    "プレイヤー→敵（物理式のdef項）",
    "physicalPlayerHits",
    "className",
    playerDefObservation,
    "軽減前は計装値からdef項だけを外したクランプ後、軽減後は実装の `formulaDmg`。比は軽減後/軽減前、実効軽減率は1−比。"
  );
  renderDefTable(
    lines,
    classRows,
    "敵→プレイヤー（finalAtk−finalDef）",
    "physicalMonsterHits",
    "targetClassName",
    monsterDefObservation,
    "軽減前は `finalAtk` のクランプ後、軽減後は実装の `formulaDmg`。比は軽減後/軽減前、実効軽減率は1−比。"
  );
  renderDefTable(
    lines,
    classRows,
    "プレイヤー→敵（magicResistの乗算）",
    "spellHits",
    "casterClass",
    playerSpellObservation,
    "軽減前は呪文効果のaffix適用後・`magicResist` 適用直前、軽減後は実装の最終ダメージ。比は軽減後/軽減前、実効軽減率は1−比。"
  );
  renderDefTable(
    lines,
    classRows,
    "敵→プレイヤー（呪文のreduceIncomingDamage）",
    "spellMonsterHits",
    "targetClassName",
    monsterSpellObservation,
    "軽減前は敵呪文の `reduceIncomingDamage` 呼出し直前、軽減後は同関数の戻り値。比は軽減後/軽減前、実効軽減率は1−比。"
  );

  renderDamageRatioTable(lines, classRows);
  renderMagicBoltTable(lines, classRows);
  renderContributionTable(lines, classRows);
  renderCriticalTable(lines, classRows);
  renderTargetedBonusTable(lines, classRows);
  renderMitigationTable(lines, classRows);

  lines.push(
    "## 固定条件・出自・再現",
    "",
    `- source commit: \`${provenance.sourceCommit}\``,
    `- origin/main ancestor: \`${provenance.originMainAncestor}\`; stale tree allowed: \`${provenance.staleTreeAllowed}\``,
    `- calibration: N=${CALIBRATION_RUNS}/scenario; ${calibration.wallSeconds.toFixed(3)}s wall, ` +
      `${calibration.cpuSeconds.toFixed(3)}s CPU; profile SHA-256 \`${calibration.sha256}\``,
    `- simulation: ${measurement.wallSeconds.toFixed(3)}s wall, ${measurement.cpuSeconds.toFixed(3)}s CPU; ` +
      `resolved parallelism=${measurement.resolvedParallelism}`,
    `- raw JSONL: \`${rawPath}\`; SHA-256 \`${rawSha256}\`（rawはgitignore対象）`,
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` / `SIM_SKIP_PROVENANCE` は未設定（runnerの既定値を使用）。",
    "- `node --check scratch/sim_issue_611_combat_formula.js` とN=1 smokeを本測定前に実行する。",
    "",
    "固定env（hash対象）:",
    "",
    "```text",
    canonicalEnvironment(environment).trimEnd(),
    "```",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_611_combat_formula.js",
    "ISSUE611_SMOKE=1 node scratch/sim_issue_611_combat_formula.js",
    "node scratch/sim_issue_611_combat_formula.js",
    "```",
    "",
    `env hash: \`${envHash}\``,
    ""
  );
  return lines.join("\n");
}

async function main() {
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibration = {
    wallSeconds: (performance.now() - calibrationStarted) / 1000,
    cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    sha256: sha256(JSON.stringify(scoringProfiles))
  };
  const measurement = await measure(scoringProfiles);
  const environment = environmentForHash();
  const envHash = sha256(canonicalEnvironment(environment));
  const provenance = MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const rawPath = new URL(`${RESULT_BASENAME}.jsonl`, resultDir);
  const rawSha256 = await writeRawJsonl(measurement.rows, rawPath);
  const markdown = renderMarkdown({
    rows: measurement.rows,
    environment,
    envHash,
    provenance,
    calibration,
    measurement,
    rawPath: fileURLToPath(rawPath),
    rawSha256
  });
  const markdownPath = new URL(`${RESULT_BASENAME}.md`, resultDir);
  writeFileSync(markdownPath, `${markdown}\n`);

  const totals = CLASSES.map(className => {
    const classRows = measurement.rows.filter(row => row.className === className);
    return {
      className,
      physical: classRows.reduce((sum, row) => sum + row.combatFormula.physicalPlayerHits.length, 0),
      monster: classRows.reduce((sum, row) => sum + row.combatFormula.physicalMonsterHits.length, 0),
      spells: classRows.reduce((sum, row) => sum + row.combatFormula.spellHits.length, 0),
      monsterSpells: classRows.reduce((sum, row) => sum + row.combatFormula.spellMonsterHits.length, 0),
      mitigations: classRows.reduce((sum, row) => sum + row.combatFormula.mitigations.length, 0)
    };
  });
  console.log(`summary: ${fileURLToPath(markdownPath)}`);
  console.log(`summary SHA-256: ${sha256(`${markdown}\n`)}`);
  console.log(`raw JSONL: ${fileURLToPath(rawPath)}`);
  console.log(`raw SHA-256: ${rawSha256}`);
  console.log(`env hash: ${envHash}`);
  console.log(`rows: ${measurement.rows.length}; parallelism: ${measurement.resolvedParallelism}`);
  console.log(`telemetry totals: ${JSON.stringify(totals)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error?.stack || error);
    process.exit(1);
  }
}
