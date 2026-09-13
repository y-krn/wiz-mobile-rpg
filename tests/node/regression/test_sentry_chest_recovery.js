import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = fs.readFileSync(path.join(repoRoot, "src/chest.js"), "utf8");

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start + 1) : source.length;
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

assert.match(source, /import \{ captureException \} from "\.\/sentry\.js";/);

const disarmRecovery = functionBody("recoverChestDisarmTransition", "recoverChestOpenTransition");
assert.match(disarmRecovery, /captureException\(error,/);
assert.match(disarmRecovery, /op: "disarm-transition"/);
assert.match(disarmRecovery, /recovery: "return-to-menu"/);
assert.ok(
  disarmRecovery.indexOf("captureException(error") < disarmRecovery.indexOf("state.transitioning = false"),
  "disarm recovery must capture the pre-recovery state"
);

const openRecovery = functionBody("recoverChestOpenTransition", "trackChestChoice");
assert.match(openRecovery, /captureException\(error,/);
assert.match(openRecovery, /op: "open-transition"/);
assert.match(openRecovery, /recovery: "close-chest"/);
assert.ok(
  openRecovery.indexOf("captureException(error") < openRecovery.indexOf("state.transitioning = false"),
  "open recovery must capture the pre-recovery state"
);

console.log("[PASS] chest recovery failures remain observable in Sentry");
