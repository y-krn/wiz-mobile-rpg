import assert from "node:assert/strict";
import { determineMonsterDrop } from "../src/combat_logic/drops.js";
import { getBiomeForFloor } from "../src/data/biomes.js";
import { getEncounterSizeWeightsForFloor } from "../src/data/encounters.js";
import { ITEMS, MONSTERS } from "../src/data.js";
import { MILESTONE_MERCHANT_STOCK } from "../src/data/milestone_merchant.js";

const RUNS = 2000;
const FIGHTS_PER_FLOOR = 5;
const CHESTS_OPENED_PER_FLOOR = 2;
const GENERIC_ITEM_COUNT = Object.keys(ITEMS).filter(id => id !== "ANTIGRAVITY_CRYSTAL").length;
const EARLY_CANDIDATE_COUNTS = Object.freeze({ 2: 24, 3: 23, 5: 17 });
const wingStock = MILESTONE_MERCHANT_STOCK.find(entry => entry.id === "return_wing");
const wingCost = process.env.SIM_LEGACY_BALANCE === "1"
  ? Object.freeze({ "黒角": 2, "呪布": 2 })
  : wingStock.cost;

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function pickWeighted(weights, rng) {
  let roll = rng();
  for (let index = 0; index < weights.length; index++) {
    roll -= weights[index];
    if (roll <= 0) return index + 1;
  }
  return weights.length;
}

function getWingChancePerChest(floor) {
  if (floor === 1 || floor === 4) return 0;
  const itemChance = floor >= 5 ? 0.85 : 0.5;
  const candidateCount = EARLY_CANDIDATE_COUNTS[floor] || GENERIC_ITEM_COUNT;
  return itemChance / candidateCount;
}

function addChestMaterials(floor, rng, materials) {
  const quantity = Math.floor(rng() * 3) + 1;
  let pool = ["獣の牙", "硬い皮"];
  if (floor === 2) pool = ["獣の牙", "硬い皮", "毒腺", "骨片"];
  else if (floor === 3) pool = ["骨片", "霊粉", "魔石片", "呪布"];
  else if (floor === 4) pool = ["魔石片", "鉄片", "呪布", "黒角"];
  else if (floor >= 5) pool = ["鉄片", "黒角", "竜鱗"];
  for (let index = 0; index < quantity; index++) {
    const material = pool[Math.floor(rng() * pool.length)];
    materials[material] = (materials[material] || 0) + 1;
  }
}

function canBuyWing(materials) {
  return Object.entries(wingCost).every(([name, quantity]) => (materials[name] || 0) >= quantity);
}

function simulateRun(seed) {
  const rng = lcg(seed);
  const materials = {};
  let found = 0;
  let bought = 0;

  for (let floor = 1; floor <= 30; floor++) {
    const pool = getBiomeForFloor(floor).enemyPool
      .map(name => MONSTERS.find(monster => monster.name === name));
    for (let fight = 0; fight < FIGHTS_PER_FLOOR; fight++) {
      const size = pickWeighted(getEncounterSizeWeightsForFloor(floor), rng);
      for (let enemy = 0; enemy < size; enemy++) {
        const monster = pool[Math.floor(rng() * pool.length)];
        const drops = determineMonsterDrop(monster, floor, rng);
        Object.entries(drops).forEach(([name, quantity]) => {
          materials[name] = (materials[name] || 0) + quantity;
        });
      }
    }
    for (let chest = 0; chest < CHESTS_OPENED_PER_FLOOR; chest++) {
      addChestMaterials(floor, rng, materials);
      if (rng() < getWingChancePerChest(floor)) found++;
    }
    while (floor % 5 === 0 && canBuyWing(materials)) {
      Object.entries(wingCost).forEach(([name, quantity]) => {
        materials[name] -= quantity;
      });
      bought++;
    }
  }
  return { found, bought, total: found + bought };
}

const totals = { found: 0, bought: 0, total: 0, zero: 0 };
for (let run = 0; run < RUNS; run++) {
  const result = simulateRun(162000 + run);
  totals.found += result.found;
  totals.bought += result.bought;
  totals.total += result.total;
  totals.zero += result.total === 0 ? 1 : 0;
}

const result = {
  found: totals.found / RUNS,
  bought: totals.bought / RUNS,
  total: totals.total / RUNS,
  zeroRate: totals.zero / RUNS
};
console.log(
  `normal_run=B1-B30 fights/floor=${FIGHTS_PER_FLOOR} chests/floor=${CHESTS_OPENED_PER_FLOOR} ` +
  `found=${result.found.toFixed(2)} bought=${result.bought.toFixed(2)} ` +
  `total=${result.total.toFixed(2)} zero=${(result.zeroRate * 100).toFixed(1)}%`
);
assert.ok(result.total >= 1 && result.total <= 2, `retreat access average ${result.total.toFixed(2)} outside 1-2`);
assert.ok(result.zeroRate > 0, "return access must not be guaranteed");
