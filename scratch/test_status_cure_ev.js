import { calculateStatusCureEv } from "./sim_depth_material_ev.js";

const failures = [];

function check(name, condition, details = "") {
  if (!condition) failures.push(`${name}${details ? `: ${details}` : ""}`);
}

const cases = [
  {
    name: "poison",
    input: {
      status: "poisoned",
      remainingExplorationSteps: 100,
      poisonDamagePerStep: 0.25,
      actionLoss: 10,
      itemLoss: 1
    },
    continueLoss: 25,
    treatmentLoss: 11,
    shouldCure: true,
    basis: "remaining-steps-x-poison-damage-per-step"
  },
  {
    name: "blind",
    input: {
      status: "blind",
      attackMissesPerEpisode: 1.47,
      blindHitDamageHp: 17.59,
      actionLoss: 17.59,
      itemLoss: 1
    },
    continueLoss: 1.47 * 17.59,
    treatmentLoss: 18.59,
    shouldCure: true,
    basis: "misses-per-episode-x-hit-damage"
  },
  {
    name: "paralyzed",
    input: {
      status: "paralyzed",
      incapacitatedActions: 0.91,
      actionLoss: 1,
      itemLoss: 1
    },
    continueLoss: 0.91,
    treatmentLoss: 2,
    shouldCure: false,
    basis: "incapacitated-actions-per-episode"
  },
  {
    name: "sleep",
    input: {
      status: "sleep",
      incapacitatedActions: 0.86,
      actionLoss: 1,
      itemLoss: 1
    },
    continueLoss: 0.86,
    treatmentLoss: 2,
    shouldCure: false,
    basis: "incapacitated-actions-per-episode"
  }
];

for (const testCase of cases) {
  const result = calculateStatusCureEv(testCase.input);
  const tolerance = 1e-9;
  check(`${testCase.name} continue loss`, Math.abs(result.continueLoss - testCase.continueLoss) < tolerance);
  check(`${testCase.name} treatment loss`, Math.abs(result.treatmentLoss - testCase.treatmentLoss) < tolerance);
  check(`${testCase.name} decision`, result.shouldCure === testCase.shouldCure);
  check(`${testCase.name} loss basis`, result.lossBasis === testCase.basis);
}

const strictBoundary = calculateStatusCureEv({
  status: "sleep",
  incapacitatedActions: 2,
  actionLoss: 1,
  itemLoss: 1
});
check("strict EV boundary", strictBoundary.shouldCure === false);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${cases.length + 1} status-cure EV cases`);
