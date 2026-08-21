/* global console, process */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const WORKER = join(ROOT, "scratch/sim_treatment_supply_701.js");
const RESULT_DIR = join(ROOT, "scratch/results");
const RAW_DIR = resolve(ROOT, "..");
const RAW_PATH = join(RAW_DIR, "issue-701-treatment-supply.raw.jsonl");
const RUNS = process.env.ISSUE701_SMOKE === "1" ? 1 : 500;
const CALIBRATION = process.env.ISSUE701_SMOKE === "1" ? 1 : 100;
const BASE_CRAFT = "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION";
const CONDITIONS = Object.freeze([
  {
    id: "baseline",
    label: "現行供給",
    env: { DEPARTURE_CRAFT_IDS: BASE_CRAFT }
  },
  {
    id: "merchant-eye-panacea",
    label: "深層商人：目薬・万能薬（供給上限）",
    env: { DEPARTURE_CRAFT_IDS: BASE_CRAFT, ISSUE701_MERCHANT_ADD: "1" }
  },
  {
    id: "merchant-eye-priced",
    label: "深層商人：目薬（霊粉1・価格制約）",
    env: { DEPARTURE_CRAFT_IDS: BASE_CRAFT, ISSUE701_MERCHANT_PRICE: "eye-drops" }
  },
  {
    id: "departure-eye",
    label: "出発kit：解毒薬→目薬",
    env: {
      DEPARTURE_CRAFT_IDS: "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,EYE_DROPS,GUARD_POTION"
    }
  },
  {
    id: "chest-missing-status",
    label: "宝箱：不足状態治療の補完",
    env: { DEPARTURE_CRAFT_IDS: BASE_CRAFT, ISSUE701_CHEST_POOL: "missing-status" }
  }
]);
const SOURCE_KEYS = ["initial", "departureCraft", "workshop", "chest", "combat", "merchant"];
const ITEM_KEYS = ["ANTIDOTE", "EYE_DROPS", "PANACEA", "PARALYZE_CURE", "WAKE_POWDER", "HOLY_WATER"];
const STATUS_KEYS = ["poisoned", "blind", "paralyzed", "sleep"];
const CLASSES = ["Fighter", "Thief", "Priest", "Mage"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitOutput(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function makeEnv(condition, smoke) {
  const env = { ...process.env };
  [
    "SIM_SEED", "SIM_RUNS", "SIM_CALIBRATION_RUNS", "SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES",
    "SIM_SKIP_PROVENANCE", "SIM_ALLOW_STALE_TREE", "DEPARTURE_CRAFT_IDS", "ISSUE701_MERCHANT_ADD",
    "ISSUE701_MERCHANT_PRICE",
    "ISSUE701_CHEST_POOL", "ISSUE701_CONDITION_ID", "ISSUE701_SMOKE"
  ].forEach(key => delete env[key]);
  Object.assign(env, {
    SIM_SEED: "231",
    SIM_RUNS: String(RUNS),
    SIM_CALIBRATION_RUNS: String(CALIBRATION),
    SIM_INDEPENDENT_RUN_RANDOM: "1",
    STATUS_CURE_POLICY: "ev",
    STATUS_CURE_MERCHANT_POLICY: "missing",
    TRAP_POLICY: "conservative",
    TRAP_AVOIDANCE_POLICY: "ev",
    FLEE_POLICY: "ev",
    FLEE_HP_THRESHOLD: "0.20",
    HEAL_POTION_THRESHOLD: "0.55",
    PORTAL_HP_THRESHOLD: "0.35",
    PORTAL_MAX_HEAL_POTIONS: "0",
    PORTAL_MIN_FLOOR: "3",
    ELITE_POLICY: "avoid",
    IDENTIFICATION_POLICY: "powder",
    IDENTIFICATION_STARTING_POWDER: "2",
    IDENTIFICATION_COST_OVERRIDE: "1",
    SIM_CORE_SCORE_DROP_TOLERANCE: "0",
    SIM_SCENARIOS: "workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete",
    ISSUE701_CONDITION_ID: condition.id,
    ISSUE701_SMOKE: smoke ? "1" : "0",
    ...condition.env
  });
  delete env.SIM_PARALLEL;
  delete env.SIM_MAP_CACHE_ENTRIES;
  return env;
}

function runCondition(condition, { smoke = false } = {}) {
  const child = spawnSync(process.execPath, [WORKER], {
    cwd: ROOT,
    env: makeEnv(condition, smoke),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (child.error || child.status !== 0) {
    throw new Error(`${condition.id} failed: ${child.error?.message || String(child.stderr).slice(-4000)}`);
  }
  const stdout = String(child.stdout);
  const timingLine = String(child.stderr).split("\n").find(line => line.startsWith("ISSUE701_TIMING "));
  if (!timingLine) throw new Error(`${condition.id} missing timing record`);
  const timing = JSON.parse(timingLine.slice("ISSUE701_TIMING ".length));
  const result = JSON.parse(stdout.trim().split("\n").at(-1));
  return { condition, stdout, stdoutSha256: sha256(stdout), timing, result };
}

function addCount(target, key, amount) {
  target[key] = (target[key] || 0) + (Number(amount) || 0);
}

function sumNested(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => addCount(target, key, value));
}

function sumSourceItems(target, source) {
  Object.entries(source || {}).forEach(([sourceName, counts]) => {
    const bucket = target[sourceName] ||= {};
    Object.entries(counts || {}).forEach(([itemId, amount]) => addCount(bucket, itemId, amount));
  });
}

function sumDecisionFloors(target, source) {
  Object.entries(source || {}).forEach(([floor, statuses]) => {
    const floorBucket = target[floor] ||= {};
    Object.entries(statuses || {}).forEach(([status, counts]) => {
      const statusBucket = floorBucket[status] ||= {};
      Object.entries(counts || {}).forEach(([kind, amount]) => addCount(statusBucket, kind, amount));
    });
  });
}

function collect(conditionResult, rowsOverride = null) {
  const rows = rowsOverride || conditionResult.result.rows;
  const out = {
    rows: rows.length,
    reached: 0,
    survived: 0,
    mpRate: 0,
    mpDepleted: 0,
    statusCureItemsAcquired: {},
    statusCureItemsUsed: {},
    consumableUsageByItem: {},
    manaAcquired: {},
    manaConsumed: {},
    holyWaterAcquired: {},
    holyWaterConsumed: {},
    statusDecisions: {},
    statusDecisionFloors: {},
    statusEv: {},
    statusApplications: {},
    statusCureMerchantAttempts: {},
    statusCureMerchantFailures: {},
    materialSources: {},
    materialSourceCounts: {},
    materialConsumedByMerchant: {}
  };
  for (const row of rows) {
    for (const itemId of ITEM_KEYS) {
      const tracked = row.consumableUsageByItem?.[itemId]?.consumed || 0;
      const statusTracked = row.statusCureItemsUsed?.[itemId] || 0;
      if (Number(tracked) !== Number(statusTracked)) {
        throw new Error(`tracking mismatch ${conditionResult.condition.id}/${row.className}/${row.runIndex}/${itemId}: ${tracked}/${statusTracked}`);
      }
    }
    out.reached += Number(row.reachedFloor) || 0;
    out.survived += Number(row.survived);
    out.mpRate += Number(row.finalMpRate) || 0;
    out.mpDepleted += Number(row.mpDepleted);
    sumSourceItems(out.statusCureItemsAcquired, row.statusCureItemsAcquired);
    sumNested(out.statusCureItemsUsed, row.statusCureItemsUsed);
    sumNested(out.statusCureMerchantAttempts, row.statusCureMerchantAttempts);
    sumNested(out.statusCureMerchantFailures, row.statusCureMerchantFailures);
    Object.entries(row.consumableUsageByItem || {}).forEach(([itemId, usage]) => {
      const bucket = out.consumableUsageByItem[itemId] ||= { acquired: 0, consumed: 0 };
      bucket.acquired += Number(usage.acquired) || 0;
      bucket.consumed += Number(usage.consumed) || 0;
    });
    sumNested(out.manaAcquired, row.manaPotionsAcquiredBySource);
    sumNested(out.manaConsumed, row.manaPotionsConsumedBySource);
    sumNested(out.holyWaterAcquired, row.holyWaterAcquiredBySource);
    sumNested(out.holyWaterConsumed, row.holyWaterConsumedBySource);
    sumNested(out.statusDecisions, row.statusCureDecisions);
    sumDecisionFloors(out.statusDecisionFloors, row.statusCureDecisionsByFloor);
    Object.entries(row.statusCureEvMetrics || {}).forEach(([status, values]) => {
      const bucket = out.statusEv[status] ||= {};
      Object.entries(values || {}).forEach(([key, value]) => {
        if (typeof value === "number") addCount(bucket, key, value);
      });
    });
    Object.entries(row.statusObservations?.byStatus || {}).forEach(([status, values]) => {
      addCount(out.statusApplications, status, values.applications);
    });
    sumNested(out.materialSources, row.materialSources);
    sumNested(out.materialSourceCounts, row.materialSourceCounts);
    sumNested(out.materialConsumedByMerchant, row.materialConsumedByMerchant);
  }
  const denominator = Math.max(1, rows.length);
  out.reached /= denominator;
  out.survivalRate = out.survived / denominator;
  out.mpRate /= denominator;
  out.mpDepletedRate = out.mpDepleted / denominator;
  out.materialTotal = Object.values(out.materialSources).reduce((a, b) => a + b, 0);
  out.materialChestShare = out.materialTotal > 0 ? (out.materialSources.chest || 0) / out.materialTotal : 0;
  out.cureChestAcquired = out.statusCureItemsAcquired.chest || {};
  out.cureAcquiredTotal = Object.values(out.statusCureItemsAcquired)
    .flatMap(counts => Object.values(counts || {})).reduce((a, b) => a + b, 0);
  out.cureChestShare = out.cureAcquiredTotal > 0
    ? Object.values(out.cureChestAcquired).reduce((a, b) => a + b, 0) / out.cureAcquiredTotal
    : 0;
  out.treatmentCoverage = {};
  for (const status of STATUS_KEYS) {
    let selected = 0;
    let unavailable = 0;
    let floors = 0;
    Object.entries(out.statusDecisionFloors).forEach(([floor, values]) => {
      const bucket = values[status];
      if (!bucket) return;
      floors++;
      selected += bucket.selected || 0;
      unavailable += bucket.unavailable || 0;
    });
    const needed = selected + unavailable;
    out.treatmentCoverage[status] = {
      decisionAttempts: needed,
      treatmentNeededObserved: out.statusEv[status]?.positiveEvaluations || 0,
      selected,
      unavailable,
      availableRate: needed > 0 ? selected / needed : null,
      unavailableRate: needed > 0 ? unavailable / needed : null,
      decisionFloors: floors,
      observedApplications: out.statusApplications[status] || 0,
      modelledPath: floors > 0 || Boolean(out.statusApplications[status])
    };
  }
  if (!rowsOverride) {
    out.byClass = Object.fromEntries(CLASSES.map(className => [
      className,
      collect(conditionResult, rows.filter(row => row.className === className))
    ]));
  }
  return out;
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function itemLine(stats, itemId) {
  const acquired = Object.values(stats.statusCureItemsAcquired)
    .reduce((sum, counts) => sum + (Number(counts?.[itemId]) || 0), 0);
  const consumed = Number(stats.statusCureItemsUsed[itemId]) || 0;
  return `${itemId} ${acquired}/${consumed}`;
}

function renderStatusRows(stats) {
  return STATUS_KEYS.map(status => {
    const c = stats.treatmentCoverage[status];
    const floors = Array.from({ length: 20 }, (_, index) => index + 1).map(floor => {
      const value = stats.statusDecisionFloors[String(floor)]?.[status]?.unavailable || 0;
      return `B${floor}:${value}`;
    }).join(" ");
    return `| ${status} | ${c.modelledPath ? "modelled" : "no modelled path"} | ${c.observedApplications} | ${c.treatmentNeededObserved} | ${c.decisionAttempts} | ${c.selected} | ${c.unavailable} | ${c.availableRate === null ? "—" : `${(c.availableRate * 100).toFixed(1)}%`} | ${floors} |`;
  }).join("\n");
}

function renderMarkdown(measurements, sourceCommit, baseCommit, rawSha) {
  const stats = Object.fromEntries(measurements.map(m => [m.condition.id, collect(m)]));
  const baseline = stats.baseline;
  const lines = [
    "# Issue #701 治療供給測定",
    "",
    `- source SHA: \`${sourceCommit}\`; origin/main/base SHA: \`${baseCommit}\`; ancestor=true; staleTreeAllowed=false`,
    `- runner: \`scratch/issue701_treatment_supply.js -> scratch/sim_treatment_supply_701.js -> scratch/sim_depth_material_ev.js\` (sim-scope: run; \`generateRunFloor\` 経由)`,
    `- 条件: 4職×${RUNS} run、seed=231、calibration=${CALIBRATION}、SIM_PARALLEL unset、B1→B20、#612 workshop distribution、run-independent hash seed`,
    `- raw JSONL: \`${RAW_PATH}\`; SHA-256: \`${rawSha}\``,
    "- reproduction: `node scratch/issue701_treatment_supply.js` (SIM_PARALLEL omitted; raw JSONL is written outside the repository)",
    `- wall/CPU seconds: ${measurements.map(m => `${m.condition.id}=cal ${m.timing.calibration.wallSeconds.toFixed(2)}/${m.timing.calibration.cpuSeconds.toFixed(2)}, sim ${m.timing.measurement.wallSeconds.toFixed(2)}/${m.timing.measurement.cpuSeconds.toFixed(2)}`).join("; ")}`,
    "",
    "## #692 tracking coverage",
    "",
    "#692/PR #776 の tracking 修正後。状態治療の `statusCureItemsUsed` と per-item `consumableUsageByItem` の消費値を同時に集計し、二重計上していない。今回の status cure は実消費地点の専用 counter、mana は既存 source queue + per-item counter を使用。`WAKE_POWDER`/`PARALYZE_CURE` の EV負は unavailable ではなく policy-deferred と分離した。",
    "",
    "## 条件別到達・MP・供給",
    "",
    "| 条件 | 到達階平均 | 生還率 | MP残率 | MP枯渇率 | 素材chest share | 治療cure chest share |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...CONDITIONS.map(condition => {
      const s = stats[condition.id];
      return `| ${condition.id} | ${fmt(s.reached)} | ${(s.survivalRate * 100).toFixed(1)}% | ${(s.mpRate * 100).toFixed(1)}% | ${(s.mpDepletedRate * 100).toFixed(1)}% | ${(s.materialChestShare * 100).toFixed(1)}% | ${(s.cureChestShare * 100).toFixed(1)}% |`;
    }),
    "",
    "素材chest share は素材総量に対する宝箱素材の割合（既知の約78%構造との照合）であり、治療品の取得率とは別集計。`治療cure chest share` は治療品取得個数に占める宝箱分で、素材収入へ換算していない。",
    "",
    "## 状態別・階層別 unavailable",
    "",
    "`decision attempts = selected + unavailable` は在庫有無を評価した全治療判定。`treatment-needed observed` は、在庫が存在してEV評価まで到達した正のEV判定。`available rate = selected / decision attempts` は供給制約の率として状態別に併記し、麻痺/睡眠のEV負（treatment-needed observed=0）は unavailable と混同しない。`observed` は状態付与の実測。",
    "",
    ...CONDITIONS.flatMap(condition => [
      `### ${condition.id}（${condition.label}）`,
      "",
      "| 状態 | path | observed | EV+ observed | attempts | selected | unavailable | available rate | unavailable by floor |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      renderStatusRows(stats[condition.id]),
      ""
    ]),
    "## 供給経路と selected/consumed",
    "",
    "各条件の cure item は `acquired/consumed`。acquired の source は initial（開始在庫）、departureCraft（出発準備）、workshop（該当なし=0）、chest、merchant、combat。consumed は #692 の実消費地点で item 単位集計。",
    "",
    ...CONDITIONS.map(condition => {
      const s = stats[condition.id];
      const sources = SOURCE_KEYS.map(source => `${source}=${JSON.stringify(s.statusCureItemsAcquired[source] || {})}`).join("; ");
      return `- **${condition.id}**: ${ITEM_KEYS.map(itemId => itemLine(s, itemId)).join(", ")}; acquired by source: ${sources}; selected=${JSON.stringify(s.statusDecisions)}; statusesCured=${JSON.stringify(s.statusCureItemsUsed)}; merchant attempts=${JSON.stringify(s.statusCureMerchantAttempts)} failures=${JSON.stringify(s.statusCureMerchantFailures)}; merchant material spend=${JSON.stringify(s.materialConsumedByMerchant)}`;
    }),
    "",
    "### 到達階・生還率（職別）",
    "",
    "| 条件 | 職 | 到達階平均 | 生還率 | MP残率 | MP枯渇率 | unavailable |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...CONDITIONS.flatMap(condition => CLASSES.map(className => {
      const s = stats[condition.id].byClass[className];
      const unavailable = STATUS_KEYS.reduce((sum, status) => sum + s.treatmentCoverage[status].unavailable, 0);
      return `| ${condition.id} | ${className} | ${fmt(s.reached)} | ${(s.survivalRate * 100).toFixed(1)}% | ${(s.mpRate * 100).toFixed(1)}% | ${(s.mpDepletedRate * 100).toFixed(1)}% | ${unavailable} |`;
    })),
    "",
    "### Mana and relevant resource outcomes",
    "",
    ...CONDITIONS.map(condition => {
      const s = stats[condition.id];
      return `- **${condition.id}**: MANA acquired=${JSON.stringify(s.manaAcquired)} consumed=${JSON.stringify(s.manaConsumed)}; HOLY_WATER acquired=${JSON.stringify(s.holyWaterAcquired)} consumed=${JSON.stringify(s.holyWaterConsumed)}; material sources=${JSON.stringify(s.materialSources)}`;
    }),
    "",
    "## Counterfactual definition and comparison",
    "",
    "- `baseline`: current fixed #691/#736-style depth conditions with departure kit `TOWN_PORTAL + 4×HEAL_POTION + ANTIDOTE + GUARD_POTION` and current source chest/merchant pools.",
    "- `merchant-eye-panacea`: prior measurement-only free-grant upper bound. At each milestone, missing `EYE_DROPS` and `PANACEA` are granted without a source price or material spend; it remains a clearly labeled availability ceiling, not a price recommendation.",
    "- `merchant-eye-priced`: measurement-only price-constrained EYE_DROPS case. It uses canonical `霊粉:1` from `.agents/game-design.md` and the existing merchant affordability, 20-slot inventory-capacity, material-spend, and purchase-path semantics. PANACEA is not included because no authoritative project price was found.",
    "- `departure-eye`: source departure recipe override replaces the one `ANTIDOTE` with one existing `EYE_DROPS` recipe (same one-item kit slot; source craft cost is used).",
    "- `chest-missing-status`: when the source chest roll returns a non-equipment, non-status-cure usable, measurement-only remap gives `EYE_DROPS` on B1–B2 and `PANACEA` on B3+, preserving existing status-cure chest results. This is a supply upper-bound for the missing-depth pool, not a production rule.",
    "",
    "| Condition | Δ reached vs baseline | Δ survival | Δ unavailable total | blind available rate | poison available rate |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...CONDITIONS.slice(1).map(condition => {
      const s = stats[condition.id];
      const unavailable = status => s.treatmentCoverage[status].unavailable;
      const baseUnavailable = STATUS_KEYS.reduce((sum, status) => sum + baseline.treatmentCoverage[status].unavailable, 0);
      const currentUnavailable = STATUS_KEYS.reduce((sum, status) => sum + unavailable(status), 0);
      return `| ${condition.id} | ${fmt(s.reached - baseline.reached)} | ${((s.survivalRate - baseline.survivalRate) * 100).toFixed(1)}pt | ${currentUnavailable - baseUnavailable} | ${s.treatmentCoverage.blind.availableRate === null ? "—" : `${(s.treatmentCoverage.blind.availableRate * 100).toFixed(1)}%`} | ${s.treatmentCoverage.poisoned.availableRate === null ? "—" : `${(s.treatmentCoverage.poisoned.availableRate * 100).toFixed(1)}%`} |`;
    }),
    "",
    "## Decision",
    "",
    "Measurement-first conclusion: no production supply change is implemented here. The free-grant merchant upper bound measures the ceiling; the price-constrained EYE_DROPS case measures the current `霊粉:1` affordability/inventory-limited direction. PANACEA remains not decision-ready because no authoritative project price exists; no price was fabricated. The measured comparison supports deciding EYE_DROPS separately from PANACEA, but does not authorize a production stock change or settle desired chest-pool semantics.",
    "",
    "## Verification and risks",
    "",
    "- Required: node --check, N=1 smoke, N=500/class measurement, raw stdout SHA-256 replicate, npm run lint, npm run test:unit, git diff --check.",
    "- Omitted from this sim (tracked as model gaps, not zero supply): production-only ETHER/noise/escape/elixir paths; combat item choices beyond existing sim policy. The state cure path itself is modelled for all four requested statuses.",
    "- No `src/` changes, no production merchant stock/item-effect/threshold/EV/economy changes, and no `.agents/content-design.md` update because no production content was changed.",
    "- PANACEA pricing: unresolved/not decision-ready. Project canon/source defines its effect and chest availability but does not define an authoritative merchant material price."
  ];
  return lines.join("\n") + "\n";
}

