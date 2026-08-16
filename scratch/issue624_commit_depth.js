/* global console, process */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

import { ISSUE612_FIXED_ENV } from "./issue612_exp_pace_env.js";
import { hashEnvSignature } from "./measurement_env_signature.js";

const SCRIPT_DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const WORKER_SCRIPT = join(SCRIPT_DIR, "sim_commit_depth_624.js");
const RESULT_DIR = join(SCRIPT_DIR, "results");
const RAW_PATH = join(RESULT_DIR, "issue-624-commit-depth.raw.jsonl");
const SUMMARY_PATH = join(RESULT_DIR, "issue-624-commit-depth.md");
const RAW_RELATIVE_PATH = "scratch/results/issue-624-commit-depth.raw.jsonl";
const SMOKE = process.env.ISSUE624_SMOKE === "1";
const RUNS_PER_CLASS = SMOKE ? 1 : 500;
const CALIBRATION_RUNS = SMOKE ? 1 : 100;
const TARGET_DEPTH = 21;
const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({
  Fighter: "Fighter (戦士)",
  Thief: "Thief (盗賊)",
  Priest: "Priest (僧侶)",
  Mage: "Mage (魔術師)"
});
const SCENARIOS = Object.freeze(
  SMOKE
    ? ["workshop-complete"]
    : [
        "workshop-empty",
        "workshop-stats",
        "workshop-gear",
        "workshop-blood-wand",
        "workshop-blood-wand-spells",
        "workshop-complete"
      ]
);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const DEPTH_BANDS = Object.freeze([
  ["B1–4", 1, 4],
  ["B5–9", 5, 9],
  ["B10–14", 10, 14],
  ["B15+", 15, TARGET_DEPTH]
]);
const Z95 = 1.959963984540054;
// #624 uses the current depth-sim seed, not the historical #612 seed. Keep
// the other fixed environment values identical to the #612 baseline so the
// only condition changes remain portal/flee policy overrides.
const BASE_ENV = Object.freeze({
  ...ISSUE612_FIXED_ENV,
  SIM_SEED: "231",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100"
});
const BASE_DEPARTURE_CRAFT_IDS = BASE_ENV.DEPARTURE_CRAFT_IDS;
const NO_PORTAL_DEPARTURE_CRAFT_IDS = BASE_DEPARTURE_CRAFT_IDS
  .split(",")
  .filter(itemId => itemId !== "TOWN_PORTAL")
  .join(",");

const CONDITIONS = Object.freeze([
  {
    id: "baseline-portal-flee",
    label: "既定：翼あり・逃走あり",
    overrides: {}
  },
  {
    id: "no-departure-portal",
    label: "翼なし出発・逃走あり",
    overrides: {
      DEPARTURE_CRAFT_IDS: NO_PORTAL_DEPARTURE_CRAFT_IDS
    }
  },
  {
    id: "portal-unused",
    label: "翼所持・PORTAL_HP_THRESHOLD=0・逃走あり",
    overrides: {
      PORTAL_HP_THRESHOLD: "0"
    }
  },
  {
    id: "no-portal-no-flee",
    label: "翼なし出発・逃走なし",
    overrides: {
      DEPARTURE_CRAFT_IDS: NO_PORTAL_DEPARTURE_CRAFT_IDS,
      FLEE_POLICY: "never"
    }
  }
]);

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeBaseEnv() {
  const env = { ...BASE_ENV };
  if (SMOKE) {
    env.SIM_RUNS = "1";
    env.SIM_CALIBRATION_RUNS = "1";
    env.SIM_SCENARIOS = "workshop-complete";
  }
  return env;
}

function makeChildEnv(condition) {
  const env = { ...process.env };
  const controlledKeys = new Set([
    ...Object.keys(ISSUE612_FIXED_ENV),
    "SIM_PRESET",
    "SIM_PARALLEL",
    "SIM_MAP_CACHE_ENTRIES",
    "SIM_SKIP_PROVENANCE",
    "SIM_ALLOW_STALE_TREE",
    "TRAP_BONUS_OVERRIDE",
    "TRAP_SENSE_OVERRIDE"
  ]);
  controlledKeys.forEach(key => delete env[key]);
  Object.assign(env, makeBaseEnv(), condition.overrides, {
    ISSUE624_CONDITION_ID: condition.id,
    ISSUE624_SMOKE: SMOKE ? "1" : "0"
  });
  // These are deliberately omitted, not set to a value.
  delete env.SIM_PARALLEL;
  delete env.SIM_MAP_CACHE_ENTRIES;
  delete env.SIM_SKIP_PROVENANCE;
  delete env.SIM_ALLOW_STALE_TREE;
  return env;
}

