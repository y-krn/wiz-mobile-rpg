import {
  buildCombatDecisionPayload,
  type CombatDecisionInput,
  type CombatDecisionPayload
} from "../../src/telemetry_combat_decision.js";

const input: CombatDecisionInput = {
  runId: "run",
  combatId: "combat",
  action: "spell",
  actorIdx: 0,
  targetIdx: -1,
  partySize: 1,
  monsters: [],
  context: {},
  spellId: "MABARRIER",
  spellTarget: "all_enemies",
  itemId: null,
  itemCategory: "other",
  normalizeEnemyId: name => String(name ?? "other")
};

const payload: CombatDecisionPayload = buildCombatDecisionPayload(input);
void payload;

// @ts-expect-error item identifiers must stay nullable strings
const invalidInput: CombatDecisionInput = { ...input, itemId: 42 };
void invalidInput;
