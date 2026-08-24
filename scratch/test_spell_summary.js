import assert from "node:assert/strict";
import { SPELLS } from "../src/data/spells.js";
import { getSpellCombatSummary } from "../src/combat_ui/spell_summary.js";
import { getSpellCombatSummary as getSpellCombatSummaryFromMenu } from "../src/combat_ui/spell_menu.js";

const RANGE_PATTERN = /(\d+)\s*-\s*(\d+)/;
const failures = [];
const checkedSummaries = [];
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
  const summary = getSpellCombatSummary(spellName);
  checkedSummaries.push(spellName);

  recordAssertion(() => {
    assert.notStrictEqual(
      summary.category,
      "unknown",
      `${spellName}: combat summary definition is missing`
    );
    assert.ok(summary.tag, `${spellName}: combat summary tag is missing`);
    assert.ok(summary.effect, `${spellName}: combat summary effect is missing`);
  });

  const descRange = extractRange(spell.desc);
  if (!descRange) continue;

  checkedSpells.push(spellName);
  const effect = summary.effect;
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
  assert.deepStrictEqual(
    getSpellCombatSummary("WEAKEN"),
    { tag: "弱体", effect: "全体攻撃力 -3 3T", category: "debuff" },
    "WEAKEN: combat summary must match the exact debuff definition"
  );
});

recordAssertion(() => {
  assert.deepStrictEqual(
    getSpellCombatSummaryFromMenu("WEAKEN"),
    getSpellCombatSummary("WEAKEN"),
    "spell menu compatibility export must use the dedicated summary module"
  );
});

recordAssertion(() => {
  assert.strictEqual(
    checkedSummaries.length,
    Object.keys(SPELLS).length,
    "every spell must have a combat summary check"
  );
});

recordAssertion(() => {
  assert.ok(checkedSpells.length > 0, "at least one spell range must be checked");
});

if (failures.length > 0) {
  console.error(`[FAIL] ${failures.length} spell summary assertion(s) failed.`);
  for (const failure of failures) console.error(failure.message);
  process.exit(1);
}

console.log(
  `[PASS] spell summaries exist for ${checkedSummaries.length} spells; ranges match (${checkedSpells.length} spells)`
);
