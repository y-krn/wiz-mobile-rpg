import { MONSTERS } from "../src/data/monsters.js";
import { ENCOUNTER_PACKS } from "../src/combat_ui/encounter.js";
import { CRAFT_RECIPES } from "../src/craft.js";
import { SHOP_STOCK } from "../src/shop/shop_stock.js";

// --- Helpers ---

// 各素材がドロップする最小 floor
const MAT_FLOORS = {
  "獣の牙": 1,
  "硬い皮": 1,
  "毒腺": 2,
  "骨片": 2,
  "霊粉": 3,
  "魔石片": 3,
  "呪布": 3,
  "鉄片": 4,
  "黒角": 4,
  "竜鱗": 5
};

// クラフトレシピから各アイテムの最小クラフト floor を算出
function getCraftFloor(resultId) {
  const recipe = CRAFT_RECIPES.find(r => r.resultId === resultId);
  if (!recipe) return Infinity;
  let maxMatFloor = 1;
  for (const mat of Object.keys(recipe.mats)) {
    const fl = MAT_FLOORS[mat];
    if (fl === undefined) return Infinity;
    if (fl > maxMatFloor) maxMatFloor = fl;
  }
  return maxMatFloor;
}

// 呪文習得レベルの定義（leveling.js からのマッピング）
const SPELL_LEARN_LEVELS = {
  LATUMOFIS: { Priest: 2, Bishop: 3, Ranger: 4 },
  DIALKO: { Priest: 2, Bishop: 3, Ranger: 4 },
  DIURCO: { Priest: 1, Bishop: 2, Ranger: 3 },
  MABARRIER: { Priest: 4, Bishop: 4, Ranger: 5 },
  MONTINO: { Mage: 4, Bishop: 5, Samurai: 6 },
};

// 各フロアの想定到達レベル（最大/推奨レベル）
const FLOOR_LEVELS = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 8
};

// 呪文がそのフロアで「基本構成（Mage/Priest）」において習得可能か？
function getSpellAvailableFloor(spellName) {
  const requirements = SPELL_LEARN_LEVELS[spellName];
  if (!requirements) return Infinity;
  
  const primaryClass = ["LATUMOFIS", "DIALKO", "DIURCO", "MABARRIER"].includes(spellName) ? "Priest" : "Mage";
  const reqLevel = requirements[primaryClass];
  
  for (let f = 1; f <= 5; f++) {
    if (FLOOR_LEVELS[f] >= reqLevel) {
      return f;
    }
  }
  return Infinity;
}

// 消耗品がそのフロアで入手可能か（ショップまたはクラフト）
function getItemAvailableFloor(itemId) {
  // ショップは最初から利用可能 (floor 1)
  const shopAvailable = SHOP_STOCK.some(stock => stock.key === itemId);
  const craftFloor = getCraftFloor(itemId);
  return Math.min(shopAvailable ? 1 : Infinity, craftFloor);
}

// --- Test 1: Monster Name Consistency ---
console.log("Checking monster name consistency in ENCOUNTER_PACKS...");
let consistencyFailed = false;

for (const [floor, packs] of Object.entries(ENCOUNTER_PACKS)) {
  const f = parseInt(floor);
  for (const pack of packs) {
    for (const member of pack.members) {
      const found = MONSTERS.some(m => m.name === member.name);
      if (!found) {
        console.error(`Error: Monster "${member.name}" in floor ${f} pack is not defined in MONSTERS.`);
        consistencyFailed = true;
      }
    }
  }
}

const specialMonsters = ["いにしえの竜", "デーモンガード", "フラック"];
specialMonsters.forEach(name => {
  const found = MONSTERS.some(m => m.name === name);
  if (!found) {
    console.error(`Error: Special monster "${name}" is not defined in MONSTERS.`);
    consistencyFailed = true;
  }
});

if (consistencyFailed) {
  process.exit(1);
}
console.log("Monster name consistency check passed.");

// --- Test 2: Counterplay Availability Audit ---
console.log("\nAuditing counterplay availability per floor...");

const monsterMinFloors = {};
for (const [floor, packs] of Object.entries(ENCOUNTER_PACKS)) {
  const f = parseInt(floor);
  for (const pack of packs) {
    for (const member of pack.members) {
      if (!monsterMinFloors[member.name] || monsterMinFloors[member.name] > f) {
        monsterMinFloors[member.name] = f;
      }
    }
  }
}

monsterMinFloors["いにしえの竜"] = 5;
monsterMinFloors["デーモンガード"] = 3;
monsterMinFloors["フラック"] = 4;

