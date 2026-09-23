// Diagnostic-only contract; no production imports or connection.

export const PROGRESSION_ENEMY_CANDIDATE = Object.freeze({
  id: "milestone-baseline-generic-enemy-band-v1",
  baselineIndex: Object.freeze({ min: 0, max: 5 }),
  enemyBandIndex: Object.freeze({ min: 0, max: 5 }),
  playerPhysicalMultiplier: baseline => 1 + 0.16 * baseline,
  playerSpellMultiplier: baseline => 1 + 0.16 * baseline,
  playerLevel1MaxHp: baseline => 20 * (1 + 0.10 * baseline),
  playerRawDefenseMilestoneBonus: 0,
  enemyHpMultiplier: band => 1 + 0.20 * band,
  enemyAttackMultiplier: band => 1 + 0.10 * band,
  enemyDefenseMultiplier: 1.0
});

const MILESTONES = Object.freeze([
  Object.freeze({ floor: 5, baseline: 1, band: 1 }),
  Object.freeze({ floor: 10, baseline: 2, band: 2 }),
  Object.freeze({ floor: 15, baseline: 3, band: 3 }),
  Object.freeze({ floor: 20, baseline: 4, band: 4 }),
  Object.freeze({ floor: 25, baseline: 5, band: 5 })
]);

export function resolveProgressionEnemyDiagnosticContext({
  kind,
  milestoneFloor = null,
  selectedStartFloor = 1,
  highestEarlierDefeatedMilestone = null
}) {
  if (kind === "b1-start") return { kind, floor: 1, baseline: 0, enemyBand: 0 };
  if (kind === "b30-reference") return { kind, floor: 30, baseline: 5, enemyBand: 5 };
  const milestone = MILESTONES.find(entry => entry.floor === milestoneFloor);
  if (!milestone || !["pre-milestone", "selected-deep-start", "post-milestone"].includes(kind)) {
    throw new Error(`invalid progression enemy diagnostic context: ${kind}/B${milestoneFloor}`);
  }
  if (kind === "pre-milestone") {
    const selected = MILESTONES.find(entry => entry.floor === selectedStartFloor)?.baseline || 0;
    const earlier = highestEarlierDefeatedMilestone
      ? MILESTONES.find(entry => entry.floor === highestEarlierDefeatedMilestone)?.baseline || 0
      : 0;
    return { kind, floor: milestone.floor, baseline: Math.max(selected, earlier), enemyBand: milestone.band };
  }
  if (kind === "selected-deep-start") {
    if (selectedStartFloor !== milestoneFloor) {
      throw new Error(`selected-deep-start floor must match milestone B${milestoneFloor}`);
    }
    const selected = MILESTONES.find(entry => entry.floor === selectedStartFloor)?.baseline || 0;
    return { kind, floor: selectedStartFloor, baseline: selected, enemyBand: milestone.band, level: 1 };
  }
  const selected = MILESTONES.find(entry => entry.floor === selectedStartFloor)?.baseline || 0;
  return {
    kind,
    floor: milestone.floor + 1,
    baseline: Math.max(selected, milestone.baseline),
    enemyBand: milestone.band
  };
}

export function deriveProgressionEnemyRunSeed({ rootSeed, context, fixtureId, runIndex }) {
  const key = [rootSeed, context.kind, context.floor, fixtureId, runIndex].join(":");
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS = Object.freeze([
  resolveProgressionEnemyDiagnosticContext({ kind: "b1-start" }),
  ...[5, 10, 20].flatMap(milestoneFloor => [
    resolveProgressionEnemyDiagnosticContext({
      kind: "pre-milestone",
      milestoneFloor,
      highestEarlierDefeatedMilestone: milestoneFloor === 5 ? null : milestoneFloor === 10 ? 5 : 15
    }),
    resolveProgressionEnemyDiagnosticContext({ kind: "selected-deep-start", milestoneFloor, selectedStartFloor: milestoneFloor }),
    resolveProgressionEnemyDiagnosticContext({ kind: "post-milestone", milestoneFloor, selectedStartFloor: 1 })
  ]),
  resolveProgressionEnemyDiagnosticContext({ kind: "b30-reference" })
]);
