import assert from "node:assert/strict";

const makeDummyElement = () => ({
  style: { setProperty: () => {}, removeProperty: () => {} },
  dataset: {},
  append: () => {},
  appendChild: () => {},
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  querySelector: () => null,
  querySelectorAll: () => [],
  textContent: "",
  innerHTML: ""
});

global.document = {
  activeElement: null,
  getElementById: () => makeDummyElement(),
  createElement: () => makeDummyElement(),
  querySelector: () => null,
  querySelectorAll: () => []
};
global.window = {};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.setTimeout = callback => { callback(); return 0; };

const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import("../../../src/state.js");
const { getCharMaxHp, getCharMaxMp } = await import("../../../src/data.js");
const { getHealMultiplier } = await import("../../../src/rules/item_rules.js");
const { applyExplorationRecovery, getExplorationRecoveryOutlook, getExplorationRecoveryRemaining } = await import("../../../src/systems/exploration_recovery.js");
const { descendToFloor, executeEnterDungeon, handleMove } = await import("../../../src/movement.js");

function freshRun(kit = "vanguard") {
  state.party = [createStartingKitCharacter(kit)];
  state.currentRun = createDefaultCurrentRun();
  state.floor = 1;
  state.party[0].status = "ok";
  return state.party[0];
}

function recoverHpAcrossCells({ cells, cursed = false, antiHealTurns = 0 }) {
  const char = freshRun();
  char.maxHp = 100;
  char.hp = 1;
  char.antiHealTurns = antiHealTurns;
  if (cursed) {
    char.equipment.accessory = {
      kind: "equipment",
      baseId: "RING_AGI",
      identified: true,
      curseEffectId: "curse_blood_thirst",
      cursePower: 1,
      affixes: []
    };
  }
  for (let index = 0; index < cells; index++) applyExplorationRecovery(state);
  return {
    recovered: state.currentRun.explorationRecovery["1"].hpRecovered,
    multiplier: getHealMultiplier(char)
  };
}

// 2% fractional recovery carries between newly visited cells.
{
  const char = freshRun();
  const maxHp = getCharMaxHp(char);
  char.hp = maxHp - 5;
  const first = applyExplorationRecovery(state);
  assert.equal(char.hp, maxHp - 5);
  assert.equal(first.hpRecovered, 0);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, 0);
  assert.ok(Math.abs(state.currentRun.explorationRecovery["1"].hpRemainder - maxHp * 0.02) < 1e-9);

  applyExplorationRecovery(state);
  assert.equal(char.hp, maxHp - 4);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, 1);
}

// A full resource neither gains credit nor spends its per-floor allowance.
{
  const char = freshRun();
  const maxHp = getCharMaxHp(char);
  char.hp = maxHp;
  const recovered = applyExplorationRecovery(state);
  assert.deepEqual(recovered, { hpRecovered: 0, mpRecovered: 0 });
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, 0);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRemainder, 0);
  assert.deepEqual(getExplorationRecoveryRemaining(state), {
    hp: Math.floor(maxHp * 0.5),
    mp: Math.floor(getCharMaxMp(char) * 0.5)
  });
}

// Fractional credit from the cell that fills HP remains available after later damage.
{
  const char = freshRun();
  const maxHp = getCharMaxHp(char);
  char.hp = maxHp - 1;
  applyExplorationRecovery(state);
  applyExplorationRecovery(state);
  assert.equal(char.hp, maxHp);
  const remainderAtFull = state.currentRun.explorationRecovery["1"].hpRemainder;
  assert.ok(remainderAtFull > 0 && remainderAtFull < 1);
  const recoveredAtFull = state.currentRun.explorationRecovery["1"].hpRecovered;

  char.hp -= 2;
  applyExplorationRecovery(state);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, recoveredAtFull + 1);
  assert.ok(state.currentRun.explorationRecovery["1"].hpRemainder < remainderAtFull);
}

