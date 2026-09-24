// Mock minimal environment for state and DOM (configured BEFORE imports)
const makeDummyElement = () => {
  const listeners = {};
  return {
    style: {},
    appendChild: () => {},
    replaceChildren: () => {},
    addEventListener: (event, cb) => {
      listeners[event] = cb;
    },
    trigger: (event, ...args) => {
      if (listeners[event]) {
        listeners[event](...args);
      }
    },
    innerHTML: "",
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {}
    },
    setAttribute: () => {},
    getAttribute: () => ""
  };
};

global.document = {
  getElementById: () => makeDummyElement(),
  createElement: () => makeDummyElement(),
  querySelector: () => makeDummyElement()
};
global.window = {};
global.localStorage = {
  getItem: () => "false",
  writes: 0,
  setItem() { this.writes++; }
};

const { state } = await import("../../../src/state.js");
const { renderEventTablet } = await import("../../../src/menu/explore_actions.js");
const assert = (await import("assert")).default;

console.log("=== TABLET EVENT GOLD REMOVAL VERIFICATION ===");

// 1. Setup state party & floor
state.floor = 1;
state.gold = 500;
state.party = [
  { name: "冒険者", status: "alive", exp: 0, hp: 20, maxHp: 20 }
];
state.logs = [];
state.maps[0] = [
  [
    { event: "event_tablet" }
  ]
];
state.x = 0;
state.y = 0;

// Mock Math.random to guarantee tablet success (40% rate -> rand < 0.40)
const originalRandom = Math.random;
Math.random = () => 0.2; // 0.2 < 0.40 (当たり分岐に入る)

// Setup optGrid
const optGrid = {
  children: [],
  appendChild: function(child) {
    this.children.push(child);
  },
  replaceChildren: function(...children) {
    this.children = children;
  }
};

// Execute render
renderEventTablet(optGrid);

// Find "文字を読む" button
const btnRead = optGrid.children[0];
assert.strictEqual(btnRead.textContent, "文字を読む");

// Trigger Click
btnRead.trigger("click");

// Restore Math.random
Math.random = originalRandom;

// Verify results
console.log(`[Result] Gold after event: ${state.gold}G (Expected: 500G)`);
console.log(`[Result] Character 1 EXP: ${state.party[0].exp} (Expected: 200)`);
console.log(`[Result] Tablet log: ${state.logs.at(-1)} (Expected: singular adventurer wording)`);

// Asserts
assert.strictEqual(state.gold, 500, "Gold must NOT increase from tablet event");
assert.strictEqual(state.party[0].exp, 200, "The adventurer should gain 200 EXP on Floor 1");
assert.ok(state.logs.some(log => log.includes("冒険者は200の経験値を獲得した")), "Tablet log should use singular player wording");

function runTablet({ floor, randomValues, contract, party, action = "read" }) {
  state.floor = floor;
  state.party = party;
  state.logs = [];
  state.currentRun = { expGained: 0, deathLogs: [] };
  state.codex.events.facilities.tablet.read = 0;
  state.maps[floor - 1] = [[{ event: "event_tablet" }]];
  state.x = 0;
  state.y = 0;
  const grid = { children: [], appendChild(child) { this.children.push(child); } };
  renderEventTablet(grid, contract ? { diagnosticContract: contract } : undefined);
  const original = Math.random;
  let index = 0;
  Math.random = () => randomValues[index++] ?? 0;
  try {
    grid.children[action === "read" ? 0 : 1].trigger("click");
  } finally {
    Math.random = original;
  }
  return { cell: state.map[0][0], logs: [...state.logs], randomCalls: index };
}

