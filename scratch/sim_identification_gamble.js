import assert from "node:assert/strict";
import { IDENTIFICATION_BALANCE, getIdentificationGambleProfile } from "../src/rules/identification_rules.js";
import { generateRandomEquipment } from "../src/systems/equipment_generation.js";

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const SAMPLES = 20000;
const UNCURSE_COST_UNITS = 3;
const rows = [];

if (process.env.SIM_LEGACY_BALANCE === "1") {
  IDENTIFICATION_BALANCE.curseChancePerFloor = 0.035;
}

for (let floor = 1; floor <= 30; floor++) {
  const rng = lcg(150000 + floor);
  let cursed = 0;
  for (let sample = 0; sample < SAMPLES; sample++) {
    const item = generateRandomEquipment(floor, { rng, allowCores: false });
    cursed += item.curseEffectId ? 1 : 0;
  }

  const profile = getIdentificationGambleProfile(floor);
  const curseRate = cursed / SAMPLES;
  const hitRate = 1 - curseRate;
  const hitValue = profile.qualityMultiplier;
  const expectedValue = hitValue * hitRate - UNCURSE_COST_UNITS * curseRate;
  rows.push({ floor, curseRate, hitValue, expectedValue });
}

console.log("| Floor | Curse | Hit value | Gamble EV |");
console.log("| ---: | ---: | ---: | ---: |");
rows.forEach(row => {
  console.log(`| B${row.floor} | ${(row.curseRate * 100).toFixed(2)}% | ${row.hitValue.toFixed(2)} | ${row.expectedValue.toFixed(3)} |`);
});

const transitionFloor = rows.find(row => row.expectedValue < 0)?.floor ?? Infinity;
assert.ok(rows[0].expectedValue > 0, "B1 gamble should be favorable");
assert.ok(rows.at(-1).expectedValue < 0, "B30 identification should be favorable");
assert.ok(transitionFloor >= 8 && transitionFloor <= 12, `transition B${transitionFloor} is outside B8-B12`);
assert.ok(rows.every((row, index) => index === 0 || row.curseRate >= rows[index - 1].curseRate - 0.02), "curse rate regressed sharply");
assert.equal(IDENTIFICATION_BALANCE.identifyCost, 1);
console.log(`transition=B${transitionFloor} uncurse_cost_units=${UNCURSE_COST_UNITS}`);
