import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readStyle = name => fs.readFileSync(path.join(repoRoot, "src/styles", name), "utf8");

const tokens = readStyle("tokens.css");
const combat = readStyle("overlays-combat.css");
const equipment = readStyle("overlays-equip.css");
const spell = readStyle("overlays-spell.css");
const result = readStyle("overlays-result.css");

assert.match(tokens, /--surface-control:\s*#fffaf1;/);
assert.match(tokens, /--surface-neutral:\s*#f7f0e3;/);
assert.match(tokens, /--surface-unavailable:\s*#ece5d9;/);
assert.match(tokens, /--surface-meter-track:\s*#e7dccb;/);

const assertOwner = (source, selector, token) => {
  const selectorPattern = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = source.match(new RegExp(`${selectorPattern}\\s*\\{[^}]*\\}`))?.[0];
  assert.ok(block, `missing CSS owner for ${selector}`);
  assert.match(block, new RegExp(`var\\(--${token}\\)`), `${selector} must own --${token}`);
};

assertOwner(combat, ".card-hp-bar-container, .card-mp-bar-container", "surface-meter-track");
assertOwner(equipment, ".equip-stat-pill", "surface-meter-track");
assertOwner(combat, ".combat-enemy-info-card", "surface-neutral");
assertOwner(spell, ".spell-char-selector", "surface-neutral");
assertOwner(spell, ".spell-detail-desc", "surface-neutral");
assertOwner(result, ".result-focus-section", "surface-neutral");
assertOwner(spell, ".spell-target-card", "surface-control");
assertOwner(combat, ".combat-target-card", "surface-control");
assertOwner(spell, ".spell-target-card.disabled", "surface-unavailable");
assertOwner(spell, ".spell-caster-btn.disabled", "surface-unavailable");

console.log("[PASS] visual surface tokens retain semantic ownership");
