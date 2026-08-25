import assert from "node:assert/strict";
import {
  MONSTERS,
  describeMonsterResistances,
  describeMonsterTraits,
  getMonsterResistanceStatus,
  getMonsterResistanceTier
} from "../src/data/monsters.js";
import {
  createMonsterCodexRecord,
  getMonsterCodexKey,
  recordMonsterResistanceDiscovery
} from "../src/state/codex_state.js";
import { createSoloCharacter } from "../src/state/initial_state.js";
import { runCombatRoundCalculation } from "../src/combat_logic/round.js";
import { resolvePlayerSpell } from "../src/combat_logic/spell_resolution.js";

function run() {
  const wisp = MONSTERS.find(monster => monster.name === "ウィル・オー・ウィスプ");
  assert.ok(wisp, "ウィル・オー・ウィスプ must exist");
  assert.equal(getMonsterCodexKey({ name: `${wisp.name} A` }), wisp.name);
  assert.equal(getMonsterResistanceTier(wisp.magicResist), "ほとんど効かない");

  const stateLike = {
    codex: { monsters: { [wisp.name]: { encountered: 1, killed: 0 } } }
  };
  recordMonsterResistanceDiscovery({ ...wisp, name: `${wisp.name} A` }, "magic", stateLike);
  let record = stateLike.codex.monsters[wisp.name];
  assert.equal(record.magicResistKnown, true);
  assert.equal(record.physResistKnown, undefined, "physical disclosure stays separate");
  assert.deepEqual(describeMonsterResistances(wisp, record), ["呪文：ほとんど効かない"]);

  recordMonsterResistanceDiscovery(wisp, "physical", stateLike);
  record = stateLike.codex.monsters[wisp.name];
  assert.deepEqual(describeMonsterResistances(wisp, record), [
    "呪文：ほとんど効かない",
    "物理：やや効きにくい"
  ]);
  assert.ok(describeMonsterTraits(wisp, record).includes("物理：やや効きにくい"));

  const statuses = getMonsterResistanceStatus(wisp, { ...createMonsterCodexRecord(), magicResistKnown: true });
  assert.deepEqual(statuses.map(status => status.description), ["ほとんど効かない", "未判明"]);
  assert.deepEqual(describeMonsterResistances(wisp, createMonsterCodexRecord()), []);

  const fighter = createSoloCharacter("Fighter");
  const target = { ...wisp, hp: 1000, maxHp: 1000, buffs: [] };
  const roundState = {
    party: [fighter],
    inventory: [],
    floor: 1,
    firstKills: [],
    codex: { monsters: {} },
    currentRun: null,
    metaMaterials: {},
    roamingMonsters: [],
    floorChestsTotal: [],
    combatState: {
      monsters: [target],
      phase: "choose_actions",
      roundNumber: 1,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      loggedCoreActivations: []
    }
  };

  const originalRandom = Math.random;
  try {
    Math.random = () => 0.99;
    const result = runCombatRoundCalculation(roundState, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    });
    assert.equal(result.state.codex.monsters[wisp.name].physResistKnown, true);
    assert.equal(result.state.codex.monsters[wisp.name].magicResistKnown, false);
    assert.ok(result.state.codex.monsters[wisp.name].observedActions.includes("通常攻撃"));

    const mage = createSoloCharacter("Mage");
    mage.mp = mage.maxMp = 20;
    const spellState = {
      floor: 1,
      party: [mage],
      codex: { monsters: {} },
      combatState: { loggedCoreActivations: [] }
    };
    const spellTarget = { ...wisp, hp: 1000, maxHp: 1000, buffs: [] };
    resolvePlayerSpell(
      mage,
      { spellName: "HALITO", targetIdx: 0 },
      spellState,
      [spellTarget],
      []
    );
    assert.equal(spellState.codex.monsters[wisp.name].magicResistKnown, true);
    assert.equal(spellState.codex.monsters[wisp.name].physResistKnown, false);
  } finally {
    Math.random = originalRandom;
  }
}

try {
  run();
  console.log("[PASS] Resistance disclosure records separate physical and magic observations.");
} catch (error) {
  console.error("[FAIL] Resistance disclosure verification failed:", error);
  process.exit(1);
}