// Poison suppresses both resources and does not bank fractional progress.
{
  const char = freshRun("arcana");
  char.hp = Math.max(1, getCharMaxHp(char) - 5);
  char.mp = Math.max(0, getCharMaxMp(char) - 5);
  char.status = "poisoned";
  for (let index = 0; index < 3; index++) applyExplorationRecovery(state);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, 0);
  assert.equal(state.currentRun.explorationRecovery["1"].mpRecovered, 0);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRemainder, 0);
  assert.equal(state.currentRun.explorationRecovery["1"].mpRemainder, 0);
}

// Healing modifiers scale HP recovery credit while MP recovery remains unmodified.
{
  const unmodified = recoverHpAcrossCells({ cells: 25 });
  const cursed = recoverHpAcrossCells({ cells: 25, cursed: true });
  assert.equal(unmodified.recovered, 50);
  assert.equal(cursed.multiplier, 0.8);
  assert.equal(cursed.recovered / unmodified.recovered, 0.8);

  const antiHealed = recoverHpAcrossCells({ cells: 25, antiHealTurns: 1 });
  assert.equal(antiHealed.multiplier, 0.5);
  assert.equal(antiHealed.recovered / unmodified.recovered, 0.5);

  const arcana = freshRun("arcana");
  arcana.maxHp = 100;
  arcana.hp = 1;
  arcana.maxMp = 100;
  arcana.mp = 1;
  arcana.antiHealTurns = 1;
  for (let index = 0; index < 25; index++) applyExplorationRecovery(state);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, 25);
  assert.equal(state.currentRun.explorationRecovery["1"].mpRecovered, Math.floor(getCharMaxMp(arcana) * 0.5));
}

// Modified HP recovery spends the per-floor budget by actual points and still stops at 50%.
{
  const cursed = recoverHpAcrossCells({ cells: 100, cursed: true });
  assert.equal(cursed.recovered, 50);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRemainder, 0);
  assert.equal(getExplorationRecoveryRemaining(state).hp, 0);
  applyExplorationRecovery(state);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, 50);
}

// Floating-point rounding never leaves a negative or whole-point remainder.
{
  for (let maxHp = 1; maxHp <= 600; maxHp++) {
    const char = freshRun();
    char.maxHp = maxHp;
    char.hp = 1;
    for (let cell = 0; cell < 150; cell++) {
      applyExplorationRecovery(state);
      const remainder = state.currentRun.explorationRecovery["1"].hpRemainder;
      assert.ok(remainder >= 0 && remainder < 1, `max HP ${maxHp}, cell ${cell + 1}: remainder ${remainder}`);
    }
  }
}

// Recovery counts actual integer HP/MP, stops at half of each maximum, and starts a fresh floor budget.
{
  const char = freshRun("arcana");
  const maxHp = getCharMaxHp(char);
  const maxMp = getCharMaxMp(char);
  char.hp = 1;
  char.mp = 0;
  const hpCap = Math.floor(maxHp * 0.5);
  const mpCap = Math.floor(maxMp * 0.5);
  for (let index = 0; index < 200; index++) applyExplorationRecovery(state);
  assert.equal(state.currentRun.explorationRecovery["1"].hpRecovered, hpCap);
  assert.equal(state.currentRun.explorationRecovery["1"].mpRecovered, mpCap);
  const hpAtCap = char.hp;
  const mpAtCap = char.mp;
  applyExplorationRecovery(state);
  assert.equal(char.hp, hpAtCap);
  assert.equal(char.mp, mpAtCap);
  assert.equal(getExplorationRecoveryRemaining(state).hp, 0);
  assert.equal(getExplorationRecoveryRemaining(state).mp, 0);

  state.floor = 2;
  char.hp = Math.max(1, getCharMaxHp(char) - 1);
  applyExplorationRecovery(state);
  assert.ok(Object.hasOwn(state.currentRun.explorationRecovery, "2"));
  assert.ok(state.currentRun.explorationRecovery["2"].hpRecovered <= Math.floor(getCharMaxHp(char) * 0.5));
}

