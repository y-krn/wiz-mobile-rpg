/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(SCRIPT_DIR, "results");
const PREFIX = "issue-271-resistance-integrity";
const OUTPUT_PATH = path.join(RESULTS_DIR, `${PREFIX}-comparison.raw.txt`);
const REPORT_PATH = path.join(RESULTS_DIR, `${PREFIX}-phase1-comparison.md`);
const ALL_RAW_PATH = path.join(RESULTS_DIR, `${PREFIX}-all-sim-output.raw.txt`);
const CLASSES = ["Fighter", "Thief", "Priest", "Mage"];
const CONDITION_META = Object.freeze({
  baseline: { label: "baseline", guardianAlways: false },
  "antidemon-b2-15-25-w1-weapon": {
    label: "antiDemon B2+/15→25/w1/weapon",
    guardianAlways: false
  },
  "antidemon-b2-15-25-w1-weapon-accessory": {
    label: "antiDemon B2+/15→25/w1/weapon+accessory",
    guardianAlways: false
  },
  "antidemon-b3-30-w1-weapon-accessory": {
    label: "antiDemon B3+/30/w1/weapon+accessory",
    guardianAlways: false
  },
  "guardian-a20": { label: "guardian A: 常時/Fighter20", guardianAlways: true },
  "guardian-b": { label: "guardian B: HP25%以下/説明修正", guardianAlways: false },
  "guardian-c10": { label: "guardian C: 常時/Fighter10", guardianAlways: true },
  "guardian-c0": { label: "guardian C: 常時/Fighter0", guardianAlways: true },
  combined: {
    label: "antiDemon weapon+accessory + guardian採用案",
    guardianAlways: true
  },
  "src-after": { label: "実src after", guardianAlways: false }
});

function readRows(conditionId) {
  const file = path.join(
    RESULTS_DIR,
    `${PREFIX}-${conditionId}-baseline-rows.jsonl`
  );
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function pearson(left, right) {
  if (left.length < 3 || left.length !== right.length) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSum += leftDelta ** 2;
    rightSum += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSum * rightSum);
  return denominator ? numerator / denominator : null;
}

function correlation95(left, right) {
  const r = pearson(left, right);
  if (r === null || left.length <= 3) return { r, low: null, high: null, n: left.length };
  const bounded = Math.max(-0.999999, Math.min(0.999999, r));
  const z = Math.atanh(bounded);
  const margin = 1.96 / Math.sqrt(left.length - 3);
  return {
    r,
    low: Math.tanh(z - margin),
    high: Math.tanh(z + margin),
    n: left.length
  };
}

function residualizedCorrelation(events, selector) {
  const left = [];
  const right = [];
  CLASSES.forEach(className => {
    const selected = events.filter(event => event.className === className);
    const xs = selected.map(selector);
    const ys = selected.map(event => Number(event.finalResult === "victory"));
    const xMean = mean(xs);
    const yMean = mean(ys);
    xs.forEach((x, index) => {
      left.push(x - xMean);
      right.push(ys[index] - yMean);
    });
  });
  return correlation95(left, right);
}

function flattenEvents(rows) {
  return rows.flatMap(row => row.b5Battles.map(battle => ({
    ...battle,
    className: row.className,
    runIndex: row.runIndex,
    build: battle.attempts[0]?.build || battle.firstBuild || null
  }))).filter(event => event.build);
}

function flattenAttempts(rows) {
  return rows.flatMap(row => row.b5Battles.flatMap(battle =>
    battle.attempts.map(attempt => ({
      ...attempt,
      className: row.className,
      finalResult: battle.finalResult
    }))
  ));
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
}

function fmtCorr(correlation) {
  return correlation.r === null
    ? "n/a"
    : `${fmt(correlation.r)} [${fmt(correlation.low)}, ${fmt(correlation.high)}] N=${correlation.n}`;
}

