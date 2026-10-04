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

const { FACILITIES, FACILITY_BY_ID, FACILITY_NODE_BY_ID, FACILITY_ORDER_BY_ID } =
  await import("../../../src/data/facilities.js");
const { FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { MATERIAL_TYPES } = await import("../../../src/data/materials.js");
const { ITEMS } = await import("../../../src/data/items.js");
const {
  getFacilityNodeBlockReason,
  getFacilityOrderBlockReason,
  getOpenFacilityOrder,
  getUnlockedStartingKitIds,
  placeFacilityOrder,
  settleFacilityOrders,
  isFacilityOpen,
  listFacilities,
  listFacilityNodes,
  purchaseFacilityNode
} = await import("../../../src/systems/facilities.js");
const { applyFacilityRoom, getFacilityRoomKind, hasWaitingKeeper, isForemanFloor } =
  await import("../../../src/systems/facility_rooms.js");
const {
  OUTPOST_SUPPLY_ITEM_IDS,
  SPECIAL_ROOMS,
  SPECIAL_ROOM_EVENT,
  clearFloorRubble,
  getSpecialRoomInfo
} = await import("../../../src/rules/special_rooms.js");
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
  isNormalizedCompanions,
  isNormalizedFacilitiesState,
  normalizeCompanions,
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
const { getDepartureCraftCost } = await import("../../../src/systems/workshop.js");
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
const escort = { startFloor: 1, deepestFloor: 3, companions: ["foreman"] };
assert.equal(addRunToFeatCounters(fresh.counters, escort, "retreat").foremanRescued, 1);
assert.equal(addRunToFeatCounters(fresh.counters, escort, "death").foremanRescued, 0, "death leaves him in the dungeon");
assert.equal(addRunToFeatCounters(fresh.counters, escort, "abandon").foremanRescued, 0, "so does abandoning the run");
assert.equal(addRunToFeatCounters(fresh.counters, { ...escort, companions: [] }, "retreat").foremanRescued, 0);
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
assert.deepEqual(listFacilities(fresh).map(entry => [entry.facility.id, entry.open]),
  FACILITIES.map(facility => [facility.id, false]));

assert.deepEqual(getFeatResultRows(null, { companions: ["foreman"], outcome: "death" }), [{
  id: "foreman_rescue", status: "失敗", completed: false, failed: true, name: "鉱夫頭を連れ帰る", detail: "鉱夫頭は迷宮に残された"
}]);
assert.equal(getFeatResultRows(rescued.result, { companions: ["foreman"], outcome: "retreat" })
  .some(row => row.failed), false);
assert.deepEqual(
  getFeatResultRows(rescued.result, { companions: ["foreman"], outcome: "retreat" })
    .find(row => row.id === "foreman_rescue"),
  { id: "foreman_rescue", status: "達成", completed: true, name: "鉱夫頭を連れ帰る", detail: "報酬 坑夫組合が開く" }
);
console.log("[PASS] the foreman is rescued by a safe return and left behind by death or abandon");

// --- The room ------------------------------------------------------------------

assert.deepEqual([1, 2, 3, 4, 5, 8, 33, 63].map(isForemanFloor), [false, false, true, false, false, false, true, true],
  "the third floor of the collapsed mine band, in every cycle");
assert.equal(getFacilityRoomKind(3, { feats: fresh, run: {} }), SPECIAL_ROOMS.TRAPPED_FOREMAN);
assert.equal(getFacilityRoomKind(3, { feats: rescued.feats, run: {} }), null, "the room is gone once he is home");
assert.equal(getFacilityRoomKind(33, { feats: fresh, run: { companions: ["foreman"] } }), null,
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
  state.currentRun.companions = companion ? [companion] : [];
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
assert.deepEqual(bought.facilities, { nodes: ["miner_kit"], orders: {}, grave: {} });
assert.deepEqual(closedContext.facilities, { nodes: [], orders: {}, grave: {} }, "a purchase does not mutate its inputs");
assert.equal(purchaseFacilityNode("miner_kit", { ...openContext, facilities: bought.facilities }).reason, "解放済み");
assert.deepEqual(listFacilityNodes("miner_guild", { ...openContext, facilities: bought.facilities })
  .map(entry => [entry.node.id, entry.bought, entry.canBuy]),
[["miner_kit", true, false], ["miner_outpost", false, false], ["miner_blast", false, false]]);
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
assert.deepEqual(state.currentRun.companions, []);
state.currentRun.deepestFloor = 2;
triggerRunResult("milestone_portal");
assert.equal(state.storage.filter(item => itemId(item) === "TRAP_KIT").length, 1,
  "the unused crafted tool returns to storage; the kit's supplies do not");
assert.equal(state.storage.some(item => itemId(item) === "TRAP_SENSE_STONE"), false);
console.log("[PASS] a miner kit run carries the supplies and returns only the crafted tool");

// The base-kit feat keeps counting the four base kits only.
assert.equal(Object.hasOwn(state.feats.counters.kitDepths, "miner"), false);

// --- Dungeon rebuilds: the outpost and the blast (#2010) -----------------------------

const withFeats = completed => ({
  counters: { ...createDefaultFeatsState().counters, foremanRescued: 1, bestDepth: 5, guardianDepth: 5 },
  completed: Object.fromEntries(completed.map(id => [id, { runNumber: 1 }]))
});
const plenty = { "硬い皮": 20, "獣の牙": 20, "鉄片": 20 };
const noNodes = createDefaultFacilitiesState();

const rescuedOnly = withFeats(["foreman_rescue"]);
assert.match(
  getFacilityNodeBlockReason("miner_outpost", { feats: rescuedOnly, facilities: noNodes, metaMaterials: plenty }),
  /^条件：偉業「坑道を抜ける」（B5Fに到達する／B5F \/ B5F）$/,
  "the outpost names the feat it needs, with its progress"
);
const reached = withFeats(["foreman_rescue", "depth_5"]);
const outpost = purchaseFacilityNode("miner_outpost", { feats: reached, facilities: noNodes, metaMaterials: plenty });
assert.equal(outpost.ok, true);
assert.equal(outpost.metaMaterials["硬い皮"], 14);
assert.equal(outpost.metaMaterials["獣の牙"], 16);

assert.equal(
  getFacilityNodeBlockReason("miner_blast", { feats: reached, facilities: outpost.facilities, metaMaterials: plenty }),
  "条件：偉業「坑道の主を倒す」（B5Fの階層守護者を倒す／B5F / B5F）"
);
const guardianDown = withFeats(["foreman_rescue", "depth_5", "guardian_5"]);
assert.equal(
  getFacilityNodeBlockReason("miner_blast", { feats: guardianDown, facilities: noNodes, metaMaterials: plenty }),
  "条件：「坑夫の詰所」の解放",
  "the blast needs the outpost first"
);
const blast = purchaseFacilityNode("miner_blast", { feats: guardianDown, facilities: outpost.facilities, metaMaterials: plenty });
assert.equal(blast.ok, true);
assert.deepEqual(blast.facilities.nodes, ["miner_outpost", "miner_blast"]);
assert.deepEqual(getUnlockedStartingKitIds(blast.facilities), [], "rebuild nodes open no kit");

// The room: vein until the outpost is bought, outpost afterwards, never elsewhere.
assert.equal(getFacilityRoomKind(3, { feats: reached, run: {}, facilities: noNodes }), null);
assert.equal(getFacilityRoomKind(3, { feats: reached, run: {}, facilities: outpost.facilities }), SPECIAL_ROOMS.MINER_OUTPOST);
assert.equal(getFacilityRoomKind(33, { feats: reached, run: {}, facilities: outpost.facilities }), SPECIAL_ROOMS.MINER_OUTPOST);
assert.equal(getFacilityRoomKind(4, { feats: reached, run: {}, facilities: outpost.facilities }), null);
assert.equal(getFacilityRoomKind(8, { feats: reached, run: {}, facilities: outpost.facilities }), SPECIAL_ROOMS.SEALED_PRIEST,
  "the next band's third floor belongs to its own facility");
assert.equal(getFacilityRoomKind(9, { feats: reached, run: {}, facilities: outpost.facilities }), null);
assert.equal(getFacilityRoomKind(3, { feats: createDefaultFeatsState(), run: {}, facilities: outpost.facilities }),
  SPECIAL_ROOMS.TRAPPED_FOREMAN, "an unrescued foreman still comes first");
assert.ok(getSpecialRoomInfo(SPECIAL_ROOMS.MINER_OUTPOST).name);

const outpostFloorKind = facilities => {
  initNewGame();
  state.feats = reached;
  state.facilities = facilities;
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "facility-room-test";
  state.maps = [];
  state.visitedMaps = [];
  state.floor = 3;
  state._freshRunFloor = 3;
  return ensureRunFloor(state, 3).flat().find(cell => cell.specialRoom)?.specialRoom.kind || null;
};
assert.equal(outpostFloorKind(noNodes), SPECIAL_ROOMS.MINE_VEIN);
assert.equal(outpostFloorKind(outpost.facilities), SPECIAL_ROOMS.MINER_OUTPOST);

assert.deepEqual([...OUTPOST_SUPPLY_ITEM_IDS], ["HEAL_POTION", "ANTIDOTE", "TRAP_KIT"]);
OUTPOST_SUPPLY_ITEM_IDS.forEach(itemId => assert.ok(ITEMS[itemId], `${itemId} exists`));

const rubbleGrid = [[
  { obstacle: { kind: "rubble", state: "intact", progress: 1, discovered: false } },
  { obstacle: { kind: "rubble", state: "cleared", progress: 3, discovered: true } },
  { obstacle: { kind: "seal", state: "closed" } },
  {}
]];
assert.equal(clearFloorRubble(rubbleGrid), 1, "only intact rubble is counted");
assert.equal(rubbleGrid[0][0].obstacle.state, "cleared");
assert.equal(rubbleGrid[0][0].obstacle.discovered, true);
assert.equal(rubbleGrid[0][2].obstacle.state, "closed", "other obstacles are untouched");
assert.equal(clearFloorRubble(rubbleGrid), 0);
console.log("[PASS] the outpost and the blast need their feats, replace the vein on B3F, and clear only rubble");

// --- Orders: pay now, receive at the next safe return (#2014) --------------------------

const trapOrder = FACILITY_ORDER_BY_ID.get("miner_trap_kits");
assert.ok(trapOrder);
assert.deepEqual([...trapOrder.yields], ["TRAP_KIT", "TRAP_KIT"]);
Object.keys(trapOrder.cost).forEach(name => assert.ok(MATERIAL_TYPES.includes(name)));
// The order is cheaper than crafting the same goods at departure.
const craftedCost = trapOrder.yields.reduce((total, itemId) => {
  const recipe = CRAFT_RECIPES.find(candidate => candidate.resultId === itemId);
  return total + Object.values(recipe.mats).reduce((sum, quantity) => sum + quantity, 0);
}, 0);
const orderCost = Object.values(trapOrder.cost).reduce((sum, quantity) => sum + quantity, 0);
assert.ok(orderCost < craftedCost, "an order costs less than departure craft");

const orderContext = { feats: rescued.feats, facilities: createDefaultFacilitiesState(), metaMaterials: { "鉄片": 5, "硬い皮": 3 } };
assert.equal(getFacilityOrderBlockReason("miner_trap_kits", { ...orderContext, feats: fresh }), "坑夫組合がまだ開いていない");
assert.equal(getFacilityOrderBlockReason("miner_trap_kits", { ...orderContext, metaMaterials: { "鉄片": 1 } }), "素材不足");
assert.equal(getFacilityOrderBlockReason("missing", orderContext), "存在しない仕込み");
const placed = placeFacilityOrder("miner_trap_kits", orderContext);
assert.equal(placed.ok, true);
assert.equal(placed.metaMaterials["鉄片"], 3, "the materials are paid when the order is placed");
assert.equal(placed.metaMaterials["硬い皮"], 2);
assert.deepEqual(placed.facilities.orders, { miner_guild: { orderId: "miner_trap_kits", items: ["TRAP_KIT", "TRAP_KIT"] } });
assert.deepEqual(orderContext.facilities.orders, {}, "placing an order does not mutate its inputs");
assert.equal(getOpenFacilityOrder(placed.facilities, "miner_guild").order, trapOrder);
assert.equal(getOpenFacilityOrder(createDefaultFacilitiesState(), "miner_guild"), null);
assert.equal(
  placeFacilityOrder("miner_trap_kits", { ...orderContext, facilities: placed.facilities }).reason,
  "仕込み中の品がある",
  "one open order per facility"
);

const died = settleFacilityOrders(placed.facilities, [], 30, "death");
assert.deepEqual(died.result, { delivered: [], waiting: 2 });
assert.deepEqual(died.facilities.orders, placed.facilities.orders, "a death leaves the order open");
assert.deepEqual(died.storage, []);
assert.deepEqual(settleFacilityOrders(placed.facilities, [], 30, "abandon").result, { delivered: [], waiting: 2 });

const returned = settleFacilityOrders(placed.facilities, ["HEAL_POTION"], 30, "retreat");
assert.deepEqual(returned.result, { delivered: ["TRAP_KIT", "TRAP_KIT"], waiting: 0 });
assert.deepEqual(returned.storage, ["HEAL_POTION", "TRAP_KIT", "TRAP_KIT"]);
assert.deepEqual(returned.facilities.orders, {}, "a finished order is closed");
assert.deepEqual(placed.facilities.orders.miner_guild.items, ["TRAP_KIT", "TRAP_KIT"], "settlement does not mutate its inputs");
// Finished goods are ordinary storage stock: departure craft uses them before materials (#1997).
assert.deepEqual(getDepartureCraftCost(["TRAP_KIT", "TRAP_KIT"], returned.storage), { typed: {}, any: 0 });
assert.deepEqual(getDepartureCraftCost(["TRAP_KIT"], []).typed, { "鉄片": 2, "硬い皮": 1 }, "the order yields two for the price of one crafted kit");

const crowded = settleFacilityOrders(placed.facilities, Array(29).fill("HEAL_POTION"), 30, "retreat");
assert.deepEqual(crowded.result, { delivered: ["TRAP_KIT"], waiting: 1 }, "what does not fit is kept, not discarded");
assert.equal(crowded.storage.length, 30);
assert.deepEqual(crowded.facilities.orders, { miner_guild: { orderId: "miner_trap_kits", items: ["TRAP_KIT"] } });
const nextReturn = settleFacilityOrders(crowded.facilities, [], 30, "retreat");
assert.deepEqual(nextReturn.result, { delivered: ["TRAP_KIT"], waiting: 0 });

assert.deepEqual(settleFacilityOrders(createDefaultFacilitiesState(), ["HEAL_POTION"], 30, "retreat"),
  { facilities: createDefaultFacilitiesState(), storage: ["HEAL_POTION"], result: null });

assert.deepEqual(
  getFeatResultRows(null, { outcome: "retreat", orderResult: returned.result })
    .find(row => row.id === "facility_orders"),
  { id: "facility_orders", status: "仕上がり", completed: true, name: "仕込みの品 罠外しキット×2", detail: "倉庫に入った" }
);
assert.deepEqual(
  getFeatResultRows(null, { outcome: "death", orderResult: died.result }).find(row => row.id === "facility_orders"),
  { id: "facility_orders", status: "持ち越し", completed: false, name: "仕込み中の品 2個", detail: "生還すると仕上がる" }
);

// The end of a run: unused supplies return first, then the order is finished.
initNewGame();
state.feats = rescued.feats;
state.facilities = placed.facilities;
state.storage = [];
state.party = [createStartingKitCharacter("vanguard")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.deepestFloor = 2;
state.gameState = "explore";
triggerRunResult("gameover");
assert.deepEqual(state.storage, [], "nothing is delivered by a death");
assert.deepEqual(state.currentRun.orderResult, { delivered: [], waiting: 2 });
assert.ok(getOpenFacilityOrder(state.facilities, "miner_guild"));
state.party = [createStartingKitCharacter("vanguard")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.deepestFloor = 2;
state.gameState = "explore";
triggerRunResult("escape_scroll");
assert.deepEqual(state.storage, ["TRAP_KIT", "TRAP_KIT"], "the Wing is a safe return and finishes the order");
assert.deepEqual(state.currentRun.orderResult, { delivered: ["TRAP_KIT", "TRAP_KIT"], waiting: 0 });
assert.equal(getOpenFacilityOrder(state.facilities, "miner_guild"), null);
console.log("[PASS] an order is paid when placed, finished by a safe return, and never discarded");

// --- Save round trip ---------------------------------------------------------------

initNewGame();
state.facilities = bought.facilities;
state.party = [createStartingKitCharacter("miner")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.companions = ["foreman"];
state.currentRun.startingKit = "miner";
state.gameState = "explore";
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.facilities, { nodes: ["miner_kit"], orders: {}, grave: {} });
assert.deepEqual(reloaded.currentRun.companions, ["foreman"], "the escort survives a reload mid-run");
assert.equal(reloaded.currentRun.startingKit, "miner");
assert.equal(reloaded.party[0].startingKit, "miner");
assert.equal(isNormalizedCurrentRun(reloaded.currentRun), true);
const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.facilities;
delete legacy.currentRun.companions;
// A save from before #2018 stored a single `companion`.
legacy.currentRun.companion = "foreman";
const migrated = normalizeSavePayload(legacy);
assert.deepEqual(migrated.currentRun.companions, ["foreman"], "the single escort of an older save is kept");
assert.equal(Object.hasOwn(migrated.currentRun, "companion"), false);
delete legacy.currentRun.companion;
assert.deepEqual(migrated.facilities, { nodes: [], orders: {}, grave: {} }, "a save from before facilities has nothing bought");
assert.deepEqual(normalizeSavePayload(legacy).currentRun.companions, []);
assert.equal(isNormalizedFacilitiesState({ nodes: ["a", "a"] }), false);
assert.deepEqual(normalizeFacilitiesState({ nodes: ["a", "a", 3, ""] }), { nodes: ["a"], orders: {}, grave: {} });
assert.deepEqual(
  normalizeFacilitiesState({ nodes: [], orders: { miner_guild: { orderId: "miner_trap_kits", items: ["TRAP_KIT", 4] }, empty: { orderId: "x", items: [] } } }),
  { nodes: [], orders: { miner_guild: { orderId: "miner_trap_kits", items: ["TRAP_KIT"] } }, grave: {} }
);
state.facilities = placed.facilities;
const orderReload = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(orderReload.facilities.orders, placed.facilities.orders, "an open order survives a reload");
assert.equal(isNormalizedCompanions(["foreman", "priest"]), true);
assert.equal(isNormalizedCompanions(["foreman", "foreman"]), false);
assert.deepEqual(normalizeCompanions(["stranger", "priest", "priest"], "foreman"), ["priest", "foreman"]);
console.log("[PASS] facility purchases and the escort survive a save round trip");
