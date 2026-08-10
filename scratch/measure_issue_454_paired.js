// sim-scope: formula
// Reaggregate the Issue #447-equivalent slot/affix raw runs with paired CI.

/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  compareConditionRows,
  independentDifference,
  inferPairingEligibility
} from "./measurement_utils.js";

const R95 = 1.959963984540054;
const RESULT_DIR = `${process.cwd()}/scratch/results`;
const OUTPUT_PATH = `${RESULT_DIR}/issue-454-paired-reaggregation.md`;
const BASE_PATH = `${RESULT_DIR}/issue-446-slot-vs-affix-base.jsonl`;
const CONDITIONS = Object.freeze({
  unlimited: {
    label: "unlimited slots",
    slotMode: "unlimited"
  },
  "slots-affix-capped": {
    label: "(1) slots↑ / affix総量据え置き",
    slotMode: "affixless-duplicates"
  },
  "affix-volume": {
    label: "(2) slots据え置き / affix総量↑",
    affixVolume: "increased-composition"
  }
});
const ENDPOINTS = Object.freeze({
  "B5突破（全run）": row => Number(row.b5Breakthrough),
  "B5死亡（全run）": row => Number(row.b5Death),
  "到達floor（全run）": row => Number(row.reachedFloor)
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function loadRows(conditionId) {
  const path = `${RESULT_DIR}/issue-446-slot-vs-affix-${conditionId}.jsonl`;
  const text = readFileSync(path);
  const rows = text.toString().trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  return { path, rows, sha256: sha256(text) };
}

function requiredNFor95(result) {
  if (!Number.isFinite(result.estimate) || !result.variancePerObservation ||
    result.estimate === 0) {
    return null;
  }
  return Math.ceil((R95 ** 2 * result.variancePerObservation) / result.estimate ** 2);
}

function formatNumber(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "NA";
}

function formatCI(result) {
  return result.estimate === null
    ? "NA"
    : `${formatNumber(result.estimate)} [${formatNumber(result.low)}, ${formatNumber(result.high)}]`;
}

function compareRows(baseRows, conditionRows, condition, selector) {
  const paired = compareConditionRows({
    leftRows: conditionRows,
    rightRows: baseRows,
    selector,
    condition
  });
  const independent = independentDifference(
    conditionRows.map(row => Number(selector(row))),
    baseRows.map(row => Number(selector(row)))
  );
  return {
    method: paired.method,
    selected: paired,
    independent,
    pairedN95: requiredNFor95(paired),
    independentN95: requiredNFor95(independent)
  };
}

function rowKey(row) {
  return `${row.scenarioId}:${row.className}:${row.runIndex}`;
}

function auditRows(baseRows, conditionRows) {
  const baseByKey = new Map(baseRows.map(row => [rowKey(row), row]));
  const conditionByKey = new Map(conditionRows.map(row => [rowKey(row), row]));
  const baseKeys = new Set(baseByKey.keys());
  const conditionKeys = new Set(conditionByKey.keys());
  const common = [...baseKeys].filter(key => conditionKeys.has(key));
  const randomSequenceMatches = common.every(key => {
    const base = baseByKey.get(key);
    const condition = conditionByKey.get(key);
    return base.randomSequenceId === condition.randomSequenceId;
  });
  return {
    baseN: baseRows.length,
    conditionN: conditionRows.length,
    commonN: common.length,
    randomSequenceMatches
  };
}

function percentReduction(independentN, pairedN) {
  if (!independentN || !pairedN) return null;
  return (1 - pairedN / independentN) * 100;
}

function renderComparison(conditionId, baseRows, conditionRows) {
  const condition = CONDITIONS[conditionId];
  const pairing = inferPairingEligibility(condition);
  const audit = auditRows(baseRows, conditionRows);
  const lines = [
    `### ${condition.label}`,
    "",
    `- classifier: method=${pairing.method}, stage=${pairing.stage}, ` +
      `randomConsumption=${pairing.randomConsumption}, trajectory=${pairing.trajectory}`,
    `- row audit: base=${audit.baseN}, condition=${audit.conditionN}, common=${audit.commonN}, ` +
      `randomSequenceId一致=${audit.randomSequenceMatches ? "yes" : "no"}`,
    "",
    "| endpoint（condition−base、全run） | 採用法 | 現在N | CI | 独立N95 | paired N95 | N低下 |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: |"
  ];
  Object.entries(ENDPOINTS).forEach(([label, selector]) => {
    const result = compareRows(baseRows, conditionRows, condition, selector);
    const reduction = percentReduction(result.independentN95, result.pairedN95);
    lines.push(
      `| ${label} | ${result.method} | ${result.selected.n} | ${formatCI(result.selected)} | ` +
      `${result.independentN95 ?? "NA"} | ${result.pairedN95 ?? "NA"} | ` +
      `${reduction === null ? "NA" : `${reduction.toFixed(1)}%`} |`
    );
  });
  return lines;
}

function main() {
  mkdirSync(RESULT_DIR, { recursive: true });
  const base = loadRows("base");
  const loaded = Object.fromEntries(Object.keys(CONDITIONS).map(conditionId => [
    conditionId,
    loadRows(conditionId)
  ]));
  const lines = [
    "# Issue #454 paired 再集計",
    "",
    "再現コマンド: `CI=true SIM_RUNS=2200 SIM_CALIBRATION_RUNS=100 SIM_DIAGNOSTICS=off SIM_ISSUE446_CONDITION=<base|unlimited|slots-affix-capped|affix-volume> node scratch/sim_issue_446_slot_vs_affix.js` を各条件で実行後、`node scratch/measure_issue_454_paired.js`。",
    "",
    "PR #447 と同じ4条件の raw run（現行 runner で再取得）を、対応 run の CI と独立2標本 CI の両方で再集計した。必要N95は、観測した効果を95% CIで0から分離する近似値。N<30は結論に使わない。",
    "",
    "## 判定規則",
    "",
    "生成構成を変えず、生成後変換で乱数列を保存する条件だけを paired 候補とする。対応キーと randomSequenceId が完全一致しない場合は、コードが独立2標本へフォールバックする。軌跡が分岐する条件は、同一生成runから得た outcome 差として paired 化するが、介入後の軌跡が同一だとは解釈しない。",
    "",
    `raw SHA: base=${base.sha256}`,
    ...Object.entries(loaded).map(([conditionId, item]) => `- ${conditionId}=${item.sha256}`),
    ""
  ];
  Object.keys(CONDITIONS).forEach(conditionId => {
    lines.push(...renderComparison(conditionId, base.rows, loaded[conditionId].rows), "");
  });
  lines.push(
    "## 結論",
    "",
    "生成後変換の unlimited slots / affixless duplicate は paired CI を採用し、生成構成変更の affix-volume は独立2標本へ戻る。必要Nの低下は上表の実測値を採用根拠とし、paired は対応 run の集合・乱数列が完全一致する場合だけ使う。"
  );
  writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, baseRows: base.rows.length }, null, 2));
}

main();
