// 呪文システム統合テスト。旧: test_spell_single_target_balance / test_magic_reflect_aoe /
// test_katino_sleep / test_weaken_spell / test_combat_paralyze / test_lahalito_counter /
// test_spell_madi を1ファイルへ集約。各テストは同名ローカル定義の衝突回避と
// Math.random 差し替えの隔離のため IIFE でスコープ分離している。
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { checkCharLevelUp } from "../src/systems/leveling.js";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { SPELL_EFFECTS } from "../src/systems/spell_effects.js";
import { ITEM_EFFECTS } from "../src/systems/item_effects.js";
import { getEffectiveAtk } from "../src/combat_logic/damage.js";
import { resolvePlayerSpell } from "../src/combat_logic/spell_resolution.js";

// ========================================================================
// Single-target spell damage/balance  (元: test_spell_single_target_balance.js)
// ========================================================================
(() => {
  const caster = { name: "Caster", int: 10, pie: 10, equipment: {} };
  const target = { name: "Target", hp: 100, tags: [] };

  function damage(spellName, rngValue, nextTarget = target) {
    return SPELL_EFFECTS[spellName]({
      caster,
      target: nextTarget,
      rng: () => rngValue
    }).damage;
  }

  assert.strictEqual(damage("HALITO", 0), 8, "HALITO minimum should be 8.");
  assert.strictEqual(damage("HALITO", 0.999), 18, "HALITO maximum should be 18.");
  assert.strictEqual(damage("MAHALITO", 0), 30, "MAHALITO minimum should be 30.");
  assert.strictEqual(damage("MAHALITO", 0.999), 50, "MAHALITO maximum should be 50.");
  assert.strictEqual(damage("BADIOS", 0), 8, "BADIOS minimum should be 8.");
  assert.strictEqual(damage("BADIOS", 0.999), 18, "BADIOS maximum should be 18.");

  const undeadDamage = damage("BADIOS", 0.5, { ...target, tags: ["undead"] });
  assert.strictEqual(undeadDamage, 20, "BADIOS should keep its undead bonus.");

  const mahalitoAvg = (30 + 50) / 2;
  const lahalitoAvg = (15 + 35) / 2;
  const madaltoAvg = (30 + 60) / 2;

  assert(
    mahalitoAvg > lahalitoAvg,
    "MAHALITO should beat LAHALITO against one high-HP target."
  );
  assert(
    lahalitoAvg * 2 > mahalitoAvg,
    "LAHALITO should remain better against multiple targets."
  );
  assert(
    mahalitoAvg / 3 > madaltoAvg / 4,
    "MAHALITO should have better single-target MP efficiency than MADALTO."
  );

  console.log("Single-target spell balance checks passed.");
})();

// ========================================================================
// Magic reflect (AoE)  (元: test_magic_reflect_aoe.js)
// ========================================================================
(() => {
  function createCaster(overrides = {}) {
    return {
      name: "MageChar",
      class: "Mage",
      hp: 30,
      maxHp: 30,
      mp: 10,
      status: "ok",
      int: 10,
      pie: 10,
      equipment: {},
      ...overrides
    };
  }

  function createState(caster) {
    return {
      party: [caster],
      floor: 1,
      currentRun: { deathLogs: [] },
      combatState: { turn: 1 }
    };
  }

  function withRandom(values, fn) {
    const originalRandom = Math.random;
    let idx = 0;
    Math.random = () => values[idx++] ?? values[values.length - 1] ?? 0;
    try {
      return fn();
    } finally {
      Math.random = originalRandom;
    }
  }

  console.log("Starting magic reflect AoE tests...");

  {
    console.log("- Test 1: single-target spell reflection still prevents spell damage");
    const caster = createCaster();
    const state = createState(caster);
    const monsters = [
      {
        name: "Mirror",
        hp: 20,
        maxHp: 20,
        traits: ["reflectMagic"],
        magicReflect: { chance: 1 },
        color: "#fff"
      }
    ];
    const logQueue = [];

    withRandom([0, 0], () => {
      resolvePlayerSpell(caster, { spellName: "HALITO", targetIdx: 0 }, state, monsters, logQueue);
    });

    assert.strictEqual(caster.hp, 25, "Single reflect should deal 5 reflected damage.");
    assert.strictEqual(caster.mp, 9, "Spell cost should be spent on reflected cast.");
    assert.strictEqual(monsters[0].hp, 20, "Reflected single-target spell should not damage the reflector.");
    assert.ok(logQueue.some(log => log.msg.includes("Mirrorは呪文を反射した")), "Reflect log should mention the reflector.");
  }

  {
    console.log("- Test 2: AoE spell reflects per target and still hits non-reflectors");
    const caster = createCaster();
    const state = createState(caster);
    const monsters = [
      {
        name: "Mirror",
        hp: 40,
        maxHp: 40,
        traits: ["reflectMagic"],
        magicReflect: { chance: 1 },
        color: "#fff"
      },
      {
        name: "Slime",
        hp: 40,
        maxHp: 40,
        color: "#0f0"
      }
    ];
    const logQueue = [];

    withRandom([0, 0, 0], () => {
      resolvePlayerSpell(caster, { spellName: "LAHALITO", targetIdx: -1 }, state, monsters, logQueue);
    });

    assert.strictEqual(caster.hp, 25, "AoE reflect should deal reflected damage to caster.");
    assert.strictEqual(caster.mp, 7, "AoE spell cost should be spent.");
    assert.strictEqual(monsters[0].hp, 40, "Reflecting target should not take reflected AoE damage.");
    assert.ok(monsters[1].hp < 40, "Non-reflecting target should still take AoE damage.");
    assert.ok(logQueue.some(log => log.msg.includes("ラハリト")), "AoE spell log should still be emitted.");
    assert.ok(logQueue.some(log => log.msg.includes("Mirrorは呪文を反射した")), "AoE reflect log should mention the reflector.");
  }

  {
    console.log("- Test 3: multiple AoE reflectors combine reflected damage");
    const caster = createCaster();
    const state = createState(caster);
    const monsters = [
      {
        name: "Mirror A",
        hp: 40,
        maxHp: 40,
        traits: ["reflectMagic"],
        magicReflect: { chance: 1 },
        color: "#fff"
      },
      {
        name: "Mirror B",
        hp: 40,
        maxHp: 40,
        traits: ["reflectMagic"],
        magicReflect: { chance: 1 },
        color: "#fff"
      }
    ];
    const logQueue = [];

    withRandom([0, 0, 0, 0], () => {
      resolvePlayerSpell(caster, { spellName: "LAHALITO", targetIdx: -1 }, state, monsters, logQueue);
    });

    assert.strictEqual(caster.hp, 20, "Two reflectors should combine reflected damage.");
    assert.deepStrictEqual(monsters.map(mon => mon.hp), [40, 40], "Reflectors should not take reflected AoE damage.");
    assert.ok(logQueue.some(log => log.msg.includes("Mirror A、Mirror Bは呪文を反射した")), "Combined reflect log should list reflectors.");
  }

  console.log("Magic reflect AoE tests passed.");
})();

