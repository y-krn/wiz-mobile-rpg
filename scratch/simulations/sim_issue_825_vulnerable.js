// sim-scope: formula — Issue #825 same-seed vulnerable multiplier and lifecycle sweep
/* global process, console */

import "./simulation_preflight.js";
import { execFileSync } from "node:child_process";
import {
  VULNERABLE_DAMAGE_MULTIPLIER_CANDIDATES,
  VULNERABLE_DAMAGE_MULTIPLIER
} from "../../src/combat_logic/status_effects.js";
import { resolvePlayerSpell } from "../../src/combat_logic/spell_resolution.js";
import { tickStatusEffects } from "../../src/combat_logic/status_effects.js";
import { recordVulnerableExpiry } from "../../src/combat_logic/vulnerable.js";

const N = Math.max(1, Number(process.env.VULNERABLE_SIM_N || 100));
const SEED = Number(process.env.VULNERABLE_SIM_SEED || 825);
const MODES = ["baseline", "immediate", "delayed", "expired"];

function createRng(seed) {
  let value = (seed >>> 0) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createScenario(multiplier, seed, mode) {
  const caster = {
    name: "Calibration Mage", class: "Mage", level: 5,
    hp: 100, maxHp: 100, mp: 10, maxMp: 10,
    str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10, status: "ok",
    spells: ["VULNERA", "MAHALITO"],
    equipment: { weapon: null, shield: null, armor: null, accessory: null }
  };
  const target = {
    name: seed % 2 ? "Calibration Midboss" : "Calibration Boss",
    hp: 1000, maxHp: 1000, def: 0, status: "ok", color: "#fff",
    isBoss: seed % 2 === 0,
    isMidboss: seed % 2 === 1
  };
  const state = {
    party: [caster], floor: 5, vulnerableDamageMultiplier: multiplier,
    currentRun: { deathLogs: [] }, combatState: { turn: 1, isBoss: target.isBoss, isMidboss: target.isMidboss },
    simTelemetry: { vulnerable: { attempts: 0, applied: 0, refresh: 0, consumed: 0, expired: 0, cleared: 0, damageContribution: 0, latencyTurns: [], qualifyingHitTypes: {}, sources: {} } },
    combatFormulaTelemetry: { spellHits: [], targetedBonuses: [] }
  };
  const logs = [];
  const originalRandom = Math.random;
  Math.random = createRng(seed);
  try {
    if (mode !== "baseline") {
      resolvePlayerSpell(caster, { spellName: "VULNERA", targetIdx: 0 }, state, [target], logs);
      const tick = () => tickStatusEffects(target, { onVulnerableExpire: expiredTarget => recordVulnerableExpiry(state, expiredTarget) });
      if (mode === "delayed") tick();
      if (mode === "expired") {
        tick();
        tick();
        tick();
      }
    }
    resolvePlayerSpell(caster, { spellName: "MAHALITO", targetIdx: 0 }, state, [target], logs);
  } finally {
    Math.random = originalRandom;
  }
  return {
    damage: target.maxHp - target.hp,
    targetType: target.isBoss ? "boss" : "midboss",
    telemetry: state.simTelemetry.vulnerable,
    buildSnapshot: { class: caster.class, level: caster.level, producerSpell: "VULNERA", finisherSpell: "MAHALITO" }
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function summarize(multiplier) {
  const rows = Object.fromEntries(MODES.map(mode => [mode, []]));
  for (let index = 0; index < N; index++) {
    const seed = SEED + index;
    MODES.forEach(mode => rows[mode].push(createScenario(multiplier, seed, mode)));
  }
  const baselineDamage = mean(rows.baseline.map(row => row.damage));
  const summaries = Object.fromEntries(MODES.map(mode => {
    const modeRows = rows[mode];
    const telemetry = modeRows.reduce((total, row) => {
      Object.entries(row.telemetry).forEach(([key, value]) => {
        if (typeof value === "number") total[key] = (total[key] || 0) + value;
      });
      return total;
    }, {});
    return [mode, {
      meanDamage: mean(modeRows.map(row => row.damage)),
      deltaVsBaseline: mean(modeRows.map(row => row.damage)) - baselineDamage,
      attempts: telemetry.attempt || 0,
      applications: telemetry.applied || 0,
      refreshes: telemetry.refresh || 0,
      consumes: telemetry.consumed || 0,
      expiries: telemetry.expired || 0,
      damageContribution: telemetry.damageContribution || 0,
      averageLatencyTurns: mean(modeRows.flatMap(row => row.telemetry.latencyTurns || [])),
      qualifyingHitTypes: modeRows.reduce((counts, row) => {
        Object.entries(row.telemetry.qualifyingHitTypes || {}).forEach(([key, value]) => {
          counts[key] = (counts[key] || 0) + value;
        });
        return counts;
      }, {}),
      bossApplications: modeRows.filter(row => row.targetType === "boss" && row.telemetry.applied > 0).length,
      midbossApplications: modeRows.filter(row => row.targetType === "midboss" && row.telemetry.applied > 0).length,
      producerSelection: mode === "baseline" ? "none" : "VULNERA",
      finalBuildSnapshot: modeRows.at(-1)?.buildSnapshot || null
    }];
  }));
  return { multiplier, summaries };
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const measurement = {
  issue: 825,
  runner: "scratch/simulations/sim_issue_825_vulnerable.js",
  sourceCommit,
  seed: SEED,
  runsPerMode: N,
  modes: MODES,
  config: {
    producer: "VULNERA",
    finisher: "MAHALITO",
    targetTypes: ["boss", "midboss"],
    delayedModeTicks: 1,
    adoptedMultiplier: VULNERABLE_DAMAGE_MULTIPLIER
  },
  candidates: VULNERABLE_DAMAGE_MULTIPLIER_CANDIDATES.map(summarize)
};
console.log(JSON.stringify(measurement, null, 2));
