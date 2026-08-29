// sim-scope: formula — compares enemy-to-player physical defense curves against current encounter anchors.
/* global console, process */

import "./simulation_preflight.js";
import { requireRunnerProvenance } from "../measurements/measurement_provenance.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { getEncounterPoolForFloor } from "../../src/data/encounters.js";
import { scaleEnemyForDepth } from "../../src/rules/depth_scaling.js";
import { createSoloCharacter } from "../../src/state/initial_state.js";
import {
  calculatePhysicalDefenseFormula,
  getCharDef,
  getCharMaxHp,
  getCharVit
} from "../../src/rules/character_stats.js";

const MEASUREMENT_PROVENANCE = requireRunnerProvenance({ fetchOriginMain: false });
const ROLLS = Object.freeze([0, 1, 2, 3]);
const CANDIDATES = Object.freeze([
  { id: "scale-2", label: "割合軽減 scale=2", kind: "scale", scale: 2 },
  { id: "scale-4", label: "割合軽減 scale=4", kind: "scale", scale: 4 },
  { id: "scale-8", label: "割合軽減 scale=8", kind: "scale", scale: 8 },
  { id: "scale-10", label: "割合軽減 scale=10", kind: "scale", scale: 10 },
  { id: "scale-12", label: "割合軽減 scale=12", kind: "scale", scale: 12 },
  { id: "scale-16", label: "割合軽減 scale=16", kind: "scale", scale: 16 },
  { id: "flat-subtract", label: "単純減算", kind: "subtract" },
  { id: "atk-def-ratio", label: "ATK/DEF比率型", kind: "ratio" }
]);

const ANCHORS = Object.freeze([
  { id: "b1-mage", label: "B1 Mage", floor: 1, hp: 23, def: 4 },
  { id: "b5-mage", label: "B5 Mage", floor: 5, hp: 25, def: 4 },
  { id: "b8-mage", label: "B8 Mage", floor: 8, hp: 56, def: 14 },
  { id: "b11-mage", label: "B11 Mage", floor: 11, hp: 56, def: 14 },
  { id: "b8-mage-tank", label: "B8 Mage耐久", floor: 8, hp: 56, def: 15 },
  { id: "b11-mage-tank", label: "B11 Mage耐久", floor: 11, hp: 56, def: 20 }
]);

function getFighterAnchor() {
  const fighter = createSoloCharacter("Fighter");
  const hp = getCharMaxHp(fighter);
  const def = calculatePhysicalDefenseFormula({
    baseDef: getCharDef(fighter),
    vit: getCharVit(fighter)
  });
  return {
    id: "fighter-standard",
    label: "Fighter標準",
    floor: 1,
    hp,
    def,
    source: {
      equipment: fighter.equipment,
      baseDef: getCharDef(fighter),
      vit: getCharVit(fighter)
    }
  };
}

function getNormalEnemyBands(floor) {
  const byName = new Map(
    getEncounterPoolForFloor(floor)
      .map(name => MONSTERS.find(monster => monster.name === name))
      .filter(monster => monster && !monster.isRare && !monster.isBoss && !monster.isMidboss)
      .map(monster => [monster.name, scaleEnemyForDepth(monster, floor)])
  );
  const enemies = [...byName.values()].sort((left, right) =>
    left.atk - right.atk || left.name.localeCompare(right.name, "ja")
  );
  if (enemies.length < 3) throw new Error(`not enough normal encounter enemies at B${floor}`);
  return [
    { band: "low", enemy: enemies[0] },
    { band: "typical", enemy: enemies[Math.floor((enemies.length - 1) / 2)] },
    { band: "high", enemy: enemies.at(-1) }
  ];
}

function damageFor(candidate, finalAtk, finalDef) {
  if (candidate.kind === "subtract") {
    return Math.max(1, finalAtk - finalDef);
  }
  if (candidate.kind === "ratio") {
    return Math.max(1, Math.floor((finalAtk * finalAtk) / (finalAtk + finalDef)));
  }
  const resistance = finalDef / (finalDef + candidate.scale);
  return Math.max(1, Math.floor(finalAtk * (1 - resistance)));
}

function evaluate(candidate, anchor, enemy) {
  const damages = ROLLS.map(roll => damageFor(candidate, enemy.atk + roll, anchor.def));
  const average = damages.reduce((sum, damage) => sum + damage, 0) / damages.length;
  return {
    candidate: candidate.id,
    anchor: anchor.id,
    floor: anchor.floor,
    anchorLabel: anchor.label,
    hp: anchor.hp,
    def: anchor.def,
    enemy: enemy.name,
    baseAtk: enemy.atk,
    rolls: damages,
    averageDamage: average,
    minDamage: Math.min(...damages),
    maxDamage: Math.max(...damages),
    oneDamageRate: damages.filter(damage => damage === 1).length / damages.length,
    averageHpRatio: average / anchor.hp,
    threeHitHpRatio: (average * 3) / anchor.hp,
    fiveHitHpRatio: (average * 5) / anchor.hp
  };
}

function buildReport() {
  const fighter = getFighterAnchor();
  const anchors = [...ANCHORS, fighter];
  const enemyBandsByFloor = Object.fromEntries(
    [...new Set(anchors.map(anchor => anchor.floor))].map(floor => [
      floor,
      getNormalEnemyBands(floor).map(({ band, enemy }) => ({
        band,
        name: enemy.name,
        baseAtk: enemy.atk,
        def: enemy.def
      }))
    ])
  );
  const rows = [];
  anchors.forEach(anchor => {
    getNormalEnemyBands(anchor.floor).forEach(({ band, enemy }) => {
      CANDIDATES.forEach(candidate => {
        rows.push({ band, ...evaluate(candidate, anchor, enemy) });
      });
    });
  });
  return {
    issue: 966,
    runner: "scratch/simulations/sim_physical_defense_curve.js",
    sourceCommit: MEASUREMENT_PROVENANCE?.sourceCommit || null,
    measurement: MEASUREMENT_PROVENANCE,
    seedPolicy: "No random sampling; depth scaling and encounter pools are current source data.",
    rollPolicy: "Enemy finalAtk is scaled base atk plus each of 0, 1, 2, 3 exactly once.",
    streakPolicy: "Three/five-hit HP ratios use average damage across the four attack rolls.",
    candidates: CANDIDATES,
    anchors,
    enemyBandsByFloor,
    rows
  };
}

const report = buildReport();
if (process.argv.includes("--markdown")) {
  console.log(`# Physical defense curve comparison (Issue #966)\n`);
  console.log(`source: ${report.sourceCommit || "unknown"}\n`);
  console.log("| Anchor | Enemy band | Enemy | base ATK | DEF | Candidate | Rolls | Avg | 1-dmg | Avg/HP | 3-hit/HP | 5-hit/HP |");
  console.log("| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |");
  report.rows.forEach(row => {
    console.log(`| ${row.anchorLabel} | ${row.band} | ${row.enemy} | ${row.baseAtk} | ${row.def} | ${row.candidate} | ${row.rolls.join("/")} | ${row.averageDamage.toFixed(2)} | ${(row.oneDamageRate * 100).toFixed(0)}% | ${(row.averageHpRatio * 100).toFixed(1)}% | ${(row.threeHitHpRatio * 100).toFixed(1)}% | ${(row.fiveHitHpRatio * 100).toFixed(1)}% |`);
  });
} else {
  console.log(JSON.stringify(report, null, 2));
}
