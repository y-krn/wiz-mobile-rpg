import { strict as assert } from "node:assert";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { SAVE_VERSION, migrateSavePayload } from "../src/state/save_migrations.js";
import { SOLO_CLASSES, createDefaultCurrentRun, createSoloCharacter, state } from "../src/state.js";
import { menuContext } from "../src/navigation.js";
import { EVENT_TYPES } from "../src/data.js";
import { applyFloorTransitionHeal, checkCellEvents } from "../src/movement.js";

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
  assert.equal(Object.hasOwn(payload, "eventCooldownTurns"), false);

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

check("legacy event cooldown field is ignored during load", () => {
  const legacyPayload = createSavePayload();
  legacyPayload.eventCooldownTurns = 15;

  applySavePayload(migrateSavePayload(legacyPayload));

  assert.equal(Object.hasOwn(state, "eventCooldownTurns"), false);
  assert.equal(Object.hasOwn(createSavePayload(), "eventCooldownTurns"), false);
});

check("ordinary cells never become random facilities", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  state.floor = 1;
  state.maps[0] = [[{ type: "floor", event: null }]];
  state.x = 0;
  state.y = 0;
  state.gameState = "explore";
  state.repelTurns = 1;
  state.roamingMonsters = [];
  const springFound = state.codex.events.facilities.spring.found;
  const tabletFound = state.codex.events.facilities.tablet.found;

  try {
    checkCellEvents();
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(state.gameState, "explore");
  assert.equal(state.codex.events.facilities.spring.found, springFound);
  assert.equal(state.codex.events.facilities.tablet.found, tabletFound);
});

check("fixed spring and tablet cells still open their facilities", () => {
  const originalDocument = global.document;
  global.document = {
    getElementById: () => ({ style: {}, textContent: "", className: "", innerHTML: "" })
  };
  state.floor = 1;
  state.maps[0] = [[{ type: "floor", event: EVENT_TYPES.SPRING }]];
  state.x = 0;
  state.y = 0;
  state.gameState = "explore";

  try {
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, EVENT_TYPES.SPRING);

    state.maps[0][0][0].event = EVENT_TYPES.TABLET;
    state.gameState = "explore";
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, EVENT_TYPES.TABLET);
  } finally {
    global.document = originalDocument;
  }
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