function summarize(conditionId, rows) {
  const meta = CONDITION_META[conditionId] || {
    label: conditionId,
    guardianAlways: false
  };
  const events = flattenEvents(rows);
  const attempts = flattenAttempts(rows);
  const physicalHits = attempts.flatMap(attempt =>
    attempt.incomingHits
      .filter(hit => hit.type === "physical")
      .map(hit => ({ ...hit, build: attempt.build }))
  );
  const guardianStreamReduction = physicalHits.length
    ? physicalHits.reduce((sum, hit) => {
      const guardian = hit.build?.effectiveAffixes?.guardian || 0;
      const active = guardian > 0 &&
        (meta.guardianAlways || hit.hpBefore / hit.rawMaxHp <= 0.25);
      return sum + (active ? Math.min(100, guardian) / 100 : 0);
    }, 0) / physicalHits.length
    : 0;
  const antiDemonEquipped = event =>
    (event.build?.supportAffixes?.antiDemon || 0) > 0;
  const relevantCounter = event =>
    (event.build?.effectiveAffixes?.antiDemon || 0) > 0 ||
    (event.build?.effectiveAffixes?.guardian || 0) > 0 ||
    (event.build?.effectiveAffixes?.spellGuard || 0) > 0;
  const deaths = rows.filter(row => row.died);
  const classStats = Object.fromEntries(CLASSES.map(className => {
    const selectedEvents = events.filter(event => event.className === className);
    const wins = selectedEvents.filter(event => event.finalResult === "victory").length;
    return [className, {
      events: selectedEvents.length,
      wins,
      rate: selectedEvents.length ? wins / selectedEvents.length : 0
    }];
  }));
  const trialVictories = attempts.filter(attempt => attempt.result === "victory").length;
  const foundRuns = rows.filter(row =>
    (row.supportAffixFoundById?.antiDemon || 0) > 0
  ).length;
  const foundItems = rows.reduce(
    (sum, row) => sum + (row.supportAffixFoundById?.antiDemon || 0),
    0
  );
  const totalEquipment = rows.reduce((sum, row) => sum + row.equipmentFound, 0);
  const bankedEv = mean(rows.map(row => row.bankedMaterials));
  const averageTime = mean(rows.map(row => row.timeCost));
  return {
    conditionId,
    label: meta.label,
    runs: rows.length,
    events: events.length,
    attempts: attempts.length,
    eventVictoryRate: mean(events.map(event => Number(event.finalResult === "victory"))),
    trialVictoryRate: attempts.length ? trialVictories / attempts.length : 0,
    classStats,
    reachB5: mean(rows.map(row => Number(row.bossFloors?.includes(5)))),
    reachB10: mean(rows.map(row => Number(row.bossFloors?.includes(10)))),
    bossDeathShare: deaths.length
      ? deaths.filter(row => row.deathEncounterType === "boss").length / deaths.length
      : 0,
    antiDemonFoundRuns: foundRuns,
    antiDemonFoundItems: foundItems,
    antiDemonFoundItemRate: totalEquipment ? foundItems / totalEquipment : 0,
    antiDemonEquippedEvents: events.filter(antiDemonEquipped).length,
    antiDemonEquipRate: mean(events.map(event => Number(antiDemonEquipped(event)))),
    guardianStreamReduction,
    averageReachedFloor: mean(rows.map(row => row.reachedFloor)),
    survivalRate: mean(rows.map(row => Number(row.survived))),
    bankedEv,
    averageTime,
    evPerTime: averageTime ? bankedEv / averageTime : 0,
    earlyCoreEncounterRate: mean(rows.map(row =>
      Number(row.firstCoreDepth !== null && row.firstCoreDepth <= 4)
    )),
    equipmentQualityCorrelation: residualizedCorrelation(
      events,
      event => event.build.equipmentStatScore
    ),
    antiDemonCorrelation: residualizedCorrelation(
      events,
      event => Number(antiDemonEquipped(event))
    ),
    relevantCounterCorrelation: residualizedCorrelation(
      events,
      event => Number(relevantCounter(event))
    )
  };
}

const requested = process.argv.slice(2);
const conditionIds = requested.length
  ? requested
  : Object.keys(CONDITION_META);
const summaries = conditionIds
  .map(conditionId => {
    const rows = readRows(conditionId);
    return rows ? summarize(conditionId, rows) : null;
  })
  .filter(Boolean);

if (!summaries.length) {
  if (!fs.existsSync(OUTPUT_PATH)) throw new Error("No measurement rows found");
  console.log(fs.readFileSync(OUTPUT_PATH, "utf8"));
  process.exit(0);
}

const lines = [
  "# Issue #271 resistance integrity 比較",
  "",
  "実grid `generateRunFloor`、実戦闘関数、工房解放済み、seed=2715。",
  ""
];
for (const item of summaries) {
  lines.push(
    `## ${item.label}`,
    "",
    `- run=${item.runs}, B5 event=${item.events}, attempt=${item.attempts}`,
    `- B5勝率: event ${pct(item.eventVictoryRate)} / 試行 ${pct(item.trialVictoryRate)}`,
    `- 職別event: ${CLASSES.map(className => {
      const value = item.classStats[className];
      return `${className} ${value.wins}/${value.events}=${pct(value.rate)}`;
    }).join(" / ")}`,
    `- 到達: B5 ${pct(item.reachB5)} / B10 ${pct(item.reachB10)} / 平均 B${fmt(item.averageReachedFloor, 2)}`,
    `- 生還 ${pct(item.survivalRate)} / boss死÷全死 ${pct(item.bossDeathShare)}`,
    `- antiDemon入手: run ${item.antiDemonFoundRuns}/${item.runs}、item ${item.antiDemonFoundItems}、全装備比 ${pct(item.antiDemonFoundItemRate)}`,
    `- antiDemon装備: B5 event ${item.antiDemonEquippedEvents}/${item.events}=${pct(item.antiDemonEquipRate)}`,
    `- guardian実効軽減: physical stream ${pct(item.guardianStreamReduction)}`,
    `- EV/時間: bank EV ${fmt(item.bankedEv, 3)} / time ${fmt(item.averageTime, 2)} / ${fmt(item.evPerTime, 5)}`,
    `- 前半core遭遇: ${pct(item.earlyCoreEncounterRate)}`,
    `- B5装備素点×勝利 職内r [95%CI]: ${fmtCorr(item.equipmentQualityCorrelation)}`,
    `- antiDemon装備×勝利 職内r [95%CI]: ${fmtCorr(item.antiDemonCorrelation)}`,
    `- 関連counter(antiDemon/guardian/spellGuard)×勝利 職内r [95%CI]: ${fmtCorr(item.relevantCounterCorrelation)}`,
    ""
  );
}

const output = `${lines.join("\n")}\n`;
fs.writeFileSync(OUTPUT_PATH, output);
fs.writeFileSync(REPORT_PATH, output);
const allRaw = summaries.map(item => {
  const rawPath = path.join(RESULTS_DIR, `${PREFIX}-${item.conditionId}.raw.txt`);
  const raw = fs.existsSync(rawPath)
    ? fs.readFileSync(rawPath, "utf8").trimEnd()
    : "(raw output missing)";
  return `===== ${item.conditionId} =====\n${raw}`;
});
allRaw.push(`===== comparison =====\n${output.trimEnd()}`);
fs.writeFileSync(ALL_RAW_PATH, `${allRaw.join("\n\n")}\n`);
console.log(output);
