import {
  getEliteProlongedCheckChance,
  recordEliteGreedAction,
  shouldSpawnEliteAfterExploration
} from "../../../../src/systems/roaming_elites";

export function recordMinimalEliteAction(): number {
  const state: {
    floor: number;
    currentRun: { eliteFloors?: Record<string, { greedScore?: number }> };
  } = { floor: 3, currentRun: {} };
  recordEliteGreedAction(state, "battle", "2");
  return state.currentRun.eliteFloors?.["3"]?.greedScore ?? 0;
}

export function getStringCheckChance(): number {
  return getEliteProlongedCheckChance("2");
}

export function spawnFromStringProgress(): boolean {
  return shouldSpawnEliteAfterExploration({
    floor: 3,
    runSeed: "x",
    greedScore: "12",
    checkIndex: "1"
  });
}
