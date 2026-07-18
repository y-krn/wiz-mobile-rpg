// Mock localStorage and basic DOM for Node.js test environment before imports
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

const createDummyElement = () => ({
  style: {},
  appendChild: () => createDummyElement(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  removeAttribute: () => {},
  innerHTML: "",
  textContent: "",
  cloneNode: () => createDummyElement()
});

global.document = {
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  body: createDummyElement()
};

global.window = {
  innerWidth: 375,
  innerHeight: 667,
  addEventListener: () => {}
};

import { MONSTERS } from "../src/data/monsters.js";
import { ENCOUNTER_POOLS, ENCOUNTER_SIZE_WEIGHTS } from "../src/data/encounters.js";

console.log("=== TOWN PORTAL RECOVERY BALANCE AUDIT ===");

// 階層ごとの設定
const floorConfigs = {
  1: { avgLevel: 1.5, chests: 2, contracts: 1, combatCount: 8, chestGoldAvg: 12.5 },
  2: { avgLevel: 3.5, chests: 2, contracts: 1, combatCount: 8, chestGoldAvg: 12.5 },
  3: { avgLevel: 6.5, chests: 2, contracts: 1, combatCount: 8, chestGoldAvg: 12.5 },
  4: { avgLevel: 10.0, chests: 3, contracts: 1, combatCount: 8, chestGoldAvg: 20.0 },
  5: { avgLevel: 13.5, chests: 3, contracts: 1, combatCount: 8, chestGoldAvg: 35.0 }
};

// 契約によるゴールド報酬の期待値
const contractGoldExpected = {
  1: 50,  // Danger C
  2: 50,  // Danger C
  3: 100, // Danger B
  4: 190, // Danger A
  5: 190  // Danger A
};

// モンスターのゴールド獲得量計算
function getMonsterGold(monsterName) {
  const mon = MONSTERS.find(m => m.name === monsterName);
  if (!mon) {
    throw new Error(`Monster not found: ${monsterName}`);
  }
  const isBossOrRare = mon.isBoss || mon.isRare;
  return isBossOrRare ? mon.gold : Math.max(1, Math.round(mon.gold * 0.15));
}

// 各階層の戦闘1回あたりの期待値
function calculateEncounterGoldAvg(floor) {
  const pool = ENCOUNTER_POOLS[floor];
  const weights = ENCOUNTER_SIZE_WEIGHTS[floor];
  if (!pool || !weights) return 0;
  const averageMonsterGold = pool.reduce((sum, name) => sum + getMonsterGold(name), 0) / pool.length;
  const averageSize = weights.reduce((sum, weight, index) => sum + weight * (index + 1), 0);
  return averageMonsterGold * averageSize;
}

// 帰還スクロール価格（新500G）
const SCROLL_PRICE = 500;
const SUPPLY_COST = 200; // 消耗品補充コスト

for (let floor = 1; floor <= 5; floor++) {
  const config = floorConfigs[floor];
  const combatGoldAvg = calculateEncounterGoldAvg(floor);
  
  // 1遠征あたりの収入期待値
  const expGoldReward = combatGoldAvg * config.combatCount;
  const expChestGold = config.chestGoldAvg * config.chests;
  const expContractGold = contractGoldExpected[floor] * config.contracts;
  const totalIncome = expGoldReward + expChestGold + expContractGold;
  
  // 再開コストの計算
  const totalLv = config.avgLevel * 6;
  const innCost = totalLv * 10;
  const totalRecoveryCost = SCROLL_PRICE + innCost + SUPPLY_COST;
  
  const balance = totalIncome - totalRecoveryCost;
  
  console.log(`\n--- Floor B${floor}F ---`);
  console.log(`  適正平均Lv: ${config.avgLevel} (合計Lv: ${totalLv})`);
  console.log(`  遠征収入期待値: ${totalIncome.toFixed(0)}G`);
  console.log(`    - 戦闘(${config.combatCount}回): ${expGoldReward.toFixed(0)}G`);
  console.log(`    - 宝箱(${config.chests}個): ${expChestGold.toFixed(0)}G`);
  console.log(`    - 契約(${config.contracts}回): ${expContractGold.toFixed(0)}G`);
  console.log(`  深層再開コスト: ${totalRecoveryCost.toFixed(0)}G`);
  console.log(`    - 宿屋: ${innCost.toFixed(0)}G`);
  console.log(`    - 帰還スクロール: ${SCROLL_PRICE}G`);
  console.log(`    - 消耗品補充: ${SUPPLY_COST}G`);
  console.log(`  収支バランス (収入 - コスト): ${balance.toFixed(0)}G (${balance >= 0 ? "黒字" : "赤字"})`);
}
