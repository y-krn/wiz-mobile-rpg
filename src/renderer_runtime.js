// balance-impact: none — renderer runtime registry only; gameplay rules unchanged.
// Runtime registry for the single production Dungeon View renderer.
// The registry owns no drawing logic; PixiJS owns the production surface.
export let dungeonRenderer = null;

export function setDungeonRenderer(renderer) {
  dungeonRenderer = renderer;
}
