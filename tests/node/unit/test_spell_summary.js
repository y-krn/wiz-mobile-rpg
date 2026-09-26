import assert from "node:assert/strict";
import { SPELLS } from "../../../src/data/spells.js";
import { getSpellCombatSummary } from "../../../src/combat_ui/spell_summary.js";
import { getSpellCombatSummary as getSpellCombatSummaryFromMenu } from "../../../src/combat_ui/spell_menu.js";
import * as facade from "../../../src/combat_ui/spell_summary.js";
import * as owner from "../../../src/combat_ui/spell_summary.ts";
import { exerciseSpellSummaryInputs } from "../fixtures/typescript/spell_summary_inputs.ts";

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
  assert.deepStrictEqual(Object.keys(facade), ["getSpellCombatSummary"]);
  assert.deepStrictEqual(Object.keys(owner), ["getSpellCombatSummary"]);
  assert.strictEqual(facade.getSpellCombatSummary, owner.getSpellCombatSummary);
  assert.strictEqual(getSpellCombatSummaryFromMenu, owner.getSpellCombatSummary);
});

recordAssertion(() => {
  for (const spellName of ["HALITO", "unknown"]) {
    const first = getSpellCombatSummary(spellName);
    const second = getSpellCombatSummary(spellName);
    assert.notStrictEqual(first, second);
    assert.equal(Object.isFrozen(first), false);
    assert.deepStrictEqual(Object.keys(first), ["tag", "effect", "category"]);
  }
  const fallback = getSpellCombatSummary("unknown");
  fallback.tag = "changed";
  fallback.extra = true;
  assert.deepStrictEqual(getSpellCombatSummary("unknown"), { tag: "不明", effect: "", category: "unknown" });
});

recordAssertion(() => {
  const objectKey = { toString: () => "HALITO" };
  const before = Object.getOwnPropertyDescriptors(objectKey);
  assert.deepStrictEqual(getSpellCombatSummary(objectKey), getSpellCombatSummary("HALITO"));
  assert.deepStrictEqual(Object.getOwnPropertyDescriptors(objectKey), before);

  const primitiveKey = { [Symbol.toPrimitive]: () => "HALITO" };
  assert.deepStrictEqual(getSpellCombatSummary(primitiveKey), getSpellCombatSummary("HALITO"));
});

recordAssertion(() => {
  for (const key of [null, undefined, 1, Symbol("HALITO"), "unknown"]) {
    assert.deepStrictEqual(getSpellCombatSummary(key), { tag: "不明", effect: "", category: "unknown" });
  }
});

recordAssertion(() => {
  const throwingMethod = { toString() { throw new Error("key conversion failed"); } };
  assert.throws(() => getSpellCombatSummary(throwingMethod), /key conversion failed/);
  const throwingGetter = Object.defineProperty({}, Symbol.toPrimitive, {
    get() { throw new Error("primitive getter failed"); }
  });
  assert.throws(() => getSpellCombatSummary(throwingGetter), /primitive getter failed/);
});

recordAssertion(() => {
  assert.deepStrictEqual(getSpellCombatSummary("toString"), {});
  assert.deepStrictEqual(getSpellCombatSummary("__proto__"), {});
  assert.deepStrictEqual(getSpellCombatSummary("constructor"), {});
});

recordAssertion(() => {
  exerciseSpellSummaryInputs();
});

recordAssertion(() => {
  assert.deepStrictEqual(
    getSpellCombatSummaryFromMenu("WEAKEN"),
    getSpellCombatSummary("WEAKEN"),
    "spell menu compatibility export must use the dedicated summary module"
  );
});

recordAssertion(() => {
  const firstSummary = getSpellCombatSummary("HALITO");
  firstSummary.tag = "mutated";
  firstSummary.effect = "mutated";
  firstSummary.category = "mutated";

  assert.deepStrictEqual(
    getSpellCombatSummary("HALITO"),
    { tag: "単体", effect: "火 12-22", category: "single" },
    "mutating one returned summary must not affect a later call"
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
