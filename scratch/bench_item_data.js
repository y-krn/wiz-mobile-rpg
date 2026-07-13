import inspector from "node:inspector";
import { performance } from "node:perf_hooks";

const elements = new Map();

class FakeElement {
  constructor() {
    this.children = [];
    this.classList = { add() {} };
    this.parentElement = null;
    this.style = {};
  }

  set id(value) {
    this._id = value;
    elements.set(value, this);
  }

  get id() {
    return this._id;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child) {
    return this.appendChild(child);
  }
}

globalThis.document = {
  createElement: () => new FakeElement(),
  getElementById: id => elements.get(id) || null
};

const root = new FakeElement();
const partyPanel = new FakeElement();
partyPanel.id = "party-panel";
root.appendChild(partyPanel);
const partyGrid = new FakeElement();
partyGrid.id = "party-grid";
partyPanel.appendChild(partyGrid);

const [{ getItemData }, { runCombatRoundCalculation }, { updatePartyHUD }, { state }] = await Promise.all([
  import("../src/rules/item_rules.js"),
  import("../src/combat_logic/round.js"),
  import("../src/ui/hud.js"),
  import("../src/state.js")
]);

function makeEquipment(baseId, affixType) {
  return {
    kind: "equipment",
    baseId,
    rarity: "rare",
    identified: true,
    enhanceLevel: 3,
    affixes: [
      { type: affixType, value: 4 },
      { type: "hp", value: 5 }
    ],
    inscription: { name: "耐毒", type: "poisonWard", value: 10 },
    tags: ["iron", "ward"]
  };
}

function makeChar(index) {
  return {
    name: `Bench${index}`,
    class: index === 3 ? "Mage" : "Fighter",
    level: 10,
    status: "ok",
    hp: 80,
    maxHp: 80,
    mp: 20,
    maxMp: 20,
    str: 15,
    int: 15,
    pie: 12,
    vit: 14,
    agi: 12,
    luk: 10,
    spells: [],
    equipment: {
      weapon: makeEquipment(index === 3 ? "WAND" : "LONG_SWORD", "agi"),
      shield: makeEquipment("SMALL_SHIELD", "firstStrike"),
      armor: makeEquipment(index === 3 ? "ROBE" : "LEATHER_ARMOR", "vit"),
      accessory: makeEquipment("AMULET_HP", "followUp")
    }
  };
}

const party = Array.from({ length: 4 }, (_, index) => makeChar(index));
const combatState = {
  party,
  inventory: [],
  combatState: {
    isAuto: false,
    monsters: [{
      name: "Benchmark Ogre",
      hp: 9999,
      maxHp: 9999,
      atk: 12,
      def: 8,
      status: "ok",
      row: "front",
      exp: 0,
      gold: 0
    }]
  },
  currentRun: null,
  codex: null,
  firstKills: [],
  roamingMonsters: [],
  floorChestsTotal: [0, 0, 0, 0, 0],
  openedGates: [],
  gold: 0,
  floor: 1,
  materials: {},
  identifyTickets: 0
};
const combatSelection = {
  actions: party.map((_, actorIdx) => ({ actorIdx, type: "defend" }))
};

function runCombatRound() {
  return runCombatRoundCalculation(combatState, combatSelection);
}

function renderPartyHud() {
  state.party = party;
  state.gameState = "explore";
  state.combatState = null;
  updatePartyHUD();
}

function post(session, method, params = {}) {
  return new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
  });
}

async function countGetItemDataCalls(run) {
  const session = new inspector.Session();
  session.connect();
  await post(session, "Profiler.enable");
  await post(session, "Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  run();
  const { result } = await post(session, "Profiler.takePreciseCoverage");
  await post(session, "Profiler.stopPreciseCoverage");
  session.disconnect();

  const script = result.find(entry => entry.url.endsWith("/src/rules/item_rules.js"));
  const fn = script?.functions.find(entry => entry.functionName === "getItemData");
  return fn?.ranges[0]?.count || 0;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timePerRun(run, iterations, batches = 7) {
  for (let i = 0; i < 100; i++) run();
  const samples = [];
  for (let batch = 0; batch < batches; batch++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) run();
    samples.push((performance.now() - start) / iterations);
  }
  return median(samples);
}

const originalRandom = Math.random;
Math.random = () => 0.5;

try {
  const dynamicItem = party[0].equipment.weapon;
  let directSink = 0;
  const directMs = timePerRun(() => {
    directSink += getItemData(dynamicItem).atk;
  }, 100_000);
  const combatCalls = await countGetItemDataCalls(runCombatRound);
  const hudCalls = await countGetItemDataCalls(renderPartyHud);
  const combatMs = timePerRun(runCombatRound, 5_000);
  const hudMs = timePerRun(renderPartyHud, 5_000);

  console.log(JSON.stringify({
    node: process.version,
    fixture: "4 characters x 4 dynamic equipment items",
    directSink,
    directGetItemDataMs: directMs,
    combatRound: {
      getItemDataCalls: combatCalls,
      totalMs: combatMs,
      estimatedGetItemDataMs: directMs * combatCalls
    },
    partyHudUpdate: {
      getItemDataCalls: hudCalls,
      totalMs: hudMs,
      estimatedGetItemDataMs: directMs * hudCalls
    }
  }, null, 2));
} finally {
  Math.random = originalRandom;
}
