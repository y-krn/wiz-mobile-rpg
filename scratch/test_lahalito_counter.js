// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { SPELLS } from "../src/data.js";

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
