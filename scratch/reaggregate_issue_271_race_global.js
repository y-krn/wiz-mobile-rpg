// sim-scope: infra
/* global console, process */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const DEFAULT_RAW_PATH = "scratch/results/issue-271-status-depth-scaling-undead-base-upper-smart-never.jsonl";
const RAW_PATH = process.env.RACE_RAW_PATH || DEFAULT_RAW_PATH;
const R95 = 1.959963984540054;

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
}

function meanInterval(values) {
  if (!values.length) return { n: 0, estimate: null, low: null, high: null };
  const estimate = mean(values);
  const standardError = values.length > 1
    ? Math.sqrt(sampleVariance(values) / values.length)
    : null;
  return {
    n: values.length,
    estimate,
    low: standardError === null ? null : estimate - R95 * standardError,
    high: standardError === null ? null : estimate + R95 * standardError
  };
}

function wilson(successes, trials) {
  if (trials <= 0) return { successes, trials, estimate: null, low: null, high: null };
  const p = successes / trials;
  const z2 = R95 ** 2;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    p * (1 - p) / trials + z2 / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth)
  };
}

function classCenteredDifference(rows, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const outcome = Number(outcomeSelector(row));
    if (!Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ row, outcome });
  });
  const observed = [];
  const unobserved = [];
  byClass.forEach(classRows => {
    const classMean = mean(classRows.map(item => item.outcome));
    classRows.forEach(({ row, outcome }) => {
      (row.antiUndeadObserved ? observed : unobserved).push(outcome - classMean);
    });
  });
  if (!observed.length || !unobserved.length) {
    return {
      estimate: null,
      low: null,
      high: null,
      observedN: observed.length,
      unobservedN: unobserved.length
    };
  }
  const estimate = mean(observed) - mean(unobserved);
  const standardError = Math.sqrt(
    sampleVariance(observed) / observed.length +
    sampleVariance(unobserved) / unobserved.length
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError,
    observedN: observed.length,
    unobservedN: unobserved.length
  };
}

function summarizeGroup(rows, totalRows) {
  const deaths = rows.filter(row => row.died).length;
  return {
    n: rows.length,
    rate: rows.length ? rows.length / totalRows : null,
    reachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    deathRate: wilson(deaths, rows.length),
    survivalRate: wilson(rows.length - deaths, rows.length)
  };
}

const cases = new Map();
let rawRowCount = 0;
const keyFor = row => `${row.conditionId}:${row.curePolicy}:${row.scenarioId}`;
const getCase = key => {
  if (!cases.has(key)) cases.set(key, []);
  return cases.get(key);
};

const input = createInterface({
  input: createReadStream(RAW_PATH),
  crlfDelay: Infinity
});
for await (const line of input) {
  if (!line) continue;
  const source = JSON.parse(line);
  const row = {
    className: source.className,
    reachedFloor: Number(source.reachedFloor),
    died: Boolean(source.died),
    // A positive observation is available anywhere in the retained run data:
    // B5 snapshot ownership or an anti-X action during a B3+ target encounter.
    antiUndeadObserved: Boolean(
      source.b5HasRaceAffix || Number(source.race?.antiEffectActionCount) > 0
    )
  };
  getCase(keyFor(source)).push(row);
  rawRowCount++;
}

const output = {};
for (const [key, rows] of [...cases.entries()].sort()) {
  const observed = rows.filter(row => row.antiUndeadObserved);
  const unobserved = rows.filter(row => !row.antiUndeadObserved);
  output[key] = {
    runs: rows.length,
    observed: summarizeGroup(observed, rows.length),
    unobserved: summarizeGroup(unobserved, rows.length),
    delta: {
      reachedFloor: classCenteredDifference(rows, row => row.reachedFloor),
      deathRate: classCenteredDifference(rows, row => row.died ? 1 : 0)
    }
  };
}

console.log(JSON.stringify({
  rawPath: RAW_PATH,
  rawRowCount,
  definition: "antiUndeadObserved = b5HasRaceAffix || race.antiEffectActionCount > 0; unobserved is not proof of final absence",
  difference: "observed minus unobserved, centered within className across all runs",
  cases: output
}, null, 2));
