#!/usr/bin/env node

// sim-scope: infra

import fs from "node:fs";

const paths = process.argv.slice(2);
const trackedStatusItems = [
  "HOLY_WATER",
  "ANTIDOTE",
  "PANACEA",
  "EYE_DROPS",
  "PARALYZE_CURE",
  "WAKE_POWDER"
];
let observations = 0;
const failures = [];

if (paths.length === 0) {
  const simSource = fs.readFileSync(new URL("../../simulations/sim_depth_material_ev.js", import.meta.url), "utf8");
  const requiredSnippets = [
    "function recordStatusCureConsumption(state, metrics, itemKey, count = 1)",
    "recordTrackedConsumableConsumption(state, metrics, itemKey, count);",
    "recordConsumableConsumption(metrics, itemKey, count);",
    "recordStatusCureConsumption(state, metrics, action.itemKey, used);",
    "recordStatusCureConsumption(state, metrics, decision.itemKey);"
  ];
  requiredSnippets.forEach(snippet => {
    if (!simSource.includes(snippet)) failures.push(`missing current tracking route: ${snippet}`);
  });
  if (failures.length > 0) {
    console.error(`[FAIL] consumable tracking source audit (${failures.length})`);
    failures.forEach(failure => console.error(`  ${failure}`));
    process.exit(1);
  }
  console.log("[PASS] consumable tracking source audit: status-cure helper and both consumption sites are present");
  process.exit(0);
}

for (const path of paths) {
  const rawOutput = fs.readFileSync(path, "utf8");
  if (rawOutput.trimStart().startsWith("{")) {
    const payload = JSON.parse(rawOutput);
    for (const row of payload.rows || []) {
      observations++;
      for (const itemId of trackedStatusItems) {
        const actual = Number(row.statusCureItemsUsed?.[itemId] || 0);
        const tracked = Number(row.consumableUsageByItem?.[itemId]?.consumed || 0);
        if (actual !== tracked) {
          failures.push(`${path}:${row.className}:${row.runIndex}:${itemId} used=${actual} tracked=${tracked}`);
        }
      }
    }
    continue;
  }
  const lines = rawOutput.split("\n");
  for (const line of lines) {
    if (!line.startsWith("STATUS_CURE_OBSERVATION_JSON=")) continue;
    observations++;
    const payload = JSON.parse(line.slice("STATUS_CURE_OBSERVATION_JSON=".length));
    const runs = Number(payload.runs);
    for (const itemId of trackedStatusItems) {
      const expected = Number(payload.statusItems?.[itemId]?.consumed || 0) * runs;
      const actual = Number(payload.statusCureItemsUsed?.[itemId] || 0);
      if (actual !== expected) {
        failures.push(`${path}:${payload.label}:${itemId} used=${actual} tracked=${expected}`);
      }
    }
  }
}

if (observations === 0) failures.push("no STATUS_CURE_OBSERVATION_JSON records found");
if (failures.length > 0) {
  console.error(`[FAIL] consumable tracking audit (${failures.length})`);
  failures.forEach(failure => console.error(`  ${failure}`));
  process.exit(1);
}
console.log(`[PASS] consumable tracking audit: ${observations} observations; HOLY_WATER + five status-cure items agree`);
