// Shared scratch-only planning for full-run B candidate integration fixtures.

import {
  allocateCandidateAward,
  calculateCandidateAward,
  classifyAwardKind
} from "./progression_exp_award_paired_inventory.js";

export function createCandidateExpPlan({ floor, monsters, templates, context = {} } = {}) {
  if (!Array.isArray(monsters) || !monsters.length || !Array.isArray(templates) ||
      templates.length !== monsters.length) {
    throw new Error("candidate plan requires the full initial roster and matching templates");
  }
  const kind = classifyAwardKind({
    boss: context.isBoss === true,
    elite: context.isElite === true || context.roamingMonster === true,
    midboss: context.isMidboss === true,
    rare: context.isRare === true
  });
  if (kind !== "ordinary" && monsters.length !== 1) {
    throw new Error(`${kind} candidate requires a one-monster initial encounter`);
  }
  const candidate = kind === "ordinary"
    ? calculateCandidateAward({
      floor,
      kind,
      monsters: templates.map(template => ({ templateExp: template.exp })),
      encounterSize: monsters.length
    })
    : calculateCandidateAward({ floor, kind });
  const allocations = kind === "ordinary"
    ? allocateCandidateAward(candidate.totalAward, templates.map(template => ({ templateExp: template.exp })))
    : [candidate.totalAward];
  return { kind, candidate, allocations };
}
