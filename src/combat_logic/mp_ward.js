import { getClassPassiveBonus } from "../rules/class_rules.js";

/**
 * MP ward is active only while the character can pay the minimum spell cost.
 * Keep this resolver shared by combat formulas and telemetry so observability
 * cannot drift from the effective defense calculation.
 */
export function getMpWardDef(char) {
  if (!char || (char.mp || 0) < 1) return 0;
  return getClassPassiveBonus(char, "mpWard");
}
