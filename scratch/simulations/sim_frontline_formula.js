// sim-scope: formula — deterministic weapon-led physical damage smoke check.
import "./simulation_preflight.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { requireRunnerProvenance } from "../measurements/measurement_provenance.js";

export const MEASUREMENT_PROVENANCE = requireRunnerProvenance();

const WEAPONS = Object.freeze({
  unarmed: 0,
  DAGGER: 2,
  SHORT_SWORD: 6,
  MACE: 5,
  RAPIER: 8,
  LONG_SWORD: 12,
  CLAYMORE: 18,
  KATANA: 25
});

function physicalDamage(weaponAtk, roll, defense, meleeRate = 1) {
  return Math.max(1, Math.floor((weaponAtk + roll - defense) * meleeRate));
}

function ttk(hp, damage) {
  return Math.ceil(hp / Math.max(1, damage));
}

function enemies(level) {
  return MONSTERS
    .filter(monster => monster.level === level && !monster.isRare && !monster.isBoss)
    .map(monster => ({
      name: monster.name,
      hp: monster.hp,
      def: monster.def,
      physResist: monster.physResist || 0
    }));
}

function report(level, weaponAtk) {
  console.log(`\n### B${level}, weapon ATK ${weaponAtk}`);
  enemies(level).forEach(enemy => {
    const raw = physicalDamage(weaponAtk, 2, enemy.def);
    const damage = enemy.physResist
      ? Math.max(1, Math.round(raw * (1 - enemy.physResist)))
      : raw;
    console.log(`  ${enemy.name.padEnd(14)} HP${String(enemy.hp).padStart(3)} DEF${enemy.def} | ${damage} dmg / ${ttk(enemy.hp, damage)} hits`);
  });
}

console.log("武器主導の物理ダメージ: 平均roll=2");
report(1, WEAPONS.SHORT_SWORD);
report(3, WEAPONS.LONG_SWORD);
report(5, WEAPONS.KATANA);
