import assert from "node:assert/strict";

const element = () => ({
  style: {},
  dataset: {},
  appendChild: () => element(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  innerHTML: "",
  textContent: "",
  className: ""
});

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  getElementById: () => element(),
  querySelector: () => element(),
  querySelectorAll: () => [],
  createElement: () => element(),
  body: element()
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
Object.defineProperty(global, "navigator", { value: { userAgent: "node" }, configurable: true });

const {
  GUIDEBOOK_PAGES,
  GUIDE_FRAGMENTS_PER_ELITE,
  GUIDE_FRAGMENTS_PER_GUARDIAN
} = await import("../../../src/data/guidebook.js");
const {
  addRunFragments,
  decodeNextGuidebookPage,
  getNextGuidebookPage,
  getVictoryFragments,
  listGuidebookPages,
  settleRunFragments
} = await import("../../../src/systems/guidebook.js");
const {
  createDefaultGuidebookState,
  isNormalizedGuidebookState,
  isNormalizedRunGuideResult,
  normalizeGuidebookState,
  normalizeRunGuideResult
} = await import("../../../src/state/guidebook_state.js");
const { settleTownFeats } = await import("../../../src/systems/feats.js");
const { createDefaultFeatsState } = await import("../../../src/state/feats_state.js");
const { FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { getPerceptionIntent } = await import("../../../src/systems/elite_perception.js");
const { ELITE_GREED_ACTION_WEIGHTS, ELITE_MIN_FLOOR } = await import("../../../src/systems/roaming_elites.js");
const { SPECIAL_ROOM_MIN_DETOUR } = await import("../../../src/map_special_rooms.js");
const { EQUIPMENT_LOAD_INITIATIVE_MODIFIERS } = await import("../../../src/rules/equipment_load.js");
const { BANKING_RATES } = await import("../../../src/rules/material_rules.js");
const { floorHasCampEvent } = await import("../../../src/run_map_generator.js");
const { purchaseMilestoneUncurse } = await import("../../../src/systems/milestone_merchant.js");
const { applyCombatRewards } = await import("../../../src/combat_logic/rewards.js");
const { state, createDefaultCurrentRun, createStartingKitCharacter, initNewGame } =
  await import("../../../src/state.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { getFeatResultRows } = await import("../../../src/ui/result_screen.js");

// --- The pages -----------------------------------------------------------------

assert.deepEqual(GUIDEBOOK_PAGES.map(page => page.cost), [2, 2, 3, 3, 3, 4, 4, 5]);
assert.equal(new Set(GUIDEBOOK_PAGES.map(page => page.id)).size, GUIDEBOOK_PAGES.length);
GUIDEBOOK_PAGES.forEach(page => {
  assert.ok(page.title, `${page.id} has a title`);
  assert.ok(page.lines.length > 0 && page.lines.every(line => typeof line === "string" && line.length > 0));
  assert.equal(page.lines.some(line => /%の確率|確率は/.test(line)), false, `${page.id} states no exact probability`);
});
const pageText = id => GUIDEBOOK_PAGES.find(page => page.id === id).lines.join("");
console.log("[PASS] the guidebook has eight pages with ordered costs");

// --- Every page states a rule that is really in force --------------------------

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const open = () => ({ walls: [false, false, false, false] });
const corridor = [Array.from({ length: 12 }, open)];
const player = (x, dir = 1) => ({ x, y: 0, dir, dx: DX, dy: DY });
const noise = { floor: 3, x: 5, y: 0, ttl: 2 };

// "音で狩るもの": deaf to distance, drawn to noise.
const soundFar = getPerceptionIntent({
  monster: { x: 10, y: 0, floor: 3, perception: "sound" }, player: player(0), noise, playerMoved: true, grid: corridor
});
assert.equal(soundFar.target, noise, "a sound hunter goes to the noise");
assert.equal(getPerceptionIntent({
  monster: { x: 10, y: 0, floor: 3, perception: "sound" }, player: player(0), noise: null, playerMoved: true, grid: corridor
}).detected, false, "and notices nothing from a distance without one");
assert.equal(getPerceptionIntent({
  monster: { x: 1, y: 0, floor: 3, perception: "sound" }, player: player(0), noise: null, playerMoved: true, grid: corridor
}).detected, true, "but notices an adventurer right next to it");

// "震えで狩るもの": far-sighted, but only while the adventurer moves.
const vibrationMonster = { x: 5, y: 0, floor: 3, perception: "vibration" };
assert.equal(getPerceptionIntent({ monster: vibrationMonster, player: player(0), noise: null, playerMoved: true, grid: corridor }).detected, true);
assert.equal(getPerceptionIntent({ monster: vibrationMonster, player: player(0), noise: null, playerMoved: false, grid: corridor }).detected, false,
  "standing still hides the adventurer");

// "見られると動けないもの": frozen while watched, double speed when not.
const afterimageMonster = { x: 4, y: 0, floor: 3, perception: "afterimage" };
const watched = getPerceptionIntent({ monster: afterimageMonster, player: player(0, 1), noise: null, playerMoved: true, grid: corridor });
assert.equal(watched.speed, 0, "it cannot move while it is watched");
const unwatched = getPerceptionIntent({ monster: afterimageMonster, player: player(0, 3), noise: null, playerMoved: true, grid: corridor });
const ordinary = getPerceptionIntent({
  monster: { x: 4, y: 0, floor: 3, perception: "standard" }, player: player(0), noise: null, playerMoved: true, grid: corridor
});
assert.equal(unwatched.speed, ordinary.speed * 2, "and closes at double speed when the adventurer looks away");

// "強敵の現れ方": from this floor on, and the chest draws it most.
assert.ok(pageText("elite_arrival").includes(`B${ELITE_MIN_FLOOR}F`));
const otherWeights = Object.entries(ELITE_GREED_ACTION_WEIGHTS).filter(([action]) => action !== "chest");
assert.ok(otherWeights.every(([, weight]) => weight < ELITE_GREED_ACTION_WEIGHTS.chest), "opening a chest weighs the most");
["optional_area", "battle", "stairs_found", "new_room"].forEach(action => {
  assert.ok(ELITE_GREED_ACTION_WEIGHTS[action] > 0, `${action} is counted`);
});

// "特別な部屋の場所".
assert.ok(pageText("special_room_place").includes(`${SPECIAL_ROOM_MIN_DETOUR}歩以上`));

// "重さと先手": light and heavy move the turn order by the same amount.
assert.ok(EQUIPMENT_LOAD_INITIATIVE_MODIFIERS.light > 0);
assert.equal(EQUIPMENT_LOAD_INITIATIVE_MODIFIERS.light, -EQUIPMENT_LOAD_INITIATIVE_MODIFIERS.heavy);
assert.equal(EQUIPMENT_LOAD_INITIATIVE_MODIFIERS.standard, 0);

// "死んで残るもの".
assert.ok(pageText("what_remains").includes(`${Math.round(BANKING_RATES.death * 100)}%`));

// "守護者の先": a camp on the floor after a guardian, and a merchant who lifts curses.
assert.equal(floorHasCampEvent(6), true);
assert.equal(floorHasCampEvent(11), true);
assert.equal(floorHasCampEvent(5), false);
assert.equal(typeof purchaseMilestoneUncurse, "function");
console.log("[PASS] each page matches the rule it describes");

// --- Fragments -----------------------------------------------------------------

assert.equal(getVictoryFragments({ elites: 2 }), 2 * GUIDE_FRAGMENTS_PER_ELITE);
assert.equal(getVictoryFragments({ guardians: 1 }), GUIDE_FRAGMENTS_PER_GUARDIAN);
assert.equal(getVictoryFragments({}), 0);
const carrier = {};
assert.equal(addRunFragments(carrier, 2), 2);
assert.equal(addRunFragments(carrier, 0), 0);
assert.equal(addRunFragments(carrier, 1), 1);
assert.equal(carrier.guideFragments, 3);

const makeCombatState = (flags, monsters) => {
  const char = createStartingKitCharacter("vanguard");
  return {
    floor: 3,
    party: [char],
    combatState: { isBoss: false, isMidboss: false, isRoamingFlack: false, isBrood: false, ...flags, monsters },
    currentRun: { ...createDefaultCurrentRun(), materials: {} },
    codex: { stats: {}, monsters: {} },
    firstKills: [],
    inventory: [],
    metaMaterials: {},
    floorChestsTotal: [0],
    roamingMonsters: [],
    feats: createDefaultFeatsState()
  };
};
const foe = extra => ({ name: "検証の敵", hp: 0, maxHp: 10, exp: 0, tags: [], fled: false, ...extra });
const fragmentsAfter = (flags, monsters) => {
  const combat = makeCombatState(flags, monsters);
  const logs = [];
  applyCombatRewards(combat, combat.combatState.monsters, logs, () => 1);
  return { fragments: combat.currentRun.guideFragments, logged: logs.some(entry => entry.msg?.startsWith("手引き書の断片を")) };
};
assert.deepEqual(fragmentsAfter({}, [foe(), foe()]), { fragments: 0, logged: false }, "ordinary enemies carry no fragment");
assert.deepEqual(fragmentsAfter({}, [foe({ isRare: true }), foe()]), { fragments: 1, logged: true }, "a rare enemy carries one");
assert.deepEqual(fragmentsAfter({ isRoamingFlack: true }, [foe(), foe()]), { fragments: 1, logged: true },
  "a strong-enemy fight yields one, however many fell");
assert.deepEqual(fragmentsAfter({ isMidboss: true }, [foe()]), { fragments: 1, logged: true });
assert.deepEqual(fragmentsAfter({ isBrood: true }, [foe()]), { fragments: 1, logged: true });
assert.deepEqual(fragmentsAfter({ isBoss: true }, [foe(), foe()]), { fragments: 2, logged: true }, "a guardian fight yields two");
assert.deepEqual(fragmentsAfter({ isRoamingFlack: true }, [foe({ fled: true })]), { fragments: 0, logged: false },
  "an enemy that fled leaves nothing");
console.log("[PASS] strong enemies and guardians yield fragments");

const home = createDefaultGuidebookState();
assert.deepEqual(settleRunFragments(home, { guideFragments: 3 }, "retreat"),
  { guidebook: { fragments: 3, decoded: 0 }, result: { carried: 3, kept: true } });
assert.deepEqual(settleRunFragments(home, { guideFragments: 3 }, "death"),
  { guidebook: { fragments: 0, decoded: 0 }, result: { carried: 3, kept: false } });
assert.deepEqual(settleRunFragments(home, { guideFragments: 3 }, "abandon").result, { carried: 3, kept: false });
assert.deepEqual(settleRunFragments(home, { guideFragments: 0 }, "retreat"), { guidebook: home, result: null });
assert.deepEqual(home, { fragments: 0, decoded: 0 }, "settlement does not mutate its input");
console.log("[PASS] fragments come home only with a safe return");

// --- Decoding ------------------------------------------------------------------

assert.equal(getNextGuidebookPage(home).id, GUIDEBOOK_PAGES[0].id);
assert.deepEqual(decodeNextGuidebookPage({ fragments: 1, decoded: 0 }), { ok: false, reason: "断片が足りない" });
const first = decodeNextGuidebookPage({ fragments: 5, decoded: 0 });
assert.equal(first.ok, true);
assert.equal(first.page.id, GUIDEBOOK_PAGES[0].id);
assert.deepEqual(first.guidebook, { fragments: 3, decoded: 1 });
const second = decodeNextGuidebookPage(first.guidebook);
assert.deepEqual(second.guidebook, { fragments: 1, decoded: 2 }, "pages are decoded in order");
assert.equal(decodeNextGuidebookPage(second.guidebook).ok, false);
assert.deepEqual(listGuidebookPages(second.guidebook).map(entry => entry.decoded),
  [true, true, false, false, false, false, false, false]);
assert.deepEqual(decodeNextGuidebookPage({ fragments: 99, decoded: GUIDEBOOK_PAGES.length }),
  { ok: false, reason: "すべての頁を解読した" });
assert.equal(getNextGuidebookPage({ fragments: 0, decoded: GUIDEBOOK_PAGES.length }), null);
console.log("[PASS] pages are decoded in order and only with enough fragments");

// The reading feat settles in the town, once.
const readingFeat = FEAT_BY_ID.get("guide_pages_3");
assert.ok(readingFeat);
const twoPages = settleTownFeats(createDefaultFeatsState(), counters => { counters.guidePagesDecoded = 2; }, 9);
assert.deepEqual(twoPages.completed, []);
const threePages = settleTownFeats(twoPages.feats, counters => { counters.guidePagesDecoded = 3; }, 9);
assert.deepEqual(threePages.completed.map(feat => feat.id), ["guide_pages_3"]);
assert.deepEqual(threePages.rewards, readingFeat.reward.materials);
assert.deepEqual(threePages.feats.completed.guide_pages_3, { runNumber: 9 });
assert.deepEqual(settleTownFeats(threePages.feats, counters => { counters.guidePagesDecoded = 4; }, 9).completed, []);
console.log("[PASS] the reading feat is achieved in the town, once");

// --- End of run and save round trip ----------------------------------------------

const endRun = reason => {
  initNewGame();
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.deepestFloor = 3;
  state.currentRun.guideFragments = 4;
  state.guidebook = { fragments: 1, decoded: 0 };
  state.floor = 3;
  state.gameState = "explore";
  triggerRunResult(reason);
  return { guidebook: state.guidebook, result: state.currentRun.guideResult };
};
assert.deepEqual(endRun("milestone_portal"), { guidebook: { fragments: 5, decoded: 0 }, result: { carried: 4, kept: true } });
assert.deepEqual(endRun("escape_scroll").guidebook, { fragments: 5, decoded: 0 }, "the Wing is a safe return too");
assert.deepEqual(endRun("gameover"), { guidebook: { fragments: 1, decoded: 0 }, result: { carried: 4, kept: false } });
assert.deepEqual(endRun("abandon").guidebook, { fragments: 1, decoded: 0 });

assert.deepEqual(getFeatResultRows(null, { guideResult: { carried: 4, kept: true } }), [{
  id: "guide_fragments", status: "持ち帰り", completed: true, failed: false,
  name: "手引き書の断片 4枚", detail: "街で頁の解読に使える"
}]);
assert.equal(getFeatResultRows(null, { guideResult: { carried: 4, kept: false } })[0].status, "喪失");
assert.deepEqual(getFeatResultRows(null, { guideResult: null }), []);

state.guidebook = { fragments: 6, decoded: 2 };
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.guidebook, { fragments: 6, decoded: 2 });
assert.deepEqual(reloaded.currentRun.guideResult, { carried: 4, kept: false });
assert.equal(isNormalizedCurrentRun(reloaded.currentRun), true);
const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.guidebook;
delete legacy.currentRun.guideFragments;
delete legacy.currentRun.guideResult;
const migrated = normalizeSavePayload(legacy);
assert.deepEqual(migrated.guidebook, { fragments: 0, decoded: 0 }, "a save from before the guidebook has nothing");
assert.equal(migrated.currentRun.guideFragments, 0);
assert.equal(migrated.currentRun.guideResult, null);
assert.equal(isNormalizedGuidebookState({ fragments: -1, decoded: 0 }), false);
assert.deepEqual(normalizeGuidebookState({ fragments: "7", decoded: 2.9 }), { fragments: 7, decoded: 2 });
assert.equal(isNormalizedRunGuideResult({ carried: 0, kept: true }), false);
assert.equal(normalizeRunGuideResult({ carried: 0, kept: true }), null);
console.log("[PASS] fragments settle at the end of the run and survive a save round trip");
