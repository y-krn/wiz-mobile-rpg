import assert from "node:assert/strict";
import { chooseAutoCombatAction } from "../src/combat_logic/auto_action.js";

const failures = [];

function check(name, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

const singleTargetMonsters = [
  { hp: 30, status: "ok", tags: [] },
  { hp: 10, status: "ok", tags: ["undead"] },
  { hp: 20, status: "ok", tags: [] }
];

check("KATINO is selected on round 1 against multiple enemies", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Mage", spells: ["KATINO", "HALITO"] },
    monsters: singleTargetMonsters,
    roundNumber: 1,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "KATINO" });
});

check("Priest BADIOS prioritizes a holy target", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Priest", spells: ["BADIOS"] },
    monsters: singleTargetMonsters,
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "BADIOS" });
});

check("Mage HALITO targets the lowest HP enemy", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Mage", spells: ["HALITO"] },
    monsters: singleTargetMonsters,
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "HALITO" });
});

check("DIOS reserves one MP before offensive casting", () => {
  const calls = [];
  const action = chooseAutoCombatAction({
    character: { class: "Priest", spells: ["DIOS", "BADIOS"] },
    monsters: [{ hp: 30, status: "ok", tags: [] }],
    roundNumber: 2,
    canCastSpell: (spellName, reserveMp) => {
      calls.push({ spellName, reserveMp });
      return reserveMp === 0;
    }
  });
  assert.deepEqual(action, { type: "fight", targetIdx: 0 });
  assert.deepEqual(calls, [{ spellName: "BADIOS", reserveMp: 1 }]);
});

check("unsupported elite classes remain outside the shared basic-class policy", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Bishop", spells: ["BADIOS"] },
    monsters: singleTargetMonsters,
    roundNumber: 1,
    canCastSpell: () => true
  });
  assert.equal(action, null);
});

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("[PASS] auto combat action selection");