// ========================================================================
// KATINO sleep  (元: test_katino_sleep.js)
// ========================================================================
(() => {
  function createState(monsterOverrides = {}, partyOverrides = {}) {
    return {
      party: [
        {
          name: "MageChar",
          class: "Mage",
          level: 5,
          hp: 30,
          maxHp: 30,
          mp: 10,
          maxMp: 10,
          status: "ok",
          str: 10,
          int: 10,
          pie: 10,
          vit: 10,
          agi: 50,
          luk: 10,
          equipment: { weapon: "WAND", shield: null, armor: null },
          spells: ["KATINO"],
          ...partyOverrides
        }
      ],
      combatState: {
        monsters: [
          {
            name: "SleepTarget",
            hp: 30,
            maxHp: 30,
            atk: 1,
            def: 0,
            exp: 1,
            gold: 1,
            level: 1,
            row: "front",
            color: "#fff",
            ...monsterOverrides
          }
        ],
        isBoss: false,
        isMidboss: false,
        allParalyzedTurns: 0,
        phase: "choose_actions"
      },
      inventory: [],
      firstKills: [],
      codex: null,
      currentRun: { itemsFound: [], equipmentFound: [] },
      roamingMonsters: [],
      floorChestsTotal: [],
      gold: 0,
      floor: 1
    };
  }

  function withRandom(values, fn) {
    const originalRandom = Math.random;
    let idx = 0;
    Math.random = () => values[idx++] ?? values[values.length - 1] ?? 0;
    try {
      return fn();
    } finally {
      Math.random = originalRandom;
    }
  }

  console.log("Starting KATINO sleep tests...");

  {
    console.log("- Test 1: KATINO sleep naturally expires");
    const state = createState();
    const selection = {
      actions: [{ type: "spell", actorIdx: 0, targetIdx: -1, spellName: "KATINO" }]
    };

    const result1 = withRandom([0, 0, 0], () => runCombatRoundCalculation(state, selection));
    const slept = result1.state.combatState.monsters[0];
    assert.strictEqual(slept.status, "sleep", "KATINO should set sleep status.");
    assert.strictEqual(slept.sleepTurns, 1, "sleepTurns should tick from 2 to 1 at round end.");
    assert.ok(result1.logQueue.some(log => log.msg?.includes("動けない")), "Sleeping monster should skip action.");

    const result2 = withRandom([0, 0], () => runCombatRoundCalculation(result1.state, {
      actions: [{ type: "defend", actorIdx: 0 }]
    }));
    const awake = result2.state.combatState.monsters[0];
    assert.strictEqual(awake.status, undefined, "Sleep should expire after the next skipped enemy turn.");
    assert.strictEqual(awake.sleepTurns, undefined, "Expired sleep should clear sleepTurns.");
  }

  {
    console.log("- Test 2: damage can wake a sleeping monster");
    const state = createState({ status: "sleep", sleepTurns: 2 });
    const result = withRandom([0, 0, 0, 0], () => runCombatRoundCalculation(state, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    }));
    const monster = result.state.combatState.monsters[0];
    assert.strictEqual(monster.status, undefined, "Damage wake roll should clear sleep.");
    assert.strictEqual(monster.sleepTurns, undefined, "Damage wake should clear sleepTurns.");
    assert.ok(result.logQueue.some(log => log.msg?.includes("目を覚ました")), "Wake log should be emitted.");
  }

  {
    console.log("- Test 3: boss sleep chance is reduced");
    const normal = { name: "Normal", hp: 30 };
    const boss = { name: "Boss", hp: 30, isBoss: true };
    const caster = { name: "MageChar", int: 10 };

    SPELL_EFFECTS.KATINO({ caster, target: [normal], rng: () => 0.25 });
    SPELL_EFFECTS.KATINO({ caster, target: [boss], rng: () => 0.25 });

    assert.strictEqual(normal.status, "sleep", "Normal monster should sleep at 0.25 roll.");
    assert.strictEqual(normal.sleepTurns, 2, "Successful KATINO should set sleepTurns.");
    assert.strictEqual(boss.status, undefined, "Boss should resist the same 0.25 roll after chance reduction.");
  }

  console.log("KATINO sleep tests passed.");
})();

