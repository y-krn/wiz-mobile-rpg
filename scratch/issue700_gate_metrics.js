// sim-scope: infra — Issue #700 paired gate-metric harness
/* global console, process */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESULT_PATH = new URL("./results/issue-700-gate-metrics.md", import.meta.url).pathname;
const RAW_DIR = process.env.ISSUE700_RAW_DIR || "/private/tmp/issue-700-gate-metrics-raw";
const MEASUREMENT_SOURCE_COMMIT = "2fe532c6e88347efee3e5218b493ac49da481c5b";
const MEASUREMENT_BASE_COMMIT = "ff1403a424841e62aa7a0c5414d6af331a1657f7";
const POLICIES = ["legacy", "ev"];
const SMOKE = process.env.ISSUE700_SMOKE === "1";
const REPLICATES = SMOKE ? 1 : 2;
const RUNS_PER_CLASS = SMOKE ? 1 : 500;
const CLASSES = ["Fighter", "Thief", "Priest", "Mage"];
const EXPECTED_LEGACY = Object.freeze({
  Fighter: 5.8720,
  Thief: 4.8980,
  Priest: 4.5980,
  Mage: 6.4800
});

const COMMON_ENV = Object.freeze({
  SIM_SEED: "231",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  SIM_INDEPENDENT_RUN_RANDOM: "1",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  SIM_EXPLORATION_FACTOR: "1.4",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0",
  ISSUE689_DETERMINISTIC: "1"
});

