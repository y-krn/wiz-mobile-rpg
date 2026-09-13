import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../../src/state/save_storage.js", import.meta.url), "utf8");

assert.match(
  source,
  /catch \(backupErr\) \{[\s\S]*?captureException\(backupErr, \{[\s\S]*?op: "backup-rotation"[\s\S]*?recovery: "continue-primary-save"[\s\S]*?console\.warn\("Save backup rotation failed"/,
  "backup rotation failures must be reported before continuing the primary save"
);

assert.match(
  source,
  /catch \(err\) \{[\s\S]*?op: "preserve-corrupt"[\s\S]*?recovery: "active-run-fallback"[\s\S]*?reason: "run-floor-recovery-failed"[\s\S]*?Failed to preserve unrecoverable active-run save/,
  "active-run preservation failures must be observable"
);

assert.match(
  source,
  /op: "preserve-corrupt"[\s\S]*?recovery: "continue-new-game"[\s\S]*?reason: "all-saves-unreadable"[\s\S]*?Failed to preserve corrupt save/,
  "total-loss preservation failures must be observable"
);

console.log("[PASS] save recovery degradation is observable in Sentry");