// ========================================================================
// WEAKEN debuff  (元: test_weaken_spell.js)
// ========================================================================
(() => {
  console.log("Starting WEAKEN spell tests...");

  // Test 1: Spell Acquisition
  {
    console.log("- Test 1: WEAKEN is learned at correct levels");
    
    // Priest L4
    const priest = {
      class: "Priest",
      level: 3,
      exp: 99999, // enough exp to level up
      maxHp: 30,
      hp: 30,
      maxMp: 10,
      mp: 10,
      spells: []
    };
    checkCharLevelUp(priest, { rng: () => 0.5 });
    assert.ok(priest.spells.includes("WEAKEN"), "Priest should learn WEAKEN at Level 4");

    // Bishop L4
    const bishop = {
      class: "Bishop",
      level: 3,
      exp: 99999,
      maxHp: 30,
      hp: 30,
      maxMp: 10,
      mp: 10,
      spells: []
    };
    checkCharLevelUp(bishop, { rng: () => 0.5 });
    assert.ok(bishop.spells.includes("WEAKEN"), "Bishop should learn WEAKEN at Level 4");

    // Ranger L5
    const ranger = {
      class: "Ranger",
      level: 4,
      exp: 99999,
      maxHp: 30,
      hp: 30,
      maxMp: 10,
      mp: 10,
      spells: []
    };
    checkCharLevelUp(ranger, { rng: () => 0.5 });
    assert.ok(ranger.spells.includes("WEAKEN"), "Ranger should learn WEAKEN at Level 5");
  }

  // Test 2: Spell Effect and getEffectiveAtk
  {
    console.log("- Test 2: WEAKEN effect decreases effective ATK");

    const caster = { name: "PriestChar", class: "Priest", int: 10 };
    const monster1 = { name: "Giant1", hp: 50, atk: 15, buffs: [] };
    const monster2 = { name: "Giant2", hp: 50, atk: 2, buffs: [] }; // test min clamp (min 1)

    // Apply WEAKEN
    const result = SPELL_EFFECTS.WEAKEN({ caster, target: [monster1, monster2] });
    assert.ok(result.log.includes("ウィークンを唱えた"), "Log should contain spell name");

    // Check buffs
    assert.strictEqual(monster1.buffs.length, 1);
    assert.strictEqual(monster1.buffs[0].type, "atk");
    assert.strictEqual(monster1.buffs[0].value, -3);
    assert.strictEqual(monster1.buffs[0].turns, 3);

    // Check effective ATK calculation
    const effAtk1 = getEffectiveAtk(monster1);
    assert.strictEqual(effAtk1, 12, "Effective ATK should be decreased by 3 (15 -> 12)");

    const effAtk2 = getEffectiveAtk(monster2);
    assert.strictEqual(effAtk2, 1, "Effective ATK should clamp to min 1 (2 -> 1)");
  }

  // Test 3: Combat Round Execution
  {
    console.log("- Test 3: WEAKEN reduces incoming physical damage");

    const state = {
      party: [
        {
          name: "FighterChar",
          class: "Fighter",
          level: 5,
          hp: 100,
          maxHp: 100,
          mp: 0,
          maxMp: 0,
          status: "ok",
          str: 15, int: 10, pie: 10, vit: 15, agi: 10, luk: 10,
          equipment: { weapon: null, shield: null, armor: null }
        },
        {
          name: "PriestChar",
          class: "Priest",
          level: 5,
          hp: 50,
          maxHp: 50,
          mp: 10,
          maxMp: 10,
          status: "ok",
          str: 10, int: 10, pie: 15, vit: 10, agi: 50, luk: 10,
          equipment: { weapon: null, shield: null, armor: null },
          spells: ["WEAKEN"]
        }
      ],
      combatState: {
        monsters: [
          {
            id: "Giant",
            name: "Giant",
            hp: 50,
            maxHp: 50,
            atk: 10,
            def: 0,
            exp: 10,
            gold: 10,
            level: 5,
            row: "front",
            color: "#fff",
            buffs: []
          }
        ],
        isBoss: false,
        isMidboss: false,
        allParalyzedTurns: 0,
        phase: "choose_actions"
      },
      inventory: [],
      firstKills: [],
      codex: null,
      currentRun: { itemsFound: [], equipmentFound: [] },
      roamingMonsters: [],
      floorChestsTotal: [],
      gold: 0,
      floor: 1
    };

    // Run a round where Priest casts WEAKEN and Giant fights
    const selection = {
      actions: [
        { type: "fight", actorIdx: 0, targetIdx: 0 },
        { type: "spell", actorIdx: 1, targetIdx: -1, spellName: "WEAKEN" }
      ]
    };

    const result = runCombatRoundCalculation(state, selection);

    const giant = result.state.combatState.monsters[0];
    assert.ok(giant.buffs.some(b => b.type === "atk" && b.value === -3), "Giant should have ATK debuff applied");
  }

  console.log("WEAKEN spell tests passed.");
})();

