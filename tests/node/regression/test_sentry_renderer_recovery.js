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
  /function reportRendererRecovery\(error, rendererName, op\)/,
  "renderer fallback must report recovered failures",
);
assert.match(source, /reportRendererRecovery\(error, "pixi", "renderer-init"\)/);
assert.match(source, /reportRendererRecovery\(error, "pixi", "module-init"\)/);
assert.match(source, /recovery: "canvas-fallback"/);
assert.doesNotMatch(
  source,
  /\.catch\(\(\) => \{\s*renderer = new DungeonRenderer/,
  "renderer import fallback must not silently discard its rejection",
);
