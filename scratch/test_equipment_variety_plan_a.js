import assert from "assert";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { ITEMS } = await import("../src/data/items.js");
const { EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } = await import("../src/data/equipment_tables.js");
const { generateRandomEquipment } = await import("../src/systems/equipment_generation.js");
const { getDismantleResults } = await import("../src/craft.js");

const additions = {
  SAGE_STAFF: { floor: 3, type: "weapon", stat: "atk", value: 2, classes: ["Priest", "Mage", "Bishop"], namePart: "杖", mats: { "魔石片": 1 } },
  ARCH_WAND: { floor: 5, type: "weapon", stat: "atk", value: 3, classes: ["Mage", "Bishop"], namePart: "杖", mats: { "魔石片": 1 } },
  SORCERER_ROBE: { floor: 5, type: "armor", stat: "def", value: 4, classes: ["Mage", "Bishop"], namePart: "ローブ", mats: { "呪布": 1 } },
  VENOM_FANG: { floor: 3, type: "weapon", stat: "atk", value: 9, classes: ["Thief", "Ninja"], namePart: "短剣", mats: { "硬い皮": 1 } },
  NINJA_BLADE: { floor: 4, type: "weapon", stat: "atk", value: 14, classes: ["Thief", "Ninja"], namePart: "剣", mats: { "鉄片": 1 } },
  MOONSHADOW: { floor: 5, type: "weapon", stat: "atk", value: 20, classes: ["Thief", "Ninja"], namePart: "剣", mats: { "鉄片": 1 } },
  HOLY_STAFF: { floor: 4, type: "weapon", stat: "atk", value: 6, classes: ["Priest", "Bishop"], namePart: "杖", mats: { "魔石片": 1 } },
  FLAME_SWORD: { floor: 4, type: "weapon", stat: "atk", value: 14, classes: ["Fighter", "Samurai", "Ranger"], namePart: "剣", mats: { "鉄片": 1 } }
};

const expectedAffixes = {
  SAGE_STAFF: ["mp", "arcane"],
  ARCH_WAND: ["mp", "arcane", "spellGuard"],
  SORCERER_ROBE: ["mp", "arcane", "spellGuard"],
  VENOM_FANG: ["trapBonus", "followUp", "treasureSense"],
  NINJA_BLADE: ["trapBonus", "followUp", "treasureSense", "firstStrike"],
  MOONSHADOW: ["trapBonus", "followUp", "treasureSense", "firstStrike"],
  HOLY_STAFF: ["arcane", "devotion", "antiUndead"],
  FLAME_SWORD: ["followUp"]
};

function makeRng(baseIndex, candidateCount, seed) {
  let calls = 0;
  let state = seed;
  return () => {
    calls++;
    if (calls === 1) {
      return 0.99;
    }
    if (calls === 2) {
      return (baseIndex + 0.01) / candidateCount;
    }
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function collectAffixTypes(baseId, floor, runs = 800) {
  const candidates = EQUIPMENT_CANDIDATES_BY_FLOOR[floor];
  const baseIndex = candidates.indexOf(baseId);
  assert.ok(baseIndex >= 0, `${baseId} must be registered for B${floor}F`);

  const found = new Set();
  let unidentifiedName = "";
  for (let seed = 1; seed <= runs; seed++) {
    const item = generateRandomEquipment(floor, {
      forceRarity: "epic",
      rng: makeRng(baseIndex, candidates.length, seed)
    });
    assert.strictEqual(item.baseId, baseId);
    unidentifiedName = item.unidentifiedName;
    item.affixes.forEach(aff => found.add(aff.type));
  }
  return { found, unidentifiedName };
}

console.log("Running equipment variety plan A checks...");

for (const [baseId, expected] of Object.entries(additions)) {
  const item = ITEMS[baseId];
  assert.ok(item, `${baseId} must exist in ITEMS`);
  assert.strictEqual(item.type, expected.type);
  assert.strictEqual(item[expected.stat], expected.value);
  assert.deepStrictEqual(item.classes, expected.classes);
  assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[expected.floor].includes(baseId), `${baseId} must drop on B${expected.floor}F`);

  const { found, unidentifiedName } = collectAffixTypes(baseId, expected.floor);
  expectedAffixes[baseId].forEach(type => {
    assert.ok(found.has(type), `${baseId} should be eligible for ${type}`);
  });
  assert.ok(unidentifiedName.includes(expected.namePart), `${baseId} unidentified name should include ${expected.namePart}`);

  const dismantle = getDismantleResults({ kind: "equipment", baseId, rarity: "magic", identified: true, affixes: [] });
  assert.deepStrictEqual(dismantle, expected.mats, `${baseId} should use explicit dismantle materials`);
}

assert.ok(RESTRICTED_CHEST_BASES.includes("MOONSHADOW"), "MOONSHADOW should stay out of standard high-end chest generation");

const ninjaDps = estimateDps({ atk: 20, str: 14, def: 12, classRate: 0.95, followUp: 15 });
const fighterDps = estimateDps({ atk: 40, str: 15, def: 12, classRate: 1.0, followUp: 15 });
assert.ok(ninjaDps < fighterDps * 0.65, `MOONSHADOW effective DPS ${ninjaDps.toFixed(2)} should stay well below Fighter ceiling ${fighterDps.toFixed(2)}`);
console.log(`MOONSHADOW estimated DPS: ${ninjaDps.toFixed(2)} (Fighter ceiling sample: ${fighterDps.toFixed(2)})`);

console.log("Equipment variety plan A checks passed.");

function estimateDps({ atk, str, def, classRate, followUp }) {
  let total = 0;
  const iterations = 10000;
  for (let i = 0; i < iterations; i++) {
    const mainRand = i % 6;
    const followRand = i % 3;
    const main = Math.max(1, Math.floor((atk * 1.5 + (str - 10) + mainRand - Math.floor(def / 2)) * classRate));
    const extra = Math.max(1, Math.floor((atk * 1.5 + (str - 10) + followRand - Math.floor(def / 2)) * 0.7 * classRate));
    total += main + extra * (followUp / 100);
  }
  return total / iterations;
}