// ========================================================================
// Paralyze combat flow  (元: test_combat_paralyze.js)
// ========================================================================
(() => {
  function createParalyzedState(partyStatuses, allParalyzedTurns = 0) {
    const party = partyStatuses.map((status, idx) => ({
      name: `Char${idx}`,
      class: "Fighter",
      level: 1,
      hp: status === "dead" ? 0 : 30,
      maxHp: 30,
      mp: 0,
      maxMp: 0,
      status: status,
      str: 10,
      int: 10,
      pie: 10,
      vit: 10,
      agi: 10,
      luk: 10,
      equipment: { weapon: null, shield: null, armor: null },
      spells: [],
      exp: 0
    }));

    return {
      party: party,
      combatState: {
        monsters: [
          { name: "Dummy Monster", hp: 10, maxHp: 10, atk: 1, def: 0, exp: 1, gold: 1, row: "front" }
        ],
        isBoss: false,
        isMidboss: false,
        isRoamingFlack: false,
        allParalyzedTurns: allParalyzedTurns
      },
      inventory: [],
      firstKills: [],
      codex: null,
      currentRun: { itemsFound: [], equipmentFound: [] },
      roamingMonsters: [],
      floorChestsTotal: [],
      gold: 0,
      floor: 1
    };
  }

  console.log("Starting Combat Paralyze Verification Tests...");

  // 1. 全員麻痺時の警告ログとカウント増加の検証
  // Math.random を常に 0.99 にして、麻痺の自然回復（20%未満）が起きないようにする。
  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    // 1ターン目 (allParalyzedTurns: 0)
    const state1 = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 0);
    const result1 = runCombatRoundCalculation(state1, { actions: [] });

    assert.ok(result1.logQueue.some(log => log.msg?.includes("全員が麻痺して動けない")), "全員麻痺時の警告ログ(動けない)が出力されること");
    assert.ok(result1.logQueue.some(log => log.msg?.includes("敵の攻撃を受けるしかない")), "全員麻痺時の警告ログ(受けるしかない)が出力されること");
    assert.strictEqual(result1.state.combatState.allParalyzedTurns, 1, "全員麻痺カウントが1になること");

    // 2ターン目 (allParalyzedTurns: 1)
    const state2 = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 1);
    const result2 = runCombatRoundCalculation(state2, { actions: [] });
    assert.strictEqual(result2.state.combatState.allParalyzedTurns, 2, "全員麻痺カウントが2になること");

    // 3ターン目 (allParalyzedTurns: 2 -> 3に達して全滅)
    const state3 = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 2);
    const result3 = runCombatRoundCalculation(state3, { actions: [] });
    assert.strictEqual(result3.state.combatState.allParalyzedTurns, 3, "全員麻痺カウントが3になること");
    assert.ok(result3.logQueue.some(log => log.msg?.includes("全員が麻痺したまま力尽きた")), "全滅ログが出力されること");
    assert.ok(result3.state.party.every(c => c.status === "dead"), "パーティ全員が死亡状態になること");

  } finally {
    Math.random = originalRandom;
  }

  // 2. 麻痺の自然回復とカウントリセットの検証
  // Math.random を 0.05 にして、20%の確率の自然回復が確実に発生するようにする。
  Math.random = () => 0.05;

  try {
    const state = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 1);
    const result = runCombatRoundCalculation(state, { actions: [] });

    assert.ok(result.logQueue.some(log => log.msg?.includes("麻痺から回復した")), "回復ログが出力されること");
    assert.strictEqual(result.state.party[0].status, "ok", "キャラクターのステータスが ok になること");
    assert.strictEqual(result.state.combatState.allParalyzedTurns, 0, "全員麻痺カウントがリセットされること");
  } finally {
    Math.random = originalRandom;
  }

  // 3. 一部が麻痺で、行動可能キャラがいる場合
  // 行動可能なキャラクター(ok)がいるのでカウントは進まない/リセットされること
  try {
    const state = createParalyzedState(["paralyzed", "ok", "dead", "dead"], 1);
    const result = runCombatRoundCalculation(state, { actions: [] });

    assert.strictEqual(result.state.combatState.allParalyzedTurns, 0, "行動可能なキャラクターがいる場合はカウントがリセットされること");
  } finally {
    Math.random = originalRandom;
  }

  // 4. 非全員麻痺から全員麻痺への状態遷移テスト
  // ターン開始時は麻痺+毒(生存)であり、ターン終了時の毒ダメージで毒キャラが死亡。
  // 結果として生存メンバーが全員麻痺になり、allParalyzedTurns が 1 に増えることを検証。
  try {
    Math.random = () => 0.99;
    const state = createParalyzedState(["paralyzed", "poisoned", "dead", "dead"], 0);
    // 毒キャラのHPを2に設定し、確実に毒ダメージ(2-4)で死亡するようにする
    state.party[1].hp = 2;

    // 毒ダメージが確実に発生するように Math.random を固定
    const result = runCombatRoundCalculation(state, { actions: [] });

    assert.strictEqual(result.state.party[1].status, "dead", "毒キャラが死亡していること");
    assert.strictEqual(result.state.combatState.allParalyzedTurns, 1, "毒キャラ死亡により全員麻痺になり、カウントが1になること");
  } finally {
    Math.random = originalRandom;
  }

  // 5. 全員麻痺状態での戦闘終了（勝利）時の検証
  // 味方が全員麻痺しているが、敵が全滅(逃亡/毒など)して戦闘勝利になった場合、敗北ではなく勝利で終わることを検証。
  try {
    const state = createParalyzedState(["paralyzed", "dead", "dead", "dead"], 1);
    // 敵のHPを0にして最初から全滅状態にする
    state.combatState.monsters[0].hp = 0;

    const result = runCombatRoundCalculation(state, { actions: [] });

    assert.ok(result.logQueue.some(log => log.msg?.includes("戦闘に勝利した") || log.msg?.includes("静寂が戻った")), "戦闘勝利または静寂ログが出力されること");
    assert.strictEqual(result.state.party[0].status, "paralyzed", "キャラクターは麻痺状態のままであること");
  } finally {
    Math.random = originalRandom;
  }

  // 6. すでにステータス異常（毒/暗闇/睡眠）のキャラクターに麻痺攻撃が当たっても上書きされないことの検証
  try {
    const state = createParalyzedState(["poisoned", "dead", "dead", "dead"], 0);
    state.combatState.monsters[0].isParalyzing = true;
    state.combatState.monsters[0].statusChance = 1.0;

    Math.random = () => 0.01;

    const result = runCombatRoundCalculation(state, { actions: [] });

    assert.strictEqual(result.state.party[0].status, "poisoned", "毒状態のキャラクターが麻痺で上書きされないこと");
  } finally {
    Math.random = originalRandom;
  }

  console.log("All Combat Paralyze verification tests passed successfully!");
})();

