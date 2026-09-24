import assert from "node:assert/strict";

const makeElement = () => {
  const listeners = {};
  return {
    style: {},
    appendChild() {},
    replaceChildren() {},
    addEventListener(event, callback) { listeners[event] = callback; },
    trigger(event, ...args) { listeners[event]?.(...args); },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {},
    getAttribute() { return ""; }
  };
};

global.document = {
  getElementById: () => makeElement(),
  createElement: () => makeElement(),
  querySelector: () => makeElement()
};
global.window = {};
global.localStorage = { getItem: () => "false", setItem() {} };

const { state, createDefaultCurrentRun } = await import("../../../src/state.js");
const { renderEventTablet } = await import("../../../src/menu/explore_actions.js");
const { applyCombatRewards } = await import("../../../src/combat_logic/rewards.js");
const { BIOMES, MONSTERS } = await import("../../../src/data.js");
const { EXP_LEVELS } = await import("../../../src/data/progression.js");
const { scaleEnemyForDepth } = await import("../../../src/rules/depth_scaling.js");
const { calculateCandidateAward } = await import("../../../scratch/measurements/progression_exp_award_paired_inventory.js");

const FLOORS = [1, 20];
const ORDERS = ["tablet-then-combat", "combat-then-tablet-then-combat"];
const CONTRACT = "phase4j-c-v1";

function prefundedLevels(level, exp) {
  let count = 0;
  for (let nextLevel = level + 1; nextLevel < EXP_LEVELS.length; nextLevel++) {
    if (exp < EXP_LEVELS[nextLevel]) break;
    count++;
  }
  return count;
}

function snapshot(char) {
  const nextThreshold = EXP_LEVELS[char.level + 1] ?? null;
  return {
    exp: char.exp,
    level: char.level,
    hp: char.hp,
    rawMaxHp: char.maxHp,
    nextLevelThreshold: nextThreshold,
    expToNextLevel: nextThreshold === null ? null : Math.max(0, nextThreshold - char.exp),
    prefundedLevels: prefundedLevels(char.level, char.exp)
  };
}

