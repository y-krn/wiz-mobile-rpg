import { MONSTERS } from "../data/monsters.js";
import { getMilestoneBossStatRule } from "./boss_rules.js";
import { getDungeonFloor, getDungeonStrength } from "./dungeons.js";

const clampBaseline = value => Math.max(0, Math.min(5, Math.floor(Number(value) || 0)));

// The Phase 4c v1 baseline is the standard rule set for every active run.
export function isProgressionTrial(stateLike) {
  return Boolean(stateLike?.currentRun);
}

// The baseline counts guardians beaten inside the dungeon, so a run that
// enters any dungeon starts at zero and gains one step at its bottom (#2060).
export function resolvePhase4cV1Baseline(currentRun) {
  const selectedStart = clampBaseline(getDungeonFloor(currentRun?.startFloor) / 5);
  const defeated = (Array.isArray(currentRun?.defeatedMilestones) ? currentRun.defeatedMilestones : [])
    .reduce((highest, floor) => Number.isInteger(floor) && floor > 0
      ? Math.max(highest, clampBaseline(getDungeonFloor(floor) / 5))
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

/** `floor` is the running floor number; the band follows the dungeon floor. */
export function phase4cV1EnemyBand(floor) {
  return clampBaseline(Math.floor(getDungeonFloor(floor) / 5));
}

function templateName(name) {
  return String(name || "").replace(/\s[A-Z]$/, "");
}

// Milestone guardians are fought on the previous baseline, and the Phase 3
// equipment trial has no vertical weapon ladder. Production depth-scaled
// guardian stats (e.g. B5 HP ~230) therefore demanded ~28 baseline hits from
// a solo character. Size the generic guardian to roughly eight to ten
// baseline rounds instead. Authored template-stat guardians (B30) keep their
// own rule.
export const PHASE4C_V1_GUARDIAN_SOLO_SCALE = Object.freeze({ hp: 0.38, atk: 0.45 });

function applyPhase4cV1GuardianBaseline(monster, template, band, strength) {
  const hp = Math.max(1, Math.round(
    template.hp * PHASE4C_V1_GUARDIAN_SOLO_SCALE.hp * (1 + 0.20 * band) * strength.guardianHp
  ));
  monster.maxHp = hp;
  monster.hp = hp;
  monster.atk = Math.max(1, Math.round(
    template.atk * PHASE4C_V1_GUARDIAN_SOLO_SCALE.atk * (1 + 0.10 * band) * strength.guardianAtk
  ));
  monster.def = Math.max(0, Math.round(template.def * strength.guardianDef));
  // A summoning guardian keeps at most one add alive at a time.
  if (monster.traits?.includes("summonAlly")) {
    monster.summon = { ...(monster.summon || {}), maxAllies: 2 };
  }
}

export function applyPhase4cV1EnemyBaseline(monsters, floor) {
  const band = phase4cV1EnemyBand(floor);
  const strength = getDungeonStrength(floor);
  for (const monster of monsters || []) {
    if (monster.isBoss === true) {
      const template = MONSTERS.find(entry => entry.name === templateName(monster.name));
      if (template && !getMilestoneBossStatRule(floor, template.name, { isBoss: true })) {
        applyPhase4cV1GuardianBaseline(monster, template, band, strength);
      }
      continue;
    }
    // Mimics and brood keepers fight with the floor elite's depth-scaled body
    // under their own names, so they have no generic template to rebaseline.
    if (monster.isMimic === true || monster.isBroodKeeper === true) continue;
    const template = MONSTERS.find(entry => entry.name === templateName(monster.name));
    if (!template) throw new Error(`Phase 4c v1 missing generic enemy template: ${monster.name}`);
    const hp = Math.max(1, Math.round(template.hp * (1 + 0.20 * band) * strength.enemyHp));
    monster.maxHp = hp;
    monster.hp = hp;
    monster.atk = Math.max(1, Math.round(template.atk * (1 + 0.10 * band) * strength.enemyAtk));
    monster.def = Math.max(0, Math.round(template.def * strength.enemyDef));
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
