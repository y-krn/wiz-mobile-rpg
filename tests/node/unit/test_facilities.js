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

const { FACILITIES, FACILITY_BY_ID, FACILITY_NODE_BY_ID } = await import("../../../src/data/facilities.js");
const { FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { MATERIAL_TYPES } = await import("../../../src/data/materials.js");
const { ITEMS } = await import("../../../src/data/items.js");
const {
  getFacilityNodeBlockReason,
  getUnlockedStartingKitIds,
  isFacilityOpen,
  listFacilities,
  listFacilityNodes,
  purchaseFacilityNode
} = await import("../../../src/systems/facilities.js");
const { applyFacilityRoom, getFacilityRoomKind, hasWaitingKeeper, isForemanFloor } =
  await import("../../../src/systems/facility_rooms.js");
const { SPECIAL_ROOMS, SPECIAL_ROOM_EVENT, getSpecialRoomInfo } = await import("../../../src/rules/special_rooms.js");
const {
  addRunToFeatCounters,
  formatFeatProgress,
  formatFeatReward,
  getFeatProgress,
  getNearestFeats,
  settleRunFeats
} = await import("../../../src/systems/feats.js");
const { createDefaultFeatsState } = await import("../../../src/state/feats_state.js");
const {
  createDefaultFacilitiesState,
  isNormalizedCompanion,
  isNormalizedFacilitiesState,
  normalizeCompanion,
  normalizeFacilitiesState
} = await import("../../../src/state/facilities_state.js");
const {
  getAvailableStartingKits,
  getCraftSelectionBlockReason,
  getDepartureBagItems,
  isStartingKitAvailable,
  resolveLastPreparation
} = await import("../../../src/systems/departure_preparation.js");
const { isBaseStartingKitId, isStartingKitId, STARTING_KIT_IDS } = await import("../../../src/state/starting_kit.js");
const {
  STARTING_KITS,
  state,
  createDefaultCurrentRun,
  createStartingKitCharacter,
  getStartingKit,
  getStartingKitItems,
  initNewGame
} = await import("../../../src/state.js");
const { CRAFT_RECIPES } = await import("../../../src/craft.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { ensureRunFloor } = await import("../../../src/state/run_floor_state.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { repeatLastDeparture } = await import("../../../src/menu/solo_start.js");
const { getFeatResultRows } = await import("../../../src/ui/result_screen.js");

// --- The catalog --------------------------------------------------------------

FACILITIES.forEach(facility => {
  assert.ok(FEAT_BY_ID.has(facility.featId), `${facility.id} opens through an existing feat`);
  assert.ok(facility.name && facility.keeper && facility.lockedHint);
  facility.nodes.forEach(node => {
    assert.equal(FACILITY_NODE_BY_ID.get(node.id), node);
    Object.entries(node.cost).forEach(([name, quantity]) => {
      assert.ok(MATERIAL_TYPES.includes(name), `${node.id} costs an existing material`);
      assert.ok(Number.isInteger(quantity) && quantity > 0);
    });
    if (node.requiresFeat) assert.ok(FEAT_BY_ID.has(node.requiresFeat));
    if (node.requiresNode) assert.ok(FACILITY_NODE_BY_ID.has(node.requiresNode));
    if (node.grants.startingKit) assert.ok(getStartingKit(node.grants.startingKit));
  });
});
const rescueFeat = FEAT_BY_ID.get("foreman_rescue");
assert.equal(formatFeatReward(rescueFeat), "坑夫組合が開く", "the rescue feat pays a facility, not materials");
console.log("[PASS] every facility opens through a feat and its nodes cost existing materials");

// --- Rescue: only a safe return counts ------------------------------------------

const fresh = createDefaultFeatsState();
const escort = { startFloor: 1, deepestFloor: 3, companion: "foreman" };
assert.equal(addRunToFeatCounters(fresh.counters, escort, "retreat").foremanRescued, 1);
assert.equal(addRunToFeatCounters(fresh.counters, escort, "death").foremanRescued, 0, "death leaves him in the dungeon");
assert.equal(addRunToFeatCounters(fresh.counters, escort, "abandon").foremanRescued, 0, "so does abandoning the run");
assert.equal(addRunToFeatCounters(fresh.counters, { ...escort, companion: null }, "retreat").foremanRescued, 0);
assert.equal(addRunToFeatCounters(fresh.counters, escort).foremanRescued, 0, "a run still going has rescued nobody yet");

const progress = getFeatProgress(rescueFeat, fresh.counters);
assert.equal(formatFeatProgress(rescueFeat, progress), "未救出");
assert.equal(formatFeatProgress(rescueFeat, progress, escort), "同行中");
assert.equal(formatFeatProgress(rescueFeat, progress, { ...escort, returnReason: "gameover" }), "未救出");
assert.equal(formatFeatProgress(rescueFeat, { current: 1, target: 1 }), "救出");
assert.equal(getNearestFeats(fresh, null, 3).some(entry => entry.feat.id === "foreman_rescue"), true,
  "the rescue is among the first goals a new save is shown");

const rescued = settleRunFeats(fresh, escort, "retreat", 4);
assert.equal(rescued.result.completed.includes("foreman_rescue"), true);
assert.equal(isFacilityOpen(rescued.feats, "miner_guild"), true);
assert.equal(isFacilityOpen(fresh, "miner_guild"), false);
assert.equal(isFacilityOpen(settleRunFeats(fresh, escort, "death", 4).feats, "miner_guild"), false);
assert.deepEqual(listFacilities(fresh).map(entry => [entry.facility.id, entry.open]), [["miner_guild", false]]);

assert.deepEqual(getFeatResultRows(null, { companion: "foreman", outcome: "death" }), [{
  id: "foreman_rescue", status: "失敗", completed: false, failed: true, name: "鉱夫頭を連れ帰る", detail: "鉱夫頭は迷宮に残された"
}]);
assert.equal(getFeatResultRows(rescued.result, { companion: "foreman", outcome: "retreat" })
  .some(row => row.failed), false);
assert.deepEqual(
  getFeatResultRows(rescued.result, { companion: "foreman", outcome: "retreat" })
    .find(row => row.id === "foreman_rescue"),
  { id: "foreman_rescue", status: "達成", completed: true, name: "鉱夫頭を連れ帰る", detail: "報酬 坑夫組合が開く" }
);
console.log("[PASS] the foreman is rescued by a safe return and left behind by death or abandon");

// --- The room ------------------------------------------------------------------

assert.deepEqual([1, 2, 3, 4, 5, 8, 33, 63].map(isForemanFloor), [false, false, true, false, false, false, true, true],
  "the third floor of the collapsed mine band, in every cycle");
assert.equal(getFacilityRoomKind(3, { feats: fresh, run: {} }), SPECIAL_ROOMS.TRAPPED_FOREMAN);
assert.equal(getFacilityRoomKind(3, { feats: rescued.feats, run: {} }), null, "the room is gone once he is home");
assert.equal(getFacilityRoomKind(33, { feats: fresh, run: { companion: "foreman" } }), null,
  "a run already leading him out does not meet him again");
assert.equal(getFacilityRoomKind(2, { feats: fresh, run: {} }), null);
assert.ok(getSpecialRoomInfo(SPECIAL_ROOMS.TRAPPED_FOREMAN).name);

const makeGrid = (kind, used = false) => [[
  { type: "empty", walls: [true, true, true, false] },
  { type: "empty", walls: [true, true, false, true], event: SPECIAL_ROOM_EVENT, specialRoom: { kind, used, discovered: false } }
]];
const veinGrid = makeGrid(SPECIAL_ROOMS.MINE_VEIN);
assert.equal(applyFacilityRoom(veinGrid, 3, { feats: fresh, run: {} }), true);
assert.equal(veinGrid[0][1].specialRoom.kind, SPECIAL_ROOMS.TRAPPED_FOREMAN);
assert.equal(hasWaitingKeeper(veinGrid), true);
veinGrid[0][1].specialRoom.used = true;
assert.equal(hasWaitingKeeper(veinGrid), false);
const untouched = makeGrid(SPECIAL_ROOMS.MINE_VEIN);
assert.equal(applyFacilityRoom(untouched, 2, { feats: fresh, run: {} }), false);
assert.equal(applyFacilityRoom(untouched, 3, { feats: rescued.feats, run: {} }), false);
assert.equal(untouched[0][1].specialRoom.kind, SPECIAL_ROOMS.MINE_VEIN);

// The real floor: B3F holds the foreman while he is unrescued, the vein after.
const roomKindOnFloor = (floor, feats, companion = null) => {
  initNewGame();
  state.feats = feats;
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "facility-room-test";
  state.currentRun.companion = companion;
  state.maps = [];
  state.visitedMaps = [];
  state.floor = floor;
  state._freshRunFloor = floor;
  const grid = ensureRunFloor(state, floor);
  return grid.flat().find(cell => cell.specialRoom)?.specialRoom.kind || null;
};
assert.equal(roomKindOnFloor(3, createDefaultFeatsState()), SPECIAL_ROOMS.TRAPPED_FOREMAN);
assert.equal(roomKindOnFloor(3, rescued.feats), SPECIAL_ROOMS.MINE_VEIN);
assert.equal(roomKindOnFloor(2, createDefaultFeatsState()), SPECIAL_ROOMS.MINE_VEIN);
console.log("[PASS] the foreman takes the mine vein's place on B3F only while unrescued");

// --- Buying nodes ---------------------------------------------------------------

const closedContext = { feats: fresh, facilities: createDefaultFacilitiesState(), metaMaterials: { "獣の牙": 9, "鉄片": 9 } };
assert.equal(getFacilityNodeBlockReason("miner_kit", closedContext), "坑夫組合がまだ開いていない");
assert.equal(purchaseFacilityNode("miner_kit", closedContext).ok, false);
const openContext = { ...closedContext, feats: rescued.feats };
assert.equal(getFacilityNodeBlockReason("miner_kit", { ...openContext, metaMaterials: { "獣の牙": 5, "鉄片": 9 } }), "素材不足");
assert.equal(getFacilityNodeBlockReason("missing", openContext), "存在しない解放項目");
const bought = purchaseFacilityNode("miner_kit", openContext);
assert.equal(bought.ok, true);
assert.equal(bought.metaMaterials["獣の牙"], 3);
assert.equal(bought.metaMaterials["鉄片"], 5);
assert.deepEqual(bought.facilities, { nodes: ["miner_kit"] });
assert.deepEqual(closedContext.facilities, { nodes: [] }, "a purchase does not mutate its inputs");
assert.equal(purchaseFacilityNode("miner_kit", { ...openContext, facilities: bought.facilities }).reason, "解放済み");
assert.deepEqual(listFacilityNodes("miner_guild", { ...openContext, facilities: bought.facilities })
  .map(entry => [entry.node.id, entry.bought, entry.canBuy]), [["miner_kit", true, false]]);
assert.deepEqual(getUnlockedStartingKitIds(bought.facilities), ["miner"]);
assert.deepEqual(getUnlockedStartingKitIds(createDefaultFacilitiesState()), []);
assert.ok(FACILITY_BY_ID.get("miner_guild"));
console.log("[PASS] a node needs its facility open and its materials, and is bought once");

// --- The miner kit ----------------------------------------------------------------

assert.deepEqual(STARTING_KITS.map(kit => kit.id), [...STARTING_KIT_IDS], "the base kits stay the same four");
assert.equal(isStartingKitId("miner"), true);
assert.equal(isBaseStartingKitId("miner"), false);
assert.deepEqual(getAvailableStartingKits(createDefaultFacilitiesState()).map(kit => kit.id), [...STARTING_KIT_IDS]);
assert.deepEqual(getAvailableStartingKits(bought.facilities).map(kit => kit.id), [...STARTING_KIT_IDS, "miner"]);
assert.equal(isStartingKitAvailable("miner", createDefaultFacilitiesState()), false);
assert.equal(isStartingKitAvailable("miner", bought.facilities), true);

const miner = createStartingKitCharacter("miner");
assert.equal(miner.startingKit, "miner");
assert.equal(miner.equipment.weapon, "MACE");
assert.equal(miner.equipment.armor, "LEATHER_ARMOR");
assert.equal(miner.equipment.shield, null, "the miner kit carries no shield");
assert.deepEqual(getStartingKitItems("miner"), ["TRAP_KIT", "TRAP_KIT", "TRAP_SENSE_STONE"]);
getStartingKitItems("miner").forEach(itemId => assert.ok(ITEMS[itemId], `${itemId} exists`));
assert.deepEqual(getStartingKitItems("vanguard"), []);
assert.deepEqual(getDepartureBagItems(["HEAL_POTION"], null, "miner"),
  ["TRAP_KIT", "TRAP_KIT", "TRAP_SENSE_STONE", "HEAL_POTION"]);

// Seventeen crafted tools fill the bag next to the kit's three supplies.
const heal = CRAFT_RECIPES.find(recipe => recipe.resultId === "HEAL_POTION");
const rich = { "硬い皮": 99, "獣の牙": 99 };
assert.equal(getCraftSelectionBlockReason(heal, Array(17).fill("HEAL_POTION"), { metaMaterials: rich, startingKitId: "miner" }),
  "バッグ上限（20枠）");
assert.equal(getCraftSelectionBlockReason(heal, Array(17).fill("HEAL_POTION"), { metaMaterials: rich, startingKitId: "vanguard" }), "");

const minerPreparation = { kitId: "miner", startingGear: null, recipeIds: [], startFloor: 1 };
assert.equal(resolveLastPreparation(minerPreparation, { facilities: createDefaultFacilitiesState() }), null,
  "a kit that is not opened is not offered again");
assert.equal(resolveLastPreparation(minerPreparation, { facilities: bought.facilities }).canRepeat, true);
console.log("[PASS] the miner kit joins the choices only once bought and carries its supplies");

// --- Departure, storage, and the end of a run ----------------------------------------

initNewGame();
state.gameState = "town";
state.feats = rescued.feats;
state.facilities = bought.facilities;
state.metaMaterials = { "硬い皮": 2, "獣の牙": 2 };
state.storage = [];
state.lastPreparation = { kitId: "miner", startingGear: null, recipeIds: ["TRAP_KIT"], startFloor: 1 };
const trapKitRecipe = CRAFT_RECIPES.find(recipe => recipe.resultId === "TRAP_KIT");
state.metaMaterials = { ...state.metaMaterials, ...Object.fromEntries(Object.entries(trapKitRecipe.mats || {}).map(([name, quantity]) => [name, quantity])) };
assert.equal(repeatLastDeparture(), true);
assert.equal(state.currentRun.startingKit, "miner");
const itemId = item => (typeof item === "string" ? item : item?.baseId);
assert.equal(state.inventory.filter(item => itemId(item) === "TRAP_KIT").length, 3, "two from the kit, one crafted");
assert.equal(state.inventory.filter(item => itemId(item) === "TRAP_SENSE_STONE").length, 1);
assert.deepEqual(state.currentRun.departureCraftItems, ["TRAP_KIT"], "only the crafted tool is departure craft");
assert.equal(state.currentRun.companion, null);
state.currentRun.deepestFloor = 2;
triggerRunResult("milestone_portal");
assert.equal(state.storage.filter(item => itemId(item) === "TRAP_KIT").length, 1,
  "the unused crafted tool returns to storage; the kit's supplies do not");
assert.equal(state.storage.some(item => itemId(item) === "TRAP_SENSE_STONE"), false);
console.log("[PASS] a miner kit run carries the supplies and returns only the crafted tool");

// The base-kit feat keeps counting the four base kits only.
assert.equal(Object.hasOwn(state.feats.counters.kitDepths, "miner"), false);

// --- Save round trip ---------------------------------------------------------------

initNewGame();
state.facilities = bought.facilities;
state.party = [createStartingKitCharacter("miner")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.companion = "foreman";
state.currentRun.startingKit = "miner";
state.gameState = "explore";
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.facilities, { nodes: ["miner_kit"] });
assert.equal(reloaded.currentRun.companion, "foreman", "the escort survives a reload mid-run");
assert.equal(reloaded.currentRun.startingKit, "miner");
assert.equal(reloaded.party[0].startingKit, "miner");
assert.equal(isNormalizedCurrentRun(reloaded.currentRun), true);
const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.facilities;
delete legacy.currentRun.companion;
const migrated = normalizeSavePayload(legacy);
assert.deepEqual(migrated.facilities, { nodes: [] }, "a save from before facilities has nothing bought");
assert.equal(migrated.currentRun.companion, null);
assert.equal(isNormalizedFacilitiesState({ nodes: ["a", "a"] }), false);
assert.deepEqual(normalizeFacilitiesState({ nodes: ["a", "a", 3, ""] }), { nodes: ["a"] });
assert.equal(isNormalizedCompanion("foreman"), true);
assert.equal(normalizeCompanion("stranger"), null);
console.log("[PASS] facility purchases and the escort survive a save round trip");
