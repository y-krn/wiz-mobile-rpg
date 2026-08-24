import { strict as assert } from "node:assert";
import { applySavePayload, createSavePayload } from "../src/state/save_payload.js";
import { SAVE_PAYLOAD_FIELDS, SAVE_VERSION, migrateSavePayload } from "../src/state/save_migrations.js";
import { SOLO_CLASSES, createDefaultCurrentRun, createSoloCharacter, loadGame, state } from "../src/state.js";
import { menuContext, openGuardedSubmenu } from "../src/navigation.js";
import { EVENT_TYPES } from "../src/data.js";
import { applyFloorTransitionHeal, checkCellEvents } from "../src/movement.js";

const saveValues = new Map();
globalThis.localStorage = {
  getItem: key => saveValues.get(key) ?? null,
  setItem: (key, value) => saveValues.set(key, String(value)),
  removeItem: key => saveValues.delete(key),
  clear: () => saveValues.clear()
};

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
  state.keyItems = ["FORGE_SEAL", "ABYSS_SEAL"];
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
  assert.deepEqual(Object.keys(payload).sort(), [...SAVE_PAYLOAD_FIELDS].sort());
  state.transitioning = true;
  state.controlsGuardUntil = Date.now() + 1000;
  state.mapRevision = 99;
  state.sessionMaxFloor = 99;
  assert.equal(Object.hasOwn(createSavePayload(), "transitioning"), false);
  assert.equal(Object.hasOwn(createSavePayload(), "controlsGuardUntil"), false);
  assert.equal(Object.hasOwn(createSavePayload(), "mapRevision"), false);
  assert.equal(Object.hasOwn(createSavePayload(), "sessionMaxFloor"), false);
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
  assert.deepEqual(state.keyItems, ["FORGE_SEAL", "ABYSS_SEAL"]);
  assert.deepEqual(state.unlockedMilestones, [5, 10]);
  assert.deepEqual(state.records, { deepestRetreat: 12, deepestDeath: 9, deepestByClass: { Mage: 12 }, totalRuns: 7 });
  assert.equal(state.currentRun.quests[0].currentValue, 4);
});

check("partial current-version payloads receive safe defaults", () => {
  const partialPayload = {
    version: SAVE_VERSION,
    party: [createSoloCharacter("Thief")],
    gameState: "equip_overlay",
    transitioning: true,
    menuContext: { type: "equipment" },
    eventCooldownTurns: 20
  };

  applySavePayload(migrateSavePayload(partialPayload));

  assert.equal(state.party[0].class, "Thief");
  assert.equal(state.gameState, "explore");
  assert.equal(state.floor, 1);
  assert.equal(state.maps.length, 5);
  assert.deepEqual(state.floorChestsOpened, [0, 0, 0, 0, 0]);
  assert.equal(state.floorChestsTotal.length, 5);
  assert.equal(Object.hasOwn(state, "eventCooldownTurns"), false);
});

check("combat screens require a usable combat payload", () => {
  const validPayload = {
    ...createSavePayload(),
    gameState: "combat",
    combatState: {
      phase: "choose_actions",
      monsters: [{ name: "スライム", hp: 5, maxHp: 5 }]
    }
  };
  const valid = migrateSavePayload(validPayload);
  assert.equal(valid.gameState, "combat");
  assert.equal(valid.combatState.monsters.length, 1);

  const malformed = migrateSavePayload({
    ...validPayload,
    combatState: { phase: "choose_actions", monsters: null }
  });
  assert.equal(malformed.combatState, null);
  assert.equal(malformed.gameState, "town");
});

check("malformed history entries are filtered without changing valid records", () => {
  const validHistory = {
    outcome: "death",
    endedAt: 0,
    result: "failed",
    bankedMaterials: { "獣の牙": 2 }
  };
  const validDeath = {
    endedAt: 0,
    floor: 2,
    cause: "罠",
    lostItems: ["HEAL_POTION"],
    character: { level: 3 }
  };
  const normalized = migrateSavePayload({
    ...createSavePayload(),
    runHistory: [null, validHistory, "invalid"],
    deathLogs: [null, { ...validDeath, lostItems: "invalid" }]
  });

  assert.deepEqual(normalized.runHistory, [validHistory]);
  assert.equal(normalized.deathLogs.length, 1);
  assert.deepEqual(normalized.deathLogs[0].lostItems, []);
});

check("save normalization does not mutate caller-owned nested data", () => {
  const payload = createSavePayload();
  payload.party[0].spells = undefined;
  payload.party[0].runTrapAttackBonus = 7;
  payload.currentRun = createDefaultCurrentRun();
  payload.currentRun.seenOmenFloors = [1];
  payload.currentRun.quests = undefined;
  payload.workshop = { ranks: {} };
  const before = structuredClone(payload);

  migrateSavePayload(payload);

  assert.deepEqual(payload, before);
});

check("malformed direct payloads fail before state mutation", () => {
  const originalX = state.x;
  assert.throws(
    () => applySavePayload(null),
    error => error?.name === "MalformedSavePayloadError"
  );
  assert.equal(state.x, originalX);

  const malformedPayload = {
    ...createSavePayload(),
    party: {},
    inventory: {},
    records: null,
    codex: null,
    combatState: { monsters: {} }
  };
  assert.doesNotThrow(() => applySavePayload(malformedPayload));
  assert.deepEqual(state.party, []);
  assert.deepEqual(state.inventory, []);
  assert.equal(state.combatState, null);
});

check("malformed primary save falls back to a valid backup", () => {
  saveValues.clear();
  const backupPayload = createSavePayload();
  backupPayload.party = [createSoloCharacter("Bishop")];
  saveValues.set("mobile_wiz_rpg_autosave", "{not-json");
  saveValues.set("mobile_wiz_rpg_backup", JSON.stringify(backupPayload));

  loadGame();

  assert.equal(state.party[0].class, "Bishop");
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

check("下り階段サブメニュー中のセーブはexploreに畳まれる", () => {
  const originalDocument = global.document;
  global.document = {
    getElementById: () => ({ style: {}, textContent: "", className: "", innerHTML: "" })
  };
  try {
    state.party = [createSoloCharacter("Fighter")];
    state.floor = 3;
    state.gameState = "explore";
    state.currentRun = createDefaultCurrentRun();
    openGuardedSubmenu("stairs_down", "B4Fへの下り階段");
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    const payload = createSavePayload();
    assert.equal(payload.gameState, "explore");
    applySavePayload(payload);
    assert.equal(state.gameState, "explore");
  } finally {
    global.document = originalDocument;
  }
});

if (failures > 0) {
  console.error(`${failures} solo state checks failed`);
  process.exit(1);
}
