/* global console, process */

process.env.SIM_737_DAMAGE_AUDIT = "1";

const failures = [];
const {
  calibrateCoreScoringProfile,
  createDamageEstimateAuditMetrics,
  getScenarioById,
  recordDamageEstimatePhysicalHits,
  resetSimulationRandom,
  simulateRun
} = await import("../../simulations/sim_depth_material_ev.js");

function check(condition, message) {
  if (!condition) failures.push(message);
}

const unmatchedMetrics = {
  damageEstimateAudit: createDamageEstimateAuditMetrics()
};
recordDamageEstimatePhysicalHits(unmatchedMetrics, [{
  floor: 7,
  weaponAtk: 999,
  formulaDmg: 5,
  damage: 5
}]);
check(
  unmatchedMetrics.damageEstimateAudit.hits.length === 0 &&
    unmatchedMetrics.damageEstimateAudit.unmatchedHits === 1 &&
    unmatchedMetrics.damageEstimateAudit.unmatchedHitsByFloor["7"].hits === 1,
  "pendingless physical hits must be excluded and counted as unmatched"
);

const matchedMetrics = {
  damageEstimateAudit: createDamageEstimateAuditMetrics()
};
matchedMetrics.damageEstimateAudit.pending = { estimate: 5 };
recordDamageEstimatePhysicalHits(matchedMetrics, [{
  floor: 7,
  weaponAtk: 999,
  formulaDmg: 6,
  damage: 6
}]);
const matchedHit = matchedMetrics.damageEstimateAudit.hits[0];
check(
  matchedMetrics.damageEstimateAudit.unmatchedHits === 0 &&
    matchedHit?.estimate === 5 &&
    !Object.hasOwn(matchedHit, "estimateFallback"),
  "pending physical hits must retain the estimate without a fallback marker"
);

const scenario = getScenarioById("workshop-complete");
const profile = calibrateCoreScoringProfile(1, scenario, "powder", scenario.workshop);
resetSimulationRandom(231);
const result = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 3,
  runIndex: 0,
  seriesId: "issue737-damage-audit-test",
  scoringProfile: profile,
  scenario,
  workshop: scenario.workshop,
  collectCombatFormula: true
});
check(
  result.damageEstimateAudit?.unmatchedHits === 0,
  "normal audited simulation should have zero unmatched physical hits"
);
check(
  (result.damageEstimateAudit?.hits || []).every(hit =>
    Number.isFinite(hit.estimate) &&
    Number.isFinite(hit.formula) &&
    Number.isFinite(hit.observed) &&
    !Object.hasOwn(hit, "estimateFallback")
  ),
  "audited physical hits must contain only finite matched values"
);

if (failures.length > 0) {
  failures.forEach(message => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] issue #737 damage audit excludes pendingless hits without fallback");
