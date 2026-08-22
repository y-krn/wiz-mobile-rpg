import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  __resetTelemetryForTests,
  __setTelemetryInitializationForTests,
  __setTelemetryClientForTests,
  normalizeCombatResult,
  normalizeDeathType,
  normalizeEnemyId,
  normalizeOutcome,
  resolvePostHogApiHost,
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

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("production telemetry uses the same-origin ingest host", () => {
  assert.equal(resolvePostHogApiHost("https://us.i.posthog.com", { isProduction: true }), "/ingest");
  assert.equal(resolvePostHogApiHost("https://eu.i.posthog.com", { isProduction: true }), "/ingest");
  assert.equal(resolvePostHogApiHost("https://us.i.posthog.com", { isProduction: false }), "https://us.i.posthog.com");
  assert.equal(resolvePostHogApiHost("  ", { isProduction: true }), "");
});

check("PostHog ingest rewrites precede the SPA fallback", () => {
  const [staticRewrite, ingestRewrite, spaFallback] = vercelConfig.rewrites;
  assert.deepEqual(staticRewrite, {
    source: "/ingest/static/(.*)",
    destination: "https://us-assets.i.posthog.com/static/$1"
  });
  assert.deepEqual(ingestRewrite, {
    source: "/ingest/(.*)",
    destination: "https://us.i.posthog.com/$1"
  });
  assert.deepEqual(spaFallback, { source: "/(.*)", destination: "/index.html" });
});

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
  assert.equal(normalizeCombatResult("milestoneVictory"), "victory");
  assert.equal(normalizeCombatResult("giveKey"), "victory");
  assert.equal(normalizeCombatResult("triggerChest"), "victory");
  assert.equal(normalizeCombatResult("fleeCombat"), "fled");
  assert.equal(normalizeCombatResult("runEscape"), "fled");
  assert.equal(normalizeCombatResult("unknown"), "other");
  assert.equal(normalizeDeathType("status"), "status");
  assert.equal(normalizeDeathType("free text"), null);
});

check("run end sends the existing death-log cause with normalized fields", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  const runWithDeathCause = {
    ...run,
    deathLogs: [{ type: "status", source: "毒 A", cause: "毒のダメージ" }],
    freeTextDeathCause: "must not be sent"
  };
  trackRunStart(runWithDeathCause, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackRunEnd(runWithDeathCause, "death");
  const properties = events.at(-1).properties;
  assert.equal(properties.outcome, "death");
  assert.equal(properties.deathType, "status");
  assert.equal(properties.deathSource, "毒");
  assert.equal(properties.deathCause, "毒のダメージ");
  assert.equal(properties.returnReason, "gameover");
  assert.equal(Object.hasOwn(properties, "charName"), false);
  assert.equal(Object.hasOwn(properties, "cause"), false);
  assert.equal(Object.hasOwn(properties, "freeTextDeathCause"), false);
});

check("lifecycle events emitted before SDK initialization are flushed in order", () => {
  const events = [];
  __setTelemetryInitializationForTests({ enabled: true });
  trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [] });
  trackDamageReceived({ enemyId: "ゴブリン A", rawDamage: 2, finalDamage: 1 });
  trackCombatEnd("endCombat", { floor: 1, turns: 1, player: { hp: 12, mp: 12 }, monsters: [] });
  trackRunEnd(run, "retreat");
  assert.deepEqual(events, []);

  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  assert.deepEqual(events.map(event => event.name), [
    "run_start",
    "combat_start",
    "damage_received",
    "combat_end",
    "run_end"
  ]);
  __resetTelemetryForTests();
});

check("pre-initialization buffer is finite", () => {
  const events = [];
  __setTelemetryInitializationForTests({ enabled: true });
  for (let index = 0; index < 80; index++) trackEvent("buffered", { index });
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  assert.equal(events.length, 64);
  assert.equal(events[0].properties.index, 16);
  assert.equal(events.at(-1).properties.index, 79);
  __resetTelemetryForTests();
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