function relevantEnvironment(env, condition) {
  const keys = new Set([
    ...Object.keys(BASE_ENV),
    ...Object.keys(condition.overrides),
    "SIM_EXPLORATION_FACTOR",
    "SIM_MAP_STATS",
    "SIM_DAMAGE_PROBE"
  ]);
  return Object.fromEntries(
    [...keys].sort().map(key => [key, env[key] ?? null])
  );
}

function environmentSignature(env, condition, sourceCommit, baseCommit) {
  return {
    issue: 624,
    sourceCommit,
    baseCommit,
    runner: "scratch/issue624_commit_depth.js -> scratch/sim_commit_depth_624.js",
    sim: "scratch/sim_depth_material_ev.js",
    conditionId: condition.id,
    seed: Number(env.SIM_SEED),
    runsPerClass: Number(env.SIM_RUNS),
    calibrationRuns: Number(env.SIM_CALIBRATION_RUNS),
    targetDepth: TARGET_DEPTH,
    classes: CLASSES,
    scenarios: SCENARIOS,
    workshopDistribution: WORKSHOP_DISTRIBUTION,
    randomSequence: "hashSeed(`${SIM_SEED}:issue612:${scenarioId}:${className}:${runIndex}`)",
    environment: relevantEnvironment(env, condition),
    SIM_PARALLEL: "omitted; runtime default",
    SIM_MAP_CACHE_ENTRIES: "omitted; runtime default 1024"
  };
}

function runCondition(condition, sourceCommit, baseCommit) {
  const env = makeChildEnv(condition);
  const signature = environmentSignature(env, condition, sourceCommit, baseCommit);
  const envHash = hashEnvSignature(signature);
  console.error(`[624] ${condition.id}: start envHash=${envHash}`);
  const child = spawnSync(process.execPath, [WORKER_SCRIPT], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024
  });
  if (child.error || child.status !== 0) {
    const stderr = String(child.stderr || "").trim().split("\n").slice(-30).join("\n");
    throw new Error(
      `${condition.id} failed (status=${child.status}): ${child.error?.message || stderr}`
    );
  }
  const lines = String(child.stdout || "").trim().split("\n").filter(Boolean);
  const result = JSON.parse(lines.at(-1));
  if (result.conditionId !== condition.id) {
    throw new Error(`condition id mismatch: ${result.conditionId}/${condition.id}`);
  }
  console.error(
    `[624] ${condition.id}: done rows=${result.rows.length}, ` +
    `parallelism=${result.resolvedParallelism}, ` +
    `wall=${result.measurement.wallSeconds.toFixed(1)}s`
  );
  return {
    condition,
    env,
    signature,
    envHash,
    result
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return {
      successes,
      trials,
      estimate: null,
      low: null,
      high: null,
      status: "未観測"
    };
  }
  const p = successes / trials;
  const denominator = 1 + Z95 ** 2 / trials;
  const center = (p + Z95 ** 2 / (2 * trials)) / denominator;
  const halfWidth = Z95 * Math.sqrt(
    p * (1 - p) / trials + Z95 ** 2 / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    status: trials < 30 ? "N不足" : "確定"
  };
}

function meanCI(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return {
      n: 0,
      estimate: null,
      low: null,
      high: null,
      status: "未観測"
    };
  }
  const estimate = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (finite.length < 2) {
    return {
      n: finite.length,
      estimate,
      low: null,
      high: null,
      status: "N不足"
    };
  }
  const variance = finite.reduce(
    (sum, value) => sum + (value - estimate) ** 2,
    0
  ) / (finite.length - 1);
  const margin = Z95 * Math.sqrt(variance / finite.length);
  return {
    n: finite.length,
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    status: finite.length < 30 ? "N不足" : "確定"
  };
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatMean(stat, digits = 2) {
  if (!stat || stat.n === 0 || stat.estimate === null) return "未観測";
  const ci = stat.low === null
    ? "CIなし"
    : `[${formatNumber(stat.low, digits)}, ${formatNumber(stat.high, digits)}]`;
  return `${formatNumber(stat.estimate, digits)} ${ci}; N=${stat.n}${stat.status === "N不足" ? "; N不足" : ""}`;
}

