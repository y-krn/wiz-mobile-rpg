// Dungeons (#2060): a run is one five-floor dungeon chosen in the town.
// Strength and reward follow the floor inside the dungeon, a dungeon opens
// when the one before it is cleared by a run that came home, and an old save
// keeps what it had.
import { strict as assert } from "node:assert";
import { DUNGEONS, DUNGEON_FLOOR_COUNT } from "../../../src/data/dungeons.js";
import { BIOMES } from "../../../src/data/biomes.js";
import { MONSTERS } from "../../../src/data/monsters.js";
import {
  formatDungeonFloor,
  formatFloorCode,
  getDungeonBottomFloor,
  getDungeonEntryFloor,
  getDungeonFloor,
  getDungeonForFloor,
  getDungeonIndexForFloor,
  getDungeonStrength,
  getEnemyStrength,
  getOpenEntryFloors,
  isDungeonBottomFloor,
  isDungeonEntryFloor,
  isDungeonOpen
} from "../../../src/rules/dungeons.js";
import {
  getDungeonOpenedByClearing,
  getDungeonOpener,
  listDungeons,
  settleDungeonClears
} from "../../../src/systems/dungeon_progress.js";
import { scaleEnemyForDepth } from "../../../src/rules/depth_scaling.js";
import {
  applyPhase4cV1EnemyBaseline,
  phase4cV1EnemyBand,
  resolvePhase4cV1Baseline
} from "../../../src/rules/phase4c_v1_trial.js";
import { calculatePhase4jBExpAward } from "../../../src/rules/phase4j_b_trial.js";
import { determineMonsterDrop } from "../../../src/combat_logic/drops.js";
import { generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { rollChestEncounter } from "../../../src/chest/chest_domain.js";
import { calculateSecretDoorSearchChance } from "../../../src/rules/exploration_rules.js";
import { calculateDisarmRate } from "../../../src/rules/trap_rules.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { createFloorElite } from "../../../src/systems/roaming_elites.js";
import { recordMilestoneVictory } from "../../../src/state/run_state.js";
import { normalizeLastPreparation } from "../../../src/state/last_preparation.js";
import { describeDroppedPreparation, resolveLastPreparation } from "../../../src/systems/departure_preparation.js";
import { getFloorLabel } from "../../../src/data/floor_themes.js";
import { formatFeatProgress, getFeatProgress } from "../../../src/systems/feats.js";
import { FEAT_BY_ID } from "../../../src/data/feats.js";
import { buildDeathNearMiss } from "../../../src/rules/near_miss.js";
import { createRng } from "../../../src/seed_rng.js";

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

const template = name => MONSTERS.find(monster => monster.name === name);

check("a running floor number names a dungeon and a floor inside it", () => {
  assert.equal(DUNGEON_FLOOR_COUNT, 5);
  assert.deepEqual(DUNGEONS.map(dungeon => dungeon.id), BIOMES.map(biome => biome.id));
  assert.deepEqual([1, 5, 6, 10, 11, 30].map(getDungeonIndexForFloor), [0, 0, 1, 1, 2, 5]);
  assert.deepEqual([1, 5, 6, 10, 11, 30].map(getDungeonFloor), [1, 5, 1, 5, 1, 5]);
  assert.deepEqual([0, 1, 5].map(getDungeonEntryFloor), [1, 6, 26]);
  assert.deepEqual([0, 1, 5].map(getDungeonBottomFloor), [5, 10, 30]);
  assert.deepEqual([1, 2, 5, 6].map(isDungeonEntryFloor), [true, false, false, true]);
  assert.deepEqual([4, 5, 6, 10].map(isDungeonBottomFloor), [false, true, false, true]);
  assert.equal(getDungeonForFloor(7).id, "forgotten_catacomb");
  // Bad input falls back to the first floor instead of naming no dungeon.
  assert.equal(getDungeonFloor(undefined), 1);
  assert.equal(isDungeonEntryFloor(1.5), false);
});

check("floors are shown as the floor inside the dungeon", () => {
  assert.equal(formatFloorCode(3), "B3F");
  assert.equal(formatFloorCode(8), "B3F");
  assert.equal(formatDungeonFloor(3), "坑道 B3F");
  assert.equal(formatDungeonFloor(8), "地下墓地 B3F");
  // A record with no floor is not shown as the first floor of the mine.
  assert.equal(formatDungeonFloor(0), "未記録");
  assert.equal(formatDungeonFloor(undefined), "未記録");
  const visited = { dungeonMemory: { visitedFloors: [1, 8] } };
  assert.equal(getFloorLabel(visited, 8), "忘れられた地下墓地（地下3階）");
});

check("only the mine and the catacomb can be entered, and the catacomb opens with the mine", () => {
  assert.deepEqual(DUNGEONS.filter(dungeon => dungeon.built).map(dungeon => dungeon.id),
    ["collapsed_mine", "forgotten_catacomb"]);
  assert.equal(isDungeonOpen(0, []), true);
  assert.equal(isDungeonOpen(1, []), false);
  assert.equal(isDungeonOpen(1, [5]), true);
  // A dungeon that is not built stays closed whatever has been cleared.
  assert.equal(isDungeonOpen(2, [5, 10]), false);
  assert.deepEqual(getOpenEntryFloors([]), [1]);
  assert.deepEqual(getOpenEntryFloors([5, 10]), [1, 6]);
  assert.equal(getDungeonOpener(0), null);
  assert.equal(getDungeonOpener(1).id, "collapsed_mine");

  const fresh = listDungeons({ unlockedMilestones: [] });
  assert.deepEqual(fresh.map(dungeon => dungeon.open), [true, false, false, false, false, false]);
  assert.equal(fresh[0].cleared, false);
  const cleared = listDungeons({ unlockedMilestones: [5] });
  assert.deepEqual(cleared.map(dungeon => dungeon.open), [true, true, false, false, false, false]);
  assert.equal(cleared[0].cleared, true);
});

check("beating the guardian does not open the next dungeon; coming home does", () => {
  const state = { unlockedMilestones: [], currentRun: { defeatedMilestones: [] } };
  assert.equal(getDungeonOpenedByClearing(state, 5).id, "forgotten_catacomb");
  assert.equal(getDungeonOpenedByClearing(state, 4), null);
  assert.deepEqual(recordMilestoneVictory(state, 5), { ok: true, unlocked: true });
  assert.deepEqual(state.currentRun.defeatedMilestones, [5]);
  assert.deepEqual(state.unlockedMilestones, [], "nothing is saved at the guardian");

  assert.deepEqual(settleDungeonClears(state, state.currentRun), ["forgotten_catacomb"]);
  assert.deepEqual(state.unlockedMilestones, [5]);
  // Clearing it again opens nothing new, and nothing more waits behind it.
  assert.deepEqual(recordMilestoneVictory(state, 5), { ok: true, unlocked: false });
  assert.deepEqual(settleDungeonClears(state, state.currentRun), []);
  assert.equal(getDungeonOpenedByClearing(state, 5), null);

  // The catacomb is recorded as cleared; the dungeon after it is not built.
  const second = { unlockedMilestones: [5] };
  assert.deepEqual(settleDungeonClears(second, { defeatedMilestones: [10] }), []);
  assert.deepEqual(second.unlockedMilestones, [5, 10]);
  assert.equal(getDungeonOpenedByClearing(second, 10), null);
});

check("a run that did not beat the guardian, or left the treasure, clears nothing", () => {
  const noGuardian = { unlockedMilestones: [] };
  assert.deepEqual(settleDungeonClears(noGuardian, { defeatedMilestones: [] }), []);
  assert.deepEqual(noGuardian.unlockedMilestones, []);

  // Round-trip rule: the dungeon is cleared only by carrying the treasure out.
  const leftBehind = { unlockedMilestones: [] };
  assert.deepEqual(settleDungeonClears(leftBehind, { defeatedMilestones: [5], roundTrip: { treasure: false } }), []);
  assert.deepEqual(leftBehind.unlockedMilestones, []);
  const carried = { unlockedMilestones: [] };
  assert.deepEqual(settleDungeonClears(carried, { defeatedMilestones: [5], roundTrip: { treasure: true } }),
    ["forgotten_catacomb"]);
});

check("an old save keeps what it had: a guardian it beat is a dungeon it cleared", () => {
  const oldSave = { unlockedMilestones: [5, 10] };
  assert.deepEqual(listDungeons(oldSave).filter(dungeon => dungeon.open).map(dungeon => dungeon.id),
    ["collapsed_mine", "forgotten_catacomb"]);
  // A remembered start on a guardian's floor is no longer a start.
  const base = { kitId: "vanguard", startingGear: null, recipeIds: [], roundTrip: false };
  assert.equal(normalizeLastPreparation({ ...base, startFloor: 5 }).startFloor, 1);
  assert.equal(normalizeLastPreparation({ ...base, startFloor: 10 }).startFloor, 1);
  assert.equal(normalizeLastPreparation({ ...base, startFloor: 6 }).startFloor, 6);
});

check("the last preparation repeats a dungeon only while it is open", () => {
  const base = { kitId: "vanguard", startingGear: null, recipeIds: [], roundTrip: false };
  const context = { workshop: { ranks: {} }, metaMaterials: {}, storage: {}, facilities: {} };
  const open = resolveLastPreparation({ ...base, startFloor: 6 }, { ...context, unlockedMilestones: [5] });
  assert.equal(open.startFloor, 6);
  assert.equal(open.canRepeat, true);
  const closed = resolveLastPreparation({ ...base, startFloor: 6 }, { ...context, unlockedMilestones: [] });
  assert.equal(closed.canRepeat, false);
  assert.equal(closed.startFloor, 1, "with one dungeon open it falls back to that one");
  assert.deepEqual(describeDroppedPreparation(closed.dropped), ["行き先「忘れられた地下墓地」（今は入れない）"]);
});

check("the mine plays as before, and every dungeon starts at the same strength", () => {
  assert.deepEqual(getDungeonStrength(3), {
    enemyHp: 1, enemyAtk: 1, enemyDef: 1, entry: 1,
    eliteHp: 1, eliteAtk: 1, eliteDef: 1,
    guardianHp: 1, guardianAtk: 1, guardianDef: 1
  });
  // The band that scales enemies is counted inside the dungeon.
  assert.deepEqual([1, 4, 5, 6, 9, 10].map(phase4cV1EnemyBand), [0, 0, 1, 0, 0, 1]);

  // The same monster on the first floor of the catacomb is the mine's first
  // floor times the catacomb's multipliers, not five floors stronger.
  const zombie = template("ゾンビ");
  const strength = getDungeonStrength(6);
  // Its first floor is eased once more, for an adventurer with only a kit.
  const [atEntry] = [scaleEnemyForDepth(zombie, 6)];
  applyPhase4cV1EnemyBaseline([atEntry], 6);
  assert.equal(atEntry.maxHp, Math.round(zombie.hp * strength.enemyHp * strength.entry));
  assert.equal(atEntry.atk, Math.round(zombie.atk * strength.enemyAtk * strength.entry));
  assert.equal(atEntry.def, Math.round(zombie.def * strength.enemyDef));
  const [onSecond] = [scaleEnemyForDepth(zombie, 7)];
  applyPhase4cV1EnemyBaseline([onSecond], 7);
  assert.equal(onSecond.maxHp, Math.round(zombie.hp * strength.enemyHp));
  assert.equal(onSecond.atk, Math.round(zombie.atk * strength.enemyAtk));
  assert.ok(atEntry.maxHp < onSecond.maxHp && onSecond.maxHp < zombie.hp,
    "the catacomb is scaled down for a fresh adventurer, its first floor most");

  // The roaming strong enemy has its own multipliers: it keeps the HP and
  // attack it was authored with, whichever body wears them.
  const keeper = template("墓守の巨躯");
  const roaming = scaleEnemyForDepth(keeper, 8);
  applyPhase4cV1EnemyBaseline([roaming], 8);
  assert.equal(roaming.maxHp, Math.round(keeper.hp * strength.eliteHp));
  assert.equal(roaming.atk, Math.round(keeper.atk * strength.eliteAtk));
  assert.equal(roaming.def, Math.round(keeper.def * strength.eliteDef));
  assert.deepEqual(getEnemyStrength(8, "墓守の巨躯"), { hp: strength.eliteHp, atk: strength.eliteAtk, def: strength.eliteDef });
  assert.deepEqual(getEnemyStrength(8, "ゾンビ"), { hp: strength.enemyHp, atk: strength.enemyAtk, def: strength.enemyDef });
  assert.deepEqual(getEnemyStrength(6, "ゾンビ"),
    { hp: strength.enemyHp * strength.entry, atk: strength.enemyAtk * strength.entry, def: strength.enemyDef });
  assert.deepEqual(getEnemyStrength(10, "ストーンガード", { boss: true }),
    { hp: strength.guardianHp, atk: strength.guardianAtk, def: strength.guardianDef });

  // A mine monster is untouched on every floor of the mine.
  const slime = template("マッドスライム");
  const mine = scaleEnemyForDepth(slime, 3);
  applyPhase4cV1EnemyBaseline([mine], 3);
  assert.equal(mine.maxHp, slime.hp);
  assert.equal(mine.atk, slime.atk);
  assert.equal(mine.def, slime.def);
});

check("a fresh adventurer starts every dungeon without the guardian bonus", () => {
  assert.equal(resolvePhase4cV1Baseline({ startFloor: 1, defeatedMilestones: [] }), 0);
  assert.equal(resolvePhase4cV1Baseline({ startFloor: 6, defeatedMilestones: [] }), 0);
  assert.equal(resolvePhase4cV1Baseline({ startFloor: 6, defeatedMilestones: [10] }), 1);
  assert.equal(resolvePhase4cV1Baseline({ startFloor: 1, defeatedMilestones: [5] }), 1);
});

check("experience, materials, search, and traps follow the floor inside the dungeon", () => {
  const monsters = [template("ゾンビ"), template("ゾンビ")];
  assert.equal(
    calculatePhase4jBExpAward({ floor: 8, kind: "elite", monsters }),
    calculatePhase4jBExpAward({ floor: 3, kind: "elite", monsters })
  );

  // Same roll, same amount: floor 8 pays like floor 3, and entering a dungeon
  // at its first floor is not a reduced-material start.
  const beast = { name: "かみつき蟲", tags: ["beast"] };
  const dropAt = (floor, startFloor) => determineMonsterDrop(beast, floor, createRng("drop"), { guaranteed: true, startFloor });
  assert.deepEqual(dropAt(8, 6), dropAt(3, 1));

  assert.equal(calculateSecretDoorSearchChance({ floor: 8 }), calculateSecretDoorSearchChance({ floor: 3 }));
  assert.equal(calculateDisarmRate({ floor: 8 }), calculateDisarmRate({ floor: 3 }));
});

check("equipment and chests are drawn from the table of the floor inside the dungeon", () => {
  const options = { rng: createRng("gear"), party: [] };
  const deep = generateRandomEquipment(8, { ...options, rng: createRng("gear") });
  const shallow = generateRandomEquipment(3, { ...options, rng: createRng("gear") });
  assert.equal(deep.level, 3);
  assert.deepEqual(deep, shallow);

  // A first-floor chest has no trap in any dungeon.
  for (let i = 0; i < 20; i++) {
    const chest = rollChestEncounter({ floor: 6, x: i, y: 1, seed: "chest-seed" });
    assert.equal(chest.trap, "none");
  }
});

check("the first floor of a dungeon is generated as an entrance", () => {
  const entry = generateRunFloor({ runSeed: "DUNGEON-ENTRY", floor: 6 });
  const cells = entry.grid.flat();
  assert.equal(cells.find(cell => cell.type === "stairs-up").message, "【上り階段】街へ戻る階段です。");
  assert.equal(entry.biomeId, "forgotten_catacomb");
  // Trap difficulty restarts with the dungeon.
  const mineEntry = generateRunFloor({ runSeed: "DUNGEON-ENTRY", floor: 1 });
  const hardest = grid => Math.max(...grid.flat().filter(cell => cell.trap).map(cell => cell.trap.difficulty));
  assert.ok(Math.abs(hardest(entry.grid) - hardest(mineEntry.grid)) <= 10);
  const bottom = generateRunFloor({ runSeed: "DUNGEON-ENTRY", floor: 10 });
  assert.equal(bottom.grid.flat().find(cell => cell.type === "stairs-up").message, "【上り階段】地下4階へ戻る階段です。");
});

check("a roaming strong enemy appears from the third floor of any dungeon", () => {
  const floor = generateRunFloor({ runSeed: "ELITE", floor: 7 });
  assert.equal(createFloorElite({ runSeed: "ELITE", floor: 7, mapData: floor }), null);
  assert.equal(createFloorElite({ runSeed: "ELITE", floor: 2, mapData: floor }), null);
});

check("feats and near misses name the dungeon", () => {
  assert.equal(FEAT_BY_ID.get("depth_10").condition, "忘れられた地下墓地のB5Fに到達する");
  assert.equal(FEAT_BY_ID.get("guardian_10").condition, "忘れられた地下墓地の階層守護者を倒す");
  const depth10 = FEAT_BY_ID.get("depth_10");
  assert.equal(formatFeatProgress(depth10, { current: 5, target: 10 }), "未到達 / 地下墓地 B5F");
  assert.equal(formatFeatProgress(depth10, { current: 7, target: 10 }), "B2F / 地下墓地 B5F");
  // Inside that dungeon the HUD does not repeat its name.
  assert.equal(formatFeatProgress(depth10, { current: 7, target: 10 }, null, { insideFloor: 8 }), "B2F / B5F");
  assert.equal(formatFeatProgress(depth10, { current: 5, target: 10 }, null, { insideFloor: 3 }), "未到達 / 地下墓地 B5F");

  // Reaching the bottom of the mine is no progress toward the catacomb's.
  assert.deepEqual(getFeatProgress(depth10, { bestDepth: 5 }), { current: 0, target: 10, ratio: 0, done: false });
  assert.deepEqual(getFeatProgress(depth10, { bestDepth: 7 }), { current: 7, target: 10, ratio: 0.4, done: false });
  assert.deepEqual(getFeatProgress(depth10, { bestDepth: 10 }), { current: 10, target: 10, ratio: 1, done: true });

  // A record in another dungeon is no distance from this run.
  const other = buildDeathNearMiss({ floor: 3, deepestFloor: 3, previousBestFloor: 8 });
  assert.equal(other?.bestDepth ?? null, null);
  const same = buildDeathNearMiss({ floor: 3, deepestFloor: 3, previousBestFloor: 5 });
  assert.deepEqual(same.bestDepth, { best: 5, gap: 2 });
});

if (failures > 0) {
  console.error(`${failures} dungeon check(s) failed`);
  process.exit(1);
}
console.log("dungeon checks passed");
