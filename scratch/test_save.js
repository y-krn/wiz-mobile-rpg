import { strict as assert } from "node:assert";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { SAVE_VERSION, migrateSavePayload } from "../src/state/save_migrations.js";
import { SOLO_CLASSES, createDefaultCurrentRun, createSoloCharacter, state } from "../src/state.js";
import { menuContext } from "../src/navigation.js";
import { applyFloorTransitionHeal } from "../src/movement.js";

let failures = 0;
function check(label, test) {
  try {
    test();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${label}`);
    console.error(error);
  }
}

check("all class choices create one fresh Lv1 character", () => {
  assert.equal(SOLO_CLASSES.length, 8);
  for (const className of SOLO_CLASSES) {
    const character = createSoloCharacter(className);
    assert.equal(character.class, className);
    assert.equal(character.level, 1);
    assert.equal(character.exp, 0);
    assert.equal(character.status, "ok");
  }
  assert.notStrictEqual(createSoloCharacter("Fighter"), createSoloCharacter("Fighter"));
});

check("solo save/load roundtrip preserves one character and stable screen", () => {
  state.party = [createSoloCharacter("Mage"), createSoloCharacter("Fighter")];
  state.party[0].hp = 4;
  state.gameState = "submenu";
  state.metaMaterials = { "獣の牙": 7, "竜鱗": 2 };
  state.workshop = { ranks: { gear_rapier: 1, stat_str: 3 } };
  state.unlockedMilestones = [5, 10];
  state.records = { deepestRetreat: 12, deepestDeath: 9, deepestByClass: { Mage: 12 }, totalRuns: 7 };
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.quests = [{ id: "depth", currentValue: 4, targetValue: 5, completed: false }];
  menuContext.type = "solo_start";
  menuContext.prevGameState = "town";

  const payload = createSavePayload();
  assert.equal(payload.version, SAVE_VERSION);
  assert.equal(payload.party.length, 1);
  assert.equal(payload.gameState, "town");
  assert.deepEqual(payload.unlockedMilestones, [5, 10]);
  assert.deepEqual(payload.records, state.records);
  assert.equal(payload.currentRun.quests[0].currentValue, 4);
  assert.equal(Object.hasOwn(payload, "contracts"), false);
  assert.equal(Object.hasOwn(payload, "activeContract"), false);
  assert.equal(Object.hasOwn(payload, "roster"), false);
  assert.equal(Object.hasOwn(payload, "remains"), false);
  assert.equal(Object.hasOwn(payload, "gold"), false);

  state.party = [];
  state.gameState = "combat";
  state.records = {};
  state.currentRun = null;
  applySavePayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(state.party.length, 1);
  assert.equal(state.party[0].class, "Mage");
  assert.equal(state.party[0].hp, 4);
  assert.equal(state.gameState, "town");
  assert.deepEqual(state.metaMaterials, { "獣の牙": 7, "竜鱗": 2 });
  assert.deepEqual(state.workshop, { ranks: { gear_rapier: 1, stat_str: 3 } });
  assert.deepEqual(state.unlockedMilestones, [5, 10]);
  assert.deepEqual(state.records, { deepestRetreat: 12, deepestDeath: 9, deepestByClass: { Mage: 12 }, totalRuns: 7 });
  assert.equal(state.currentRun.quests[0].currentValue, 4);
});

check("legacy saves are rejected instead of migrated", () => {
  assert.throws(
    () => migrateSavePayload({ version: SAVE_VERSION - 1 }),
    error => error?.name === "IncompatibleSaveVersionError"
  );
});

check("floor transition applies provisional 15 percent solo heal", () => {
  state.party = [createSoloCharacter("Fighter")];
  state.party[0].hp = 10;
  state.logs = [];
  const healed = applyFloorTransitionHeal();
  assert.equal(healed, 3);
  assert.equal(state.party[0].hp, 13);
  assert.match(state.logs.at(-1), /HPが3回復/);
});

if (failures > 0) {
  console.error(`${failures} solo state checks failed`);
  process.exit(1);
}