function formatRate(stat, digits = 1) {
  if (!stat || stat.trials === 0 || stat.estimate === null) return "未観測";
  return `${formatNumber(stat.estimate * 100, digits)}% [` +
    `${formatNumber(stat.low * 100, digits)}%, ${formatNumber(stat.high * 100, digits)}%; ` +
    `${stat.successes}/${stat.trials}${stat.status === "N不足" ? "; N不足" : ""}]`;
}

function valuesAt(rows, selector) {
  return rows.map(selector).filter(Number.isFinite);
}

function causeBucket(row) {
  const type = String(row.deathEncounterType || "");
  const cause = String(row.deathCause || row.deathSnapshot?.cause || "");
  if (type.includes("trap") || cause.includes("罠")) return "trap";
  if (type === "boss" || type === "midboss") return "boss";
  if (type === "normal") return "normal";
  if (type === "elite") return "other";
  return "other";
}

function countBy(items) {
  return items.reduce((counts, item) => {
    counts[item] = (counts[item] || 0) + 1;
    return counts;
  }, {});
}

function sortedTop(counts, limit = 5) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function distribution(rows) {
  const terminal = Array.from({ length: TARGET_DEPTH + 1 }, () => ({ death: 0, retreat: 0 }));
  const deathFloor = Array(TARGET_DEPTH + 1).fill(0);
  for (const row of rows) {
    const floor = Math.max(1, Math.min(TARGET_DEPTH, Math.round(row.reachedFloor)));
    terminal[floor][row.died ? "death" : "retreat"]++;
    if (row.died && Number.isInteger(row.deathFloor)) {
      const deathAt = Math.max(1, Math.min(TARGET_DEPTH, row.deathFloor));
      deathFloor[deathAt]++;
    }
  }
  return { terminal, deathFloor };
}

function deathStateSummary(rows) {
  const deaths = rows.filter(row => row.died);
  const snapshots = deaths.map(row => row.deathSnapshot).filter(Boolean);
  const levels = valuesAt(snapshots, snapshot => Number(snapshot.level));
  const equipmentSlots = valuesAt(snapshots, snapshot =>
    Array.isArray(snapshot.equipment) ? snapshot.equipment.length : NaN
  );
  const cores = countBy(snapshots.flatMap(snapshot => snapshot.coreIds || []));
  const equipment = countBy(
    snapshots.flatMap(snapshot =>
      (snapshot.equipment || []).map(item => `${item.slot}:${item.id || "空"}`)
    )
  );
  return {
    deaths: deaths.length,
    level: meanCI(levels),
    levelBands: countBy(levels.map(level =>
      level <= 1 ? "L1" : level <= 3 ? "L2–3" : level <= 5 ? "L4–5" : "L6+"
    )),
    equipmentSlots: meanCI(equipmentSlots),
    cores: sortedTop(cores, 8),
    equipment: sortedTop(equipment, 8)
  };
}

function materialSummary(rows) {
  const deathRows = rows.filter(row => row.died);
  const materialNames = [...new Set(
    rows.flatMap(row => Object.keys(row.bankedMaterialCounts || {}))
  )].sort();
  const bankingMismatches = rows.filter(row => {
    const rate = row.died ? 0.3 : 1;
    const names = new Set([
      ...Object.keys(row.carriedMaterialCounts || {}),
      ...Object.keys(row.bankedMaterialCounts || {})
    ]);
    return [...names].some(name =>
      Math.floor((Number(row.carriedMaterialCounts?.[name]) || 0) * rate) !==
      (Number(row.bankedMaterialCounts?.[name]) || 0)
    );
  }).length;
  return {
    banked: meanCI(valuesAt(rows, row => row.bankedMaterials)),
    bankedPerTime: meanCI(valuesAt(rows, row =>
      row.timeCost > 0 ? row.bankedMaterials / row.timeCost : NaN
    )),
    acquired: meanCI(valuesAt(rows, row => row.materialAcquired)),
    consumedMerchant: meanCI(valuesAt(rows, row => row.materialConsumed)),
    carried: meanCI(valuesAt(rows, row => row.carriedMaterials)),
    deathBanked: meanCI(valuesAt(deathRows, row => row.bankedMaterials)),
    materialNames,
    bankedByMaterial: Object.fromEntries(
      materialNames.map(name => [
        name,
        meanCI(rows.map(row => Number(row.bankedMaterialCounts?.[name]) || 0))
      ])
    ),
    bankingMismatches
  };
}

