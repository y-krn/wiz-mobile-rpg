import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  CHEST_ITEM_CANDIDATES_BY_FLOOR,
  CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP,
  CHEST_SPECIAL_REWARD_CHANCE_BY_FLOOR,
  rollChestReward,
  rollChestSpecialReward
} from "../../../src/rules/chest_rules.js";

const makeElement = () => ({
  style: {
    setProperty() {},
    removeProperty() {}
  },
  className: "",
  classList: {
    add() {},
    remove() {},
    toggle() {},
    contains() { return false; }
  },
  children: [],
  innerHTML: "",
  textContent: "",
  appendChild(child) { this.children.push(child); },
  replaceChildren(...children) { this.children = children; },
  addEventListener() {},
  removeEventListener() {},
  setAttribute() {},
  getAttribute() { return null; },
  removeAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  closest() { return null; },
  getContext() { return {}; }
});

const elements = new Map();
global.document = {
  activeElement: null,
  documentElement: makeElement(),
  body: makeElement(),
  addEventListener() {},
  removeEventListener() {},
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  },
  createElement: makeElement,
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
global.window = { innerWidth: 390, innerHeight: 844 };
global.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};

const { state, createDefaultCodex, createDefaultCurrentRun, createSoloCharacter } =
  await import("../../../src/state.js");
const { setupChestState, openChestDirectly, smashChest } = await import("../../../src/chest.js");

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("Return Wing is absent from every ordinary chest candidate pool", () => {
  Object.values(CHEST_ITEM_CANDIDATES_BY_FLOOR).forEach(candidates => {
    assert.equal(candidates.includes("TOWN_PORTAL"), false);
  });
});

check("special reward chance is explicit by floor", () => {
  assert.deepEqual(CHEST_SPECIAL_REWARD_CHANCE_BY_FLOOR, {
    1: 0,
    2: 0.02,
    3: 0.02,
    4: 0,
    5: 0.04
  });
  assert.equal(rollChestSpecialReward(2, () => 0.019), "TOWN_PORTAL");
  assert.equal(rollChestSpecialReward(2, () => 0.02), null);
  assert.equal(rollChestSpecialReward(4, () => 0), null);
});

check("special roll does not replace an ordinary main reward", () => {
  const reward = rollChestReward({
    floor: 2,
    rng: (() => {
      const values = [0, 0, 0];
      return () => values.shift() ?? 0;
    })(),
    party: [],
    currentRun: { b1ChestsOpened: 0, b1EquipFound: 1, chestsOpened: 0, equipmentFound: [] },
    trap: "none",
    firstChestGuaranteed: true
  });
  assert.ok(reward.item, "ordinary reward should still be present");
  assert.notEqual(reward.item, "TOWN_PORTAL");
  assert.equal(rollChestSpecialReward(2, () => 0.01), "TOWN_PORTAL");
});

function makeMap() {
  return Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({
    walls: [false, false, false, false],
    event: null
  })));
}

function prepareLiveChest(inventory = []) {
  state.floor = 2;
  state.x = 1;
  state.y = 1;
  state.maps[1] = makeMap();
  state.maps[1][1][1].event = "chest";
  state.party = [createSoloCharacter("Fighter")];
  state.inventory = [...inventory];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.startFloor = 1;
  state.codex = createDefaultCodex();
  state.firstChestUnidentifiedGuaranteed = false;
  state.floorChestsOpened = [0, 0, 0, 0, 0];
  state.logs = [];
  state.chestState = null;
  state.gameState = "explore";
  state.transitioning = false;
  state.seed = "RETURN-WING-SCRATCH";
}

