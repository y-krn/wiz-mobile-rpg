import { createCombatMonsterInstance, isMonsterTemplate } from "../state/monster.js";
import { getDungeonFloor, getEnemyStrength } from "./dungeons.js";

export function getDepthScaling(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const milestoneTier = Math.floor((depth - 1) / 5);
  const linear = 1 + (depth - 1) * 0.035;
  const milestone = 1 + milestoneTier * 0.055;
  return Object.freeze({
    floor: depth,
    milestoneTier,
    enemy: linear * milestone,
    reward: (1 + (depth - 1) * 0.045) * (1 + milestoneTier * 0.07)
  });
}

// `floor` is the running floor number. Strength follows the floor inside the
// dungeon and that dungeon's own multipliers, so a fresh adventurer meets the
// same pressure on the same floor of every dungeon (#2060).
export function scaleEnemyForDepth(monster, floor, { boss = false } = {}) {
  if (!isMonsterTemplate(monster)) throw new TypeError("Invalid MonsterTemplate");
  const scaling = getDepthScaling(getDungeonFloor(floor));
  const strength = getEnemyStrength(floor, monster.name, { boss });
  const bossMultiplier = boss ? 1.12 : 1;
  const hpMultiplier = scaling.enemy * bossMultiplier * strength.hp;
  const attackMultiplier = (1 + (scaling.enemy - 1) * 0.58 + (boss ? 0.08 : 0)) * strength.atk;
  const defenseMultiplier = (1 + (scaling.enemy - 1) * 0.34) * strength.def;
  const rewardMultiplier = scaling.reward * (boss ? 1.2 : 1);
  const hp = Math.max(1, Math.round(monster.hp * hpMultiplier));
  return createCombatMonsterInstance(monster, {
    hp,
    maxHp: hp,
    atk: Math.max(1, Math.round(monster.atk * attackMultiplier)),
    def: Math.max(0, Math.round(monster.def * defenseMultiplier)),
    exp: Math.max(1, Math.round(monster.exp * rewardMultiplier)),
    isBoss: boss || monster.isBoss,
    depthFloor: scaling.floor
  });
}