function outcomeSummary(rows) {
  const { terminal, deathFloor } = distribution(rows);
  const causes = countBy(rows.filter(row => row.died).map(causeBucket));
  return {
    runs: rows.length,
    reached: meanCI(valuesAt(rows, row => row.reachedFloor)),
    survival: wilson(rows.filter(row => row.survived).length, rows.length),
    death: wilson(rows.filter(row => row.died).length, rows.length),
    terminal,
    deathFloor,
    causes: Object.fromEntries(
      ["boss", "trap", "normal", "other"].map(key => [
        key,
        wilson(causes[key] || 0, rows.filter(row => row.died).length)
      ])
    ),
    deathState: deathStateSummary(rows),
    materials: materialSummary(rows)
  };
}

function pairRows(baselineRows, comparisonRows) {
  const baselineByKey = new Map(
    baselineRows.map(row => [`${row.className}:${row.runIndex}`, row])
  );
  const pairs = [];
  const mismatches = [];
  for (const row of comparisonRows) {
    const key = `${row.className}:${row.runIndex}`;
    const baseline = baselineByKey.get(key);
    if (!baseline) {
      mismatches.push(`${key}:missing-baseline`);
      continue;
    }
    if (
      baseline.scenarioId !== row.scenarioId ||
      baseline.randomSequenceId !== row.randomSequenceId
    ) {
      mismatches.push(`${key}:seed-or-scenario`);
      continue;
    }
    pairs.push({ baseline, comparison: row });
  }
  return { pairs, mismatches };
}

function pairedSummary(baselineRows, comparisonRows) {
  const { pairs, mismatches } = pairRows(baselineRows, comparisonRows);
  const all = {
    n: pairs.length,
    reachedDelta: meanCI(pairs.map(pair =>
      pair.comparison.reachedFloor - pair.baseline.reachedFloor
    )),
    bankedDelta: meanCI(pairs.map(pair =>
      pair.comparison.bankedMaterials - pair.baseline.bankedMaterials
    )),
    deathRateDelta: meanCI(pairs.map(pair =>
      Number(pair.comparison.died) - Number(pair.baseline.died)
    ))
  };
  const bands = DEPTH_BANDS.map(([label, min, max]) => {
    const selected = pairs.filter(pair =>
      pair.baseline.reachedFloor >= min && pair.baseline.reachedFloor <= max
    );
    const bankedDelta = meanCI(selected.map(pair =>
      pair.comparison.bankedMaterials - pair.baseline.bankedMaterials
    ));
    return {
      label,
      min,
      max,
      n: selected.length,
      bankedDelta,
      winner: selected.length < 30
        ? "N不足"
        : bankedDelta.low > 0
          ? "commit優位"
          : bankedDelta.high < 0
            ? "既定優位"
            : "差を確定できず"
    };
  });
  return { all, bands, mismatches };
}

function buildSummaries(measurements) {
  const byCondition = Object.fromEntries(
    measurements.map(measurement => [measurement.condition.id, measurement])
  );
  const summaries = {};
  for (const measurement of measurements) {
    summaries[measurement.condition.id] = {};
    for (const className of CLASSES) {
      summaries[measurement.condition.id][className] = outcomeSummary(
        measurement.result.rows.filter(row => row.className === className)
      );
    }
  }
  const baselineRows = byCondition[CONDITIONS[0].id].result.rows;
  const paired = {};
  for (const condition of CONDITIONS.slice(1)) {
    paired[condition.id] = {};
    for (const className of CLASSES) {
      paired[condition.id][className] = pairedSummary(
        baselineRows.filter(row => row.className === className),
        byCondition[condition.id].result.rows.filter(row => row.className === className)
      );
    }
  }
  return { summaries, paired };
}

