import assert from "node:assert/strict";

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
  className: "",
  cloneNode: () => createDummyElement(),
});

global.document = {
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  body: createDummyElement(),
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  configurable: true,
});

const {
  getMilestoneBossRule,
  getMilestoneBossExposureMultiplier,
  shouldBreakMilestoneBossGuard,
} = await import("../src/rules/boss_rules.js");
const { getDamageAffixResult } = await import("../src/rules/affix_rules.js");
const { resolveBossAction } = await import("../src/combat_logic/boss_actions.js");
const { state } = await import("../src/state/state_core.js");
const { applySavePayload, createSavePayload } = await import("../src/state/save_payload.js");

const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

await test("B5ルールはデーモンガードだけに解決される", () => {
  const rule = getMilestoneBossRule(5, "デーモンガード", { isBoss: true });
  assert.equal(rule?.id, "B5_DEMON_GUARD_BREAK");
  assert.equal(getMilestoneBossRule(4, "デーモンガード", { isBoss: true }), null);
  assert.equal(getMilestoneBossRule(5, "デーモンガード", { isBoss: false }), null);
  assert.equal(getMilestoneBossRule(5, "フラック", { isBoss: true }), null);
});

await test("詠唱中かつHP閾値以下でだけ装甲崩しを判定する", () => {
  const rule = getMilestoneBossRule(5, "デーモンガード", { isBoss: true });
  assert.equal(
    shouldBreakMilestoneBossGuard(
      { hp: 80, maxHp: 100, lahalitoQueued: false },
      rule
    ),
    false
  );
  assert.equal(
    shouldBreakMilestoneBossGuard(
      { hp: 81, maxHp: 100, lahalitoQueued: true },
      rule
    ),
    false
  );
  assert.equal(
    shouldBreakMilestoneBossGuard(
      { hp: 80, maxHp: 100, lahalitoQueued: true },
      rule
    ),
    true
  );
});

await test("B5の露出倍率は既存affixダメージ経路だけに乗る", () => {
  const char = { hp: 100, maxHp: 100, equipment: {} };
  const b5Boss = { name: "デーモンガード", isBoss: true, maxHp: 200, tags: [] };
  const b6Boss = { name: "デーモンガード", isBoss: true, maxHp: 200, tags: [] };
  assert.equal(
    getMilestoneBossExposureMultiplier(5, { ...b5Boss, b5ExposureTurns: 4 }),
    1.5
  );
  assert.equal(getMilestoneBossExposureMultiplier(6, { ...b6Boss, b5ExposureTurns: 4 }), 1);
  assert.equal(
    getDamageAffixResult(char, { ...b5Boss, b5ExposureTurns: 4 }, 100, { floor: 5 }).damage,
    150
  );
  assert.equal(
    getDamageAffixResult(char, { ...b5Boss, b5ExposureTurns: 0 }, 100, { floor: 5 }).damage,
    100
  );
});

await test("B5の詠唱崩しは攻撃を中断し、次の攻撃窓を消費する", () => {
  const stateForCombat = {
    floor: 5,
    combatState: { isBoss: true },
  };
  const monster = {
    name: "デーモンガード",
    hp: 150,
    maxHp: 200,
    lahalitoQueued: true,
    b5GuardBroken: false,
    b5ExposureTurns: 0,
  };
  const logQueue = [];
  assert.equal(resolveBossAction(monster, stateForCombat, { actions: [] }, [monster], logQueue), true);
  assert.equal(monster.lahalitoQueued, false);
  assert.equal(monster.b5GuardBroken, true);
  assert.equal(monster.b5ExposureTurns, 4);
  assert.match(logQueue[0].msg, /装甲が砕けた/);

  const nextLogQueue = [];
  assert.equal(resolveBossAction(monster, stateForCombat, { actions: [] }, [monster], nextLogQueue), true);
  assert.equal(monster.b5ExposureTurns, 3);
  assert.match(nextLogQueue[0].msg, /攻撃できない/);
});

await test("新しいcombatStateフィールドはsave→loadされ、旧セーブも読める", () => {
  state.party = [{ name: "戦士" }];
  state.gameState = "combat";
  state.combatState = {
    isBoss: true,
    monsters: [{
      name: "デーモンガード",
      hp: 100,
      maxHp: 200,
      b5GuardBroken: true,
      b5ExposureTurns: 3,
    }],
  };

  const payload = JSON.parse(JSON.stringify(createSavePayload()));
  state.combatState = null;
  applySavePayload(payload);
  assert.equal(state.combatState.monsters[0].b5GuardBroken, true);
  assert.equal(state.combatState.monsters[0].b5ExposureTurns, 3);

  const legacyPayload = JSON.parse(JSON.stringify(payload));
  delete legacyPayload.combatState.monsters[0].b5GuardBroken;
  delete legacyPayload.combatState.monsters[0].b5ExposureTurns;
  assert.doesNotThrow(() => applySavePayload(legacyPayload));
  assert.equal(state.combatState.monsters[0].b5GuardBroken, undefined);
  assert.equal(state.combatState.monsters[0].b5ExposureTurns, undefined);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} B5 boss test(s) failed.`);
  process.exit(1);
}
