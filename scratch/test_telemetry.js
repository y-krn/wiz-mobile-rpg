import assert from "node:assert/strict";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  normalizeCombatResult,
  normalizeDeathType,
  normalizeEnemyId,
  normalizeOutcome,
  trackCombatEnd,
  trackCombatStart,
  trackDamageReceived,
  trackEvent,
  trackRunEnd,
  trackRunStart
} from "../src/telemetry.js";
import { recordReceivedDamage } from "../src/combat_logic/damage.js";
import { getMpWardDef } from "../src/combat_logic/mp_ward.js";

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

const run = {
  characterClass: "Mage",
  startedAt: Date.now() - 100,
  startFloor: 1,
  deepestFloor: 4,
  steps: 12,
  battles: 3,
  kills: 5,
  elitesKilled: 1,
  bossesKilled: 0,
  chestsOpened: 2,
  trapsTriggered: 1,
  returnReason: "gameover",
  deathLogs: [{ type: "status", source: "ゴブリン A", cause: "free text must not be sent" }]
};

check("telemetry without a client is a complete no-op", () => {
  __resetTelemetryForTests();
  assert.doesNotThrow(() => {
    trackEvent("run_start", { value: undefined });
    trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
    trackCombatStart({ floor: 1, player: {}, monsters: [] });
    trackDamageReceived({ enemyId: "Goblin A", rawDamage: 1, finalDamage: 1 });
    trackCombatEnd("endCombat", { monsters: [] });
    trackRunEnd(run, "death");
  });
});

check("capture exceptions do not escape into gameplay", () => {
  __setTelemetryClientForTests({
    capture() {
      throw new Error("transport failed");
    }
  });
  assert.doesNotThrow(() => {
    trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
    trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [] });
    trackDamageReceived({ enemyId: "Goblin A", rawDamage: 3, finalDamage: 1 });
    trackCombatEnd("endCombat", { monsters: [] });
    trackRunEnd(run, "death");
  });
});

check("properties are normalized and undefined values are removed", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackEvent("custom", { defined: 1, missing: undefined, nested: { missing: undefined, value: null } });
  assert.deepEqual(events[0], {
    name: "custom",
    properties: { schemaVersion: 1, defined: 1, nested: { value: null } }
  });
});

check("enemy suffixes and enum fields are normalized", () => {
  assert.equal(normalizeEnemyId("ゴブリン A"), "ゴブリン");
  assert.equal(normalizeEnemyId("ゴブリン"), "ゴブリン");
  assert.equal(normalizeOutcome("death"), "death");
  assert.equal(normalizeOutcome("unknown"), null);
  assert.equal(normalizeCombatResult("escapeToTown"), "escape_to_town");
  assert.equal(normalizeCombatResult("milestoneVictory"), "other");
  assert.equal(normalizeDeathType("status"), "status");
  assert.equal(normalizeDeathType("free text"), null);
});

check("run end sends normalized death fields without free-text cause", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackRunEnd(run, "death");
  const properties = events.at(-1).properties;
  assert.equal(properties.outcome, "death");
  assert.equal(properties.deathType, "status");
  assert.equal(properties.deathSource, "ゴブリン");
  assert.equal(properties.deathCause, "status");
  assert.equal(properties.returnReason, "gameover");
  assert.equal(Object.hasOwn(properties, "charName"), false);
  assert.equal(Object.hasOwn(properties, "cause"), false);
});

check("runtime correlation IDs do not consume Math.random", () => {
  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => {
    randomCalls++;
    return 0.5;
  };
  try {
    __setTelemetryClientForTests({ capture() {} });
    trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
    trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [{ name: "ゴブリン A" }] });
    trackCombatEnd("endCombat", { floor: 1, turns: 1, player: { hp: 14, mp: 12 }, monsters: [] });
    trackRunEnd(run, "retreat");
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(randomCalls, 0);
});

check("damage telemetry matches the live MP ward formula at zero and nonzero MP", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 0 }, monsters: [] });

  const emptyMp = { class: "Mage", hp: 10, mp: 0 };
  recordReceivedDamage({ floor: 1 }, emptyMp, "ゴブリン A", 2, 2, 12, { attackType: "physical" });
  const activeMp = { class: "Mage", hp: 10, mp: 1 };
  recordReceivedDamage({ floor: 1 }, activeMp, "ゴブリン A", 2, 2, 12, { attackType: "physical" });

  const damageEvents = events.filter(event => event.name === "damage_received");
  assert.equal(damageEvents[0].properties.mpWardActive, getMpWardDef(emptyMp) > 0);
  assert.equal(damageEvents[1].properties.mpWardActive, getMpWardDef(activeMp) > 0);
  assert.equal(damageEvents[0].properties.mpWardActive, false);
  assert.equal(damageEvents[1].properties.mpWardActive, true);
});

check("telemetry lifecycle preserves a fixed random sequence", () => {
  const originalRandom = Math.random;
  const sequence = [0.1, 0.8, 0.3, 0.6];

  function sample(withTelemetry) {
    let index = 0;
    Math.random = () => sequence[index++];
    if (withTelemetry) {
      __setTelemetryClientForTests({ capture() {} });
      trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
      trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [] });
      trackDamageReceived({ enemyId: "ゴブリン A", rawDamage: 2, finalDamage: 1 });
      trackCombatEnd("endCombat", { floor: 1, turns: 1, player: { hp: 13, mp: 12 }, monsters: [] });
      trackRunEnd(run, "retreat");
    }
    const draws = [Math.random(), Math.random()];
    return { draws, index };
  }

  try {
    const off = sample(false);
    const on = sample(true);
    assert.deepEqual(on, off);
  } finally {
    Math.random = originalRandom;
    __resetTelemetryForTests();
  }
});

if (failures > 0) process.exit(1);
