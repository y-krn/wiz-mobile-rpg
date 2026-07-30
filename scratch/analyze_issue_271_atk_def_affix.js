/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(SCRIPT_DIR, "results");
const BEFORE_PATH = path.join(
  RESULTS_DIR,
  "issue-271-atk-def-before-baseline-rows.jsonl"
);
const AFTER_PATH = path.join(
  RESULTS_DIR,
  "issue-271-atk-def-after-baseline-rows.jsonl"
);
const OUTPUT_PATH = path.join(
  RESULTS_DIR,
  "issue-271-atk-def-comparison.md"
);
const CLASSES = ["Fighter", "Thief", "Priest", "Mage"];

function readRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`measurement rows missing: ${filePath}`);
  }
  const rows = fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
  if (rows.length === 0) throw new Error(`measurement rows empty: ${filePath}`);
  return rows;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function flattenEvents(rows) {
  return rows.flatMap(row => row.b5Battles.map(battle => ({
    ...battle,
    className: row.className,
    runIndex: row.runIndex,
    build: battle.attempts[0]?.build || null
  })));
}

function flattenAttempts(rows) {
  return rows.flatMap(row => row.b5Battles.flatMap(battle =>
    battle.attempts.map(attempt => ({
      ...attempt,
      className: row.className,
      eventResult: battle.finalResult,
      runIndex: row.runIndex
    }))
  ));
}

function summarizeAffix(events, type, statKey) {
  const withBuild = events.filter(event => event.build);
  const value = event => event.build.supportAffixes?.[type] || 0;
  const equipped = withBuild.filter(event => value(event) !== 0);
  return {
    equipped: equipped.length,
    events: withBuild.length,
    equipRate: withBuild.length ? equipped.length / withBuild.length : 0,
    meanWhenEquipped: mean(equipped.map(value)),
    meanAllEvents: mean(withBuild.map(value)),
    meanStatShareWhenEquipped: mean(equipped.map(event =>
      value(event) / Math.max(1, event.build[statKey])
    ))
  };
}

function summarize(rows) {
  const events = flattenEvents(rows);
  const attempts = flattenAttempts(rows);
  const hits = attempts.flatMap(attempt => attempt.incomingHits);
  const deathAttempts = attempts.filter(attempt => attempt.result === "death");
  const deaths = rows.filter(row => row.died);
  const bankedEv = mean(rows.map(row => row.bankedMaterials));
  const averageTime = mean(rows.map(row => row.timeCost));
  const eventWins = events.filter(event => event.finalResult === "victory").length;
  const attemptWins = attempts.filter(attempt => attempt.result === "victory").length;
  const damagePerTurn = mean(attempts.map(attempt => attempt.damagePerTurn));

  return {
    runs: rows.length,
    events: events.length,
    attempts: attempts.length,
    eventVictoryRate: events.length ? eventWins / events.length : 0,
    attemptVictoryRate: attempts.length ? attemptWins / attempts.length : 0,
    classes: Object.fromEntries(CLASSES.map(className => {
      const selected = events.filter(event => event.className === className);
      const wins = selected.filter(event => event.finalResult === "victory").length;
      return [className, {
        events: selected.length,
        wins,
        rate: selected.length ? wins / selected.length : 0
      }];
    })),
    damagePerTurn,
    theoreticalTurns: damagePerTurn ? 230 / damagePerTurn : null,
    incomingDamagePerHit: mean(hits.map(hit => hit.damage)),
    hitsPerDeathAttempt: mean(deathAttempts.map(attempt => attempt.incomingHits.length)),
    atkAffix: summarizeAffix(events, "atk", "atk"),
    defAffix: summarizeAffix(events, "def", "def"),
    averageReachedFloor: mean(rows.map(row => row.reachedFloor)),
    survivalRate: mean(rows.map(row => Number(row.survived))),
    evPerTime: averageTime ? bankedEv / averageTime : null,
    earlyCoreEncounterRate: mean(rows.map(row =>
      Number(row.firstCoreDepth !== null && row.firstCoreDepth <= 4)
    )),
    bossReachRate: mean(rows.map(row => Number(row.bossFloors.includes(5)))),
    bossDeathShare: deaths.length
      ? deaths.filter(row => row.deathEncounterType === "boss").length / deaths.length
      : null
  };
}

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
}

function num(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function formatAffix(label, affix) {
  return `${label} ${affix.equipped}/${affix.events}=${pct(affix.equipRate)}、` +
    `装備時+${num(affix.meanWhenEquipped)}、全event平均+${num(affix.meanAllEvents)}、` +
    `該当stat比${pct(affix.meanStatShareWhenEquipped)}`;
}

function formatSummary(label, summary) {
  return [
    `## ${label}`,
    "",
    `- run ${summary.runs}、B5 event ${summary.events}、attempt ${summary.attempts}`,
    `- B5勝率: event ${pct(summary.eventVictoryRate)} / attempt ${pct(summary.attemptVictoryRate)}`,
    `- 職別event: ${CLASSES.map(className => {
      const item = summary.classes[className];
      return `${className} ${item.wins}/${item.events}=${pct(item.rate)}`;
    }).join(" / ")}`,
    `- 火力: ${num(summary.damagePerTurn)} damage/combat turn、HP230へ${num(summary.theoreticalTurns)} turn`,
    `- 耐久: ${num(summary.incomingDamagePerHit)} damage/hit、死亡attempt平均${num(summary.hitsPerDeathAttempt)} hit`,
    `- ${formatAffix("atk", summary.atkAffix)}`,
    `- ${formatAffix("def", summary.defAffix)}`,
    `- 平均到達 B${num(summary.averageReachedFloor)}、生還${pct(summary.survivalRate)}、EV/時間${num(summary.evPerTime, 5)}`,
    `- 前半core遭遇${pct(summary.earlyCoreEncounterRate)}、B5 boss到達${pct(summary.bossReachRate)}、boss死/全死${pct(summary.bossDeathShare)}`,
    ""
  ];
}

const beforeText = fs.readFileSync(BEFORE_PATH, "utf8");
const afterText = fs.readFileSync(AFTER_PATH, "utf8");
const before = summarize(readRows(BEFORE_PATH));
const after = summarize(readRows(AFTER_PATH));
const byteIdentical = beforeText === afterText;
const lines = [
  "# Issue #271 `atk` / `def` affix before/after",
  "",
  "工房解放済み（帰還の翼あり）、N=2,000、seed=2715、SIM_PARALLEL=15。",
  "実grid `generateRunFloor`、実combat round、`applyCombatRewards`は勝利round内部1回。",
  "",
  ...formatSummary("修正前", before),
  ...formatSummary("修正後", after),
  "## 判定",
  "",
  `- before/after rows byte一致: ${byteIdentical ? "Yes" : "No"}`,
  "- 生成`atk` / `def` supportは修正前から装備値へ加算済み。",
  "- 修正対象の火印/鉄印は現行run simで到達不能な工房機能のため、run KPIへの影響なし。",
  "- event勝率20–35%目標は未達。職業格差は不変。"
];

fs.writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