// Movement heals only on a newly visited cell; walking back and forth does not repeat it.
{
  const char = freshRun();
  executeEnterDungeon(1);
  char.hp = 5;
  state.repelTurns = 999;
  state.encounterQuietSteps = 99;
  state.roamingMonsters = [];
  // A two-cell corridor isolates revisit recovery from generated start-cell hazards.
  const plainCell = { blockEnter: [false, false, false, false], secretDoor: [false, false, false, false], secretFound: [false, false, false, false] };
  state.maps[0] = [[
    { ...plainCell, walls: [true, false, true, true], type: "empty" },
    { ...plainCell, walls: [true, true, true, false], type: "empty" }
  ]];
  state.visitedMaps[0] = [[true, false]];
  state.x = 0;
  state.y = 0;
  state.dir = 1;
  handleMove("forward");
  const afterFirstVisit = { ...state.currentRun.explorationRecovery["1"] };
  assert.ok(afterFirstVisit.hpRecovered > 0 || afterFirstVisit.hpRemainder > 0);
  handleMove("backward");
  handleMove("forward");
  assert.deepEqual(state.currentRun.explorationRecovery["1"], afterFirstVisit);
}

// Stairs and pitfall transitions no longer restore resources.
for (const isPitfall of [false, true]) {
  const char = freshRun();
  executeEnterDungeon(1);
  char.hp = 7;
  char.mp = 0;
  descendToFloor(2, null, isPitfall);
  assert.equal(state.floor, 2);
  assert.equal(char.hp, 7);
  assert.equal(char.mp, 0);
}

// The explore screen's outlook: the unspent allowance, and what the adventurer
// can take of it right now (held to what is missing, nothing while poisoned).
{
  assert.equal(getExplorationRecoveryOutlook({ party: [], currentRun: createDefaultCurrentRun(), floor: 1 }), null);

  const char = freshRun("arcana");
  char.maxHp = 100;
  const maxMp = getCharMaxMp(char);
  const mpCap = Math.floor(maxMp * 0.5);
  char.hp = 97;
  char.mp = 0;
  assert.deepEqual(getExplorationRecoveryOutlook(state), {
    hp: 3,
    mp: mpCap,
    allowance: { hp: 50, mp: mpCap },
    hasMpAllowance: true,
    suspended: false
  });

  char.hp = 10;
  state.currentRun.explorationRecovery["1"] = { hpRecovered: 44, mpRecovered: mpCap, hpRemainder: 0, mpRemainder: 0 };
  const spent = getExplorationRecoveryOutlook(state);
  assert.deepEqual([spent.hp, spent.mp, spent.allowance], [6, 0, { hp: 6, mp: 0 }]);
  assert.equal(getExplorationRecoveryOutlook(state, 2).hp, 50, "another floor has its own allowance");

  char.status = "poisoned";
  const poisoned = getExplorationRecoveryOutlook(state);
  assert.deepEqual([poisoned.hp, poisoned.mp, poisoned.suspended], [0, 0, true]);
  assert.deepEqual(poisoned.allowance, { hp: 6, mp: 0 }, "poison does not spend the allowance");
  char.status = "ok";
  char.hp = 100;
  char.mp = maxMp;
  const full = getExplorationRecoveryOutlook(state);
  assert.deepEqual([full.hp, full.mp, full.suspended], [0, 0, false]);

  // A kit whose single MP has no use has no MP allowance at all.
  const vanguard = freshRun("vanguard");
  vanguard.mp = 0;
  const outlook = getExplorationRecoveryOutlook(state);
  assert.deepEqual([outlook.mp, outlook.allowance.mp, outlook.hasMpAllowance], [0, 0, false]);
  assert.equal(JSON.stringify(state.currentRun.explorationRecovery), "{}", "reading the outlook writes nothing");
}

console.log("exploration recovery checks passed");
