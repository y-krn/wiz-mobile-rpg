import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import stylelint from "stylelint";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const configFile = path.join(repoRoot, "stylelint.config.js");
const targetFile = path.join(repoRoot, "src/styles/overlays-spell.css");

const productionResult = await stylelint.lint({ configFile, files: targetFile });
const productionWarnings = productionResult.results.flatMap(result => result.warnings);
assert.equal(
  productionResult.errored,
  false,
  productionWarnings.map(warning => `${warning.rule}: ${warning.text}`).join("\n")
);

const duplicateResult = await stylelint.lint({
  code: ".spell-target-card { min-height: 90px; min-height: 80px; }",
  configFile,
});
const duplicateWarnings = duplicateResult.results.flatMap(result => result.warnings);
assert.ok(
  duplicateWarnings.some(warning => warning.rule === "declaration-block-no-duplicate-properties"),
  "the standard CSS lint must catch duplicate declarations"
);

console.log("[PASS] spell target card CSS lint coverage");
