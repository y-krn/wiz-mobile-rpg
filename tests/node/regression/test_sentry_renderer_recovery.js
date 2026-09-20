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
  /function reportRendererFailure\(error, selection, reason, phase\)/,
  "renderer failure must report a safe UI path",
);
assert.match(source, /requested_renderer: selection\.requestedRenderer/);
assert.match(source, /failure_reason: reason/);
assert.match(source, /failure_phase: phase/);
assert.match(source, /extra: \{\s*renderer:/);
assert.match(source, /recovery: "safe-ui"/);
assert.match(source, /renderer-safe-ui/);
assert.match(source, /renderer-retry/);
assert.match(source, /renderer-reload/);
assert.match(source, /aria-labelledby.*renderer-safe-ui-title/);
assert.match(source, /safeUi\.querySelector\("#renderer-retry"\)\?\.focus\(\)/);
assert.match(source, /candidate\.initializationPhase = "unsupported"/);
assert.match(source, /phase === "unsupported"/);
assert.match(source, /assertInjectedFailure\("runtime"\)/);
assert.match(source, /showRendererFailure\(error, "pixi-runtime-failed", "runtime"\);\s*return;/);
assert.doesNotMatch(source, /\bDungeonRenderer\b|canvas-fallback|fallback_occurred/);