// ========================================================================
// Ally sleep combat flow
// ========================================================================
(() => {
  function createSleepState(partyOverrides = {}, monsterOverrides = {}) {
    return {
      party: [
        {
          name: "Char0",
          class: "Fighter",
          level: 1,
          hp: 30,
          maxHp: 30,
          mp: 0,
          maxMp: 0,
          status: "ok",
          str: 10,
          int: 10,
          pie: 10,
          vit: 10,
          agi: 10,
          luk: 10,
          equipment: { weapon: null, shield: null, armor: null },
          spells: [],
          exp: 0,
          ...partyOverrides
        }
      ],
      combatState: {
        monsters: [
          {
            name: "Sleep Beast",
            hp: 20,
            maxHp: 20,
            atk: 1,
            def: 0,
            exp: 1,
            gold: 1,
            row: "front",
            buffs: [],
            ...monsterOverrides
          }
        ],
        isBoss: false,
        isMidboss: false,
        isRoamingFlack: false,
        allParalyzedTurns: 0,
        phase: "choose_actions"
      },
      inventory: [],
      firstKills: [],
      codex: null,
      currentRun: { itemsFound: [], equipmentFound: [] },
      roamingMonsters: [],
      floorChestsTotal: [],
      gold: 0,
      floor: 1
    };
  }

  function withRandom(values, fn) {
    const originalRandom = Math.random;
    let idx = 0;
    Math.random = () => values[idx++] ?? values[values.length - 1] ?? 0;
    try {
      return fn();
    } finally {
      Math.random = originalRandom;
    }
  }

  console.log("Starting Ally Sleep verification tests...");

  {
    const state = createSleepState({}, { isSleepInflicting: true, statusChance: 1 });
    const result = withRandom([0, 0, 0, 0, 0], () => runCombatRoundCalculation(state, {
      actions: [{ type: "defend", actorIdx: 0 }]
    }));

    assert.strictEqual(result.state.party[0].status, "sleep", "Sleep-inflicting monster should put an ok ally to sleep.");
    assert.strictEqual(result.state.party[0].sleepTurns, 1, "Newly inflicted ally sleep should tick from 2 to 1 at round end.");
    assert.ok(result.logQueue.some(log => log.msg?.includes("眠りに落ちた")), "Sleep infliction log should be emitted.");
  }

  {
    const state = createSleepState({ status: "sleep", sleepTurns: 2 });
    const result = withRandom([0.99], () => runCombatRoundCalculation(state, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    }));

    assert.strictEqual(result.state.combatState.monsters[0].hp, 20, "Sleeping ally should skip selected actions.");
    assert.strictEqual(result.state.party[0].status, "sleep", "Sleeping ally should remain asleep when damage wake roll fails.");
    assert.strictEqual(result.state.party[0].sleepTurns, 1, "Sleeping ally duration should tick at round end.");
  }

  {
    const state = createSleepState({ status: "sleep", sleepTurns: 2 });
    const result = withRandom([0, 0, 0, 0], () => runCombatRoundCalculation(state, {
      actions: []
    }));

    assert.strictEqual(result.state.party[0].status, "ok", "Damage wake roll should clear ally sleep.");
    assert.strictEqual(result.state.party[0].sleepTurns, undefined, "Damage wake should clear ally sleepTurns.");
    assert.ok(result.logQueue.some(log => log.msg?.includes("目を覚ました")), "Damage wake log should be emitted.");
  }

  {
    const state = createSleepState({ status: "sleep", sleepTurns: 1 });
    const result = withRandom([0.99], () => runCombatRoundCalculation(state, {
      actions: []
    }));

    assert.strictEqual(result.state.party[0].status, "ok", "Ally sleep should naturally expire.");
    assert.strictEqual(result.state.party[0].sleepTurns, undefined, "Expired ally sleep should clear sleepTurns.");
    assert.strictEqual(result.state.combatState.allParalyzedTurns, 0, "All-sleep party should not advance all-paralyzed defeat counter.");
    assert.ok(result.state.party[0].hp > 0, "All-sleep party should not be defeated by sleep itself.");
  }

  {
    const caster = { name: "PriestChar" };
    const dialkoTarget = { name: "Char0", status: "sleep", sleepTurns: 2 };
    SPELL_EFFECTS.DIALKO({ caster, target: dialkoTarget });
    assert.strictEqual(dialkoTarget.status, "ok", "DIALKO should cure ally sleep.");
    assert.strictEqual(dialkoTarget.sleepTurns, undefined, "DIALKO should clear sleepTurns.");

    const wakeTarget = { name: "Char1", status: "sleep", sleepTurns: 2 };
    ITEM_EFFECTS.WAKE_POWDER({ char: wakeTarget });
    assert.strictEqual(wakeTarget.status, "ok", "Wake powder should cure ally sleep.");
    assert.strictEqual(wakeTarget.sleepTurns, undefined, "Wake powder should clear sleepTurns.");

    const panaceaTarget = { name: "Char2", status: "sleep", sleepTurns: 2 };
    ITEM_EFFECTS.PANACEA({ char: panaceaTarget });
    assert.strictEqual(panaceaTarget.status, "ok", "PANACEA should cure ally sleep.");
    assert.strictEqual(panaceaTarget.sleepTurns, undefined, "PANACEA should clear sleepTurns.");
  }

  console.log("All Ally Sleep verification tests passed successfully!");
})();

