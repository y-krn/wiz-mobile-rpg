import { ENCOUNTER_COMPOSITION_RULES } from "../data/encounters.js";

export function isEncounterCompositionAllowed(monsters, targetSize = monsters.length) {
  const rules = ENCOUNTER_COMPOSITION_RULES;
  if (targetSize < rules.minSize || targetSize > rules.maxSize || monsters.length > targetSize) return false;

  const roleCounts = {};
  const nameCounts = {};
  for (const monster of monsters) {
    if (!monster?.role) return false;
    roleCounts[monster.role] = (roleCounts[monster.role] || 0) + 1;
    nameCounts[monster.name] = (nameCounts[monster.name] || 0) + 1;
    if (roleCounts[monster.role] > (rules.maxRoleCounts[monster.role] ?? 0)) return false;
    if (nameCounts[monster.name] > rules.maxCopiesPerMonster) return false;
  }

  if (targetSize === 1 && monsters.some(monster => rules.forbiddenSoloRoles.includes(monster.role))) return false;
  return true;
}

export function pickEncounterSize(weights, rng = Math.random) {
  const roll = rng();
  let cumulative = 0;
  for (let index = 0; index < weights.length; index++) {
    cumulative += weights[index];
    if (roll < cumulative) return index + 1;
  }
  return weights.length;
}
