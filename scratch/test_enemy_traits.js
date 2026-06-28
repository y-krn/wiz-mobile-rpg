// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { checkCharLevelUp } from "../src/data.js";
import assert from "assert";

console.log("Starting Enemy Traits Verification Tests...");

// 1. guardAdjacent / guardAdjacentReduce (庇う) のテスト
const testGuard = () => {
  const party = [
    { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
  ];
  const monsters = [
    { name: "錆びた盾兵", hp: 30, maxHp: 30, atk: 5, def: 5, traits: ["guardAdjacent"], buffs: [] },
    { name: "コボルトの斥候", hp: 20, maxHp: 20, atk: 5, def: 1, traits: [], buffs: [] }
  ];
  const state = {
    party,
    combatState: { monsters, round: 0 },
    inventory: []
  };
  const selection = {
    actions: [
      { type: "fight", actorIdx: 0, targetIdx: 1 } // コボルトの斥候を狙う
    ]
  };

  let guardedCount = 0;
  for (let i = 0; i < 50; i++) {
    const tempState = JSON.parse(JSON.stringify(state));
    const result = runCombatRoundCalculation(tempState, selection);
    if (result.state.combatState.monsters[0].hp < 30) {
      guardedCount++;
    }
  }

  assert.ok(guardedCount > 0, "Rust Guard should guard Kobold adjacent at least once");
  console.log(`[PASS] guardAdjacent verified (guarded ${guardedCount}/50 times).`);
};

// 2. reflectPhysical (物理反射) のテスト
const testPhysicalReflect = () => {
  const party = [
    { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
  ];
  const monsters = [
    { name: "針甲虫", hp: 30, maxHp: 30, atk: 5, def: 1, traits: ["reflectPhysical"], buffs: [] }
  ];
  const state = {
    party,
    combatState: { monsters, round: 0 },
    inventory: []
  };
  const selection = {
    actions: [
      { type: "fight", actorIdx: 0, targetIdx: 0 }
    ]
  };

  const result = runCombatRoundCalculation(state, selection);
  assert.ok(result.state.party[0].hp < 100, "Fighter should receive reflect damage when attacking Needle Beetle");
  console.log("[PASS] reflectPhysical verified.");
};

// 3. reflectMagic (魔法反射) のテスト
const testMagicReflect = () => {
  const party = [
    { name: "魔術師", class: "Mage", status: "ok", hp: 50, maxHp: 50, mp: 10, level: 1, equipment: { weapon: "WAND" }, spells: ["HALITO"], str: 8, int: 15, pie: 8, vit: 10, agi: 12, luk: 8, buffs: [] }
  ];
  const monsters = [
    { name: "呪いの小鏡", hp: 30, maxHp: 30, atk: 5, def: 1, traits: ["reflectMagic"], buffs: [] }
  ];
  const state = {
    party,
    combatState: { monsters, round: 0 },
    inventory: []
  };
  const selection = {
    actions: [
      { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "HALITO" }
    ]
  };

  let reflectCount = 0;
  for (let i = 0; i < 50; i++) {
    const tempState = JSON.parse(JSON.stringify(state));
    const result = runCombatRoundCalculation(tempState, selection);
    if (result.state.party[0].hp < 50) {
      reflectCount++;
    }
  }

  assert.ok(reflectCount > 0, "Magic reflect should happen at least once for Curse Mirror");
  console.log(`[PASS] reflectMagic verified (reflected ${reflectCount}/50 times).`);
};

// 4. splitOnDeath (分裂スライム) のテスト
const testSplitOnDeath = () => {
  const party = [
    { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 10, equipment: { weapon: "LONG_SWORD" }, str: 30, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
  ];
  const monsters = [
    { name: "分裂スライム", hp: 1, maxHp: 20, atk: 5, def: 0, traits: ["splitOnDeath"], exp: 100, gold: 10, buffs: [] }
  ];
  const state = {
    party,
    combatState: { monsters, round: 0 },
    inventory: []
  };
  const selection = {
    actions: [
      { type: "fight", actorIdx: 0, targetIdx: 0 }
    ]
  };

  const result = runCombatRoundCalculation(state, selection);
  const newMonsters = result.state.combatState.monsters;
  assert.strictEqual(newMonsters[0].hp, 0, "Original split slime should be dead");
  const splits = newMonsters.filter(m => m.name.includes("分裂体"));
  assert.strictEqual(splits.length, 2, "Should summon 2 split slimes");
  assert.strictEqual(splits[0].hp, 10, "Split slimes should have 50% HP");
  assert.strictEqual(splits[0].exp, 25, "Split slimes should award 25 EXP");
  console.log("[PASS] splitOnDeath verified.");
};

// 5. regen (再生) のテスト
const testRegen = () => {
  const party = [
    { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
  ];
  const monsters = [
    { name: "竜血の再生者", hp: 50, maxHp: 80, atk: 5, def: 10, traits: ["regen"], buffs: [] }
  ];
  const state = {
    party,
    combatState: { monsters, round: 0 },
    inventory: []
  };
  const selection = {
    actions: [
      { type: "defend", actorIdx: 0 }
    ]
  };

  const result = runCombatRoundCalculation(state, selection);
  assert.strictEqual(result.state.combatState.monsters[0].hp, 59, "Dragon blood regenerator should regen 9 HP at turn end");
  console.log("[PASS] regen verified.");
};

// 6. silence (沈黙) のテスト
const testSilence = () => {
  const party = [
    { name: "魔術師", class: "Mage", status: "ok", hp: 50, maxHp: 50, mp: 10, level: 1, equipment: { weapon: "WAND" }, spells: ["HALITO"], str: 8, int: 15, pie: 8, vit: 10, agi: 12, luk: 8, silenceTurns: 2, buffs: [{ type: "silence", value: 1, turns: 2 }] }
  ];
  const monsters = [
    { name: "コボルトの斥候", hp: 20, maxHp: 20, atk: 5, def: 1, traits: [], buffs: [] }
  ];
  const state = {
    party,
    combatState: { monsters, round: 0 },
    inventory: []
  };
  const selection = {
    actions: [
      { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "HALITO" }
    ]
  };

  const result = runCombatRoundCalculation(state, selection);
  assert.strictEqual(result.state.party[0].mp, 10, "MP should not decrease on failed spell cast due to silence");
  assert.strictEqual(result.state.combatState.monsters[0].hp, 20, "Monster HP should not decrease on failed spell cast");
  assert.strictEqual(result.state.party[0].silenceTurns, 1, "Silence turn should decrease");
  console.log("[PASS] silence verified.");
};

// 7. level up scaling (レベルアップ成長抑制) のテスト
const testLevelUpScaling = () => {
  const char = {
    name: "戦士",
    class: "Fighter",
    level: 1,
    exp: 0,
    hp: 20,
    maxHp: 20,
    mp: 0,
    maxMp: 0,
    str: 15,
    int: 8,
    pie: 8,
    vit: 15,
    agi: 10,
    luk: 10,
    spells: []
  };

  // Level 1 -> 2 (Not multiple of 3, stats should not change)
  char.exp = 200;
  let lvlUp = checkCharLevelUp(char);
  assert.ok(lvlUp, "Should level up to 2");
  assert.strictEqual(char.level, 2, "Level should be 2");
  assert.strictEqual(char.str, 15, "str should not change");
  assert.strictEqual(char.vit, 15, "vit should not change");

  // Level 2 -> 3 (Multiple of 3, either str or vit should increase by 1)
  char.exp = 800;
  lvlUp = checkCharLevelUp(char);
  assert.ok(lvlUp, "Should level up to 3");
  assert.strictEqual(char.level, 3, "Level should be 3");
  
  const totalStats = char.str + char.vit;
  assert.strictEqual(totalStats, 31, "Either str or vit should increase by 1 at Level 3");
  console.log("[PASS] level up scaling suppression verified.");
};

testGuard();
testPhysicalReflect();
testMagicReflect();
testSplitOnDeath();
testRegen();
testSilence();
testLevelUpScaling();

console.log("All Enemy and Stats Traits Verification Tests passed successfully!");
