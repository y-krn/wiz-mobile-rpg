import {
  getPerceptionIntent,
  type PerceptionIntent
} from "../../../../src/systems/elite_perception";

export function getMinimalPerceptionIntent(): PerceptionIntent {
  return getPerceptionIntent({
    monster: { x: 0, y: 0, perception: "standard" },
    player: { x: 3, y: 0 },
    grid: []
  });
}