const candidateExp = new Map([[1, 80], [5, 80], [10, 83], [20, 90], [30, 96]]);
for (const [floor, expectedExp] of candidateExp) {
  const char = { name: "候補検証", status: "alive", exp: 0, level: 1, hp: 20, maxHp: 20 };
  const { cell } = runTablet({ floor, randomValues: [0.399, 0], contract: "phase4j-c-v1", party: [char] });
  assert.equal(char.exp, expectedExp, `candidate EXP at B${floor}`);
  assert.equal(char.level, 1, `no immediate level-up at B${floor}`);
  assert.equal(cell.event, null, `Read consumes tablet at B${floor}`);
  assert.equal(char.exp < 100, true, `one success does not fund Lv2 at B${floor}`);
  runTablet({ floor, randomValues: [0.399, 0], contract: "phase4j-c-v1", party: [char] });
  assert.ok(char.exp < 400, `two successes do not fund Lv3 at B${floor}`);
}

for (const [rawMaxHp, expectedDamage] of [[20, 7], [25, 9], [30, 11]]) {
  const char = { name: "罠検証", status: "alive", exp: 0, hp: 40, maxHp: rawMaxHp };
  runTablet({ floor: 10, randomValues: [0.4, 0], contract: "phase4j-c-v1", party: [char, { name: "同行者", status: "alive", exp: 0, hp: 20, maxHp: 20 }] });
  assert.equal(char.hp, 40 - expectedDamage, `raw maxHP ${rawMaxHp} trap damage`);
}

const { getCharMaxHp } = await import("../../../src/rules/character_stats.js");
const gearedChar = { name: "護符装備", status: "alive", exp: 0, hp: 30, maxHp: 20, equipment: { accessory: "AMULET_HP" } };
assert.equal(getCharMaxHp(gearedChar), 30, "HP equipment increases effective HP buffer");
runTablet({ floor: 30, randomValues: [0.4, 0], contract: "phase4j-c-v1", party: [gearedChar, { name: "同行者", status: "alive", exp: 0, hp: 20, maxHp: 20 }] });
assert.equal(gearedChar.hp, 23, "HP equipment is excluded from candidate damage; raw 20 takes 7");

for (const [hp, expectedStatus, cause] of [[7, "dead", "石碑の罠"], [8, "alive", undefined]]) {
  const char = { name: "瀕死検証", status: "alive", exp: 0, hp, maxHp: 20 };
  runTablet({ floor: 1, randomValues: [0.4, 0], contract: "phase4j-c-v1", party: [char, { name: "同行者", status: "alive", exp: 0, hp: 20, maxHp: 20 }] });
  assert.equal(char.status, expectedStatus, `HP ${hp} trap outcome`);
  if (cause) assert.equal(state.currentRun.deathLogs[0]?.cause, cause, "trap death attribution remains");
}

for (const [roll, expectedExp, expectedDamage] of [[0.399999, 80, 0], [0.4, 0, 7], [0.699999, 0, 7], [0.7, 0, 0]]) {
  const char = { name: "境界検証", status: "alive", exp: 0, hp: 20, maxHp: 20 };
  const result = runTablet({ floor: 1, randomValues: [roll, 0], contract: "phase4j-c-v1", party: [char, { name: "同行者", status: "alive", exp: 0, hp: 20, maxHp: 20 }] });
  assert.equal(char.exp, expectedExp, `outcome roll ${roll} EXP`);
  assert.equal(20 - char.hp, expectedDamage, `outcome roll ${roll} trap damage`);
  assert.equal(result.cell.event, null, `Read consumes cell at ${roll}`);
  assert.equal(result.randomCalls, expectedExp ? 2 : roll < 0.7 ? 2 : 1, `outcome RNG consumption at ${roll}`);
}

const leaveChar = { name: "立ち去り", status: "alive", exp: 0, hp: 20, maxHp: 20 };
const leaveResult = runTablet({ floor: 1, randomValues: [], contract: "phase4j-c-v1", party: [leaveChar], action: "leave" });
assert.equal(leaveResult.cell.event, "event_tablet", "Leave does not consume the cell");
assert.equal(leaveChar.exp, 0, "Leave grants no EXP");

