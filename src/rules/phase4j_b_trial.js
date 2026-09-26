import { BIOMES } from "../data/biomes.js";
import { ENCOUNTER_SIZE_WEIGHTS } from "../data/encounters.js";
import { MONSTERS } from "../data/monsters.js";
import { isTrialProfile } from "../trial_profiles.js";

const SPECIAL_UNITS = Object.freeze({ rare: 1.75, elite: 2, midboss: 2, boss: 3 });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function classifyPhase4jBEncounter({ boss = false, elite = false, midboss = false, rare = false } = {}) {
  if (boss) return "boss";
  if (elite) return "elite";
  if (midboss) return "midboss";
  if (rare) return "rare";
  return "ordinary";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function biomeMedianExp(floor) {
  const biome = BIOMES[Math.floor((floor - 1) / 5)];
  if (!biome) throw new Error(`biome missing for floor ${floor}`);
  const values = biome.enemyPool
    .map(name => MONSTERS.find(monster => monster.name === name))
    .filter(monster => monster && !monster.treasureRare && !monster.isBoss && !monster.isMidboss)
    .map(monster => monster.exp);
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error(`invalid biome template EXP for ${biome.id}`);
  }
  const result = median(values);
  if (!(result > 0)) throw new Error(`non-positive biome median EXP for ${biome.id}`);
  return result;
}

function standardEncounterSize(floor) {
  const localFloor = ((floor - 1) % 5) + 1;
  const weights = ENCOUNTER_SIZE_WEIGHTS[localFloor];
  if (!Array.isArray(weights) || !weights.length || weights.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error(`invalid pre-trial encounter-size weights at floor ${floor}`);
  }
  return weights.reduce((best, value, index) => value > weights[best] ? index : best, 0) + 1;
}

export function allocatePhase4jBExp(totalAward, monsters) {
  if (!Number.isSafeInteger(totalAward) || totalAward < 0 || !Array.isArray(monsters) || !monsters.length ||
      monsters.some(monster => !Number.isFinite(monster.exp) || monster.exp < 0)) {
    throw new Error("Phase 4j-B allocation requires a non-negative total and template EXP roster");
  }
  const totalTemplateExp = monsters.reduce((sum, monster) => sum + monster.exp, 0);
  if (!(totalTemplateExp > 0)) throw new Error("Phase 4j-B allocation requires positive template EXP");
  const shares = monsters.map((monster, index) => {
    const exact = totalAward * monster.exp / totalTemplateExp;
    return { index, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = totalAward - shares.reduce((sum, share) => sum + share.value, 0);
  [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, remaining).forEach(share => { share.value++; });
  return shares.map(share => share.value);
}

export function calculatePhase4jBExpAward({ floor, kind, monsters }) {
  const bandReward = 1 + 0.04 * clamp(Math.floor((floor - 1) / 5), 0, 5);
  let totalAward;
  if (kind === "ordinary") {
    if (!Array.isArray(monsters) || !monsters.length) throw new Error("ordinary Phase 4j-B award requires initial roster");
    const medianExp = biomeMedianExp(floor);
    const standardSize = standardEncounterSize(floor);
    const meanThreat = monsters.reduce((sum, monster) => sum + monster.exp / medianExp, 0) / monsters.length;
    const threat = clamp(meanThreat, 0.8, 1.25);
    const sizePressure = clamp(monsters.length / standardSize, 0.75, 1.35);
    totalAward = Math.round(40 * clamp(threat * sizePressure, 0.75, 1.5) * bandReward);
  } else {
    const units = SPECIAL_UNITS[kind];
    if (units === undefined) throw new Error(`unknown Phase 4j-B encounter kind: ${kind}`);
    totalAward = Math.round(40 * units * bandReward);
  }
  return totalAward;
}

function baseTemplateName(name) {
  return String(name || "").replace(/\s[A-Z]$/, "");
}

export function preparePhase4jBEncounter(stateLike, monsters, context = {}) {
  if (!isTrialProfile(stateLike?.currentRun?.trialProfile)) return { applied: false, initialCount: null };
  const initialCount = monsters.length;
  const templates = monsters.map(monster => {
    const template = MONSTERS.find(entry => entry.name === baseTemplateName(monster.name));
    if (!template || !Number.isFinite(template.exp) || template.exp < 0) {
      throw new Error(`Phase 4j-B missing initial enemy EXP template: ${monster.name}`);
    }
    return template;
  });
  const kind = classifyPhase4jBEncounter({ ...context, rare: context.rare || monsters.some(monster => monster.isRare) });
  if (kind !== "ordinary" && monsters.length !== 1) {
    throw new Error(`Phase 4j-B ${kind} encounter requires one initial monster`);
  }
  const totalAward = calculatePhase4jBExpAward({ floor: stateLike.floor, kind, monsters: templates });
  const allocations = kind === "ordinary"
    ? allocatePhase4jBExp(totalAward, templates)
    : [totalAward];
  monsters.forEach((monster, index) => { monster.exp = allocations[index]; });
  return { applied: true, initialCount, kind, totalAward, allocations };
}

export function settlePhase4jBExpOwnership(stateLike, monsters) {
  if (!isTrialProfile(stateLike?.currentRun?.trialProfile)) return false;
  const savedInitialCount = stateLike.combatState?.trialExpInitialCount;
  const initialCount = Number.isInteger(savedInitialCount) && savedInitialCount >= 0
    ? Math.min(savedInitialCount, monsters.length)
    : monsters.length;
  monsters.slice(initialCount).forEach(monster => { monster.exp = 0; });
  return true;
}
