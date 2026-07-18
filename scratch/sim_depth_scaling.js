import { MONSTERS } from "../src/data/monsters.js";
import { getBiomeForFloor } from "../src/data/biomes.js";
import { getEncounterSizeWeightsForFloor } from "../src/data/encounters.js";
import { getDepthScaling, scaleEnemyForDepth } from "../src/rules/depth_scaling.js";
import { getDepthMaterialDropChance, getDepthMaterialExpectedQuantity } from "../src/rules/material_rules.js";

const LEGACY_POOLS = Object.freeze({
  dragon_forge: ["ドラゴンワーム", "ワイバーン", "レッドドラゴン", "反逆の鎧", "黒曜の魔導士", "竜血の再生者", "結界の守護者", "双頭の番犬", "盾持ちデーモン", "灰燼の術士"],
  abyssal_throne: ["マスターデーモン", "プリーストデーモン", "命喰いの影", "深淵の分裂体", "破滅の導師", "盾持ちデーモン", "結界の守護者", "黒曜の魔導士", "灰燼の術士"]
});

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function pickWeighted(weights, rng) {
  let roll = rng();
  for (let index = 0; index < weights.length; index++) {
    roll -= weights[index];
    if (roll <= 0) return index + 1;
  }
  return weights.length;
}

function playerProfile(floor) {
  const level = 1 + Math.floor((floor - 1) * 0.72);
  return {
    maxHp: 18 + level * 5 + floor * 2.5,
    attack: 14 + level * 2 + floor * 1.5,
    defense: 2 + level * 0.7 + floor * 0.6
  };
}

function simulateFight(floor, rng) {
  const biome = getBiomeForFloor(floor);
  const poolNames = process.env.SIM_LEGACY_BALANCE === "1"
    ? LEGACY_POOLS[biome.id] || biome.enemyPool
    : biome.enemyPool;
  const pool = poolNames.map(name => MONSTERS.find(monster => monster.name === name)).filter(Boolean);
  const size = pickWeighted(getEncounterSizeWeightsForFloor(floor), rng);
  const enemies = Array.from({ length: size }, () => {
    const template = pool[Math.floor(rng() * pool.length)];
    return scaleEnemyForDepth(template, floor);
  });
  const player = playerProfile(floor);
  let hp = player.maxHp;
  let turns = 0;
  while (hp > 0 && enemies.some(enemy => enemy.hp > 0) && turns < 50) {
    turns++;
    const target = enemies.filter(enemy => enemy.hp > 0).sort((a, b) => a.hp - b.hp)[0];
    const playerDamage = Math.max(1, Math.floor(player.attack + rng() * 5 - target.def * 0.5));
    target.hp -= playerDamage;
    enemies.filter(enemy => enemy.hp > 0).forEach(enemy => {
      hp -= Math.max(1, Math.floor(enemy.atk - player.defense * 0.55 + rng() * 3));
    });
  }
  return { win: hp > 0, damageRate: Math.min(1, (player.maxHp - Math.max(0, hp)) / player.maxHp) };
}

export function runDepthScalingSimulation(iterations = 600) {
  const rows = [];
  for (let floor = 1; floor <= 30; floor++) {
    const rng = lcg(152000 + floor);
    let wins = 0;
    let damage = 0;
    for (let run = 0; run < iterations; run++) {
      const result = simulateFight(floor, rng);
      wins += result.win ? 1 : 0;
      damage += result.damageRate;
    }
    const expectedMaterials = getDepthMaterialDropChance(floor) * getDepthMaterialExpectedQuantity(floor);
    rows.push({
      floor,
      biome: getBiomeForFloor(floor).name,
      enemyScale: getDepthScaling(floor).enemy,
      winRate: wins / iterations,
      damageRate: damage / iterations,
      expectedMaterials
    });
  }
  return rows;
}

const rows = runDepthScalingSimulation();
console.log("| Floor | Biome | Enemy x | Win | Damage | Materials/fight |");
console.log("| ---: | --- | ---: | ---: | ---: | ---: |");
rows.forEach(row => {
  console.log(`| B${row.floor} | ${row.biome} | ${row.enemyScale.toFixed(2)} | ${(row.winRate * 100).toFixed(1)}% | ${(row.damageRate * 100).toFixed(1)}% | ${row.expectedMaterials.toFixed(2)} |`);
});
const monotonicMaterials = rows.every((row, index) => index === 0 || row.expectedMaterials >= rows[index - 1].expectedMaterials);
const viableCombat = rows.every(row => row.winRate >= 0.55 && row.damageRate >= 0.04 && row.damageRate <= 0.85);
const lateRows = rows.slice(15);
const intentionalLateRhythm = lateRows.every((row, index) => (
  index === 0 || row.winRate >= lateRows[index - 1].winRate - 0.10
));
const lateTensionRemains = lateRows.some(row => row.winRate < 0.95 && row.damageRate > 0.35);
console.log(
  `material_monotonic=${monotonicMaterials} combat_viable=${viableCombat} ` +
  `late_rhythm=${intentionalLateRhythm} late_tension=${lateTensionRemains}`
);
if (!monotonicMaterials || !viableCombat || !intentionalLateRhythm || !lateTensionRemains) process.exit(1);
