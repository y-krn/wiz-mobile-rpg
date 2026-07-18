import {
  getBiomeForFloor,
  getEncounterPoolForFloor,
  getEncounterSizeWeightsForFloor,
  MONSTERS
} from "../data.js";
import { isEncounterCompositionAllowed, pickEncounterSize } from "../rules/encounter_rules.js";
import { scaleEnemyForDepth } from "../rules/depth_scaling.js";

export function getEnemyRow(monster) {
  return monster.row || "front";
}

export function generateEncounter(state, isBoss, isMidboss, isRoamingFlack, roamingMonster = null, rng = Math.random) {
  const monsters = [];
  let isRare = false;

  if (isBoss) {
    const bossName = getBiomeForFloor(state.floor).bossName;
    const bossTemplate = MONSTERS.find(m => m.name === bossName);
    monsters.push(scaleEnemyForDepth(bossTemplate, state.floor, { boss: true }));
  } else if (isMidboss) {
    const midbossTemplate = MONSTERS.find(m => m.name === "デーモンガード");
    monsters.push({
      ...midbossTemplate,
      hp: midbossTemplate.hp,
      maxHp: midbossTemplate.hp
    });
  } else if (isRoamingFlack) {
    const monsterName = roamingMonster?.kind === "warden" ? roamingMonster.name : "フラック";
    const flackTemplate = MONSTERS.find(m => m.name === monsterName) || MONSTERS.find(m => m.name === "フラック");
    monsters.push({
      ...flackTemplate,
      hp: flackTemplate.hp,
      maxHp: flackTemplate.hp
    });
  } else {
    // Regular random encounter
    const poolNames = getEncounterPoolForFloor(state.floor);
    const poolTemplates = poolNames.map(name => MONSTERS.find(monster => monster.name === name)).filter(Boolean);
    const maxPoolLevel = Math.max(...poolTemplates.map(monster => monster.level));
    const rareChance = ((state.floor - 1) % 5) === 3 ? 0.18 : 0.08;
    const treasureCandidates = MONSTERS.filter(m => m.treasureRare && m.level <= maxPoolLevel + 1);
    const isTreasureEncounter = (rng() < rareChance) && (treasureCandidates.length > 0);
    
    if (isTreasureEncounter) {
      isRare = true;
      const template = treasureCandidates[Math.floor(rng() * treasureCandidates.length)];
      monsters.push({ ...scaleEnemyForDepth(template, state.floor), isRare: true });
    } else {
      const tempMonsters = [];
      const pool = poolTemplates;
      const targetSize = pickEncounterSize(getEncounterSizeWeightsForFloor(state.floor), rng);

      while (tempMonsters.length < targetSize) {
        const candidates = pool.filter(template =>
          isEncounterCompositionAllowed([...tempMonsters, template], targetSize)
        );
        if (candidates.length === 0) break;
        const template = candidates[Math.floor(rng() * candidates.length)];
        tempMonsters.push(scaleEnemyForDepth(template, state.floor));
      }

      const nameCounts = {};
      tempMonsters.forEach(m => {
        nameCounts[m.name] = (nameCounts[m.name] || 0) + 1;
      });

      const currentNameIndices = {};
      tempMonsters.forEach(m => {
        const baseName = m.name;
        if (nameCounts[baseName] > 1) {
          currentNameIndices[baseName] = (currentNameIndices[baseName] || 0) + 1;
          const suffix = ` ${String.fromCharCode(64 + currentNameIndices[baseName])}`;
          m.name = baseName + suffix;
        }
        monsters.push(m);
      });
    }
  }

  return { monsters, isRare };
}
