import {
  getBiomeForFloor,
  getEncounterPoolForFloor,
  getEncounterSizeWeightsForFloor,
  MONSTERS
} from "../data.js";
import { isEncounterCompositionAllowed, pickEncounterSize } from "../rules/encounter_rules.js";
import { scaleEnemyForDepth } from "../rules/depth_scaling.js";
import {
  getBandIndexForFloor,
  getBandTrialForFloor,
  getFloorRole,
  getTrialGuardianPressures
} from "../rules/floor_trials.js";

export function generateEncounter(state, isBoss, isMidboss, isRoamingFlack, roamingMonster = null, rng = Math.random) {
  const monsters = [];
  let isRare = false;
  const runSeed = state.currentRun?.runSeed;
  const bandIndex = getBandIndexForFloor(state.floor);
  const storedTrial = state.currentRun?.trialBands?.[bandIndex] || null;
  const trial = runSeed ? getBandTrialForFloor(runSeed, state.floor, storedTrial) : null;
  const floorRole = getFloorRole(state.floor);

  if (isBoss) {
    const bossName = getBiomeForFloor(state.floor).bossName;
    const bossTemplate = MONSTERS.find(m => m.name === bossName);
    const guardian = {
      ...scaleEnemyForDepth(bossTemplate, state.floor, { boss: true }),
      // A guardian is a high-density confirmation of what this band already
      // taught. These IDs are internal and do not add a new boss rule.
      trialThemeIds: trial ? [trial.mainId, trial.subId] : [],
      trialDensity: trial ? "high" : null,
      trialPressures: []
    };
    if (trial) {
      const biomeNames = getBiomeForFloor(state.floor).enemyPool;
      const candidateTemplates = [
        ...biomeNames.map(name => MONSTERS.find(monster => monster.name === name)).filter(Boolean),
        ...MONSTERS
      ].filter((template, index, all) => all.findIndex(candidate => candidate.name === template.name) === index);
      const pressures = getTrialGuardianPressures(trial, candidateTemplates, { maxLevel: bossTemplate.level });
      pressures.forEach(pressure => {
        guardian.trialPressures.push({
          role: pressure.role,
          themeId: pressure.themeId,
          sourceName: pressure.sourceName
        });
        guardian.traits = [...new Set([...(guardian.traits || []), ...pressure.traits])];
        Object.entries(pressure.behavior).forEach(([key, value]) => {
          if (guardian[key] === undefined) guardian[key] = value;
        });
      });
    }
    monsters.push(guardian);
  } else if (isMidboss) {
    const midbossTemplate = MONSTERS.find(m => m.name === "デーモンガード");
    monsters.push({
      ...midbossTemplate,
      hp: midbossTemplate.hp,
      maxHp: midbossTemplate.hp
    });
  } else if (isRoamingFlack) {
    const eliteName = roamingMonster?.name || getBiomeForFloor(state.floor).eliteName;
    const eliteTemplate = MONSTERS.find(m => m.name === eliteName) || MONSTERS.find(m => m.name === "フラック");
    // 深層でも脅威として成立させるため、通常敵と同じ深度スケールを掛ける。
    monsters.push(scaleEnemyForDepth(eliteTemplate, state.floor));
  } else {
    // Regular random encounter
    const poolNames = getEncounterPoolForFloor(state.floor, { trial });
    const poolTemplates = poolNames.map(name => MONSTERS.find(monster => monster.name === name)).filter(Boolean);
    const maxPoolLevel = Math.max(...poolTemplates.map(monster => monster.level));
    const rareMultiplier = trial && floorRole.id === "temptation" ? 1.38 : 1;
    const rareChance = Math.min(0.5, (((state.floor - 1) % 5) === 3 ? 0.18 : 0.08) * rareMultiplier);
    const treasureCandidates = MONSTERS.filter(m => m.treasureRare && m.level <= maxPoolLevel + 1);
    const isTreasureEncounter = (rng() < rareChance) && (treasureCandidates.length > 0);
    
    if (isTreasureEncounter) {
      isRare = true;
      const template = treasureCandidates[Math.floor(rng() * treasureCandidates.length)];
      monsters.push({ ...scaleEnemyForDepth(template, state.floor), isRare: true });
    } else {
      const tempMonsters = [];
      const pool = poolTemplates;
      const targetSize = pickEncounterSize(
        getEncounterSizeWeightsForFloor(state.floor, { trial }),
        rng
      );

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

  return {
    monsters,
    isRare,
    trial,
    floorRole: floorRole.id
  };
}
