import assert from "node:assert/strict";

// The smithy and the audience hall (#2021): a keeper freed with materials, a
// keeper freed with HP, the longer temper and the reforge, the oath and the
// mirror gallery, and the two kits.

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

const { FACILITIES, FACILITY_BY_ID } = await import("../../../src/data/facilities.js");
const { BIOMES } = await import("../../../src/data/biomes.js");
const { FEAT_BY_ID } = await import("../../../src/data/feats.js");
const { CRAFT_RECIPES } = await import("../../../src/craft.js");
const { getFacilityNodeBlockReason, isFacilityOpen, listTownFacilities, placeFacilityOrder, purchaseFacilityNode } =
  await import("../../../src/systems/facilities.js");
const { applyFacilityRoom, getFacilityForFloor, getFacilityRoomKind } =
  await import("../../../src/systems/facility_rooms.js");
const {
  FORGE_TEMPER_BATTLES,
  GALLERY_VISION_FLOORS,
  REFORGE_MATERIAL_COST,
  REFORGE_MAX_LEVEL,
  SMITH_TEMPER_BATTLES,
  SPECIAL_ROOMS,
  SPECIAL_ROOM_EVENT,
  applyForgeTemper,
  getReforgedLevel,
  getRescueBloodCost,
  getSpecialRoomInfo,
  hasMirrorVisionFor,
  startForgeTemperBattle
} = await import("../../../src/rules/special_rooms.js");
const { getFeatProgress, settleRunFeats } = await import("../../../src/systems/feats.js");
const { createDefaultFeatsState, normalizeFeatsState } = await import("../../../src/state/feats_state.js");
const { getAvailableStartingKits } = await import("../../../src/systems/departure_preparation.js");
const { isStartingKitId } = await import("../../../src/state/starting_kit.js");
const {
  state,
  createDefaultCurrentRun,
  createStartingKitCharacter,
  getStartingKit,
  initNewGame
} = await import("../../../src/state.js");
const { getRunMaterialStake } = await import("../../../src/ui/run_stakes.js");
const { createSavePayload } = await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { applyMirrorVision, ensureRunFloor } = await import("../../../src/state/run_floor_state.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { getEvaluationText, getFeatResultRows } = await import("../../../src/ui/result_screen.js");

const smithy = FACILITY_BY_ID.get("smithy");
const hall = FACILITY_BY_ID.get("audience_hall");

// --- Every band now has its facility --------------------------------------------------

assert.deepEqual(FACILITIES.map(facility => facility.site.biomeId), BIOMES.map(biome => biome.id),
  "one facility per biome band, in band order");
assert.deepEqual([3, 8, 13, 18, 23, 28].map(floor => getFacilityForFloor(floor)?.id),
  ["miner_guild", "chapel", "weaving_house", "scriptorium", "smithy", "audience_hall"]);
assert.deepEqual([53, 58].map(floor => getFacilityForFloor(floor)?.id), ["smithy", "audience_hall"]);
assert.deepEqual([smithy.site.rescue.kind, smithy.site.rescue.materials], ["fuel", 4]);
assert.deepEqual([hall.site.rescue.kind, hall.site.rescue.hpRate], ["blood", 0.3]);
FACILITIES.filter(facility => facility.site.rescue.kind === "blood").forEach(facility => {
  ["prompt", "action", "done"].forEach(key => assert.ok(facility.site.rescue[key].includes("{cost}"), `${facility.id} ${key} shows the cost`));
  assert.ok(facility.site.rescue.shortage);
});
assert.equal(getRescueBloodCost({ hp: 45 }, 45, 0.3), 14);

const fresh = createDefaultFeatsState();
assert.equal(getFacilityRoomKind(23, { feats: fresh, run: {} }), SPECIAL_ROOMS.COLD_FORGE);
assert.equal(getFacilityRoomKind(28, { feats: fresh, run: {} }), SPECIAL_ROOMS.MIRROR_CAPTIVE);
const makeGrid = kind => [[
  { type: "empty", walls: [true, true, true, false] },
  { type: "empty", walls: [true, true, false, true], event: SPECIAL_ROOM_EVENT, specialRoom: { kind, used: false, discovered: false } }
]];
const forgeGrid = makeGrid(SPECIAL_ROOMS.FORGE);
assert.equal(applyFacilityRoom(forgeGrid, 23, { feats: fresh, run: {} }), true);
assert.equal(forgeGrid[0][1].specialRoom.kind, SPECIAL_ROOMS.COLD_FORGE);
const mirrorGrid = makeGrid(SPECIAL_ROOMS.MIRROR_HALL);
assert.equal(applyFacilityRoom(mirrorGrid, 28, { feats: fresh, run: {} }), true);
assert.equal(mirrorGrid[0][1].specialRoom.kind, SPECIAL_ROOMS.MIRROR_CAPTIVE);

const roomKindOnFloor = (floor, feats, facilities = null) => {
  initNewGame();
  state.feats = feats;
  if (facilities) state.facilities = facilities;
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "smith-hall-room-test";
  state.maps = [];
  state.visitedMaps = [];
  state.floor = floor;
  state._freshRunFloor = floor;
  return ensureRunFloor(state, floor).flat().find(cell => cell.specialRoom)?.specialRoom.kind || null;
};
assert.equal(roomKindOnFloor(23, createDefaultFeatsState()), SPECIAL_ROOMS.COLD_FORGE);
assert.equal(roomKindOnFloor(22, createDefaultFeatsState()), SPECIAL_ROOMS.FORGE);
assert.equal(roomKindOnFloor(28, createDefaultFeatsState()), SPECIAL_ROOMS.MIRROR_CAPTIVE);
assert.equal(roomKindOnFloor(27, createDefaultFeatsState()), SPECIAL_ROOMS.MIRROR_HALL);

const bothHome = settleRunFeats(fresh, { startFloor: 1, deepestFloor: 4, companions: ["smith", "chamberlain"] }, "retreat", 9);
assert.equal(isFacilityOpen(bothHome.feats, "smithy"), true);
assert.equal(isFacilityOpen(bothHome.feats, "audience_hall"), true);
const everyone = settleRunFeats(fresh, {
  startFloor: 1,
  deepestFloor: 4,
  companions: ["foreman", "priest", "weaver", "scribe", "smith", "chamberlain"]
}, "retreat", 9);
assert.deepEqual(listTownFacilities(everyone.feats).map(entry => entry.open), [true, true, true, true, true, true],
  "with everyone home the town shows all six facilities and no silhouette");
console.log("[PASS] the smith and the chamberlain complete one facility per band");

// --- New feats ----------------------------------------------------------------------------

assert.deepEqual(
  ["depth_25", "guardian_25", "guardian_30"].map(id => [FEAT_BY_ID.get(id).chain, FEAT_BY_ID.get(id).metric.target]),
  [["depth", 25], ["guardian", 25], ["guardian", 30]]
);
assert.equal(getFeatProgress(FEAT_BY_ID.get("depth_25"), { bestDepth: 25 }).done, true);
FACILITIES.forEach(facility => facility.nodes.forEach(node => {
  if (node.requiresFeat) assert.ok(FEAT_BY_ID.has(node.requiresFeat), `${node.id} names an existing feat`);
}));

// --- The smith's forge ----------------------------------------------------------------------

const withFeats = (feats, ids) => normalizeFeatsState({
  ...feats,
  completed: { ...feats.completed, ...Object.fromEntries(ids.map(id => [id, { runNumber: 9 }])) }
});
const open = withFeats(createDefaultFeatsState(), ["smith_rescue", "chamberlain_rescue"]);
const rich = { "鉄片": 40, "黒角": 40, "竜鱗": 40, "霊粉": 40, "魔石片": 40 };
const context = (feats, facilities) => ({ feats, facilities, metaMaterials: rich });
assert.match(getFacilityNodeBlockReason("smith_forge", context(open, null)), /^条件：偉業「竜火をくぐる」/);
const depth25 = withFeats(open, ["depth_25"]);
const forgeNode = purchaseFacilityNode("smith_forge", context(depth25, null));
assert.equal(forgeNode.ok, true);
assert.match(getFacilityNodeBlockReason("smith_reforge", context(depth25, forgeNode.facilities)), /^条件：偉業「鍛造殿の主を倒す」/);
assert.equal(purchaseFacilityNode("smith_reforge", context(withFeats(depth25, ["guardian_25"]), forgeNode.facilities)).ok, true);
assert.equal(getFacilityRoomKind(23, { feats: depth25, run: {}, facilities: forgeNode.facilities }), SPECIAL_ROOMS.SMITH_FORGE);
assert.equal(roomKindOnFloor(23, depth25, forgeNode.facilities), SPECIAL_ROOMS.SMITH_FORGE);
assert.ok(getSpecialRoomInfo(SPECIAL_ROOMS.SMITH_FORGE).name);

assert.deepEqual([FORGE_TEMPER_BATTLES, SMITH_TEMPER_BATTLES], [3, 5]);
const tempered = createStartingKitCharacter("vanguard");
assert.deepEqual(applyForgeTemper(tempered, 10), { bonus: 2, battles: 3 }, "the plain forge is unchanged");
assert.deepEqual(applyForgeTemper(tempered, 10, SMITH_TEMPER_BATTLES), { bonus: 2, battles: 5 });
assert.deepEqual([1, 2, 3, 4, 5].map(() => startForgeTemperBattle(tempered)), ["active", "active", "active", "active", "active"]);
assert.equal(startForgeTemperBattle(tempered), "cooled");

assert.deepEqual([REFORGE_MATERIAL_COST, REFORGE_MAX_LEVEL], [4, 6]);
assert.equal(getReforgedLevel("SHORT_SWORD"), 1, "a plain starting weapon becomes +1");
assert.equal(getReforgedLevel({ baseId: "SHORT_SWORD", enhanceLevel: 5 }), 6, "one grade past what a find can carry");
assert.equal(getReforgedLevel({ baseId: "SHORT_SWORD", enhanceLevel: 6 }), null);
console.log("[PASS] the smith's forge tempers for five battles and reforges up to +6");

// --- The oath altar ---------------------------------------------------------------------------

assert.match(getFacilityNodeBlockReason("hall_oath", context(open, null)), /^条件：偉業「深淵の玉座」/);
const depth30 = withFeats(open, ["depth_30"]);
const oathNode = purchaseFacilityNode("hall_oath", context(depth30, null));
assert.equal(oathNode.ok, true);
assert.match(getFacilityNodeBlockReason("hall_gallery", context(depth30, oathNode.facilities)), /^条件：偉業「玉座の主を倒す」/);
assert.equal(purchaseFacilityNode("hall_gallery", context(withFeats(depth30, ["guardian_30"]), oathNode.facilities)).ok, true);
assert.equal(getFacilityRoomKind(28, { feats: depth30, run: {}, facilities: oathNode.facilities }), SPECIAL_ROOMS.OATH_ALTAR);
assert.equal(roomKindOnFloor(28, depth30, oathNode.facilities), SPECIAL_ROOMS.OATH_ALTAR);

// The stake shown during the run: under an oath a death keeps nothing.
assert.deepEqual(getRunMaterialStake({ "鉄片": 10 }, false), { currentTotal: 10, deathLoss: 7 });
assert.deepEqual(getRunMaterialStake({ "鉄片": 10 }, true), { currentTotal: 10, deathLoss: 10 });

const endRun = (reason, { oath, offered = {} }) => {
  initNewGame();
  state.feats = withFeats(createDefaultFeatsState(), [...FEAT_BY_ID.keys()]);
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.startingKit = "vanguard";
  state.currentRun.materials = { "鉄片": 10 };
  state.currentRun.offeredMaterials = { ...offered };
  state.currentRun.oath = oath;
  state.floor = 29;
  state.gameState = "explore";
  if (reason === "gameover") state.party[0].hp = 0;
  const run = state.currentRun;
  triggerRunResult(reason);
  return run;
};
const plainDeath = endRun("gameover", { oath: false });
assert.equal(state.metaMaterials["鉄片"], 3, "without an oath a death keeps 30%");
assert.equal(getFeatResultRows(null, plainDeath).some(row => row.id === "oath"), false);
const brokenByDeath = endRun("gameover", { oath: true });
assert.equal(state.metaMaterials["鉄片"] || 0, 0, "a broken oath keeps nothing");
assert.equal(brokenByDeath.bankedMaterials["鉄片"], 0);
assert.deepEqual(getFeatResultRows(null, brokenByDeath).find(row => row.id === "oath"), {
  id: "oath", status: "誓約", completed: false, failed: true, name: "誓約は破れた", detail: "手持ちの素材は街に残らなかった"
});
assert.match(getEvaluationText(brokenByDeath, false), /で力尽きた。誓約により、手持ちの素材は残らなかった。$/);
endRun("abandon", { oath: true });
assert.equal(state.metaMaterials["鉄片"] || 0, 0, "abandoning breaks the oath too");
const offeredThenDied = endRun("gameover", { oath: true, offered: { "鉄片": 6 } });
assert.equal(state.metaMaterials["鉄片"], 6, "what an offering already sent home is not part of the oath");
assert.equal(offeredThenDied.bankedMaterials["鉄片"], 6);
const kept = endRun("milestone_portal", { oath: true });
assert.equal(state.metaMaterials["鉄片"], 10, "a safe return under an oath banks everything");
assert.deepEqual(getFeatResultRows(null, kept).find(row => row.id === "oath"), {
  id: "oath", status: "誓約", completed: true, failed: false, name: "誓約を果たした", detail: "素材をすべて持ち帰った"
});
assert.match(getEvaluationText(kept, true), /から帰還した。$/);
console.log("[PASS] an oath banks nothing on a death or an abandoned run and everything on a safe return");

// --- The mirror gallery -------------------------------------------------------------------------

assert.equal(GALLERY_VISION_FLOORS, 2);
const roomGrid = room => [[{ type: "empty", walls: [true, true, true, true], event: SPECIAL_ROOM_EVENT, specialRoom: room }]];
const oathMirror = { kind: SPECIAL_ROOMS.OATH_ALTAR, used: true, discovered: true, vision: 1 };
assert.equal(hasMirrorVisionFor(roomGrid(oathMirror)), true);
assert.equal(hasMirrorVisionFor(roomGrid(oathMirror), 2), false, "the plain mirror shows one floor");
const gallery = { kind: SPECIAL_ROOMS.OATH_ALTAR, used: true, discovered: true, vision: 2 };
assert.equal(hasMirrorVisionFor(roomGrid(gallery)), true);
assert.equal(hasMirrorVisionFor(roomGrid(gallery), 2), true);
assert.equal(hasMirrorVisionFor(roomGrid(gallery), 3), false);
assert.equal(hasMirrorVisionFor(roomGrid({ kind: SPECIAL_ROOMS.OATH_ALTAR, used: true, discovered: true }), 1), false,
  "an oath sworn at the altar shows no floor");
assert.equal(hasMirrorVisionFor(roomGrid({ kind: SPECIAL_ROOMS.MIRROR_HALL, used: true, discovered: true }), 2), false);

// On real floors: a gallery vision on B22F marks the stairs of B23F and B24F only.
const stairsShown = floor => {
  let shown = false;
  state.maps[floor - 1].forEach((row, y) => row.forEach((cell, x) => {
    if (cell.type === "stairs-down") shown = Boolean(state.visitedMaps[floor - 1][y][x]);
  }));
  return shown;
};
const lookAhead = vision => {
  initNewGame();
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "gallery-vision-test";
  state.maps = [];
  state.visitedMaps = [];
  state.floor = 21;
  state._freshRunFloor = 21;
  ensureRunFloor(state, 21);
  const room = ensureRunFloor(state, 22).flat().find(cell => cell.specialRoom).specialRoom;
  room.used = true;
  room.vision = vision;
  [23, 24, 25].forEach(floor => ensureRunFloor(state, floor));
  return [23, 24, 25].map(stairsShown);
};
assert.deepEqual(lookAhead(2), [true, true, false]);
assert.deepEqual(lookAhead(1), [true, false, false]);
assert.deepEqual(lookAhead(undefined), [false, false, false], "a room spent on something else shows nothing");
// A vision granted before the floors exist is applied when they are entered;
// applying it again changes nothing.
assert.equal(applyMirrorVision(state, 23), 0);
console.log("[PASS] the mirror gallery reaches two floors ahead and the plain mirror one");

// --- Orders ---------------------------------------------------------------------------------------

const guardPotion = placeFacilityOrder("smith_guard_potion", context(open, null));
assert.deepEqual(guardPotion.facilities.orders.smithy.items, ["GUARD_POTION", "GUARD_POTION"]);
const wing = FACILITY_BY_ID.get("audience_hall").orders[0];
const wingRecipe = CRAFT_RECIPES.find(recipe => recipe.resultId === "TOWN_PORTAL");
assert.deepEqual(wing.yields, ["TOWN_PORTAL"]);
assert.equal(Object.values(wing.cost).reduce((sum, quantity) => sum + quantity, 0) * 2, wingRecipe.departureCost.total,
  "the wing order costs half the number of materials departure craft takes");

// --- Save round trip -----------------------------------------------------------------------------

initNewGame();
state.party = [createStartingKitCharacter("vanguard")];
state.currentRun = createDefaultCurrentRun();
state.currentRun.startingKit = "vanguard";
state.currentRun.companions = ["smith", "chamberlain"];
state.currentRun.oath = true;
state.gameState = "explore";
const reloaded = normalizeSavePayload(JSON.parse(JSON.stringify(createSavePayload())));
assert.deepEqual(reloaded.currentRun.companions, ["smith", "chamberlain"]);
assert.equal(reloaded.currentRun.oath, true, "a sworn oath survives a reload");
assert.equal(isNormalizedCurrentRun(reloaded.currentRun), true);
const legacy = JSON.parse(JSON.stringify(createSavePayload()));
delete legacy.currentRun.oath;
assert.equal(normalizeSavePayload(legacy).currentRun.oath, false, "a save from before the oath has none");
console.log("[PASS] the oath and both escorts survive a save round trip");

// --- The kits ----------------------------------------------------------------------------------

const kitNodes = purchaseFacilityNode("hall_kit", context(open,
  purchaseFacilityNode("smith_kit", context(open, null)).facilities));
assert.deepEqual(["ironclad", "ceremonial"].map(isStartingKitId), [true, true]);
assert.deepEqual(
  getAvailableStartingKits(kitNodes.facilities).map(kit => kit.id).filter(id => ["ironclad", "ceremonial"].includes(id)),
  ["ironclad", "ceremonial"]
);
const ironclad = createStartingKitCharacter("ironclad");
assert.deepEqual([ironclad.equipment.weapon, ironclad.equipment.shield, ironclad.equipment.armor], ["DAGGER", null, "PLATE_MAIL"]);
assert.deepEqual(getStartingKit("ironclad").items, ["GUARD_POTION"]);
const ceremonial = createStartingKitCharacter("ceremonial");
assert.deepEqual(
  [ceremonial.equipment.weapon, ceremonial.equipment.shield, ceremonial.equipment.armor],
  ["MACE", "LARGE_SHIELD", "ROBE"]
);
assert.deepEqual(getStartingKit("ceremonial").items || [], []);
// Every kit a facility sells exists, and no two kits start with the same equipment.
const kitIds = FACILITIES.flatMap(facility => facility.nodes.map(node => node.grants.startingKit).filter(Boolean));
assert.equal(kitIds.length, FACILITIES.length, "one kit per facility");
kitIds.forEach(kitId => assert.ok(getStartingKit(kitId), `${kitId} exists`));
const gearSets = getAvailableStartingKits({ nodes: FACILITIES.flatMap(facility => facility.nodes.map(node => node.id)) })
  .map(kit => [...kit.gear].sort().join("+"));
assert.equal(new Set(gearSets).size, gearSets.length, "every kit starts with different equipment");
assert.equal(gearSets.length, 10);
console.log("[PASS] the ironclad and ceremonial kits join the choices and all ten kits differ");
