import { calculateSecretDoorSearchChance } from "../../../../src/rules/exploration_rules.js";

const floor: unknown = "5.9";
const arcaneSense: unknown = 0.5;
const legacyContainer: unknown = false;

export function compileLegacyExplorationInputs(): number[] {
  return [
    calculateSecretDoorSearchChance({ floor, arcaneSense }),
    calculateSecretDoorSearchChance(legacyContainer),
    calculateSecretDoorSearchChance()
  ];
}