function runConnectedPath({ floor, candidate, order }) {
  state.floor = floor;
  state.party = [{ name: "接続検証", status: "alive", level: 1, exp: 0, hp: 15, maxHp: 20 }];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.expGained = 0;
  state.currentRun.startFloor = floor;
  state.firstKills = [];
  state.inventory = [];
  state.combatState = { isBoss: false, isMidboss: false, isRoamingFlack: false, monsters: [] };
  state.maps[floor - 1] = [[{ event: "event_tablet" }]];
  state.x = 0;
  state.y = 0;
  state.logs = [];
  state.codex.events.facilities.tablet.read = 0;

  const biome = BIOMES[Math.floor((floor - 1) / 5)];
  const template = MONSTERS.find(monster => monster.name === biome.enemyPool[0]);
  assert.ok(template, `ordinary template exists at B${floor}`);
  assert.equal(template.treasureRare, undefined, "diagnostic fixture is ordinary, not Rare");
  const templateSnapshot = structuredClone(template);
  const productionEnemy = scaleEnemyForDepth(template, floor);
  const candidateAward = calculateCandidateAward({
    floor,
    kind: "ordinary",
    monsters: [{ templateExp: template.exp }],
    encounterSize: 1
  });
  const enemy = candidate
    ? { ...productionEnemy, exp: candidateAward.totalAward }
    : productionEnemy;
  if (candidate) {
    assert.deepEqual({ ...enemy, exp: productionEnemy.exp }, productionEnemy,
      "diagnostic candidate changes only the cloned ordinary enemy EXP");
  }

  const trace = [];
  let tabletRandomCalls = 0;
  const originalRandom = Math.random;
  Math.random = () => ([0, 0][tabletRandomCalls++] ?? 0);
  try {
    function readTablet() {
      const before = snapshot(state.party[0]);
      const runCombatExpBefore = state.currentRun.expGained;
      const grid = { children: [], appendChild(child) { this.children.push(child); } };
      renderEventTablet(grid, candidate ? { diagnosticContract: CONTRACT } : undefined);
      grid.children[0].trigger("click");
      const after = snapshot(state.party[0]);
      const runCombatExpDelta = state.currentRun.expGained - runCombatExpBefore;
      trace.push({
        source: "tablet",
        expAwarded: after.exp - before.exp,
        before,
        after,
        levelUps: 0,
        naturalHpGrowth: 0,
        additionalRecovery: 0,
        runCombatExpDelta
      });
      assert.equal(runCombatExpDelta, 0, "tablet Read does not change currentRun combat EXP");
      assert.equal(state.party[0].level, before.level, "tablet Read does not level immediately");
      assert.equal(state.map[0][0].event, null, "actual successful Read consumes the tablet");
    }

    function settleCombat(combatEnemy = enemy) {
      const char = state.party[0];
      const before = snapshot(char);
      const rawMaxHpBefore = char.maxHp;
      const hpBefore = char.hp;
      state.combatState.monsters = [combatEnemy];
      const runExpBefore = state.currentRun.expGained;
      const logs = [];
      applyCombatRewards(state, state.combatState.monsters, logs, () => 1);
      const after = snapshot(char);
      const runCombatExpDelta = state.currentRun.expGained - runExpBefore;
      const levelUp = logs.find(entry => Number.isFinite(entry.levelUpRecoveryHp));
      const maxHpGrowth = char.maxHp - rawMaxHpBefore;
      trace.push({
        source: "combat",
        expAwarded: after.exp - before.exp,
        before,
        after,
        levelUps: char.level - before.level,
        naturalHpGrowth: maxHpGrowth,
        additionalRecovery: levelUp ? Math.max(0, levelUp.levelUpRecoveryHp - maxHpGrowth) : 0,
        runCombatExpDelta
      });
      assert.equal(runCombatExpDelta, combatEnemy.exp, "currentRun.expGained tracks combat award only");
    }

    if (order === "tablet-then-combat") {
      readTablet();
      settleCombat();
    } else {
      settleCombat();
      readTablet();
      const nextEnemy = candidate
        ? { ...productionEnemy, exp: candidateAward.totalAward }
        : { ...productionEnemy };
      settleCombat(nextEnemy);
    }
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(template, templateSnapshot, "production monster template remains unchanged");
  return {
    floor,
    path: candidate ? "fixed-B+C-candidate" : "production-current",
    order,
    candidateCombatExp: candidateAward.totalAward,
    productionCombatExp: productionEnemy.exp,
    tabletRandomCalls,
    trace,
    final: snapshot(state.party[0]),
    totalRunCombatExp: state.currentRun.expGained
  };
}

// Fresh independent state per path; deterministic Read and reward RNG make reruns comparable.
const observations = [];
for (const floor of FLOORS) {
  for (const order of ORDERS) {
    for (const candidate of [false, true]) {
      const first = runConnectedPath({ floor, candidate, order });
      const repeated = runConnectedPath({ floor, candidate, order });
      assert.deepEqual(first, repeated, "identical input reproduces the same connected trace");
      observations.push(first);
    }
  }
}

for (const floor of FLOORS) {
  for (const order of ORDERS) {
    const pair = observations.filter(row => row.floor === floor && row.order === order);
    assert.deepEqual(pair.map(row => row.tabletRandomCalls), [2, 2], "candidate path preserves tablet RNG calls");
    for (const row of pair) {
      assert.equal(row.productionCombatExp, floor === 1 ? 40 : 2693, "production single-enemy EXP fixture");
      assert.equal(row.candidateCombatExp, floor === 1 ? 32 : 42, "fixed B+C single-enemy candidate");
      assert.equal(row.trace.find(event => event.source === "tablet").expAwarded,
        row.path === "production-current" ? (floor === 1 ? 200 : 2100) : (floor === 1 ? 80 : 90),
      "actual Read callback applies the selected tablet path");
      assert.equal(row.trace.reduce((sum, event) => sum + event.expAwarded, 0), row.final.exp,
        "source-attributed EXP sums to character EXP");
      assert.equal(row.totalRunCombatExp,
        row.trace.filter(event => event.source === "combat").reduce((sum, event) => sum + event.expAwarded, 0),
      "run EXP is combat-only");
      for (const event of row.trace) {
        if (event.source === "tablet") {
          assert.equal(event.runCombatExpDelta, 0, "tablet EXP never enters currentRun combat EXP");
        }
        if (event.source === "combat" && event.levelUps > 0) {
          assert.equal(event.naturalHpGrowth, 5, "one level grants production natural HP growth");
          assert.ok(event.additionalRecovery >= 0 && event.additionalRecovery <= 5,
            "additional recovery stays within production cap");
        }
      }
    }
  }
}

console.log(JSON.stringify({
  status: "diagnostic-only",
  fixtureN: 1,
  comparisonVariants: observations.length,
  measurementBoundary: "N=1 transition regression; no combat execution, run traversal, survival, or balance inference",
  observations
}));
