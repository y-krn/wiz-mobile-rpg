import { recordEliteGreedAction } from "../../../../src/systems/roaming_elites";

export function recordMinimalEliteAction(): number {
  const state: {
    floor: number;
    currentRun: { eliteFloors?: Record<string, { greedScore?: number }> };
  } = { floor: 3, currentRun: {} };
  recordEliteGreedAction(state, "battle");
  return state.currentRun.eliteFloors?.["3"]?.greedScore ?? 0;
}
