import assert from "node:assert/strict";

// The chapel (#2018): the facility framework across biome bands, leading more
// than one keeper out, the chapel altar's offering, and the grave.

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
  CHAPEL_GRAVE_LIMIT,
  CHAPEL_GRAVE_RATE,
  CHAPEL_OFFERING_LIMIT,
  COMPANIONS,
  FACILITIES,
  FACILITY_BY_ID,
  KEEPER_ROOM_FACILITY
} = await import("../../../src/data/facilities.js");
const { BIOMES } = await import("../../../src/data/biomes.js");
const { FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { ITEMS } = await import("../../../src/data/items.js");
const { CRAFT_RECIPES } = await import("../../../src/craft.js");
const {
  getEscortNames,
  getFacilityNodeBlockReason,
  isFacilityOpen,
  listRunCompanions,
  listTownFacilities,
  placeFacilityOrder,
  purchaseFacilityNode
} = await import("../../../src/systems/facilities.js");
const { applyFacilityRoom, getFacilityForFloor, getFacilityRoomKind, getWaitingKeeperFacility } =
  await import("../../../src/systems/facility_rooms.js");
const {
  SPECIAL_ROOMS,
  SPECIAL_ROOM_EVENT,
  applyOffering,
  getGraveMaterials,
  getOfferingChoices,
  getRescueBloodCost,
  getSpecialRoomInfo
} = await import("../../../src/rules/special_rooms.js");
const { addRunToFeatCounters, listFeats, settleRunFeats } = await import("../../../src/systems/feats.js");
const { createDefaultFeatsState, normalizeFeatsState } = await import("../../../src/state/feats_state.js");
const { isNormalizedFacilitiesState, normalizeFacilitiesState } =
  await import("../../../src/state/facilities_state.js");
const { getAvailableStartingKits, getDepartureBagItems } = await import("../../../src/systems/departure_preparation.js");
const { isStartingKitId } = await import("../../../src/state/starting_kit.js");
const {
  state,
  createDefaultCurrentRun,
  createStartingKitCharacter,
  getStartingKit,
  initNewGame
} = await import("../../../src/state.js");
const { getDepartureCraftCost } = await import("../../../src/systems/workshop.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { ensureRunFloor } = await import("../../../src/state/run_floor_state.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { getFeatResultRows } = await import("../../../src/ui/result_screen.js");

// --- The framework: one facility per biome band -----------------------------------

const biomeIds = BIOMES.map(biome => biome.id);
const siteBiomes = FACILITIES.map(facility => facility.site.biomeId);
assert.equal(new Set(siteBiomes).size, siteBiomes.length, "no two facilities share a band");
FACILITIES.forEach(facility => {
  assert.ok(biomeIds.includes(facility.site.biomeId), `${facility.id} sits in an existing band`);
  assert.ok(getSpecialRoomInfo(facility.site.keeperRoom)?.name, `${facility.id} keeper room is described`);
  assert.equal(KEEPER_ROOM_FACILITY.get(facility.site.keeperRoom), facility);
  assert.ok(facility.site.omen, `${facility.id} announces its keeper on the floor`);
  assert.ok(["dig", "blood", "fight", "drain", "fuel"].includes(facility.site.rescue.kind));
  assert.equal(COMPANIONS[facility.companion.id].facilityId, facility.id);
  const feat = FEAT_BY_ID.get(facility.featId);
  assert.equal(feat.chain, "rescue", "rescues share one chain");
  assert.equal(feat.metric.key, facility.companion.counterKey);
  assert.equal(feat.metric.companion, facility.companion.id);
  assert.ok(Object.hasOwn(createDefaultFeatsState().counters, facility.companion.counterKey));
  facility.nodes.filter(node => node.grants.room).forEach(node => {
    assert.ok(getSpecialRoomInfo(node.grants.room)?.name, `${node.id} rebuilds into a described room`);
  });
  facility.orders.forEach(order => {
    // An order yields a craftable tool at half the price of departure craft:
    // two for one recipe's materials, or one for half the count of an
    // any-material recipe (the return wing).
    const recipe = CRAFT_RECIPES.find(candidate => candidate.resultId === order.yields[0]);
    assert.ok(recipe, `${order.id} yields a tool departure craft can also make`);
    if (recipe.mats) {
      assert.deepEqual(order.cost, recipe.mats);
      assert.equal(order.yields.length, 2);
    } else {
      const total = Object.values(order.cost).reduce((sum, quantity) => sum + quantity, 0);
      assert.equal(total * 2, recipe.departureCost.total * order.yields.length);
    }
    assert.deepEqual(getDepartureCraftCost(order.yields, order.yields), { typed: {}, any: 0 },
      "finished goods are stock for departure craft");
  });
});
const chapel = FACILITY_BY_ID.get("chapel");
assert.deepEqual([3, 8, 33, 38].map(floor => getFacilityForFloor(floor)?.id || null),
  ["miner_guild", "chapel", "miner_guild", "chapel"], "the third floor of each band, in every cycle");
assert.deepEqual([6, 7, 9, 10].map(floor => getFacilityForFloor(floor)), [null, null, null, null]);
console.log("[PASS] each facility owns the third floor of its band and its data is consistent");

// --- The priest's room --------------------------------------------------------------

const fresh = createDefaultFeatsState();
assert.equal(getFacilityRoomKind(8, { feats: fresh, run: {} }), SPECIAL_ROOMS.SEALED_PRIEST);
assert.equal(getFacilityRoomKind(8, { feats: fresh, run: { companions: ["priest"] } }), null,
  "a run already leading him out does not meet him again");
assert.equal(getFacilityRoomKind(8, { feats: fresh, run: { companions: ["foreman"] } }), SPECIAL_ROOMS.SEALED_PRIEST,
  "leading the foreman does not hide the priest");
const makeGrid = kind => [[
  { type: "empty", walls: [true, true, true, false] },
  { type: "empty", walls: [true, true, false, true], event: SPECIAL_ROOM_EVENT, specialRoom: { kind, used: false, discovered: false } }
]];
const altarGrid = makeGrid(SPECIAL_ROOMS.ALTAR);
assert.equal(applyFacilityRoom(altarGrid, 8, { feats: fresh, run: {} }), true);
assert.equal(altarGrid[0][1].specialRoom.kind, SPECIAL_ROOMS.SEALED_PRIEST);
assert.equal(getWaitingKeeperFacility(altarGrid), chapel);
assert.equal(applyFacilityRoom(makeGrid(SPECIAL_ROOMS.MINE_VEIN), 8, { feats: fresh, run: {} }), false,
  "only the band's own room is replaced");

const roomKindOnFloor = (floor, feats, facilities = null) => {
  initNewGame();
  state.feats = feats;
  if (facilities) state.facilities = facilities;
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "chapel-room-test";
  state.maps = [];
  state.visitedMaps = [];
  state.floor = floor;
  state._freshRunFloor = floor;
  return ensureRunFloor(state, floor).flat().find(cell => cell.specialRoom)?.specialRoom.kind || null;
};
assert.equal(roomKindOnFloor(8, createDefaultFeatsState()), SPECIAL_ROOMS.SEALED_PRIEST);
assert.equal(roomKindOnFloor(7, createDefaultFeatsState()), SPECIAL_ROOMS.ALTAR);

// The seal takes a quarter of max HP and never the last point.
assert.equal(chapel.site.rescue.hpRate, 0.25);
assert.equal(getRescueBloodCost({ hp: 45 }, 45, 0.25), 12);
assert.equal(getRescueBloodCost({ hp: 5 }, 45, 0.25), 4);
assert.equal(getRescueBloodCost({ hp: 1 }, 45, 0.25), 0, "with 1 HP there is no blood to give");
console.log("[PASS] the priest takes the altar's place on B8F while unrescued and the seal costs blood");

// --- Leading two people out ------------------------------------------------------------

const both = { startFloor: 1, deepestFloor: 8, companions: ["foreman", "priest"] };
assert.equal(getEscortNames(both), "鉱夫頭・司祭");
assert.deepEqual(listRunCompanions(both).map(companion => companion.id), ["foreman", "priest"]);
assert.equal(getEscortNames({ companions: [] }), "");
const died = addRunToFeatCounters(fresh.counters, both, "death");
assert.deepEqual([died.foremanRescued, died.priestRescued], [0, 0]);
const home = settleRunFeats(fresh, both, "retreat", 3);
assert.deepEqual([home.feats.counters.foremanRescued, home.feats.counters.priestRescued], [1, 1]);
assert.deepEqual(home.result.completed.filter(id => id.endsWith("_rescue")), ["foreman_rescue", "priest_rescue"]);
assert.equal(isFacilityOpen(home.feats, "chapel"), true);
assert.deepEqual(getFeatResultRows(null, { ...both, outcome: "death" }).map(row => [row.id, row.detail]), [
  ["foreman_rescue", "鉱夫頭は迷宮に残された"],
  ["priest_rescue", "司祭は迷宮に残された"]
]);

// The rescue chain offers one person at a time, but anyone found is rescued.
const offered = feats => listFeats(feats).filter(entry => entry.offered && entry.feat.chain === "rescue").map(entry => entry.feat.id);
assert.deepEqual(offered(fresh), ["foreman_rescue"]);
const priestFirst = settleRunFeats(fresh, { startFloor: 1, deepestFloor: 8, companions: ["priest"] }, "retreat", 2);
assert.equal(isFacilityOpen(priestFirst.feats, "chapel"), true, "a keeper found out of order is still rescued");
assert.equal(isFacilityOpen(priestFirst.feats, "miner_guild"), false);
assert.deepEqual(offered(priestFirst.feats), ["foreman_rescue"]);
assert.deepEqual(offered(home.feats), FACILITIES.slice(2, 3).map(facility => facility.featId),
  "with both home, the next keeper in order is offered");

// The town shows open facilities and only the next closed one.
assert.deepEqual(listTownFacilities(fresh).map(entry => [entry.facility.id, entry.open]), [["miner_guild", false]]);
const foremanHome = settleRunFeats(fresh, { startFloor: 1, deepestFloor: 3, companions: ["foreman"] }, "retreat", 1);
assert.deepEqual(listTownFacilities(foremanHome.feats).map(entry => [entry.facility.id, entry.open]),
  [["miner_guild", true], ["chapel", false]]);
assert.deepEqual(listTownFacilities(priestFirst.feats).map(entry => [entry.facility.id, entry.open]),
  [["miner_guild", false], ["chapel", true]]);
assert.deepEqual(listTownFacilities(home.feats).map(entry => entry.facility.id),
  FACILITIES.slice(0, 3).map(facility => facility.id), "only one closed facility is shown at a time");
console.log("[PASS] two keepers can be led out together and the town shows the next one to find");

// --- Nodes, the kit and the order -------------------------------------------------------

const context = (feats, facilities, metaMaterials) => ({ feats, facilities, metaMaterials });
const rich = { "骨片": 20, "霊粉": 20, "呪布": 20, "魔石片": 20, "黒角": 20 };
const open = home.feats;
assert.match(getFacilityNodeBlockReason("chapel_offering", context(open, null, rich)), /^先に偉業「地下墓地の底へ」/);
const depth10 = normalizeFeatsState({ ...open, completed: { ...open.completed, depth_10: { runNumber: 5 } } });
assert.equal(getFacilityNodeBlockReason("chapel_offering", context(depth10, null, rich)), "");
assert.match(getFacilityNodeBlockReason("chapel_grave", context(depth10, null, rich)), /^先に偉業「地下墓地の主を倒す」/);
const allFeats = normalizeFeatsState({ ...depth10, completed: { ...depth10.completed, guardian_10: { runNumber: 6 } } });
assert.equal(getFacilityNodeBlockReason("chapel_grave", context(allFeats, null, rich)), "先に「献灯台」を解放する");
const offering = purchaseFacilityNode("chapel_offering", context(allFeats, null, rich));
const graveNode = purchaseFacilityNode("chapel_grave", context(allFeats, offering.facilities, offering.metaMaterials));
assert.equal(graveNode.ok, true);
assert.equal(getFacilityRoomKind(8, { feats: allFeats, run: {}, facilities: null }), null, "the altar is plain until rebuilt");
assert.equal(getFacilityRoomKind(8, { feats: allFeats, run: {}, facilities: offering.facilities }), SPECIAL_ROOMS.CHAPEL_ALTAR);
assert.equal(roomKindOnFloor(8, allFeats, offering.facilities), SPECIAL_ROOMS.CHAPEL_ALTAR);
assert.equal(roomKindOnFloor(8, allFeats), SPECIAL_ROOMS.ALTAR);

const kit = purchaseFacilityNode("chapel_kit", context(open, null, rich));
assert.equal(isStartingKitId("pilgrim"), true);
assert.equal(getAvailableStartingKits(kit.facilities).some(entry => entry.id === "pilgrim"), true);
assert.equal(getAvailableStartingKits(null).some(entry => entry.id === "pilgrim"), false);
const pilgrim = createStartingKitCharacter("pilgrim");
assert.deepEqual(
  [pilgrim.equipment.weapon, pilgrim.equipment.shield, pilgrim.equipment.armor],
  ["SHORT_SWORD", "MAGIC_SHIELD", "ROBE"]
);
assert.deepEqual(getStartingKit("pilgrim").items, ["HOLY_WATER"]);
assert.ok(ITEMS.HOLY_WATER);
assert.deepEqual(getDepartureBagItems([], null, "pilgrim"), ["HOLY_WATER"]);

const ordered = placeFacilityOrder("chapel_greater_heal", context(open, null, rich));
assert.equal(ordered.ok, true);
assert.deepEqual(ordered.facilities.orders.chapel.items, ["GREATER_HEAL", "GREATER_HEAL"]);
console.log("[PASS] chapel nodes need their feats, the pilgrim kit carries holy water, and the order yields two");

// --- The offering -----------------------------------------------------------------------

assert.equal(CHAPEL_OFFERING_LIMIT, 6);
assert.deepEqual(getOfferingChoices({ "鉄片": 9, "骨片": 2, "霊粉": 0 }, 6), [
  { name: "鉄片", quantity: 6 },
  { name: "骨片", quantity: 2 }
]);
const carried = { "鉄片": 9, "骨片": 2 };
const sent = applyOffering(carried, {}, "鉄片", 6);
assert.deepEqual(sent, { materials: { "鉄片": 3, "骨片": 2 }, offered: { "鉄片": 6 }, sent: 6 });
assert.deepEqual(applyOffering(carried, {}, "骨片", 6).materials, { "鉄片": 9 }, "an emptied stack is removed");
assert.equal(applyOffering(carried, {}, "竜鱗", 6), null);
assert.deepEqual(carried, { "鉄片": 9, "骨片": 2 }, "an offering does not mutate its inputs");

const endRun = (reason, { materials, offered = {}, facilities = null }) => {
  initNewGame();
  state.feats = allFeats;
  if (facilities) state.facilities = facilities;
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.startingKit = "vanguard";
  state.currentRun.materials = { ...materials };
  state.currentRun.offeredMaterials = { ...offered };
  state.floor = 9;
  state.gameState = "explore";
  if (reason === "gameover") state.party[0].hp = 0;
  const run = state.currentRun;
  triggerRunResult(reason);
  return run;
};
// A death keeps 30% of what is carried and all of what was offered.
const deadRun = endRun("gameover", { materials: { "鉄片": 3, "骨片": 2 }, offered: { "鉄片": 6 } });
assert.equal(state.metaMaterials["鉄片"], 6, "the offered iron arrived although the run died");
assert.equal(deadRun.bankedMaterials["鉄片"], 6);
assert.equal(deadRun.materialsBeforeBanking["鉄片"], 9, "offered materials still count as found");
const safeRun = endRun("milestone_portal", { materials: { "鉄片": 3 }, offered: { "鉄片": 6 } });
assert.equal(state.metaMaterials["鉄片"], 9, "a safe return banks the carried and the offered once each");
assert.equal(safeRun.bankedMaterials["鉄片"], 9);
console.log("[PASS] an offering sends one material type home whatever the outcome");

// --- The grave --------------------------------------------------------------------------

assert.deepEqual([CHAPEL_GRAVE_RATE, CHAPEL_GRAVE_LIMIT], [0.5, 8]);
assert.deepEqual(getGraveMaterials({ "鉄片": 7, "骨片": 1, "霊粉": 4 }, 0.5, 8), { "鉄片": 3, "霊粉": 2 });
assert.deepEqual(getGraveMaterials({ "鉄片": 14, "骨片": 6 }, 0.5, 8), { "鉄片": 7, "骨片": 1 }, "the total is capped");
assert.deepEqual(getGraveMaterials({}, 0.5, 8), {});

// Without the node, a death leaves nothing on the grave.
const noGrave = endRun("gameover", { materials: { "鉄片": 10 }, facilities: offering.facilities });
assert.equal(noGrave.graveResult, null);
assert.deepEqual(normalizeFacilitiesState(state.facilities).grave, {});

// With it: 10 carried, 3 banked (30%), 7 lost, 3 kept on the grave.
const graveRun = endRun("gameover", { materials: { "鉄片": 10 }, facilities: graveNode.facilities });
assert.equal(state.metaMaterials["鉄片"], 3);
assert.deepEqual(graveRun.graveResult, { "鉄片": 3 });
assert.deepEqual(state.facilities.grave, { "鉄片": 3 });
assert.deepEqual(getFeatResultRows(null, graveRun).find(row => row.id === "chapel_grave"), {
  id: "chapel_grave",
  status: "墓標",
  completed: false,
  name: "素材 3個が墓標に残った",
  detail: "地下墓地の3階目、礼拝堂の祭壇で取り戻せる"
});
const withGrave = state.facilities;
// A safe return and an abandoned run leave the grave as it is.
endRun("milestone_portal", { materials: { "骨片": 4 }, facilities: withGrave });
assert.deepEqual(state.facilities.grave, { "鉄片": 3 });
const abandoned = endRun("abandon", { materials: { "骨片": 4 }, facilities: withGrave });
assert.equal(abandoned.graveResult, null);
assert.deepEqual(state.facilities.grave, { "鉄片": 3 });
// The next death adds to it; nothing already there is lost.
const second = endRun("gameover", { materials: { "骨片": 4 }, facilities: withGrave });
assert.deepEqual(state.facilities.grave, { "鉄片": 3, "骨片": 1 });
assert.deepEqual(second.graveResult, { "骨片": 1 }, "the result shows what this death added");
const emptyDeath = endRun("gameover", { materials: {}, facilities: state.facilities });
assert.deepEqual(state.facilities.grave, { "鉄片": 3, "骨片": 1 });
assert.equal(emptyDeath.graveResult, null);
// It fills up to the limit across deaths: 4 held, so only 4 more fit.
const third = endRun("gameover", { materials: { "霊粉": 20 }, facilities: state.facilities });
assert.deepEqual(state.facilities.grave, { "鉄片": 3, "骨片": 1, "霊粉": 4 });
assert.deepEqual(third.graveResult, { "霊粉": 4 });
const full = endRun("gameover", { materials: { "霊粉": 20 }, facilities: state.facilities });
assert.deepEqual(state.facilities.grave, { "鉄片": 3, "骨片": 1, "霊粉": 4 }, "a full grave takes nothing more");
assert.equal(full.graveResult, null);
console.log("[PASS] the grave keeps half of what a death lost and fills up to eight until taken back");

// --- Save round trip --------------------------------------------------------------------

initNewGame();
state.facilities = { ...graveNode.facilities, grave: { "鉄片": 3 } };
state.party = [createStartingKitCharacter("pilgrim")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.startingKit = "pilgrim";
state.currentRun.companions = ["foreman", "priest"];
state.currentRun.offeredMaterials = { "鉄片": 6 };
state.gameState = "explore";
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.facilities.grave, { "鉄片": 3 });
assert.deepEqual(reloaded.currentRun.companions, ["foreman", "priest"]);
assert.deepEqual(reloaded.currentRun.offeredMaterials, { "鉄片": 6 });
assert.equal(reloaded.currentRun.graveResult, null);
assert.equal(reloaded.currentRun.startingKit, "pilgrim");
assert.equal(isNormalizedCurrentRun(reloaded.currentRun), true);
const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.facilities.grave;
delete legacy.currentRun.offeredMaterials;
delete legacy.currentRun.graveResult;
const migrated = normalizeSavePayload(legacy);
assert.deepEqual(migrated.facilities.grave, {});
assert.deepEqual(migrated.currentRun.offeredMaterials, {});
assert.equal(migrated.currentRun.graveResult, null);
assert.equal(isNormalizedFacilitiesState({ nodes: [], grave: { "鉄片": 0 } }), false);
assert.deepEqual(normalizeFacilitiesState({ nodes: [], grave: { "鉄片": 2.9, "": 3, "骨片": -1 } }).grave, { "鉄片": 2 });
console.log("[PASS] the grave, the offering and both escorts survive a save round trip");