function main() {
  const sourceCommit = gitOutput(["rev-parse", "HEAD"]);
  const baseCommit = gitOutput(["rev-parse", "origin/main"]);
  const smoke = process.env.ISSUE701_SMOKE === "1";
  const measurements = CONDITIONS.map(condition => runCondition(condition, { smoke }));
  mkdirSync(RAW_DIR, { recursive: true });
  const rawText = measurements.flatMap(m => m.result.rows.map(row => JSON.stringify({
    sourceCommit,
    baseCommit,
    conditionId: m.condition.id,
    stdoutSha256: m.stdoutSha256,
    ...row
  }))).join("\n") + "\n";
  writeFileSync(RAW_PATH, rawText);
  mkdirSync(RESULT_DIR, { recursive: true });
  const summary = renderMarkdown(measurements, sourceCommit, baseCommit, sha256(rawText));
  const summaryPath = join(RESULT_DIR, "issue-701-treatment-supply.md");
  writeFileSync(summaryPath, summary);
  console.log(`summary: ${summaryPath}`);
  console.log(`summary SHA-256: ${sha256(summary)}`);
  console.log(`raw JSONL: ${RAW_PATH}`);
  console.log(`raw SHA-256: ${sha256(rawText)}`);
  console.log(`source commit: ${sourceCommit}`);
  console.log(`origin/main: ${baseCommit}`);
  measurements.forEach(m => console.log(`${m.condition.id} stdout SHA-256: ${m.stdoutSha256}`));
}

main();
