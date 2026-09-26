import { MONSTERS } from "../data/monsters.js";
import { isTrialProfile } from "../trial_profiles.js";

const clampBaseline = value => Math.max(0, Math.min(5, Math.floor(Number(value) || 0)));

export function isProgressionTrial(stateLike) {
  return isTrialProfile(stateLike?.currentRun?.trialProfile);
}

export function resolvePhase4cV1Baseline(currentRun) {
  const selectedStart = clampBaseline((Number(currentRun?.startFloor) || 1) / 5);
  const defeated = (Array.isArray(currentRun?.defeatedMilestones) ? currentRun.defeatedMilestones : [])
    .reduce((highest, floor) => Number.isInteger(floor) && floor > 0
      ? Math.max(highest, clampBaseline(floor / 5))
      : highest, 0);
  return Math.max(selectedStart, defeated);
}

export function applyPhase4cV1PlayerBaseline(stateLike, { refill = false } = {}) {
  if (!isProgressionTrial(stateLike)) return { applied: false, baseline: 0, hpBonusDelta: 0 };
  const run = stateLike.currentRun;
  const baseline = resolvePhase4cV1Baseline(run);
  const nextHpBonus = Math.round(20 * (1 + 0.10 * baseline)) - 20;
  const previousHpBonus = Number(run.phase4cV1AppliedHpBonus) || 0;
  const hpBonusDelta = nextHpBonus - previousHpBonus;
  for (const character of stateLike.party || []) {
    character.maxHp += hpBonusDelta;
    character.phase4cV1Baseline = baseline;
    if (refill) character.hp = character.maxHp;
  }
  run.phase4cV1Baseline = baseline;
  run.phase4cV1AppliedHpBonus = nextHpBonus;
  return { applied: true, baseline, hpBonusDelta };
}

export function phase4cV1EnemyBand(floor) {
  return clampBaseline(Math.floor((Number(floor) || 1) / 5));
}

function templateName(name) {
  return String(name || "").replace(/\s[A-Z]$/, "");
}

export function applyPhase4cV1EnemyBaseline(monsters, floor) {
  const band = phase4cV1EnemyBand(floor);
  for (const monster of monsters || []) {
    if (monster.isBoss === true) continue;
    const template = MONSTERS.find(entry => entry.name === templateName(monster.name));
    if (!template) throw new Error(`Phase 4c v1 missing generic enemy template: ${monster.name}`);
    const hp = Math.max(1, Math.round(template.hp * (1 + 0.20 * band)));
    monster.maxHp = hp;
    monster.hp = hp;
    monster.atk = Math.max(1, Math.round(template.atk * (1 + 0.10 * band)));
    monster.def = Math.max(0, Math.round(template.def));
  }
  return band;
}

export function preparePhase4cV1Encounter(stateLike, monsters) {
  if (!isProgressionTrial(stateLike)) return { applied: false, band: null };
  const band = applyPhase4cV1EnemyBaseline(monsters, stateLike.floor);
  return { applied: true, band };
}

export function preparePhase4cV1Summon(stateLike, monster) {
  if (!isProgressionTrial(stateLike) || monster?.isBoss === true) return monster;
  applyPhase4cV1EnemyBaseline([monster], stateLike.floor);
  monster.exp = 0;
  return monster;
}

export function clearPhase4cV1CharacterBaseline(stateLike) {
  for (const character of stateLike.party || []) delete character.phase4cV1Baseline;
  if (stateLike.currentRun) {
    delete stateLike.currentRun.phase4cV1Baseline;
    delete stateLike.currentRun.phase4cV1AppliedHpBonus;
  }
}