const invalidHpChar = { name: "不正HP", status: "alive", exp: 0, hp: 20, maxHp: Number.NaN };
const invalidHpResult = runTablet({ floor: 1, randomValues: [0.4, 0], contract: "phase4j-c-v1", party: [invalidHpChar, { name: "同行者", status: "alive", exp: 0, hp: 20, maxHp: 20 }] });
assert.equal(invalidHpChar.hp, 20, "invalid raw maxHP fails closed without HP mutation");
assert.equal(Number.isNaN(invalidHpChar.hp), false, "invalid HP does not propagate NaN");
assert.ok(invalidHpResult.logs.some(log => log.includes("最大HPが不正")), "invalid maxHP is reported");
assert.equal(invalidHpResult.cell.event, null, "failed closed Read still consumes the cell");

const testLocalStorage = global.localStorage;
const { applySimulationTabletRead } = await import("../../../scratch/simulations/sim_depth_material_ev.js");
Object.defineProperty(globalThis, "localStorage", {
  value: testLocalStorage,
  configurable: true,
  writable: true
});
for (const floor of [1, 20]) {
  for (const candidate of ["current", "fixed-c"]) {
    for (const outcome of ["success", "trap-survival", "trap-death", "trap-upper", "miss"]) {
      const damage = candidate === "fixed-c" ? 7 : 6 + floor * 3;
      const firstHp = outcome === "trap-death" ? damage : damage + 1;
      const makeParty = () => [
        { name: "Parity対象", status: "alive", exp: 0, level: 1, hp: firstHp, maxHp: 20 },
        { name: "Parity同行者", status: "alive", exp: 0, level: 1, hp: 100, maxHp: 100 }
      ];
      const randomValues = outcome === "success" ? [0.399, 0.5]
        : outcome === "trap-upper" ? [0.699999, 0]
        : outcome === "trap-survival" || outcome === "trap-death" ? [0.4, 0]
          : [0.7];
      const productionParty = makeParty();
      const production = runTablet({
        floor,
        randomValues,
        contract: candidate === "fixed-c" ? "phase4j-c-v1" : null,
        party: productionParty
      });
      const simulationParty = makeParty();
      const simulationCell = { event: "event_tablet" };
      const simulationState = {
        floor,
        party: simulationParty,
        currentRun: { expGained: 0, deathLogs: [] }
      };
      let randomIndex = 0;
      const simulation = applySimulationTabletRead({
        state: simulationState,
        floor,
        cell: simulationCell,
        candidate,
        rng: () => randomValues[randomIndex++] ?? 0
      });
      assert.deepEqual(
        simulationParty.map(({ exp, hp, status }) => ({ exp, hp, status })),
        productionParty.map(({ exp, hp, status }) => ({ exp, hp, status })),
        `${candidate} B${floor} ${outcome}: state matches production Read callback`
      );
      assert.deepEqual(simulationState.currentRun.deathLogs, state.currentRun.deathLogs,
        `${candidate} B${floor} ${outcome}: death attribution matches`);
      assert.equal(simulationCell.event, production.cell.event,
        `${candidate} B${floor} ${outcome}: consumption matches`);
      assert.equal(simulation.randomCalls, production.randomCalls,
        `${candidate} B${floor} ${outcome}: RNG call count matches`);
      assert.equal(simulationState.currentRun.expGained, 0,
        "tablet EXP never enters the combat-only ledger");
      assert.equal(simulation.expGained, outcome === "success"
        ? (candidate === "fixed-c" ? Math.round(80 * (1 + 0.04 * Math.floor((floor - 1) / 5))) : 100 + floor * 100)
        : 0);
      assert.equal(state.currentRun.expGained, 0,
        "production Read callback leaves the combat-only ledger unchanged");
    }
  }
}

const beforeDefaultSave = global.localStorage.writes;
const defaultTrapChar = { name: "既定罠", status: "alive", exp: 0, hp: 20, maxHp: 20 };
runTablet({ floor: 1, randomValues: [0.4, 0], party: [defaultTrapChar, { name: "同行者", status: "alive", exp: 0, hp: 20, maxHp: 20 }] });
assert.equal(defaultTrapChar.hp, 11, "production-default B1 trap remains 9 damage");
assert.ok(global.localStorage.writes > beforeDefaultSave, "Read autosaves the event result");

console.log("\n=== VERIFICATION COMPLETE: ALL PASSED ===");
