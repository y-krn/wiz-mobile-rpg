/* global process */

process.env.SIM_SEED ||= "483";
process.env.SIM_SCENARIOS ||= "workshop-complete";

const { createSoloCharacter } = await import("../src/state/initial_state.js");
const { getCharMaxHp } = await import("../src/data.js");
const { getSimulationHealAmount } = await import("./sim_depth_material_ev.js");

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

function makeState(floor, healPotionAmountOverride = null) {
  const character = createSoloCharacter("Fighter");
  return {
    floor,
    party: [character],
    simPolicy: { healPotionAmountOverride }
  };
}

const baseState = makeState(1, { kind: "fixed", amount: 15 });
const maxHp = getCharMaxHp(baseState.party[0]);
check("fixed override uses the requested amount", getSimulationHealAmount(baseState, "HEAL_POTION") === 15);
check(
  "max-hp ratio rounds from effective max HP",
  getSimulationHealAmount(makeState(1, { kind: "max-hp-ratio", ratio: 0.25 }), "HEAL_POTION") ===
    Math.round(maxHp * 0.25)
);
check(
  "floor scale anchors B1 at 15",
  getSimulationHealAmount(makeState(1, { kind: "floor-scale", base: 15, perFloor: 5 }), "HEAL_POTION") === 15
);
check(
  "floor scale adds per-floor amount",
  getSimulationHealAmount(makeState(3, { kind: "floor-scale", base: 15, perFloor: 5 }), "HEAL_POTION") === 25
);
check(
  "upper potion stays at the source 40 under heal-potion what-if",
  getSimulationHealAmount(makeState(10, { kind: "fixed", amount: 60 }), "GREATER_HEAL") === 40
);

const failures = checks.filter(({ condition }) => !condition);
checks.forEach(({ name, condition }) => console.log(`${condition ? "PASS" : "FAIL"} ${name}`));
if (failures.length > 0) {
  process.exit(1);
}