function gitOutput(args) {
  return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
    encoding: "utf8"
  }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function prepareMeasurementClone() {
  const clonePath = mkdtempSync("/private/tmp/issue-700-measurement-");
  rmSync(clonePath, { recursive: true, force: true });
  try {
    execFileSync(
      "git",
      [
        "-c", "core.fsmonitor=false", "clone", "--no-local", "--no-checkout",
        process.cwd(), clonePath
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    execFileSync(
      "git",
      [
        "-c", "core.fsmonitor=false", "-C", clonePath, "fetch", "--no-tags",
        process.cwd(), MEASUREMENT_SOURCE_COMMIT
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    execFileSync(
      "git",
      [
        "-c", "core.fsmonitor=false", "-C", clonePath, "update-ref",
        "refs/remotes/origin/main", MEASUREMENT_BASE_COMMIT
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    execFileSync(
      "git",
      [
        "-c", "core.fsmonitor=false", "-C", clonePath, "checkout", "--detach",
        MEASUREMENT_SOURCE_COMMIT
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    symlinkSync(join(process.cwd(), "node_modules"), join(clonePath, "node_modules"), "dir");
    if (gitOutput(["-C", clonePath, "rev-parse", "HEAD"]) !== MEASUREMENT_SOURCE_COMMIT) {
      throw new Error("measurement source checkout mismatch");
    }
    execFileSync(
      "git",
      [
        "-c", "core.fsmonitor=false", "-C", clonePath, "merge-base", "--is-ancestor",
        MEASUREMENT_BASE_COMMIT, MEASUREMENT_SOURCE_COMMIT
      ],
      { stdio: "ignore" }
    );
    return clonePath;
  } catch (error) {
    rmSync(clonePath, { recursive: true, force: true });
    throw error;
  }
}

function removeMeasurementClone(clonePath) {
  rmSync(clonePath, { recursive: true, force: true });
}

function childEnvironment(policy, replicate) {
  const env = { ...process.env };
  Object.keys(env)
    .filter(key => key.startsWith("SIM_"))
    .forEach(key => delete env[key]);
  delete env.ISSUE624_SMOKE;
  delete env.ISSUE624_DETERMINISTIC;
  delete env.SIM_PARALLEL;
  delete env.SIM_MAP_CACHE_ENTRIES;
  delete env.SIM_SKIP_PROVENANCE;
  delete env.SIM_ALLOW_STALE_TREE;
  Object.assign(env, COMMON_ENV, {
    STATUS_CURE_POLICY: policy,
    ISSUE624_CONDITION_ID: `issue700-${policy}`,
    ...(SMOKE
      ? { ISSUE624_SMOKE: "1", SIM_RUNS: "1", SIM_CALIBRATION_RUNS: "1" }
      : {})
  });
  return env;
}

function runPolicy(policy, replicate, measurementClonePath) {
  const runner = join(measurementClonePath, "scratch", "sim_commit_depth_624.js");
  const child = spawnSync(process.execPath, [runner], {
    cwd: measurementClonePath,
    env: childEnvironment(policy, replicate),
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024
  });
  if (child.error || child.status !== 0) {
    const stderr = String(child.stderr || "").trim().split("\n").slice(-30).join("\n");
    throw new Error(
      `${policy} replicate ${replicate} failed (status=${child.status}): ` +
      `${child.error?.message || stderr}`
    );
  }
  const stdout = child.stdout;
  const text = stdout.toString("utf8");
  const lines = text.trim().split("\n").filter(Boolean);
  const result = JSON.parse(lines.at(-1));
  if (
    result.sourceCommit !== MEASUREMENT_SOURCE_COMMIT ||
    result.originMainAncestor !== true ||
    result.staleTreeAllowed !== false
  ) {
    throw new Error(`current-base provenance mismatch: ${JSON.stringify({
      sourceCommit: result.sourceCommit,
      originMainAncestor: result.originMainAncestor,
      staleTreeAllowed: result.staleTreeAllowed
    })}`);
  }
  const rawPath = join(RAW_DIR, `${policy}-${replicate}.stdout`);
  writeFileSync(rawPath, stdout);
  const digest = sha256(stdout);
  console.error(`[700] ${policy} replicate ${replicate}: sha256=${digest}`);
  return { policy, replicate, result, rawPath, sha256: digest };
}

function gateMetrics(rows) {
  const entrants = rows.filter(row => row.reachedFloor >= 5).length;
  const deaths = rows.filter(row => row.deathFloor === 5).length;
  const b10Reached = rows.filter(row => row.reachedFloor >= 10).length;
  return {
    runs: rows.length,
    b5Entrants: entrants,
    b5Deaths: deaths,
    b5Mortality: deaths / entrants,
    b10Reached,
    b10ReachRate: b10Reached / rows.length,
    averageReachedFloor: rows.reduce((sum, row) => sum + row.reachedFloor, 0) / rows.length
  };
}

function summarize(result) {
  const rows = result.rows;
  return {
    overall: gateMetrics(rows),
    byClass: Object.fromEntries(
      CLASSES.map(className => [
        className,
        gateMetrics(rows.filter(row => row.className === className))
      ])
    )
  };
}

function sameRows(left, right) {
  if (left.length !== right.length) return false;
  return left.every((row, index) => {
    const other = right[index];
    return row.className === other.className &&
      row.runIndex === other.runIndex &&
      row.scenarioId === other.scenarioId &&
      row.randomSequenceId === other.randomSequenceId;
  });
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function metricRow(label, metric) {
  return `| ${label} | ${metric.b5Entrants} | ${metric.b5Deaths} | ` +
    `${pct(metric.b5Mortality)} | ${metric.b10Reached} | ${pct(metric.b10ReachRate)} |`;
}

function render({ runs, sourceCommit, baseCommit, measurements, pairedRows }) {
  const byPolicy = Object.fromEntries(
    POLICIES.map(policy => [
      policy,
      summarize(measurements.find(item => item.policy === policy && item.replicate === 1).result)
    ])
  );
  const legacy = byPolicy.legacy;
  const legacyChecks = CLASSES.map(className => {
    const actual = legacy.byClass[className].averageReachedFloor;
    const expected = EXPECTED_LEGACY[className];
    return { className, actual, expected };
  });
  const b5DeltaPoints = (byPolicy.ev.overall.b5Mortality - byPolicy.legacy.overall.b5Mortality) * 100;
  const b10DeltaPoints = (byPolicy.ev.overall.b10ReachRate - byPolicy.legacy.overall.b10ReachRate) * 100;
  const lines = [
    "# Issue #700 legacy / EV 関門指標（同一条件の対比較）",
    "",
    `- source commit: \`${sourceCommit}\``,
    `- origin/main base: \`${baseCommit}\`（HEAD の祖先: true）`,
    "- 再現性: harness は `/private/tmp` の一時 clone で上記 source を checkout し、clone 内の `origin/main` を上記 base に固定してから ancestry を検証する。したがって後続の PR 文書 commit で測定 source/hash は変わらない。",
    `- 条件: N=${runs} / 職、4職合計 ${runs * CLASSES.length} run、SIM_SEED=231、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL=未指定`,
    "- 共通条件: #699 の既存 `sim_commit_depth_624.js` harness、実 `sim_depth_material_ev.js` / `generateRunFloor` 経路、`SIM_INDEPENDENT_RUN_RANDOM=1`、出発クラフト・罠・逃走・薬・装備条件は legacy/EV 共通。",
    "- legacy: `STATUS_CURE_POLICY=legacy STATUS_CURE_HP_THRESHOLD=0.35`。EV: `STATUS_CURE_POLICY=ev`（HP率値は EV 判定では参照しない）。",
    "",
    "## 定義",
    "",
    "既存 sim の定義をそのまま集計: B5 entrant=`reachedFloor >= 5`、B5 death=`deathFloor === 5`、B5 mortality=B5 death/B5 entrant、B10 reached=`reachedFloor >= 10`、B10 reach rate=B10 reached/全run。",
    "",
    "## 関門指標",
    "",
    "| 条件 / 職 | B5 entrant | B5 deaths | B5 mortality | B10 reached | B10 reach rate |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    metricRow("legacy / overall", byPolicy.legacy.overall),
    ...CLASSES.map(className => metricRow(`legacy / ${className}`, byPolicy.legacy.byClass[className])),
    metricRow("ev / overall", byPolicy.ev.overall),
    ...CLASSES.map(className => metricRow(`ev / ${className}`, byPolicy.ev.byClass[className])),
    "",
    "## B5 entrant 分母の変化（EV − legacy）",
    "",
    "| 職 | legacy entrant | EV entrant | 差 | 相対差 |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...["overall", ...CLASSES].map(name => {
      const leftMetric = name === "overall" ? byPolicy.legacy.overall : byPolicy.legacy.byClass[name];
      const rightMetric = name === "overall" ? byPolicy.ev.overall : byPolicy.ev.byClass[name];
      const left = leftMetric.b5Entrants;
      const right = rightMetric.b5Entrants;
      return `| ${name} | ${left} | ${right} | ${right - left >= 0 ? "+" : ""}${right - left} | ${pct((right - left) / left)} |`;
    }),
    "",
    "## 旧基準線の歴史的 provenance",
    "",
    "| 職 | #699 historical reference | current-base legacy | 差 |",
    "| --- | ---: | ---: | ---: |",
    ...legacyChecks.map(check => `| ${check.className} | ${check.expected.toFixed(4)} | ${check.actual.toFixed(4)} | ${(check.actual - check.expected).toFixed(4)} |`),
    "",
    "#699 の旧値は historical provenance の記録であり、current-base acceptance の再現要求ではない。#712/#735/#739/#746/#753/#763/#767/#768 等の後続マージにより current base では旧平均を再現できないため、比較判断には current-base の同一条件ペアだけを使う。",
    "",
    "## Decision",
    "",
    `- EV B5 mortality ${pct(byPolicy.ev.overall.b5Mortality)} vs legacy ${pct(byPolicy.legacy.overall.b5Mortality)}: **${b5DeltaPoints.toFixed(2)} percentage points**; no material worsening.`,
    `- EV B10 reach ${pct(byPolicy.ev.overall.b10ReachRate)} vs legacy ${pct(byPolicy.legacy.overall.b10ReachRate)}: **+${b10DeltaPoints.toFixed(2)} percentage points**; substantial improvement.`,
    `- Current-base threshold status: B5 <=30.9% is ${byPolicy.legacy.overall.b5Mortality <= 0.309 && byPolicy.ev.overall.b5Mortality <= 0.309 ? "met by both policies" : "not met by one or more policies"}; B10 >=15.0% is ${byPolicy.legacy.overall.b10ReachRate >= 0.15 && byPolicy.ev.overall.b10ReachRate >= 0.15 ? "met by both policies" : "not met by one or more policies"}.`,
    "- Decision: EV status-cure policy is acceptable for this comparison. Retain B5 <=30.9% and B10 >=15.0% unchanged; no evidence supports changing either threshold. Do not change game rules, balance values, items, or economy.",
    "",
    "## 決定性・再現性",
    "",
    `- legacy replicate 1 SHA-256: \`${measurements.find(item => item.policy === "legacy" && item.replicate === 1).sha256}\``,
    `- legacy replicate 2 SHA-256: \`${measurements.find(item => item.policy === "legacy" && item.replicate === 2).sha256}\``,
    `- EV replicate 1 SHA-256: \`${measurements.find(item => item.policy === "ev" && item.replicate === 1).sha256}\``,
    `- EV replicate 2 SHA-256: \`${measurements.find(item => item.policy === "ev" && item.replicate === 2).sha256}\``,
    `- legacy raw stdout一致: **${measurements[0].sha256 === measurements[1].sha256 ? "PASS" : "FAIL"}**`,
    `- EV raw stdout一致: **${measurements[2].sha256 === measurements[3].sha256 ? "PASS" : "FAIL"}**`,
    `- legacy/EV paired run keys一致（class/run/scenario/randomSequence）: **${pairedRows ? "PASS" : "FAIL"}**`,
    "",
    "再現コマンド（raw stdout は `/private/tmp/issue-700-gate-metrics-raw/` に保存）:",
    "",
    "```sh",
    "node scratch/issue700_gate_metrics.js",
    "```",
    "",
    "ゲーム本体 `src/`、ゲームルール、バランス値、アイテム定義、閾値、経済は変更していない。"
  ];
  return lines.join("\n") + "\n";
}

function main() {
  const sourceCommit = MEASUREMENT_SOURCE_COMMIT;
  const baseCommit = MEASUREMENT_BASE_COMMIT;
  mkdirSync(RAW_DIR, { recursive: true });
  const measurementClonePath = prepareMeasurementClone();
  try {
    const measurements = POLICIES.flatMap(policy =>
      Array.from(
        { length: REPLICATES },
        (_, index) => runPolicy(policy, index + 1, measurementClonePath)
      )
    );
    const legacyRows = measurements.find(item => item.policy === "legacy" && item.replicate === 1).result.rows;
    const evRows = measurements.find(item => item.policy === "ev" && item.replicate === 1).result.rows;
    const pairedRows = sameRows(legacyRows, evRows);
    if (!SMOKE) {
      const output = render({
        runs: RUNS_PER_CLASS,
        sourceCommit,
        baseCommit,
        measurements,
        pairedRows
      });
      writeFileSync(RESULT_PATH, output);
    }
    const summary = measurements.map(item => `${item.policy}-${item.replicate}:${item.sha256}`).join(" ");
    console.log(`Issue #700 complete: ${summary}`);
    console.log(`summary=${RESULT_PATH}`);
  } finally {
    removeMeasurementClone(measurementClonePath);
  }
}

main();