function renderFloorDistribution(summary) {
  const lines = [];
  for (const floor of Array.from({ length: TARGET_DEPTH }, (_, index) => index + 1)) {
    const point = summary.terminal[floor];
    lines.push(`B${floor}=D${point.death}/R${point.retreat}`);
  }
  return lines.join("; ");
}

function renderDeathFloors(summary) {
  return summary.deathFloor
    .slice(1)
    .map((count, index) => `B${index + 1}=${count}`)
    .join(", ");
}

function renderCauses(summary) {
  return ["boss", "trap", "normal", "other"]
    .map(key => `${key} ${formatRate(summary.causes[key])}`)
    .join(" / ");
}

function renderDeathState(state) {
  const levelBands = Object.entries(state.levelBands)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([band, count]) => `${band}=${count}`)
    .join(", ");
  const cores = state.cores.length > 0
    ? state.cores.map(([id, count]) => `${id}:${count}`).join(", ")
    : "なし";
  const equipment = state.equipment.length > 0
    ? state.equipment.map(([id, count]) => `${id}:${count}`).join(", ")
    : "なし";
  const sampleStatus = state.deaths < 30
    ? "（N不足。到達しないのではなく、死亡runの観測数不足）"
    : "";
  return `death N=${state.deaths}${sampleStatus}; lv ${formatMean(state.level, 2)}; ` +
    `装備slot ${formatMean(state.equipmentSlots, 2)}; ` +
    `lv帯(${levelBands || "なし"}); core(${cores}); 装備(${equipment})`;
}

function renderMaterialVector(materials) {
  return materials.materialNames
    .map(name => `${name}=${formatNumber(materials.bankedByMaterial[name].estimate, 2)}`)
    .join(", ");
}

