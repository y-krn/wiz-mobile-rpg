import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../../src/ui/solo_hud.js", import.meta.url), "utf8");

assert.match(source, /import \{ captureException \} from "\.\.\/sentry\.js";/);
assert.match(source, /const reportedStatFallbacks = new Set\(\);/);
assert.match(source, /if \(reportedStatFallbacks\.has\(stat\)\) return;/);
assert.match(source, /reportedStatFallbacks\.add\(stat\);/);
assert.match(source, /op: "solo-hud-stat"/);
assert.match(source, /recovery: "use-stored-stat"/);
assert.match(source, /reportStatFallback\(error, "maxHp"\);/);
assert.match(source, /reportStatFallback\(error, "maxMp"\);/);

console.log("[PASS] solo HUD fallbacks are observable and deduplicated");