async function liveCheck(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

await liveCheck("live setup/opening keeps main and special rewards together", async () => {
  prepareLiveChest();
  setupChestState("none", null, null, () => 0);
  const mainItem = state.chestState.item;
  assert.ok(mainItem, "setup should create an ordinary main reward");
  assert.equal(state.chestState.specialItem, "TOWN_PORTAL");

  openChestDirectly(state.party[0], () => 0);

  assert.ok(state.inventory.includes(mainItem), "main reward should be awarded");
  assert.equal(state.inventory.filter(item => item === "TOWN_PORTAL").length, 1);
  assert.equal(state.chestState, null, "real chest opening should clear the chest state");
});

await liveCheck("live opening handles duplicate and full Return Wing inventory", async () => {
  prepareLiveChest(["TOWN_PORTAL"]);
  setupChestState("none", null, null, () => 0);
  openChestDirectly(state.party[0], () => 0);
  assert.equal(state.inventory.filter(item => item === "TOWN_PORTAL").length, 1);
  assert.ok(state.logs.includes("帰還の翼はすでに所持している。"));

  prepareLiveChest(Array.from({ length: 20 }, () => "ANTIDOTE"));
  setupChestState("none", null, null, () => 0);
  openChestDirectly(state.party[0], () => 0);
  assert.equal(state.inventory.length, 20, "full inventory should not overflow");
  assert.equal(state.inventory.includes("TOWN_PORTAL"), false);
  assert.ok(state.logs.includes("[!] バッグがいっぱいで [帰還の翼] を持ち帰れなかった！"));
});

await liveCheck("live smash path still resolves the trap and rewards", async () => {
  prepareLiveChest();
  setupChestState("poison needle", null, null, () => 0);
  assert.equal(smashChest(() => 0), true);
  assert.ok(state.currentRun.trapsTriggered > 0, "smash should trigger the chest trap");
  assert.equal(state.chestState, null, "smash should finish the real chest path");
});

await liveCheck("combat-generated reward chests keep their existing reward scope", async () => {
  prepareLiveChest();
  const rolls = [0, (20.5 / CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP[2].length), 1];
  setupChestState("none", null, null, () => rolls.shift() ?? 1, { fromDrop: true });
  assert.ok(state.chestState.item, "combat chest should still create its main reward");
  assert.equal(CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP[2][20], "TOWN_PORTAL");
  assert.equal(state.chestState.item, "TOWN_PORTAL");
  assert.equal(state.chestState.specialItem, null);
  openChestDirectly(state.party[0], () => 0);
  assert.equal(state.inventory.filter(item => item === "TOWN_PORTAL").length, 1);
});

await liveCheck("combat-generated Return Wing remains protected when smashed", async () => {
  prepareLiveChest();
  setupChestState("none", null, "TOWN_PORTAL", () => 0, { fromDrop: true });
  assert.equal(state.chestState.fromDrop, true);
  assert.equal(smashChest(() => 0), true);
  assert.equal(state.inventory.filter(item => item === "TOWN_PORTAL").length, 1);
  assert.equal(state.currentRun.itemsFound.includes("TOWN_PORTAL"), true);
});

check("real-run telemetry exposes acquisition, use, floor, HP band, and outcome fields", () => {
  const output = execFileSync(process.execPath, ["scratch/simulations/sim_depth_material_ev.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SIM_SKIP_PROVENANCE: "1",
      SIM_RETURN_WING_MODE: "special",
      SIM_RUNS: "1",
      SIM_CALIBRATION_RUNS: "1",
      SIM_SCENARIOS: "workshop-empty"
    },
    encoding: "utf8"
  });
  const line = output.split("\n").find(value => value.startsWith("ISSUE791_MEASUREMENT_JSON="));
  assert.ok(line, "issue measurement output should be present");
  const measurement = JSON.parse(line.slice("ISSUE791_MEASUREMENT_JSON=".length))[0];
  assert.deepEqual(measurement.baselinePortalCandidateIndices, {
    2: 20,
    3: 23,
    5: 15
  });
  [
    "chestPortalAcquisitions",
    "chestSpecialPortalAcquisitions",
    "mainRewardPortalReplacementsPerRun",
    "portalUsesPerRun",
    "portalUsesBySourcePerRun",
    "baselinePortalCandidateIndices",
    "portalUseFloorCounts",
    "portalUseHpBands",
    "survivalRate",
    "retreatRate",
    "deathRate",
    "outcomeCounts",
    "modeledMechanisms",
    "omittedMechanisms",
    "bankedMaterialEv",
    "b5ReachRate",
    "b10ReachRate",
    "equipmentPerRun"
  ].forEach(field => assert.ok(Object.hasOwn(measurement, field), `missing ${field}`));
  assert.deepEqual(
    Object.keys(measurement.outcomeCounts).sort(),
    ["abandon", "death", "retreat"]
  );
  assert.equal(
    measurement.retreatRate,
    measurement.outcomeCounts.retreat / measurement.runs
  );
  assert.equal(
    measurement.deathRate,
    measurement.outcomeCounts.death / measurement.runs
  );

  const issue697Line = output.split("\n").find(value => value.startsWith("ISSUE697_MEASUREMENT_JSON="));
  assert.ok(issue697Line, "Issue #697 measurement output should be present");
  const issue697 = JSON.parse(issue697Line.slice("ISSUE697_MEASUREMENT_JSON=".length))[0];
  assert.equal(issue697.retreatRate, issue697.outcomeCounts.retreat / issue697.runs);
  assert.equal(issue697.deathRate, issue697.outcomeCounts.death / issue697.runs);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} Return Wing special reward test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("[PASS] Return Wing special reward coverage");
}
