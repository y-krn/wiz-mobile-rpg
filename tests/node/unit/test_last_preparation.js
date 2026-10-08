import assert from "node:assert/strict";

const element = () => ({
  style: {},
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

const { isNormalizedLastPreparation, normalizeLastPreparation } =
  await import("../../../src/state/last_preparation.js");
const {
  describeDroppedPreparation,
  resolveLastPreparation
} = await import("../../../src/systems/departure_preparation.js");
const { state, initNewGame } = await import("../../../src/state.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const {
  formatRepeatDepartureCost,
  getRepeatDeparturePlan,
  repeatLastDeparture
} = await import("../../../src/menu/solo_start.js");

// --- The stored shape --------------------------------------------------------

assert.equal(normalizeLastPreparation(undefined), null);
assert.equal(normalizeLastPreparation({}), null);
assert.equal(normalizeLastPreparation({ kitId: "unknown", recipeIds: [], startFloor: 1 }), null,
  "an unknown kit means there is no previous preparation");
assert.deepEqual(
  normalizeLastPreparation({
    kitId: "scout",
    startingGear: "",
    recipeIds: ["HEAL_POTION", 3, "", "TRAP_KIT"],
    startFloor: 7,
    extra: true
  }),
  { kitId: "scout", startingGear: null, recipeIds: ["HEAL_POTION", "TRAP_KIT"], startFloor: 1, roundTrip: false },
  "invalid tools are removed and an impossible floor falls back to B1F"
);
assert.equal(isNormalizedLastPreparation(null), true);
// A dungeon is remembered as the running number of its first floor (#2060).
const catacomb = normalizeLastPreparation({
  kitId: "arcana", startingGear: "SAGE_STAFF", recipeIds: ["HEAL_POTION"], startFloor: 6
});
assert.equal(catacomb.startFloor, 6);
assert.equal(isNormalizedLastPreparation(catacomb), true);
// A start on a guardian's floor, saved by the old start-floor choice, loads
// as the first dungeon.
assert.equal(normalizeLastPreparation({
  kitId: "arcana", startingGear: null, recipeIds: [], startFloor: 5
}).startFloor, 1);
assert.equal(isNormalizedLastPreparation({ kitId: "arcana", startingGear: null, recipeIds: [], startFloor: 5, roundTrip: false }), false);
assert.equal(isNormalizedLastPreparation({ kitId: "arcana", startingGear: null, recipeIds: [], startFloor: 3 }), false);
console.log("[PASS] last preparation normalizes to a known kit, tools, and start floor");

// --- Restoring what can still be chosen --------------------------------------

assert.equal(resolveLastPreparation(null, {}), null, "no previous preparation yields no plan");

const noWorkshop = { ranks: {}, lateralUnlocks: [] };
const potions = { kitId: "vanguard", startingGear: null, recipeIds: ["HEAL_POTION", "HEAL_POTION"], startFloor: 1 };

const affordable = resolveLastPreparation(potions, {
  workshop: noWorkshop,
  metaMaterials: { "硬い皮": 2, "獣の牙": 2 },
  storage: [],
  unlockedMilestones: []
});
assert.equal(affordable.canRepeat, true);
assert.deepEqual(affordable.recipeIds, ["HEAL_POTION", "HEAL_POTION"]);
assert.deepEqual(affordable.dropped, []);
assert.deepEqual(affordable.payment.typed, { "硬い皮": 2, "獣の牙": 2 });
assert.equal(affordable.storedCount, 0);
console.log("[PASS] an affordable previous preparation can be repeated as-is");

const withStock = resolveLastPreparation(potions, {
  workshop: noWorkshop,
  metaMaterials: { "硬い皮": 1, "獣の牙": 1 },
  storage: ["HEAL_POTION"],
  unlockedMilestones: []
});
assert.equal(withStock.canRepeat, true, "storage stock covers the first potion");
assert.equal(withStock.storedCount, 1);
assert.deepEqual(withStock.payment.typed, { "硬い皮": 1, "獣の牙": 1 },
  "the payment is what remains after storage stock is used");
console.log("[PASS] storage stock is used before materials");

const short = resolveLastPreparation(potions, {
  workshop: noWorkshop,
  metaMaterials: { "硬い皮": 1, "獣の牙": 1 },
  storage: [],
  unlockedMilestones: []
});
assert.equal(short.canRepeat, false, "a repeat never leaves with fewer tools than last time");
assert.deepEqual(short.recipeIds, ["HEAL_POTION"], "the tools that still fit are kept for the review screen");
assert.deepEqual(short.dropped, [{ kind: "item", itemId: "HEAL_POTION", reason: "素材不足" }]);
assert.deepEqual(describeDroppedPreparation(short.dropped), ["傷薬×1（素材不足）"]);
console.log("[PASS] tools that cannot be afforded are dropped and reported");

const deepStart = { kitId: "vanguard", startingGear: null, recipeIds: [], startFloor: 6 };
const lockedFloor = resolveLastPreparation(deepStart, {
  workshop: noWorkshop, metaMaterials: {}, storage: [], unlockedMilestones: []
});
assert.equal(lockedFloor.canRepeat, false);
assert.equal(lockedFloor.startFloor, 1, "the only remaining floor is pre-selected");
assert.deepEqual(describeDroppedPreparation(lockedFloor.dropped), ["行き先「忘れられた地下墓地」（今は入れない）"]);
const unlockedFloor = resolveLastPreparation(deepStart, {
  workshop: noWorkshop, metaMaterials: {}, storage: [], unlockedMilestones: [5]
});
assert.equal(unlockedFloor.canRepeat, true);
assert.equal(unlockedFloor.startFloor, 6);
// The third dungeon cannot be entered yet; with two dungeons open the choice
// is left to the player.
const lockedAmongSeveral = resolveLastPreparation(
  { kitId: "vanguard", startingGear: null, recipeIds: [], startFloor: 11 },
  { workshop: noWorkshop, metaMaterials: {}, storage: [], unlockedMilestones: [5, 10] }
);
assert.equal(lockedAmongSeveral.startFloor, null, "several dungeons keep the explicit choice");
assert.equal(lockedAmongSeveral.canRepeat, false);
console.log("[PASS] a dungeon that is not open is dropped and reported");

const saber = { kitId: "scout", startingGear: "FIGHTER_SABER", recipeIds: [], startFloor: 1 };
const gearLocked = resolveLastPreparation(saber, {
  workshop: noWorkshop, metaMaterials: {}, storage: [], unlockedMilestones: []
});
assert.equal(gearLocked.canRepeat, false);
assert.equal(gearLocked.startingGear, null);
assert.equal(gearLocked.dropped[0].kind, "gear");
assert.match(describeDroppedPreparation(gearLocked.dropped)[0], /^開始武器の差し替え「.+」（今は選べない）$/);
const gearUnlocked = resolveLastPreparation(saber, {
  workshop: { ranks: { gear_fighter_saber: 1 }, lateralUnlocks: [] },
  metaMaterials: {}, storage: [], unlockedMilestones: []
});
assert.equal(gearUnlocked.canRepeat, true);
assert.equal(gearUnlocked.startingGear, "FIGHTER_SABER");
console.log("[PASS] a Workshop weapon swap is kept only while it can be chosen");

// --- Repeat departure from the town ------------------------------------------

initNewGame();
state.gameState = "town";
state.metaMaterials = { "硬い皮": 3, "獣の牙": 3 };
state.storage = ["HEAL_POTION"];
state.lastPreparation = null;
assert.equal(getRepeatDeparturePlan(), null);
assert.equal(repeatLastDeparture(), false, "nothing to repeat before the first departure");

state.lastPreparation = normalizeLastPreparation(potions);
const plan = getRepeatDeparturePlan();
assert.equal(plan.canRepeat, true);
assert.equal(formatRepeatDepartureCost(plan), "道具2品（倉庫から1品・支払い：硬い皮1・獣の牙1）");
assert.equal(formatRepeatDepartureCost({ recipeIds: [], storedCount: 0 }), "持ち込む道具なし");

assert.equal(repeatLastDeparture(), true);
assert.equal(state.gameState, "explore");
assert.equal(state.currentRun.startingKit, "vanguard");
assert.equal(state.currentRun.startFloor, 1);
assert.deepEqual(state.storage, [], "the stored potion was taken first");
assert.equal(state.metaMaterials["硬い皮"], 2, "only the second potion was paid for");
assert.equal(state.metaMaterials["獣の牙"], 2);
assert.equal(state.inventory.filter(item => item === "HEAL_POTION" || item?.baseId === "HEAL_POTION").length, 2);
assert.deepEqual(state.lastPreparation, normalizeLastPreparation(potions), "the departure is remembered again");

// A replayed tap arrives after the run has started and must not pay twice.
assert.equal(repeatLastDeparture(), false);
assert.equal(state.metaMaterials["硬い皮"], 2);
console.log("[PASS] a repeat departure pays once, storage first, and starts the run");

state.gameState = "town";
state.currentRun = null;
state.party = [];
state.metaMaterials = { "硬い皮": 0, "獣の牙": 0 };
state.storage = [];
assert.equal(getRepeatDeparturePlan().canRepeat, false);
assert.equal(repeatLastDeparture(), false, "an unaffordable repeat is refused rather than reduced");
assert.equal(state.gameState, "town");
console.log("[PASS] a repeat that cannot be matched is refused");

// --- Save round trip ----------------------------------------------------------

state.lastPreparation = normalizeLastPreparation(potions);
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.lastPreparation, normalizeLastPreparation(potions));
const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.lastPreparation;
assert.equal(normalizeSavePayload(legacy).lastPreparation, null,
  "a save from before this field loads with no previous preparation");
console.log("[PASS] the last preparation survives a save round trip");
