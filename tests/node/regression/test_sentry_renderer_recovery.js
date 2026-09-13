import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/game.js", "utf8");

assert.match(
  source,
  /import \{ addGameBreadcrumb, captureException \} from "\.\/sentry\.js";/,
  "renderer recovery must use the runtime-neutral Sentry facade",
);
assert.match(
  source,
  /function reportRendererRecovery\(error, selection, reason, pixiPhase\)/,
  "renderer fallback must report recovered failures",
);
assert.match(source, /requested_renderer: selection\.requestedRenderer/);
assert.match(source, /fallback_reason: reason/);
assert.match(source, /pixi_phase: pixiPhase/);
assert.match(source, /extra: \{\s*renderer:/);
assert.match(source, /recovery: "canvas-fallback"/);
assert.doesNotMatch(
  source,
  /\.catch\(\(\) => \{\s*renderer = new DungeonRenderer/,
  "renderer import fallback must not silently discard its rejection",
);
