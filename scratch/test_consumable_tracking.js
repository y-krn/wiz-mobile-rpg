#!/usr/bin/env node

// sim-scope: infra

import fs from "node:fs";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("usage: node scratch/test_consumable_tracking.js <sim-output> [...]");
  process.exit(2);
}

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

for (const path of paths) {
  const lines = fs.readFileSync(path, "utf8").split("\n");
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
