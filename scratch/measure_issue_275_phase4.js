// sim-scope: run — Issue #275 phase 4 measurement-model verification
/* global console, process */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { generateRunFloor } from "../src/run_map_generator.js";

const SMOKE = process.env.ISSUE275_PHASE4_SMOKE === "1";
const SEED = 461;
const R95 = 1.959963984540054;
const DEFAULT_FACTORS = Object.freeze([1.0, 1.2, 1.4, 1.6, 1.8]);
const FACTORS = Object.freeze(
  String(process.env.ISSUE275_PHASE4_FACTORS || DEFAULT_FACTORS.join(","))
    .split(",")
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value) && value > 0)
);
const RESULT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-275-phase4-sensitivity-smoke" : "issue-275-phase4-sensitivity");

if (FACTORS.length === 0) {
  throw new Error("ISSUE275_PHASE4_FACTORS must contain a positive number");
}

const ROUTE_DIRECTIONS = Object.freeze([
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalStats(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { mean: null, low: null, high: null, n: 0 };
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (finite.length < 2) return { mean, low: null, high: null, n: finite.length };
  const variance = finite.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / (finite.length - 1);
  const margin = R95 * Math.sqrt(variance / finite.length);
  return { mean, low: mean - margin, high: mean + margin, n: finite.length };
}

function formatStats(stats, digits = 2) {
  if (stats.mean === null) return "未観測";
  const trials = stats.n ?? stats.trials ?? 0;
  const mean = stats.mean.toFixed(digits);
  if (stats.low === null) return `${mean} [未確定; N=${trials}]`;
  const uncertain = trials < 30 ? "; 未確定" : "";
  return `${mean} [${stats.low.toFixed(digits)},${stats.high.toFixed(digits)}; N=${trials}${uncertain}]`;
}

function formatValue(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "未観測";
}

function pairStats(rows, firstDepth, secondDepth, selector) {
  const byKey = new Map();
  for (const row of rows) {
    if (![firstDepth, secondDepth].includes(row.targetDepth)) continue;
    const key = `${row.className}:${row.runIndex}:${row.scenarioId}`;
    const pair = byKey.get(key) || {};
    pair[row.targetDepth] = row;
    byKey.set(key, pair);
  }
  const deltas = [];
  for (const pair of byKey.values()) {
    if (!pair[firstDepth] || !pair[secondDepth]) continue;
    deltas.push(selector(pair[secondDepth]) - selector(pair[firstDepth]));
  }
  return normalStats(deltas);
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function shortestPathLength(grid, start, target) {
  if (!start || !target) return null;
  const keyOf = ({ x, y }) => `${x},${y}`;
  const targetKey = keyOf(target);
  const queue = [{ ...start, distance: 0 }];
  const seen = new Set([keyOf(start)]);
  for (const current of queue) {
    if (keyOf(current) === targetKey) return current.distance;
    const cell = grid[current.y]?.[current.x];
    if (!cell) continue;
    for (const direction of ROUTE_DIRECTIONS) {
      if (cell.walls?.[direction.dir]) continue;
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      const next = grid[y]?.[x];
      if (!next || next.blockEnter?.[(direction.dir + 2) % 4]) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }
  return null;
}

function inspectGeneratedFloors() {
  const runSeed = `${SEED}:issue275-phase3:Fighter:0`;
  const floors = [];
  for (let floor = 1; floor <= 10; floor++) {
    const generated = generateRunFloor({ runSeed, floor });
    const start = findCell(generated.grid, cell => cell.type === "stairs-up");
    const stairs = findCell(generated.grid, cell => cell.type === "stairs-down");
    const boss = findCell(generated.grid, cell => cell.event === "boss");
    const midbossCount = generated.grid.flat().filter(cell => cell.event === "midboss").length;
    const criticalPath = generated.validation.criticalPath;
    const bossRouteDistance = boss
      ? shortestPathLength(generated.grid, start, boss) +
        shortestPathLength(generated.grid, boss, stairs)
      : null;
    floors.push({
      floor,
      criticalPath,
      bossCount: boss ? 1 : 0,
      midbossCount,
      milestoneBoss: Boolean(
        boss && generated.grid[boss.y][boss.x].milestoneFloor === floor
      ),
      bossRouteDistance
    });
  }
  return floors;
}

function modelFloorSteps(floor, factor) {
  const staticSteps = Math.round(floor.criticalPath * factor);
  const routeDistance = floor.bossRouteDistance ?? floor.criticalPath;
  const routeSteps = Math.ceil(routeDistance * factor);
  return {
    staticSteps,
    routeSteps,
    floorSteps: Math.max(staticSteps, routeSteps)
  };
}

function aggregateModelSteps(floors, targetDepth, factor, actual = false) {
  return floors
    .filter(floor => floor.floor < targetDepth)
    .reduce((sum, floor) => {
      const routeDistance = floor.bossRouteDistance ?? floor.criticalPath;
      return sum + (actual ? routeDistance : modelFloorSteps(floor, factor).floorSteps);
    }, 0);
}

function runFactor(factor) {
  const label = factor.toFixed(2).replace(/\./g, "_");
  const stem = `issue-275-phase4-factor-${label}${SMOKE ? "-smoke" : ""}`;
  const summaryPath = `scratch/results/${stem}.json`;
  const rawPath = `scratch/results/${stem}.raw.jsonl`;
  if (process.env.ISSUE275_PHASE4_REUSE === "1" &&
      existsSync(summaryPath) && existsSync(rawPath)) {
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    const rows = readFileSync(rawPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line));
    return {
      factor,
      summary,
      rows,
      policies: [...new Set(rows.map(row => row.bossPolicy))],
      rawSha256: summary.rawSha256,
      summarySha256: sha256(`${JSON.stringify(summary, null, 2)}\n`)
    };
  }
  const env = { ...process.env };
  const fixedKeys = [
    "SIM_PRESET",
    "SIM_SEED",
    "SIM_RUNS",
    "SIM_CALIBRATION_RUNS",
    "DEPARTURE_CRAFT_IDS",
    "TRAP_POLICY",
    "TRAP_AVOIDANCE_POLICY",
    "TRAP_DAMAGE_MULTIPLIER",
    "IDENTIFICATION_POLICY",
    "IDENTIFICATION_STARTING_POWDER",
    "IDENTIFICATION_COST_OVERRIDE",
    "STATUS_CURE_POLICY",
    "STATUS_CURE_HP_THRESHOLD",
    "STATUS_CURE_MERCHANT_POLICY",
    "HEAL_POTION_MERCHANT_POLICY",
    "FLEE_POLICY",
    "FLEE_HP_THRESHOLD",
    "HEAL_POTION_THRESHOLD",
    "PORTAL_HP_THRESHOLD",
    "PORTAL_MAX_HEAL_POTIONS",
    "PORTAL_MIN_FLOOR",
    "ELITE_POLICY",
    "BLOOD_WAND_HP_PAYMENT_MIN_RATE",
    "SIM_CORE_SCORE_DROP_TOLERANCE",
    "SIM_440_CONDITION",
    "SIM_SCENARIOS",
    "SIM_PARALLEL",
    "SIM_MAP_CACHE_ENTRIES"
  ];
  fixedKeys.forEach(key => delete env[key]);
  env.SIM_EXPLORATION_FACTOR = String(factor);
  env.SIM_RESULT_BASENAME = stem;
  if (SMOKE) env.ISSUE275_PHASE3_SMOKE = "1";
  else delete env.ISSUE275_PHASE3_SMOKE;

  const child = spawnSync(
    process.execPath,
    ["scratch/measure_issue_275_phase3_steps.js"],
    { cwd: process.cwd(), env, encoding: "utf8" }
  );
  if (child.status !== 0) {
    throw new Error(
      `factor ${factor} failed (status=${child.status})\n${child.stderr.slice(-4000)}\n${child.stdout.slice(-1000)}`
    );
  }
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const rows = readFileSync(rawPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const policies = [...new Set(rows.map(row => row.bossPolicy))];
  return {
    factor,
    summary,
    rows,
    policies,
    rawSha256: summary.rawSha256,
    summarySha256: sha256(`${JSON.stringify(summary, null, 2)}\n`)
  };
}

function buildMarkdown(results, floors) {
  const lines = [
    "# Issue #275 フェーズ4 測定仮定検証",
    "",
    "## 判定",
    "",
    `- ` + (SMOKE ? "smoke測定。主判定不可。" : "N>=30の全主集計で判定可能。") +
      ` 探索係数 ${FACTORS.map(factor => factor.toFixed(2)).join(" / ")} を同一seed・同一条件で掃引。`,
    "- `bossPolicy` 実効値は全factor・全rowで `engage`。`avoid` は既定測定に入っていない。",
    "- 実run生成で midboss は0件。B5にmilestone boss 1件。B5→B6の切替は、B6測定から実runのB5へ入ること。",
    "- `EXPLORATION_FACTOR` はゲーム本体の移動処理ではなく、simの synthetic `floorSteps`、route event / trap schedule / elite routeへ伝播する測定仮定。",
    "",
    "## 係数感度分析（全職合算）",
    ""
  ];
  for (const result of results) {
    const all = result.summary.groups.all;
    const evByDepth = [5, 6, 7, 8, 9, 10].map(depth =>
      `B${depth}=${formatStats(all.byDepth[String(depth)].materialEvPerTime, 4)}`
    ).join(" / ");
    const best = [5, 6, 7, 8, 9, 10].reduce((bestDepth, depth) =>
      !bestDepth || all.byDepth[String(depth)].materialEvPerTime.mean >
        all.byDepth[String(bestDepth)].materialEvPerTime.mean
        ? depth
        : bestDepth, null);
    const pairedSteps = pairStats(result.rows, 5, 10, row => row.steps);
    lines.push(
      `- factor=${result.factor.toFixed(2)}: B5歩数 ${formatStats(all.byDepth["5"].steps)} → B10 ${formatStats(all.byDepth["10"].steps)}、B5→B10 paired歩数差 ${formatStats(pairedSteps)}。`,
      `  - EV/時間: ${evByDepth}。最大点=B${best}。`,
      `  - B5→B10実測時間: ${formatStats(all.byDepth["5"].timeCost)} → ${formatStats(all.byDepth["10"].timeCost)}。bossPolicy=${result.policies.join(",") || "未観測"}。`,
      `  - raw SHA-256=${result.rawSha256}、summary SHA-256=${result.summarySha256}。`,
      ""
    );
  }

  const baseline = results.find(result => result.factor === 1.4) || results[0];
  const baselineRows = baseline.rows;
  const pairedSteps56 = pairStats(baselineRows, 5, 6, row => row.steps);
  const pairedSteps510 = pairStats(baselineRows, 5, 10, row => row.steps);
  const modelAtBaseline = [5, 6].map(targetDepth => ({
    targetDepth,
    modeled: aggregateModelSteps(floors, targetDepth, baseline.factor),
    actualShortest: aggregateModelSteps(floors, targetDepth, baseline.factor, true)
  }));
  const modelDelta = modelAtBaseline[1].modeled - modelAtBaseline[0].modeled;
  const actualDelta = modelAtBaseline[1].actualShortest - modelAtBaseline[0].actualShortest;
  const floor5 = floors.find(floor => floor.floor === 5);
  const floor5Model = modelFloorSteps(floor5, baseline.factor);

  lines.push(
    "## 実装・歩数モデル対照",
    "",
    `- 生成map監査（runSeed=${SEED}:issue275-phase3:Fighter:0）: ` +
      `midboss floors=${floors.filter(floor => floor.midbossCount > 0).map(floor => floor.floor).join(",") || "なし"}` +
      `、milestone boss floors=${floors.filter(floor => floor.milestoneBoss).map(floor => floor.floor).join(",") || "なし"}。`,
    `- B5 floor: criticalPath=${formatValue(floor5.criticalPath)}、boss経由 routeDistance=${formatValue(floor5.bossRouteDistance)}、static=${formatValue(floor5Model.staticSteps)}、route=${formatValue(floor5Model.routeSteps)}。`,
    `- B5→B6の実run最短必須移動（B5 bossを踏んで階段へ）差=${formatValue(actualDelta)}歩。factor=${baseline.factor.toFixed(2)} synthetic予算差=${formatValue(modelDelta)}歩。`,
    `- B5: 実run最短=${formatValue(modelAtBaseline[0].actualShortest)}、sim予算=${formatValue(modelAtBaseline[0].modeled)}。B6: 実run最短=${formatValue(modelAtBaseline[1].actualShortest)}、sim予算=${formatValue(modelAtBaseline[1].modeled)}。`,
    "- 実装側は `src/movement.js` の成功したforward/backward 1マス移動が `recordExplorationSteps()` を呼ぶ。実装に `EXPLORATION_FACTOR` / `floorSteps` 予算はない。",
    "- sim側は `metrics.bossPolicy = scenario.bossPolicy || \"engage\"`、`createFloorRoutePlan(..., metrics.bossPolicy)`、`floorSteps = max(round(criticalPath×factor), ceil(routeDistance×factor))`。",
    "- `src/run_map_generator.js` は `generateRandomMap(..., legacyMilestones: false)` 後、5の倍数階だけ `placeMilestoneEvents()` を追加。旧 `src/map_generator.js` のfloor 3 midboss / floor 5 boss分岐は実run経路で使われない。",
    "- したがって、B5→B6の形は実runのB5 milestone追加と、測定側factorによる synthetic歩数倍率が合成されたもの。設計変更前に基準線是正が必要。",
    "",
    "## 方法・制約",
    "",
    `- seed=${SEED}、対象B5/B6/B7/B8/B9/B10、factor=${FACTORS.map(factor => factor.toFixed(2)).join(",")}。各factorは既存Phase 3測定経路を再実行。`,
    `- 通常測定: 各職N=500、全職合算 各深度N=2000、calibration N=100。${SMOKE ? "smokeは各職N=2、calibration N=1。" : ""}`,
    "- 工房分布・報酬・drop・戦闘・撤退・死亡bankはPhase 3固定条件。`SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES`は未指定。B15/B20未測定。",
    "- EV/時間はrun単位のbank素材 / timeCost。歩数差は同一(class, runIndex, scenario) paired。CIは正規近似95%、N<30は未確定。",
    "",
    "## 再現",
    "",
    "```sh",
    "node --check scratch/measure_issue_275_phase4.js",
    "node --check scratch/sim_depth_material_ev.js",
    "node --check scratch/measure_issue_275_phase3_steps.js",
    "ISSUE275_PHASE4_SMOKE=1 node scratch/measure_issue_275_phase4.js",
    "node scratch/measure_issue_275_phase4.js",
    "```",
    "",
    "## 検証対象の結論",
    "",
    `- factor=1.4 baseline B5→B6 paired歩数差: ${formatStats(pairedSteps56)}。B5→B10: ${formatStats(pairedSteps510)}。`,
    "- 本測定は仮定検証のみ。src balance値・報酬・design canon変更なし。"
  );
  return `${lines.join("\n")}\n`;
}

const floors = inspectGeneratedFloors();
if (floors.some(floor => floor.midbossCount !== 0)) {
  throw new Error("unexpected midboss in generateRunFloor output");
}
if (!floors.some(floor => floor.floor === 5 && floor.milestoneBoss)) {
  throw new Error("B5 milestone boss missing in generateRunFloor output");
}

const results = FACTORS.map(runFactor);
if (results.some(result => result.policies.length !== 1 || result.policies[0] !== "engage")) {
  throw new Error(`unexpected bossPolicy values: ${results.map(result => result.policies.join(",")).join(" / ")}`);
}

const markdown = buildMarkdown(results, floors);
writeFileSync(`scratch/results/${RESULT_STEM}.md`, markdown);
const summary = {
  issue: 275,
  phase: "phase4-measurement-model-verification",
  mode: SMOKE ? "smoke" : "measurement",
  seed: SEED,
  factors: FACTORS,
  floors,
  results: results.map(result => ({
    factor: result.factor,
    policies: result.policies,
    rawSha256: result.rawSha256,
    summarySha256: result.summarySha256,
    b5: result.summary.groups.all.byDepth["5"],
    b10: result.summary.groups.all.byDepth["10"],
    pairedSteps510: pairStats(result.rows, 5, 10, row => row.steps)
  }))
};
console.log(JSON.stringify({
  output: `scratch/results/${RESULT_STEM}.md`,
  factors: FACTORS,
  rowsPerFactor: results.map(result => result.rows.length),
  baselineBossPolicy: results.find(result => result.factor === 1.4)?.policies || null,
  reportSha256: sha256(markdown),
  summary
}, null, 2));