// ========================================================================
// LAHALITO countermeasures (MABARRIER/MONTINO/MORLIS)  (元: test_lahalito_counter.js)
// ========================================================================
(() => {
  // Helper to create basic party and monster state
  function createTestState() {
    const party = [
      {
        name: "PriestChar",
        class: "Priest",
        level: 5,
        hp: 30,
        maxHp: 30,
        mp: 10,
        maxMp: 10,
        status: "ok",
        str: 10, int: 10, pie: 15, vit: 10, agi: 15, luk: 10,
        equipment: { weapon: null, shield: null, armor: null },
        spells: ["DIOS", "MABARRIER"]
      },
      {
        name: "MageChar",
        class: "Mage",
        level: 5,
        hp: 20,
        maxHp: 20,
        mp: 10,
        maxMp: 10,
        status: "ok",
        str: 10, int: 16, pie: 10, vit: 10, agi: 12, luk: 10,
        equipment: { weapon: null, shield: null, armor: null },
        spells: ["HALITO", "MONTINO", "MORLIS"]
      }
    ];

    const monsters = [
      {
        name: "マスターメイジ",
        hp: 50,
        maxHp: 50,
        atk: 5,
        def: 5,
        exp: 100,
        gold: 50,
        level: 4,
        spell: "LAHALITO",
        spellChance: 1.0, // Force spell try
        row: "back"
      }
    ];

    return {
      party,
      combatState: {
        monsters,
        isBoss: false,
        isMidboss: false,
        isRoamingFlack: false,
        allParalyzedTurns: 0,
        phase: "choose_actions"
      },
      inventory: [],
      firstKills: [],
      codex: null,
      currentRun: { itemsFound: [], equipmentFound: [] },
      roamingMonsters: [],
      floorChestsTotal: [],
      gold: 0,
      floor: 1
    };
  }

  console.log("Starting Lahalito Countermeasure Tests...");

  // 1. MABARRIER バフの適用、ダメージ軽減、乗算、上限のテスト
  {
    console.log("- Test 1: MABARRIER mechanics");
    const state = createTestState();
    
    // 1-1. 呪文の発動と mabarrierTurns の付与
    const selection = {
      actions: [
        { type: "spell", actorIdx: 0, targetIdx: -1, spellName: "MABARRIER" }
      ]
    };

    // Math.random を固定して他の不確定要素を抑える
    const originalRandom = Math.random;
    Math.random = () => 0.0; // 敵の行動決定等で確実に動作するように

    try {
      const result = runCombatRoundCalculation(state, selection);
      const priest = result.state.party[0];
      const mage = result.state.party[1];

      assert.strictEqual(priest.mabarrierTurns, 2, "1ターン経過後に mabarrierTurns が 2 に減少していること（適用時は3）");
      assert.strictEqual(mage.mabarrierTurns, 2, "同乗しているメンバー全員に mabarrierTurns が適用されていること");
      assert.ok(result.logQueue.some(log => log.msg?.includes("マバリアを唱えた")), "マバリアのログが出力されていること");

      // 1-2. MABARRIER によるダメージ軽減の検証
      // MABARRIER (30% 軽減) 単体の時、ダメージが30%軽減されるか
      // 敵からのラハリト発動を模倣してダメージ軽減を検証する
      // ラハリトのダメージは 10-25 (一般敵)。防御無しで受ける。
      // Math.random = 0.5 の場合、ラハリトダメージは Math.floor(0.5 * 15) + 10 = 17 ダメージ。
      // 30% 軽減の場合、17 * 0.7 = 11.9 -> 12 ダメージになるはず。
      Math.random = () => 0.5;
      
      const stateMabarrier = createTestState();
      stateMabarrier.party[0].mabarrierTurns = 3;
      stateMabarrier.party[1].mabarrierTurns = 3;
      stateMabarrier.combatState.monsters[0].lahalitoQueued = true;
      
      const resultDmg = runCombatRoundCalculation(stateMabarrier, {
        actions: [
          { type: "defend", actorIdx: 0 },
          { type: "defend", actorIdx: 1 }
        ]
      });
      
      // 防御（50%軽減）と MABARRIER（30%軽減）が同時に効いている。
      // 元ダメージ = 17。
      // 防御で 17 * 0.5 = 8.5 -> 9。
      // MABARRIER で 9 * (1 - 0.3) = 6.3 -> 6 ダメージ。
      // 最終ダメージが 6 になっているか確認。
      const logChar0 = resultDmg.logQueue.find(log => log.msg?.includes("PriestCharは") && log.msg?.includes("炎ダメージを受けた"));
      assert.ok(logChar0.msg.includes("6の炎ダメージを受けた"), `防御とマバリア適用時のダメージ検証。ログ: ${logChar0.msg}`);
      assert.ok(logChar0.msg.includes("(半減)"), "防御ログが含まれていること");
      
      // 1-3. 軽減上限 (60%) の検証
      // spellGuard 装備 (40% 軽減) と MABARRIER (30% 軽減) がある場合、
      // 合計軽減率は上限60%に制限される。
      // 元ダメージ = 17。防御なしの場合、17 * (1 - 0.6) = 6.8 -> 7 ダメージ。
      const stateLimit = createTestState();
      stateLimit.party[0].mabarrierTurns = 3;
      stateLimit.combatState.monsters[0].lahalitoQueued = true;
      stateLimit.party[0].equipment.armor = {
        id: "LEATHER_ARMOR",
        name: "魔導鎧",
        identified: true,
        affixes: [
          { type: "spellGuard", value: 40 }
        ]
      };
      
      const resultLimit = runCombatRoundCalculation(stateLimit, {
        actions: [
          { type: "fight", actorIdx: 0, targetIdx: 0 },
          { type: "fight", actorIdx: 1, targetIdx: 0 }
        ]
      });
      
      const logCharLimit = resultLimit.logQueue.find(log => log.msg?.includes("PriestCharは") && log.msg?.includes("炎ダメージを受けた"));
      assert.ok(logCharLimit.msg.includes("7の炎ダメージを受けた"), `軽減上限60%の検証。ログ: ${logCharLimit.msg}`);
      assert.ok(resultLimit.logQueue.some(log => log.msg?.includes("結界と魔除け")), "結界と魔除けの軽減ログが含まれていること");

      // 1-4. ターン経過による MABARRIER の消失
      const stateExpire = createTestState();
      stateExpire.party[0].mabarrierTurns = 1;
      
      const resultExpire = runCombatRoundCalculation(stateExpire, {
        actions: [
          { type: "defend", actorIdx: 0 },
          { type: "defend", actorIdx: 1 }
        ]
      });
      assert.strictEqual(resultExpire.state.party[0].mabarrierTurns, 0, "1ターン経過後に mabarrierTurns が 0 になること");
    } finally {
      Math.random = originalRandom;
    }
  }

  // 2. MONTINO (沈黙) 成功率と強敵減衰のテスト
  {
    console.log("- Test 2: MONTINO mechanics");
    const state = createTestState();
    const selection = {
      actions: [
        { type: "defend", actorIdx: 0 },
        { type: "spell", actorIdx: 1, targetIdx: -1, spellName: "MONTINO" }
      ]
    };

    const originalRandom = Math.random;
    try {
      // 2-1. 成功率の検証
      Math.random = () => 0.0;
      const result = runCombatRoundCalculation(state, selection);
      const targetMonster = result.state.combatState.monsters[0];
      
      assert.strictEqual(targetMonster.silenceTurns, 1, "沈黙デバフ silenceTurns が 1 に設定されていること（適用時は2、ターン終了で1減少）");
      assert.ok(result.logQueue.some(log => log.msg?.includes("敵1体を沈黙させた")), "沈黙ログが出力されていること");

      // 2-2. 敵が沈黙中にラハリトを唱えようとすると通常攻撃にフォールバックされること
      const stateSilenced = createTestState();
      stateSilenced.combatState.monsters[0].silenceTurns = 2;
      stateSilenced.combatState.monsters[0].lahalitoQueued = true;
      
      Math.random = () => 0.5;
      const resultSilenceRun = runCombatRoundCalculation(stateSilenced, {
        actions: [
          { type: "defend", actorIdx: 0 },
          { type: "defend", actorIdx: 1 }
        ]
      });

      assert.ok(resultSilenceRun.state.combatState.monsters[0].lahalitoQueued === false, "沈黙により予兆フラグがクリアされていること");
      assert.ok(resultSilenceRun.logQueue.some(log => log.msg?.includes("攻撃！")), "呪文の代わりに物理攻撃を行っていること");
      assert.ok(!resultSilenceRun.logQueue.some(log => log.msg?.includes("ラハリト")), "ラハリトを唱えていないこと");
    } finally {
      Math.random = originalRandom;
    }
  }

  // 3. MORLIS (魔防低下デバフ) の効果テスト
  {
    console.log("- Test 3: MORLIS mechanics");
    const state = createTestState();
    const selection = {
      actions: [
        { type: "defend", actorIdx: 0 },
        { type: "spell", actorIdx: 1, targetIdx: -1, spellName: "MORLIS" }
      ]
    };

    const originalRandom = Math.random;
    try {
      Math.random = () => 0.0;
      const result = runCombatRoundCalculation(state, selection);
      const targetMonster = result.state.combatState.monsters[0];

      const magicResistBuff = targetMonster.buffs.find(b => b.type === "magicResist");
      assert.ok(magicResistBuff, "魔法耐性デバフが付与されていること");
      assert.strictEqual(magicResistBuff.value, -0.2, "魔法耐性が-20%されていること");
      assert.strictEqual(magicResistBuff.turns, 2, "効果時間が2ターンであること（適用時は3、ターン終了で1減少）");
    } finally {
      Math.random = originalRandom;
    }
  }

  // 4. ラハリト予兆・確定発動・解除のテスト
  {
    console.log("- Test 4: Lahalito warning mechanism");
    
    const originalRandom = Math.random;
    try {
      // 4-1. 予兆の発生
      const state = createTestState();
      Math.random = () => 0.0;
      
      const result1 = runCombatRoundCalculation(state, {
        actions: [
          { type: "defend", actorIdx: 0 },
          { type: "defend", actorIdx: 1 }
        ]
      });

      const monster1 = result1.state.combatState.monsters[0];
      assert.strictEqual(monster1.lahalitoQueued, true, "ラハリトが選択され、予兆状態 (lahalitoQueued = true) がセットされること");
      assert.ok(result1.logQueue.some(log => log.msg?.includes("周囲に炎が渦巻く！")), "予兆警告ログが出力されていること");
      assert.ok(!result1.logQueue.some(log => log.msg?.includes("ラハリト）を吹き出した")), "1ターン目にはラハリトを撃っていないこと");

      // 4-2. 2ターン目：確定発動
      const state2 = result1.state;
      state2.combatState.monsters[0].spellChance = 0.0;
      
      const result2 = runCombatRoundCalculation(state2, {
        actions: [
          { type: "defend", actorIdx: 0 },
          { type: "defend", actorIdx: 1 }
        ]
      });

      const monster2 = result2.state.combatState.monsters[0];
      assert.strictEqual(monster2.lahalitoQueued, false, "ラハリト発動後に予兆フラグがクリアされていること");
      assert.ok(result2.logQueue.some(log => log.msg?.includes("ラハリト）を吹き出した")), "確定でラハリトが発動すること");

      // 4-3. 予兆中の状態異常による予兆リセット
      const stateWarning = createTestState();
      stateWarning.combatState.monsters[0].lahalitoQueued = true;
      stateWarning.combatState.monsters[0].status = "sleep";

      const resultSleep = runCombatRoundCalculation(stateWarning, {
        actions: [
          { type: "defend", actorIdx: 0 },
          { type: "defend", actorIdx: 1 }
        ]
      });

      const monsterSleep = resultSleep.state.combatState.monsters[0];
      assert.strictEqual(monsterSleep.lahalitoQueued, false, "睡眠により予兆状態がクリアされること");
    } finally {
      Math.random = originalRandom;
    }
  }

  console.log("All Lahalito Countermeasure tests passed successfully!");
})();