function renderMarkdown({
  measurements,
  summaries,
  paired,
  sourceCommit,
  baseCommit,
  rawSha256,
  summaryEnv
}) {
  const baselineId = CONDITIONS[0].id;
  const baselineSummary = summaries[baselineId];
  const expectedBaseline = {
    Fighter: 5.778,
    Thief: 5.162,
    Priest: 4.740,
    Mage: 6.474
  };
  const baselineChecks = CLASSES.map(className => {
    const actual = baselineSummary[className].reached.estimate;
    const expected = expectedBaseline[className];
    const delta = actual - expected;
    return {
      className,
      actual,
      expected,
      delta,
      match: Math.abs(delta) <= 0.005
    };
  });
  const baselineOk = baselineChecks.every(check => check.match);
  const lines = [
    "# Issue #624 測定: 「持ち帰りを諦めて潜る」到達限界",
    "",
    `- 測定 source commit: \`${sourceCommit}\``,
    `- 測定 base（origin/main）: \`${baseCommit}\``,
    `- 条件数: ${CONDITIONS.length}、職別 N=${RUNS_PER_CLASS}、職: ${CLASSES.map(className => CLASS_LABELS[className]).join(" / ")}`,
    `- 目標深度: B${TARGET_DEPTH}（B1開始、既存 #612 の重み付き工房系列）`,
    `- seed: ${BASE_ENV.SIM_SEED}、calibration: ${BASE_ENV.SIM_CALIBRATION_RUNS}、SIM_PARALLEL: omitted`,
    `- raw JSONL: \`${RAW_RELATIVE_PATH}\`（ignored artifact）`,
    `- raw JSONL SHA-256: \`${rawSha256}\``,
    `- summary env hash（全条件の短縮hash）: \`${summaryEnv}\``,
    "",
    "## 測定条件",
    "",
    "既定の #612 固定 env（TRAP_POLICY=conservative、鑑定粉、状態回復、elite avoid、" +
      "DEPARTURE_CRAFT_IDS の heal/antidote/guard を含む）を基準にし、portal と逃走だけを変更した。" +
      " `SIM_PARALLEL` と `SIM_MAP_CACHE_ENTRIES` は未指定で、runtime の既定値を使用した。",
    "",
    "| 条件 | 差分 | env hash | parallelism | wall |",
    "| --- | --- | --- | ---: | ---: |",
    ...measurements.map(measurement => [
      `| ${measurement.condition.id}（${measurement.condition.label}） | ` +
        `${Object.entries(measurement.condition.overrides).map(([key, value]) => `\`${key}=${value}\``).join(", ") || "差分なし"} | ` +
        `\`${measurement.envHash}\` | ${measurement.result.resolvedParallelism} | ` +
        `${measurement.result.measurement.wallSeconds.toFixed(1)}s |`
    ]),
    "",
    "条件4は条件2（翼を出発キットから除外）に `FLEE_POLICY=never` を加えた。" +
      "条件2は宝箱等で途中入手した翼まで禁止する条件ではなく、「持たずに出発」の条件である。",
    "",
    "## 基準線再現（#652値との照合）",
    "",
    "期待値は #652 再測定の到達階平均 Fighter 5.778 / Thief 5.162 / Priest 4.740 / Mage 6.474。" +
      " 判定は表示2桁の丸め誤差を許容して |実測−期待|≤0.005 とした。",
    "",
    "| 職 | 期待 | 実測平均 | 差 | 判定 |",
    "| --- | ---: | ---: | ---: | --- |",
    ...baselineChecks.map(check =>
      `| ${CLASS_LABELS[check.className]} | ${check.expected.toFixed(2)} | ` +
      `${check.actual.toFixed(4)} | ${check.delta >= 0 ? "+" : ""}${check.delta.toFixed(4)} | ` +
      `${check.match ? "一致" : "不一致（原因調査要）"} |`
    ),
    "",
    `基準線再現: **${baselineOk ? "可" : "不可。測定側の変更を確定せず原因調査が必要"}**。`,
    "",
    ...(baselineOk
      ? []
      : [
          "### 基準線不一致の原因調査",
          "",
          "#652 の基準値は base `3e659a62a2b7acca1442feddf101b9b71849458f` で測定された。" +
            "現行 base では #656 により `scratch/sim_depth_material_ev.js` の回復経路へ " +
            "mana potion と MP不足時の計測が入り、#662 で MP圧力計測が追加されている。" +
            "#657 はUI変更で、ゲーム本体のルール値はこの区間で変更されていない。",
          "",
          "このため新しい基準値は現行 base では再現しなかった。旧値へ合わせる変更は行わず、" +
            "以下の paired 比較は現行 base で再測定した `baseline-portal-flee` を対照にする。" +
            "#656/#662 の各差分が平均値の差へ与えた寄与は、過去 base の再実行を伴わないため個別には判定しない。",
          ""
        ]),
    "## 到達階の主要結果（全run分母）",
    "",
    "平均は通常近似95% CI、率は Wilson 95% CI。`N不足` は該当セルの N<30 で、結論には使わない。" +
      " 到達階は死亡・撤退を含む `reachedFloor` の run 平均である。主結果の各職×条件は N=500。" +
      "深度帯や死亡状態の `N不足` は到達しないことではなく、その層の観測数不足を示す。",
    "",
    "| 条件 | 職 | 到達階平均 [95% CI; N] | 生還率 Wilson | 死亡率 Wilson |",
    "| --- | --- | --- | --- | --- |",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const summary = summaries[condition.id][className];
      return `| ${condition.id} | ${CLASS_LABELS[className]} | ${formatMean(summary.reached, 2)} | ` +
        `${formatRate(summary.survival)} | ${formatRate(summary.death)} |`;
    })),
    "",
    "## 全階分布",
    "",
    "各セルは `D=その到達階で死亡 / R=その到達階で撤退・生還`。死亡階分布は死亡 run を分母とせず、" +
      "件数を全階で列挙する。",
    "",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const summary = summaries[condition.id][className];
      return `- **${condition.id} / ${CLASS_LABELS[className]}**: ` +
        `${renderFloorDistribution(summary)}\n  - deathFloor: ${renderDeathFloors(summary)}`;
    })),
    "",
    "## 死因内訳",
    "",
    "死因率の分母は各セルの死亡 run 数（`death N`）で、Wilson 95% CI を付けた。" +
      " `boss` は boss/midboss、`trap` は trap source または cause に罠を含むもの、`normal` は通常遭遇、" +
      " `other` は elite/未分類である。",
    "",
    "| 条件 | 職 | 死亡 N | boss | trap | normal | other |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const summary = summaries[condition.id][className];
      return `| ${condition.id} | ${CLASS_LABELS[className]} | ${summary.deathState.deaths} | ` +
        `${formatRate(summary.causes.boss)} | ${formatRate(summary.causes.trap)} | ` +
        `${formatRate(summary.causes.normal)} | ${formatRate(summary.causes.other)} |`;
    })),
    "",
    "## 死亡時のレベル・装備・core",
    "",
    "死亡時 snapshot は既存 sim の死亡経路に計装し、level、HP/MP、装備 slot、装備 ID、" +
      "support/core ID、inventory を保存した。以下は死亡 run 内の要約で、死亡 N<30 は N不足。",
    "",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const state = summaries[condition.id][className].deathState;
      return `- **${condition.id} / ${CLASS_LABELS[className]}**: ${renderDeathState(state)}`;
    })),
    "",
    "## 素材収支（死亡30% bank反映）",
    "",
    "`banked` は sim が `getBankedMaterials` で計算した実効 bank 素材（撤退100%、死亡30%）の " +
      "total/run。`banked/time` はその実効 bank を sim の時間コストで割った run 平均。" +
      " `consumedMerchant` は既存 sim の商人消費計測であり、出発クラフトは banked の前段で反映済み。",
    "",
    "| 条件 | 職 | banked total/run [CI; N] | banked/time [CI; N] | acquired/run | merchant消費/run | 死亡時bank/run |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const material = summaries[condition.id][className].materials;
      return `| ${condition.id} | ${CLASS_LABELS[className]} | ${formatMean(material.banked, 2)} | ` +
        `${formatMean(material.bankedPerTime, 4)} | ${formatMean(material.acquired, 2)} | ` +
        `${formatMean(material.consumedMerchant, 2)} | ${formatMean(material.deathBanked, 2)} |`;
    })),
    "",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const material = summaries[condition.id][className].materials;
      return `- **${condition.id} / ${CLASS_LABELS[className]}**: banked material vector ` +
        `(${renderMaterialVector(material) || "未観測"}); 30% bank検算 mismatch=${material.bankingMismatches}`;
    })),
    "",
    "## 同一 seed の paired 対比",
    "",
    "各 run は同じ `className/runIndex/scenarioId/randomSequenceId` を対にした。" +
      " portal/逃走の変更後に軌跡自体が同一とは解釈せず、同じ生成開始系列に対する outcome 差として扱う。" +
      " paired 差の CI は run-level 差の平均95% CI。",
    "",
    "| 条件 | 職 | paired N | 到達階差（条件−既定） | banked差（条件−既定） | 死亡率差 |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...CONDITIONS.slice(1).flatMap(condition => CLASSES.map(className => {
      const pair = paired[condition.id][className];
      return `| ${condition.id} | ${CLASS_LABELS[className]} | ${pair.all.n} | ` +
        `${formatMean(pair.all.reachedDelta, 2)} | ${formatMean(pair.all.bankedDelta, 2)} | ` +
        `${formatMean(pair.all.deathRateDelta, 3)} |`;
    })),
    "",
    "### 素材効率の深度帯（基準条件の到達階で層化）",
    "",
    "帯は選択バイアスを避けるため、同一 paired run の既定条件 `reachedFloor` で層化した。" +
      " `commit優位` は banked 差 CI 下限>0、`既定優位` は上限<0、それ以外は確定不能。" +
      " N<30 は N不足で結論に使わない。",
    "",
    "| 条件 | 職 | 帯 | N | banked差 [95% CI] | 判定 |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...CONDITIONS.slice(1).flatMap(condition => CLASSES.flatMap(className =>
      paired[condition.id][className].bands.map(band =>
        `| ${condition.id} | ${CLASS_LABELS[className]} | ${band.label} | ${band.n} | ` +
        `${formatMean(band.bankedDelta, 2)} | ${band.winner} |`
      )
    )),
    "",
    "## 結論",
    "",
    `現行 base の既定（翼あり・逃走あり）平均は ${CLASSES.map(className =>
      `${CLASS_LABELS[className]} ${baselineSummary[className].reached.estimate.toFixed(3)}`
    ).join(" / ")}。翼を持たずに出発する条件は途中入手の翼を許すため、` +
      "翼を完全に禁止する条件ではなく、`PORTAL_HP_THRESHOLD=0` が「所持するが使わない」、" +
      "`FLEE_POLICY=never` が逃走撤退を切る条件である。",
    "",
    ...CONDITIONS.slice(1).map(condition => {
      const summary = summaries[condition.id];
      return `- ${condition.id}: ` + CLASSES.map(className =>
        `${CLASS_LABELS[className]} ${summary[className].reached.estimate.toFixed(3)}`
      ).join(" / ");
    }),
    "",
    (() => {
      const winners = CONDITIONS.slice(1).flatMap(condition =>
        CLASSES.flatMap(className =>
          paired[condition.id][className].bands
            .filter(band => band.winner === "commit優位")
            .map(band => `${condition.id}/${CLASS_LABELS[className]} ${band.label}`)
        )
      );
      return winners.length > 0
        ? `素材効率で commit 優位が確定した帯: ${winners.join(", ")}。`
        : "素材効率で commit 優位を確定できる深度帯はなかった（CIが重なるか N不足）。";
    })(),
    "死亡時 bank は `BANKING_RATES.death=0.3` を適用しており、深度を伸ばすことと素材効率を" +
      "同一視しない。",
    "",
    "## 判断・制約・未解決",
    "",
    "- #612/#652基準線の seed=231、series ID、run ごとの hash seed、工房系列、core calibration の手順を再利用した。",
    "- 条件2は「出発時に翼を持たない」、条件3は「翼を持つが threshold=0 で使わない」であり、宝箱からの途中入手は共通の既存経路に任せた。",
    "- 条件4は条件2 + `FLEE_POLICY=never` とした。逃走も撤退の一種なので、翼だけを切った条件と分離した。",
    "- 既定の sim ロジック（探索、戦闘、報酬、map生成）は再実装していない。新規ファイルは既存 `simulateRun` を呼ぶ run-scope worker と、child 実行・集計だけの harness である。",
    "- `N不足` は未確定であり、到達しないこととは区別した。全職×条件の主結果は N=500 なので、N<30 の死亡状態/深度帯だけを結論の根拠にしない。",
    "",
    "## 再現コマンド",
    "",
    "```sh",
    "node scratch/issue624_commit_depth.js",
    "```",
    "",
    "smoke は N=1 のみで本測定の代用ではない。実行時に `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` を指定してはならない。",
    "",
    "```sh",
    "ISSUE624_SMOKE=1 node scratch/issue624_commit_depth.js",
    "```"
  ];
  return lines.join("\n") + "\n";
}

