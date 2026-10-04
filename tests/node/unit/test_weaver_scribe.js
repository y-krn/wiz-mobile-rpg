import assert from "node:assert/strict";

// The weaving house and the scriptorium (#2019): a keeper freed by a fight,
// a keeper freed by quiet work, the hammock's rest and mend, the scribe's
// floor plan and copy desk, and the two kits.

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

const { FACILITY_BY_ID } = await import("../../../src/data/facilities.js");
const { FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { ITEMS } = await import("../../../src/data/items.js");
const { BASIC_RUNE_ITEM_ID } = await import("../../../src/data/magic.js");
const { getFacilityNodeBlockReason, isFacilityOpen, purchaseFacilityNode } =
  await import("../../../src/systems/facilities.js");
const { applyFacilityRoom, freeKeeperAfterFight, getFacilityForFloor, getFacilityRoomKind } =
  await import("../../../src/systems/facility_rooms.js");
const {
  COPY_FRAGMENTS,
  COPY_TURNS,
  HAMMOCK_REST_HP_RATE,
  HAMMOCK_REST_TURNS,
  MENDING_BATTLES,
  MENDING_MATERIAL_COST,
  SPECIAL_ROOMS,
  SPECIAL_ROOM_EVENT,
  applyArmorMend,
  getArmorMendAmount,
  getArmorMendBonus,
  getHammockRestAmount,
  getSpecialRoomInfo,
  hasMirrorVisionFor,
  startArmorMendBattle
} = await import("../../../src/rules/special_rooms.js");
const { getCharDef, getCharEquipmentDef } = await import("../../../src/rules/character_stats.js");
const { getCharMaxMp } = await import("../../../src/data.js");
const { getFeatProgress, settleRunFeats } = await import("../../../src/systems/feats.js");
const { createDefaultFeatsState, normalizeFeatsState } = await import("../../../src/state/feats_state.js");
const { createDepartureCharacter, getAvailableStartingKits, getDepartureBagItems } =
  await import("../../../src/systems/departure_preparation.js");
const { isStartingKitId } = await import("../../../src/state/starting_kit.js");
const {
  state,
  createDefaultCurrentRun,
  createStartingKitCharacter,
  getStartingKit,
  initNewGame
} = await import("../../../src/state.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { ensureRunFloor } = await import("../../../src/state/run_floor_state.js");
const { applyCombatRewards } = await import("../../../src/combat_logic/rewards.js");

const weaving = FACILITY_BY_ID.get("weaving_house");
const scriptorium = FACILITY_BY_ID.get("scriptorium");

// --- Where the keepers wait ------------------------------------------------------------

assert.deepEqual([13, 18, 43, 48].map(floor => getFacilityForFloor(floor)?.id),
  ["weaving_house", "scriptorium", "weaving_house", "scriptorium"]);
assert.deepEqual([weaving.site.rescue.kind, scriptorium.site.rescue.kind], ["fight", "drain"]);
assert.equal(scriptorium.site.rescue.turns, 5);
const fresh = createDefaultFeatsState();
assert.equal(getFacilityRoomKind(13, { feats: fresh, run: {} }), SPECIAL_ROOMS.COCOONED_WEAVER);
assert.equal(getFacilityRoomKind(18, { feats: fresh, run: {} }), SPECIAL_ROOMS.STRANDED_SCRIBE);
assert.equal(getFacilityRoomKind(13, { feats: fresh, run: { companions: ["weaver"] } }), null);
const makeGrid = kind => [[
  { type: "empty", walls: [true, true, true, false] },
  { type: "empty", walls: [true, true, false, true], event: SPECIAL_ROOM_EVENT, specialRoom: { kind, used: false, discovered: false } }
]];
const nest = makeGrid(SPECIAL_ROOMS.BROOD_CHAMBER);
assert.equal(applyFacilityRoom(nest, 13, { feats: fresh, run: {} }), true);
assert.equal(nest[0][1].specialRoom.kind, SPECIAL_ROOMS.COCOONED_WEAVER);
const library = makeGrid(SPECIAL_ROOMS.READING_ROOM);
assert.equal(applyFacilityRoom(library, 18, { feats: fresh, run: {} }), true);
assert.equal(library[0][1].specialRoom.kind, SPECIAL_ROOMS.STRANDED_SCRIBE);

const roomKindOnFloor = (floor, feats, facilities = null) => {
  initNewGame();
  state.feats = feats;
  if (facilities) state.facilities = facilities;
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "weaver-scribe-room-test";
  state.maps = [];
  state.visitedMaps = [];
  state.floor = floor;
  state._freshRunFloor = floor;
  return ensureRunFloor(state, floor).flat().find(cell => cell.specialRoom)?.specialRoom.kind || null;
};
assert.equal(roomKindOnFloor(13, createDefaultFeatsState()), SPECIAL_ROOMS.COCOONED_WEAVER);
assert.equal(roomKindOnFloor(12, createDefaultFeatsState()), SPECIAL_ROOMS.BROOD_CHAMBER);
assert.equal(roomKindOnFloor(18, createDefaultFeatsState()), SPECIAL_ROOMS.STRANDED_SCRIBE);
assert.equal(roomKindOnFloor(17, createDefaultFeatsState()), SPECIAL_ROOMS.READING_ROOM);
console.log("[PASS] the weaver and the scribe take their band's room on its third floor");

// --- Freed by a fight ---------------------------------------------------------------------

const cocoon = makeGrid(SPECIAL_ROOMS.COCOONED_WEAVER)[0][1];
const fightRun = { companions: ["foreman"] };
assert.equal(freeKeeperAfterFight(cocoon, fightRun), weaving);
assert.deepEqual(fightRun.companions, ["foreman", "weaver"]);
assert.equal(cocoon.specialRoom.used, true);
assert.equal(freeKeeperAfterFight(cocoon, fightRun), null, "a spent room frees nobody twice");
const plainBrood = makeGrid(SPECIAL_ROOMS.BROOD_CHAMBER)[0][1];
assert.equal(freeKeeperAfterFight(plainBrood, { companions: [] }), null);
assert.equal(plainBrood.specialRoom.used, false);
const priestRoom = makeGrid(SPECIAL_ROOMS.SEALED_PRIEST)[0][1];
assert.equal(freeKeeperAfterFight(priestRoom, { companions: [] }), null, "only a fight-kind keeper is freed by a fight");

// The victory over the brood keeper frees her through the production rewards path.
const winBroodFight = cell => {
  initNewGame();
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.floor = 13;
  state.maps = [];
  state.maps[12] = [[cell]];
  state.x = 0;
  state.y = 0;
  const monster = { name: "巣の主", hp: 0, maxHp: 30, exp: 5, isBroodKeeper: true };
  state.combatState = { monsters: [monster], isBrood: true, isBoss: false, isMidboss: false, isRoamingFlack: false };
  const logQueue = [];
  applyCombatRewards(state, [monster], logQueue, () => 0.99);
  return logQueue.map(entry => entry.msg);
};
const victoryCell = makeGrid(SPECIAL_ROOMS.COCOONED_WEAVER)[0][1];
const victoryLog = winBroodFight(victoryCell);
assert.deepEqual(state.currentRun.companions, ["weaver"]);
assert.equal(victoryCell.specialRoom.used, true);
assert.ok(victoryLog.some(line => line.includes("織り手が這い出してきた")));
assert.ok(victoryLog.some(line => line === "織り手が同行する。帰還の門か帰還の翼で生還すれば、街に織り場が開く。"));
assert.ok(victoryLog.includes("卵室の荷を検める。"), "the brood keeper's hoard is still paid");
const ordinaryCell = makeGrid(SPECIAL_ROOMS.BROOD_CHAMBER)[0][1];
ordinaryCell.specialRoom.used = true;
const ordinaryLog = winBroodFight(ordinaryCell);
assert.deepEqual(state.currentRun.companions, []);
assert.ok(ordinaryLog.includes("巣の主を倒した！卵室の奥に、獲物の遺した荷が積まれている。"));

const bothHome = settleRunFeats(fresh, { startFloor: 1, deepestFloor: 18, companions: ["weaver", "scribe"] }, "retreat", 9);
assert.equal(isFacilityOpen(bothHome.feats, "weaving_house"), true);
assert.equal(isFacilityOpen(bothHome.feats, "scriptorium"), true);
assert.equal(isFacilityOpen(settleRunFeats(fresh, { startFloor: 1, deepestFloor: 18, companions: ["weaver"] }, "death", 9).feats,
  "weaving_house"), false);
console.log("[PASS] the weaver is freed by winning the brood fight, and both are rescued by a safe return");

// --- New guardian feats ------------------------------------------------------------------

assert.deepEqual(
  ["guardian_15", "guardian_20"].map(id => [FEAT_BY_ID.get(id).chain, FEAT_BY_ID.get(id).metric.target]),
  [["guardian", 15], ["guardian", 20]]
);
assert.equal(getFeatProgress(FEAT_BY_ID.get("guardian_15"), { guardianDepth: 15 }).done, true);
assert.equal(getFeatProgress(FEAT_BY_ID.get("guardian_20"), { guardianDepth: 15 }).done, false);

// --- The hammock: rest or mend ----------------------------------------------------------

const withFeats = (feats, ids) => normalizeFeatsState({
  ...feats,
  completed: { ...feats.completed, ...Object.fromEntries(ids.map(id => [id, { runNumber: 9 }])) }
});
// Only the two rescues: the depth and guardian feats are still ahead.
const open = withFeats(createDefaultFeatsState(), ["weaver_rescue", "scribe_rescue"]);
const rich = { "毒腺": 30, "呪布": 30, "硬い皮": 30, "鉄片": 30, "魔石片": 30, "霊粉": 30, "骨片": 30, "黒角": 30 };
const context = (feats, facilities) => ({ feats, facilities, metaMaterials: rich });
assert.match(getFacilityNodeBlockReason("weaver_hammock", context(open, null)), /^条件：偉業「大裂溝を渡る」/);
const depth15 = withFeats(open, ["depth_15"]);
const hammock = purchaseFacilityNode("weaver_hammock", context(depth15, null));
assert.equal(hammock.ok, true);
assert.match(getFacilityNodeBlockReason("weaver_mending", context(depth15, hammock.facilities)), /^条件：偉業「大裂溝の主を倒す」/);
const guardian15 = withFeats(depth15, ["guardian_15"]);
assert.equal(getFacilityNodeBlockReason("weaver_mending", context(guardian15, null)), "条件：「吊り寝床」の解放");
assert.equal(purchaseFacilityNode("weaver_mending", context(guardian15, hammock.facilities)).ok, true);
assert.equal(getFacilityRoomKind(13, { feats: depth15, run: {}, facilities: null }), null);
assert.equal(getFacilityRoomKind(13, { feats: depth15, run: {}, facilities: hammock.facilities }), SPECIAL_ROOMS.WEAVER_HAMMOCK);
assert.equal(roomKindOnFloor(13, depth15, hammock.facilities), SPECIAL_ROOMS.WEAVER_HAMMOCK);
assert.ok(getSpecialRoomInfo(SPECIAL_ROOMS.WEAVER_HAMMOCK).name);

assert.deepEqual([HAMMOCK_REST_TURNS, HAMMOCK_REST_HP_RATE], [4, 0.3]);
assert.equal(getHammockRestAmount({ hp: 10 }, 45), 14, "30% of max HP, rounded up");
assert.equal(getHammockRestAmount({ hp: 40 }, 45), 5, "never above max HP");
assert.equal(getHammockRestAmount({ hp: 45 }, 45), 0);

assert.deepEqual([MENDING_MATERIAL_COST, MENDING_BATTLES], [2, 3]);
assert.deepEqual([0, 2, 6, 10, 22].map(getArmorMendAmount), [1, 1, 2, 3, 6], "a quarter of equipment DEF, at least 1");
const mended = createStartingKitCharacter("vanguard");
const baseDef = getCharDef(mended);
assert.equal(getCharEquipmentDef(mended), baseDef);
const mend = applyArmorMend(mended, getCharEquipmentDef(mended));
assert.deepEqual(mend, { bonus: getArmorMendAmount(baseDef), battles: 3 });
assert.equal(getCharDef(mended), baseDef + mend.bonus);
assert.equal(getCharEquipmentDef(mended), baseDef, "the mend is not equipment DEF, so it cannot compound");
assert.deepEqual([1, 2, 3].map(() => startArmorMendBattle(mended)), ["active", "active", "active"]);
assert.equal(getCharDef(mended), baseDef + mend.bonus, "it still holds during the third battle");
assert.equal(startArmorMendBattle(mended), "worn");
assert.equal(mended.armorMend, undefined);
assert.equal(getCharDef(mended), baseDef);
assert.equal(getArmorMendBonus(mended), 0);
assert.equal(startArmorMendBattle(mended), null);
console.log("[PASS] the hammock restores 30% of max HP and a mend adds DEF for three battles");

// --- The scribe's reading room -----------------------------------------------------------

assert.match(getFacilityNodeBlockReason("scribe_waymark", context(open, null)), /^条件：偉業「沈んだ書庫を読む」/);
const depth20 = withFeats(open, ["depth_20"]);
const waymark = purchaseFacilityNode("scribe_waymark", context(depth20, null));
assert.equal(waymark.ok, true);
assert.match(getFacilityNodeBlockReason("scribe_copy_desk", context(depth20, waymark.facilities)), /^条件：偉業「書庫の主を倒す」/);
assert.equal(purchaseFacilityNode("scribe_copy_desk", context(withFeats(depth20, ["guardian_20"]), waymark.facilities)).ok, true);
assert.equal(getFacilityRoomKind(18, { feats: depth20, run: {}, facilities: waymark.facilities }), SPECIAL_ROOMS.SCRIBE_READING_ROOM);
assert.equal(roomKindOnFloor(18, depth20, waymark.facilities), SPECIAL_ROOMS.SCRIBE_READING_ROOM);
assert.deepEqual([COPY_TURNS, COPY_FRAGMENTS], [3, 1]);

// A used reading room that showed the next floor grants the vision; a plain one does not.
const visionRoom = { kind: SPECIAL_ROOMS.SCRIBE_READING_ROOM, used: true, discovered: true, vision: true };
const visionGrid = [[{ type: "empty", walls: [true, true, true, true], event: SPECIAL_ROOM_EVENT, specialRoom: visionRoom }]];
assert.equal(hasMirrorVisionFor(visionGrid), true);
visionRoom.vision = false;
assert.equal(hasMirrorVisionFor(visionGrid), false, "copying a manuscript shows nothing of the next floor");
visionRoom.vision = true;
visionRoom.used = false;
assert.equal(hasMirrorVisionFor(visionGrid), false);
const mirrorGrid = [[{ type: "empty", walls: [true, true, true, true], event: SPECIAL_ROOM_EVENT, specialRoom: { kind: SPECIAL_ROOMS.MIRROR_HALL, used: true, discovered: true } }]];
assert.equal(hasMirrorVisionFor(mirrorGrid), true, "the mirror hall keeps working as before");
console.log("[PASS] the scribe's room needs its feats and its floor plan carries a vision of the next floor");

// --- The kits ------------------------------------------------------------------------------

const kitNodes = purchaseFacilityNode("scribe_kit", context(open,
  purchaseFacilityNode("weaver_kit", context(open, null)).facilities));
assert.deepEqual(["stalker", "scribe"].map(isStartingKitId), [true, true]);
assert.deepEqual(
  getAvailableStartingKits(kitNodes.facilities).map(kit => kit.id).filter(id => ["stalker", "scribe"].includes(id)),
  ["stalker", "scribe"]
);
const stalker = createStartingKitCharacter("stalker");
assert.deepEqual([stalker.equipment.weapon, stalker.equipment.shield, stalker.equipment.armor], ["DAGGER", null, "EXPLORER_CLOAK"]);
assert.deepEqual(getDepartureBagItems([], null, "stalker"), ["SILENCE_INCENSE", "SILENCE_INCENSE", "NOISE_BALL"]);
getStartingKit("stalker").items.forEach(itemId => assert.ok(ITEMS[itemId], `${itemId} exists`));

const scribe = createStartingKitCharacter("scribe");
assert.deepEqual([scribe.equipment.weapon, scribe.equipment.shield, scribe.equipment.armor], ["SAGE_STAFF", null, "ROBE"]);
assert.deepEqual(scribe.mediumState, { mediumKey: "SAGE_STAFF", socketedRunes: [BASIC_RUNE_ITEM_ID] },
  "the staff starts with the basic rune set, like the arcana kit's wand");
assert.deepEqual(createStartingKitCharacter("arcana").mediumState, { mediumKey: "WAND", socketedRunes: [BASIC_RUNE_ITEM_ID] });
assert.deepEqual(createStartingKitCharacter("vanguard").mediumState, { mediumKey: null, socketedRunes: [] });
assert.deepEqual(getDepartureBagItems([], null, "scribe"), ["MANA_POTION", "MANA_POTION"]);
const departing = createDepartureCharacter("scribe").character;
assert.equal(departing.mediumState.socketedRunes.length, 1, "the run starts with the rune still set");
assert.ok(getCharMaxMp(departing) > getCharMaxMp(createDepartureCharacter("vanguard").character), "a medium raises max MP");
assert.equal(departing.mp, getCharMaxMp(departing));
console.log("[PASS] the stalker and scribe kits carry their supplies, and the scribe starts with a rune");

// --- Save round trip -----------------------------------------------------------------------

initNewGame();
state.facilities = kitNodes.facilities;
state.party = [createStartingKitCharacter("scribe")];
state.party[0].armorMend = { bonus: 2, battles: 2 };
state.currentRun = createDefaultCurrentRun();
state.currentRun.startingKit = "scribe";
state.currentRun.companions = ["weaver", "scribe"];
state.gameState = "explore";
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.currentRun.companions, ["weaver", "scribe"]);
assert.equal(reloaded.currentRun.startingKit, "scribe");
assert.deepEqual(reloaded.party[0].armorMend, { bonus: 2, battles: 2 }, "an active mend survives a reload");
assert.equal(isNormalizedCurrentRun(reloaded.currentRun), true);
assert.deepEqual([reloaded.feats.counters.weaverRescued, reloaded.feats.counters.scribeRescued], [0, 0]);
console.log("[PASS] the escorts, the kit and an active mend survive a save round trip");