// ========================================================================
// MADI heal  (元: test_spell_madi.js)
// ========================================================================
(() => {
  console.log("Starting MADI spell tests...");

  // Test 1: Spell Acquisition
  {
    console.log("- Test 1: MADI is learned at correct levels");

    // Priest L5
    const priest = {
      class: "Priest",
      level: 4,
      exp: 99999,
      maxHp: 30, hp: 30,
      maxMp: 10, mp: 10,
      spells: []
    };
    checkCharLevelUp(priest, { rng: () => 0.5 });
    assert.ok(priest.spells.includes("MADI"), "Priest should learn MADI at Level 5");

    // Ranger L6
    const ranger = {
      class: "Ranger",
      level: 5,
      exp: 99999,
      maxHp: 30, hp: 30,
      maxMp: 10, mp: 10,
      spells: []
    };
    checkCharLevelUp(ranger, { rng: () => 0.5 });
    assert.ok(ranger.spells.includes("MADI"), "Ranger should learn MADI at Level 6");

    // Bishop L7
    const bishop = {
      class: "Bishop",
      level: 6,
      exp: 99999,
      maxHp: 30, hp: 30,
      maxMp: 10, mp: 10,
      spells: []
    };
    checkCharLevelUp(bishop, { rng: () => 0.5 });
    assert.ok(bishop.spells.includes("MADI"), "Bishop should learn MADI at Level 7");
  }

  // Test 2: Spell Effect (Direct invocation)
  {
    console.log("- Test 2: MADI effect rules (dead skips, max Hp clamp, stat bonuses)");

    const caster = {
      name: "PriestChar",
      class: "Priest",
      pie: 15, // PIE bonus = 1.0 + (15 - 10) * 0.05 = 1.25
      equipment: {}
    };

    // Test devotion affix (+20% heal)
    caster.equipment = {
      weapon: { name: "Mace", affixes: { devotion: 20 } }
    };

    const allies = [
      { name: "FighterChar", class: "Fighter", hp: 10, maxHp: 100, status: "ok" },
      { name: "DeadChar", class: "Thief", hp: 0, maxHp: 50, status: "dead" },
      { name: "FullChar", class: "Mage", hp: 50, maxHp: 50, status: "ok" }
    ];

    // Heal value logic: 25-40 (rng: 0.5 -> 33)
    // PIE 15 bonus: * 1.10 -> 36.3
    // devotion 20% bonus: * 1.20 -> 43.56 -> round: 44
    const rng = () => 0.5;

    const result = SPELL_EFFECTS.MADI({ caster, target: allies, rng });

    assert.strictEqual(allies[0].hp, 54, "Fighter should be healed by 44 (10 -> 54)");
    assert.strictEqual(allies[1].hp, 0, "Dead member should remain at 0 HP");
    assert.strictEqual(allies[1].status, "dead", "Dead member should remain dead");
    assert.strictEqual(allies[2].hp, 50, "Full HP member should stay clamped at maxHp (50)");

    assert.ok(result.heal > 0, "Total heal should be recorded");
    assert.ok(result.log.includes("マディ"), "Log should contain spell name");
    assert.ok(result.log.includes("FighterChar(+44)"), "Log details should list healed ally and amount");
    assert.ok(!result.log.includes("DeadChar"), "Log should not mention dead member");

    // Test case when everyone is at full HP
    const allFull = [
      { name: "FighterChar", class: "Fighter", hp: 100, maxHp: 100, status: "ok" }
    ];
    const resultAllFull = SPELL_EFFECTS.MADI({ caster, target: allFull, rng });
    assert.strictEqual(resultAllFull.heal, 0, "Heal amount should be 0 when everyone is full");
    assert.ok(resultAllFull.log.includes("最大だった"), "Log should mention HP was max");
  }

  // Test 4: Combat cast integration
  {
    console.log("- Test 4: Combat round casting integration");

    const combatState = {
      party: [
        {
          name: "FighterChar", class: "Fighter", level: 5, hp: 10, maxHp: 100, mp: 0, maxMp: 0, status: "ok",
          str: 15, int: 10, pie: 10, vit: 15, agi: 10, luk: 10, equipment: {}
        },
        {
          name: "PriestChar", class: "Priest", level: 5, hp: 50, maxHp: 50, mp: 10, maxMp: 10, status: "ok",
          str: 10, int: 10, pie: 15, vit: 10, agi: 50, luk: 10, equipment: {}, spells: ["MADI"]
        }
      ],
      combatState: {
        monsters: [
          {
            id: "Giant", name: "Giant", hp: 50, maxHp: 50, atk: 10, def: 0, exp: 10, gold: 10,
            level: 5, row: "front", color: "#fff", buffs: []
          }
        ],
        isBoss: false, isMidboss: false, allParalyzedTurns: 0, phase: "choose_actions"
      },
      inventory: [], firstKills: [], codex: null, currentRun: { itemsFound: [], equipmentFound: [] },
      roamingMonsters: [], floorChestsTotal: [], gold: 0, floor: 1
    };

    const selection = {
      actions: [
        { type: "fight", actorIdx: 0, targetIdx: 0 },
        { type: "spell", actorIdx: 1, targetIdx: -1, spellName: "MADI" }
      ]
    };

    const result = runCombatRoundCalculation(combatState, selection);
    
    assert.ok(result.state.party[0].hp > 10, "Fighter HP should increase after Priest casts MADI in round");
  }

  console.log("MADI spell tests passed.");
})();

console.log("\n[ALL SPELL TESTS PASSED]");