function main() {
  const sourceCommit = gitOutput(["rev-parse", "HEAD"]);
  const baseCommit = gitOutput(["rev-parse", "origin/main"]);
  const measurements = CONDITIONS.map(condition =>
    runCondition(condition, sourceCommit, baseCommit)
  );
  const { summaries, paired } = buildSummaries(measurements);
  const rawLines = measurements.flatMap(measurement =>
    measurement.result.rows.map(row => JSON.stringify({
      sourceCommit,
      baseCommit,
      conditionId: measurement.condition.id,
      envHash: measurement.envHash,
      ...row
    }))
  );
  const rawText = `${rawLines.join("\n")}\n`;
  mkdirSync(RESULT_DIR, { recursive: true });
  writeFileSync(RAW_PATH, rawText);
  const rawSha256 = sha256(rawText);
  const summaryEnv = hashEnvSignature({
    issue: 624,
    sourceCommit,
    baseCommit,
    conditions: measurements.map(measurement => ({
      id: measurement.condition.id,
      envHash: measurement.envHash
    })),
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    simParallel: "omitted",
    simMapCacheEntries: "omitted"
  });
  const markdown = renderMarkdown({
    measurements,
    summaries,
    paired,
    sourceCommit,
    baseCommit,
    rawSha256,
    summaryEnv
  });
  writeFileSync(SUMMARY_PATH, markdown);
  console.log(`summary: ${SUMMARY_PATH}`);
  console.log(`summary SHA-256: ${sha256(markdown)}`);
  console.log(`raw JSONL: ${RAW_PATH}`);
  console.log(`raw SHA-256: ${rawSha256}`);
  console.log(`source commit: ${sourceCommit}`);
  console.log(`env hash: ${summaryEnv}`);
}

main();
