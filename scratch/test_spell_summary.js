import assert from "node:assert/strict";
import { SPELLS } from "../src/data/spells.js";
import { getSpellCombatSummary } from "../src/combat_ui/spell_menu.js";

const RANGE_PATTERN = /(\d+)\s*-\s*(\d+)/;
const failures = [];
const checkedSpells = [];

function extractRange(text) {
  const match = text.match(RANGE_PATTERN);
  return match ? `${match[1]}-${match[2]}` : null;
}

function recordAssertion(assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(error);
  }
}

for (const [spellName, spell] of Object.entries(SPELLS)) {
  const descRange = extractRange(spell.desc);
  if (!descRange) continue;

  checkedSpells.push(spellName);
  const effect = getSpellCombatSummary(spellName).effect;
  const effectRange = extractRange(effect);

  recordAssertion(() => {
    assert.strictEqual(
      effectRange,
      descRange,
      `${spellName}: combat summary range should match spell description`
    );
  });
}

recordAssertion(() => {
  assert.ok(checkedSpells.length > 0, "at least one spell range must be checked");
});

if (failures.length > 0) {
  console.error(`[FAIL] ${failures.length} spell summary assertion(s) failed.`);
  for (const failure of failures) console.error(failure.message);
  process.exit(1);
}

console.log(`[PASS] spell summary ranges match (${checkedSpells.length} spells)`);
