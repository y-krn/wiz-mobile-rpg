import {
  ENCOUNTER_POOLS,
  ENCOUNTER_SIZE_WEIGHTS,
  MONSTERS,
  START_X,
  START_Y
} from "../data.js";
import { isEncounterCompositionAllowed, pickEncounterSize } from "../rules/encounter_rules.js";

export function getEnemyRow(monster) {
  return monster.row || "front";
}

export function generateEncounter(state, isBoss, isMidboss, isRoamingFlack, roamingMonster = null, rng = Math.random) {
  const monsters = [];
  let isRare = false;

  if (isBoss) {
    const dragonTemplate = MONSTERS.find(m => m.name === "いにしえの竜");
    monsters.push({
      ...dragonTemplate,
      hp: dragonTemplate.hp,
      maxHp: dragonTemplate.hp
    });
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
    const dist = Math.abs(state.x - START_X) + Math.abs(state.y - START_Y);
    
    let targetLevel = 1;
    if (state.floor === 1) {
      targetLevel = dist < 20 ? 1 : 2;
    } else if (state.floor === 2) {
      targetLevel = dist < 20 ? 2 : 3;
    } else if (state.floor === 3) {
      targetLevel = dist < 20 ? 3 : 4;
    } else if (state.floor === 4) {
      targetLevel = dist < 20 ? 4 : 6;
    } else if (state.floor === 5) {
      targetLevel = dist < 20 ? 6 : 7;
    }
    
    const rareChance = state.floor === 4 ? 0.18 : 0.08;
    const treasureCandidates = MONSTERS.filter(m => m.treasureRare && m.level <= targetLevel + 1);
    const isTreasureEncounter = (rng() < rareChance) && (treasureCandidates.length > 0);
    
    if (isTreasureEncounter) {
      isRare = true;
      const template = treasureCandidates[Math.floor(rng() * treasureCandidates.length)];
      monsters.push({
        ...template,
        hp: template.hp,
        maxHp: template.hp
      });
    } else {
      const tempMonsters = [];
      const floor = ENCOUNTER_POOLS[state.floor] ? state.floor : 1;
      const pool = ENCOUNTER_POOLS[floor]
        .map(name => MONSTERS.find(monster => monster.name === name))
        .filter(Boolean);
      const targetSize = pickEncounterSize(ENCOUNTER_SIZE_WEIGHTS[floor], rng);

      while (tempMonsters.length < targetSize) {
        const candidates = pool.filter(template =>
          isEncounterCompositionAllowed([...tempMonsters, template], targetSize)
        );
        if (candidates.length === 0) break;
        const template = candidates[Math.floor(rng() * candidates.length)];
        tempMonsters.push({ ...template, hp: template.hp, maxHp: template.hp });
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