let minPoisonFloor = Infinity;
let minParalyzeFloor = Infinity;
let minBlindFloor = Infinity;
let minSilenceFloor = Infinity;
let minMpDrainFloor = Infinity;
let minLahalitoFloor = Infinity;
let minMadaltoFloor = Infinity;
let minTiltowaitFloor = Infinity;

MONSTERS.forEach(m => {
  const minFloor = monsterMinFloors[m.name];
  if (minFloor === undefined) return;
  
  if (m.isPoisonous) {
    if (minFloor < minPoisonFloor) minPoisonFloor = minFloor;
  }
  if (m.isParalyzing) {
    if (minFloor < minParalyzeFloor) minParalyzeFloor = minFloor;
  }
  if (m.isBlinding) {
    if (minFloor < minBlindFloor) minBlindFloor = minFloor;
  }
  if (m.traits && m.traits.includes("silence")) {
    if (minFloor < minSilenceFloor) minSilenceFloor = minFloor;
  }
  if (m.traits && m.traits.includes("drainMp")) {
    if (minFloor < minMpDrainFloor) minMpDrainFloor = minFloor;
  }
  if (m.spell === "LAHALITO") {
    if (minFloor < minLahalitoFloor) minLahalitoFloor = minFloor;
  }
  if (m.spell === "MADALTO") {
    if (minFloor < minMadaltoFloor) minMadaltoFloor = minFloor;
  }
  if (m.spell === "TILTOWAIT") {
    if (minFloor < minTiltowaitFloor) minTiltowaitFloor = minFloor;
  }
});

const threats = [
  { name: "毒 (Poison)", minFloor: minPoisonFloor, spells: ["LATUMOFIS"], items: ["ANTIDOTE"] },
  { name: "麻痺 (Paralysis)", minFloor: minParalyzeFloor, spells: ["DIALKO"], items: ["PARALYZE_CURE"] },
  { name: "盲目 (Blind)", minFloor: minBlindFloor, spells: ["DIURCO"], items: ["EYE_DROPS"] },
  { name: "沈黙 (Silence)", minFloor: minSilenceFloor, spells: ["MONTINO"], items: [] },
  { name: "MPドレイン (MP Drain)", minFloor: minMpDrainFloor, spells: [], items: ["MANA_POTION"] },
  { name: "全体魔法 LAHALITO", minFloor: minLahalitoFloor, spells: ["MABARRIER"], items: [] },
  { name: "全体魔法 MADALTO", minFloor: minMadaltoFloor, spells: ["MABARRIER"], items: [] },
  { name: "全体魔法 TILTOWAIT", minFloor: minTiltowaitFloor, spells: ["MABARRIER"], items: [] }
];

console.log("\nThreat Floor Mapping:");
console.log("-----------------------------------------------------------------");
console.log("| Threat               | Min Floor | Counterplay (Floor)        |");
console.log("-----------------------------------------------------------------");

let auditFailed = false;

threats.forEach(t => {
  if (t.minFloor === Infinity) {
    console.log(`| ${t.name.padEnd(20)} | None      | N/A                        |`);
    return;
  }
  
  let minCounterplayFloor = Infinity;
  const counterplayList = [];
  
  t.spells.forEach(s => {
    const fl = getSpellAvailableFloor(s);
    if (fl < minCounterplayFloor) minCounterplayFloor = fl;
    counterplayList.push(`${s}(Spell:Fl${fl})`);
  });
  t.items.forEach(i => {
    const fl = getItemAvailableFloor(i);
    const craftFl = getCraftFloor(i);
    if (fl < minCounterplayFloor) minCounterplayFloor = fl;
    counterplayList.push(`${i}(Item:Fl${fl}, Craft:Fl${craftFl})`);
  });
  
  const counterStr = counterplayList.join(", ");
  console.log(`| ${t.name.padEnd(20)} | Floor ${t.minFloor}   | ${counterStr.padEnd(26)} |`);
  
  if (t.minFloor < minCounterplayFloor) {
    console.error(`Audit Failed: Threat "${t.name}" appears on Floor ${t.minFloor}, but counterplay is not available until Floor ${minCounterplayFloor}.`);
    auditFailed = true;
  }
});

console.log("-----------------------------------------------------------------");

if (auditFailed) {
  console.error("\nAudit FAILED: Counterplay gaps detected!");
  process.exit(1);
} else {
  console.log("\nAudit PASSED: All threats have valid counterplays available at or before their appearance floor.");
}
