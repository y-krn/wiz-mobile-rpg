import type {
  ExplorationDecisionInput,
  ExplorationDecisionPayload
} from "../../../../src/telemetry_exploration_decision.js";

export const explorationDecisionInput = {
  runId: "fixture-run",
  context: { floor: 1 },
  action: "spell",
  source: "event_camp",
  safeCellEvents: new Set(["event_camp"]),
  spellId: "DIOS",
  targetIdx: 0,
  partySize: 1,
  targetType: null,
  spellTarget: "single_ally",
  safeSpellTargetTypes: new Set(["single_ally", "all_allies"]),
  itemId: null,
  itemCategory: "other",
  direction: null,
  safeDirections: new Set([0, 1, 2, 3])
} satisfies ExplorationDecisionInput;

export declare const explorationDecisionPayload: ExplorationDecisionPayload;
