import { performance } from "node:perf_hooks";

import { cloneCombatStateForRound, runCombatRoundCalculation } from "../../src/combat_logic/round.js";
import { createDefaultCodex, createDefaultCurrentRun, createStartingKitCharacter } from "../../src/state/initial_state.js";
import { createMonsterCodexRecord } from "../../src/state/codex_state.js";

const WARMUP_ROUNDS = 200;
const SAMPLE_COUNT = 25;
const BATCH_SIZE = 20;

const CONDITIONS = {
  small: {
    codexMonsters: 2,
    codexEquipment: 2,
    runHistory: 0,
    inventory: 8,
    label: "初期状態に近い codex / currentRun"
  },
  medium: {
    codexMonsters: 40,
    codexEquipment: 20,
    runHistory: 50,
    inventory: 60,
    label: "数十戦・複数 floor・観測/loot/deathLogs"
  },
  large: {
    codexMonsters: 240,
    codexEquipment: 100,
    runHistory: 1000,
    inventory: 500,
    label: "長時間 run / simulation 想定"
  }
};

const FIXED_RNG_SEQUENCE = [
  0.11, 0.27, 0.43, 0.59, 0.71, 0.83, 0.19, 0.37,
  0.53, 0.67, 0.89, 0.23, 0.47, 0.79, 0.31, 0.61
];

function sequenceRng() {
  let index = 0;
  return () => FIXED_RNG_SEQUENCE[index++ % FIXED_RNG_SEQUENCE.length];
}

function makeCodex(condition) {
  const codex = createDefaultCodex();
  for (let index = 0; index < condition.codexMonsters; index++) {
    const name = `観測モンスター${index}`;
    codex.monsters[name] = createMonsterCodexRecord({
      encountered: 2 + (index % 9),
      killed: index % 7,
      firstKilled: index % 7 === 0,
      observedActions: ["通常攻撃", "防御強化", `固有行動${index % 5}`],
      observedConditions: ["毒を受けた", "盲目を受けた"],
      observedLoot: [`素材${index % 12}`, `装備${index % 18}`],
      encounterFloors: { "1": 1 + (index % 3), "3": 1, "5": index % 2 },
      firstEncounterFloor: 1 + (index % 3),
      lastEncounterFloor: 5 + (index % 6)
    });
  }
  for (let index = 0; index < condition.codexEquipment; index++) {
    codex.equipment[`EQUIPMENT_${index}`] = {
      discovered: true,
      foundCount: 1 + (index % 12),
      highestRarity: index % 5 === 0 ? "rare" : "common",
      bestBonus: index % 15,
      affixesSeen: [`affix_${index % 9}`, `affix_${(index + 3) % 9}`],
      foundFloors: { "1": 1, "4": index % 4, "6": 1 },
      tagObservations: { blade: 1 + (index % 4), ward: index % 3 },
      firstFoundAt: `B${1 + (index % 5)}F`,
      lastFoundSeed: `BENCH-SEED-${index}`
    };
  }
  codex.insights = Array.from({ length: Math.min(20, Math.max(0, condition.codexEquipment / 4)) }, (_, index) => ({
    id: `insight_${index}`,
    count: index + 1,
    firstFloor: 1,
    lastFloor: 1 + (index % 6)
  }));
  codex.stats.totalKills = condition.codexMonsters * 3;
  return codex;
}

function makeCurrentRun(condition) {
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = `BENCH-RUN-${condition.runHistory}`;
  currentRun.battles = condition.runHistory;
  currentRun.kills = condition.runHistory * 2;
  currentRun.expGained = condition.runHistory * 17;
  currentRun.deepestFloor = Math.min(20, 1 + Math.floor(condition.runHistory / 20));
  currentRun.materials = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`素材${index}`, index + 1]));
  currentRun.codexRewards = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`報酬${index}`, index % 4]));
  currentRun.deathLogs = Array.from({ length: Math.min(50, Math.floor(condition.runHistory / 10)) }, (_, index) => ({
    charName: `キャラクター${index % 4}`,
    cause: `モンスター${index % 12}の攻撃`,
    floor: 1 + (index % 6),
    turn: 1 + (index % 9),
    type: "combat",
    source: `モンスター${index % 12}`
  }));
  currentRun.equipmentFound = Array.from({ length: Math.min(240, Math.floor(condition.runHistory / 4)) }, (_, index) => ({
    kind: "equipment",
    baseId: `EQUIPMENT_${index % Math.max(2, condition.codexEquipment)}`,
    rarity: index % 5 === 0 ? "rare" : "common",
    identified: false,
    atkBonus: index % 7
  }));
  currentRun.itemsFound = Array.from({ length: Math.min(240, Math.floor(condition.runHistory / 3)) }, (_, index) => `ITEM_${index % 18}`);
  currentRun.meaningfulItemHistory = Array.from({ length: Math.min(500, Math.floor(condition.runHistory / 2)) }, (_, index) => ({
    baseId: `EQUIPMENT_${index % Math.max(2, condition.codexEquipment)}`,
    floor: 1 + (index % 6),
    source: "combat"
  }));
  currentRun.unbankedObjectLoot = Array.from({ length: Math.min(300, Math.floor(condition.runHistory / 3)) }, (_, index) => ({
    lootId: `loot-${index}`,
    baseId: `OBJECT_${index % 13}`,
    quantity: 1 + (index % 3),
    state: "unresolved"
  }));
  currentRun.eventObservations = Object.fromEntries(Array.from({ length: Math.min(200, Math.floor(condition.runHistory / 5)) }, (_, index) => [
    `event-${index}`,
    { key: `event-${index}`, scope: "run", text: `観測 ${index}`, kind: "unresolved", lifecycle: "active" }
  ]));
  currentRun.quests = Array.from({ length: Math.min(10, Math.max(1, Math.floor(condition.runHistory / 25))) }, (_, index) => ({
    type: "role_kill",
    role: index % 2 ? "beast" : "undead",
    progress: index + 1,
    target: 20,
    completed: false
  }));
  currentRun.defeatsByRole = { beast: condition.runHistory, undead: Math.floor(condition.runHistory / 2) };
  currentRun.floorsVisited = Array.from({ length: Math.min(20, Math.max(1, Math.floor(condition.runHistory / 8))) }, (_, index) => index + 1);
  currentRun.firstKills = Array.from({ length: Math.min(100, Math.floor(condition.runHistory / 5)) }, (_, index) => `初討伐${index}`);
  return currentRun;
}

function makeState(condition) {
  const party = Array.from({ length: 4 }, (_, index) => ({
    ...createStartingKitCharacter("vanguard"),
    name: `ベンチキャラ${index}`,
    hp: 9999,
    maxHp: 9999,
    mp: 100,
    maxMp: 100,
    status: "ok",
    buffs: []
  }));
  const inventory = Array.from({ length: condition.inventory }, (_, index) => ({
    kind: "equipment",
    baseId: `EQUIPMENT_${index % Math.max(2, condition.codexEquipment)}`,
    rarity: index % 4 === 0 ? "magic" : "common",
    identified: false,
    atkBonus: index % 5
  }));
  return {
    floor: 5,
    seed: "BENCH-SEED",
    party,
    combatState: {
      monsters: [{
        name: "訓練用ゴブリン A",
        hp: 999999,
        maxHp: 999999,
        atk: 1,
        def: 0,
        exp: 1,
        status: "ok",
        row: "front",
        traits: [],
        buffs: []
      }],
      phase: "choose_actions",
      roundNumber: 12,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      loggedCoreActivations: []
    },
    inventory,
    firstKills: [...(currentRunFirstKills(condition))],
    codex: makeCodex(condition),
    currentRun: makeCurrentRun(condition),
    metaMaterials: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`素材${index}`, index + 2])),
    roamingMonsters: Array.from({ length: Math.min(20, condition.runHistory / 20) }, (_, index) => ({ id: `roaming-${index}`, floor: index + 1, defeated: false })),
    floorChestsTotal: Array.from({ length: Math.min(20, Math.max(1, Math.floor(condition.runHistory / 15))) }, (_, index) => index + 2),
    logs: [],
    logEntries: []
  };
}

function currentRunFirstKills(condition) {
  return Array.from({ length: Math.min(100, Math.floor(condition.runHistory / 5)) }, (_, index) => `初討伐${index}`);
}

// The full clone measurement calls the production helper directly.
function cloneRoundStartState(originalState) {
  return cloneCombatStateForRound(originalState);
}

function cloneOtherRoundStartFields(originalState) {
  const party = originalState.party.map(c => ({
    ...c,
    equipment: { ...c.equipment },
    buffs: c.buffs ? c.buffs.map(buff => ({ ...buff })) : undefined,
    mediumState: c.mediumState && typeof c.mediumState === "object"
      ? { ...c.mediumState, socketedRunes: [...(c.mediumState.socketedRunes || [])] }
      : c.mediumState
  }));
  const monsters = originalState.combatState.monsters.map(m => ({
    ...m,
    buffs: m.buffs ? m.buffs.map(buff => ({ ...buff })) : undefined
  }));
  const inventory = [...originalState.inventory];
  const firstKills = originalState.firstKills ? [...originalState.firstKills] : [];
  const metaMaterials = { ...(originalState.metaMaterials || {}) };
  const roamingMonsters = originalState.roamingMonsters ? originalState.roamingMonsters.map(rm => ({ ...rm })) : [];
  const floorChestsTotal = originalState.floorChestsTotal ? [...originalState.floorChestsTotal] : [];
  return [party, monsters, inventory, firstKills, metaMaterials, roamingMonsters, floorChestsTotal];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function measureMedian(label, fn) {
  for (let index = 0; index < WARMUP_ROUNDS; index++) fn();
  const samples = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const start = performance.now();
    for (let index = 0; index < BATCH_SIZE; index++) fn();
    samples.push((performance.now() - start) / BATCH_SIZE);
  }
  return { label, medianMs: median(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples) };
}

function measureHeapTrend(fn) {
  const iterations = 1000;
  if (typeof global.gc === "function") global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let index = 0; index < iterations; index++) fn();
  if (typeof global.gc === "function") global.gc();
  const after = process.memoryUsage().heapUsed;
  return {
    iterations,
    beforeBytes: before,
    afterBytes: after,
    deltaBytes: after - before,
    gcAvailable: typeof global.gc === "function"
  };
}

function runScenario(name, condition) {
  const state = makeState(condition);
  const selection = { actions: state.party.map((_, actorIdx) => ({ type: "defend", actorIdx })) };
  const cloneParts = {
    codex: () => state.codex ? JSON.parse(JSON.stringify(state.codex)) : null,
    currentRun: () => state.currentRun ? JSON.parse(JSON.stringify(state.currentRun)) : null,
    other: () => cloneOtherRoundStartFields(state)
  };
  const clone = measureMedian("round-start clone", () => cloneRoundStartState(state));
  const codex = measureMedian("codex JSON clone (baseline reference)", cloneParts.codex);
  const currentRun = measureMedian("currentRun JSON clone (baseline reference)", cloneParts.currentRun);
  const other = measureMedian("other round-start clone", cloneParts.other);
  const fullRound = measureMedian("full combat round", () => runCombatRoundCalculation(state, selection, { rng: sequenceRng() }));
  const heapTrend = measureHeapTrend(() => cloneRoundStartState(state));
  return {
    name,
    label: condition.label,
    counts: {
      party: state.party.length,
      monsters: state.combatState.monsters.length,
      inventory: state.inventory.length,
      codexMonsters: Object.keys(state.codex.monsters).length,
      codexEquipment: Object.keys(state.codex.equipment).length,
      currentRunDeathLogs: state.currentRun.deathLogs.length,
      currentRunEquipmentFound: state.currentRun.equipmentFound.length,
      currentRunMeaningfulItemHistory: state.currentRun.meaningfulItemHistory.length,
      currentRunUnbankedObjectLoot: state.currentRun.unbankedObjectLoot.length,
      currentRunEventObservations: Object.keys(state.currentRun.eventObservations).length
    },
    bytes: {
      codex: jsonBytes(state.codex),
      currentRun: jsonBytes(state.currentRun),
      party: jsonBytes(state.party),
      monsters: jsonBytes(state.combatState.monsters),
      inventory: jsonBytes(state.inventory),
      otherRoundStartFields: jsonBytes({
        firstKills: state.firstKills,
        metaMaterials: state.metaMaterials,
        roamingMonsters: state.roamingMonsters,
        floorChestsTotal: state.floorChestsTotal
      })
    },
    timings: {
      clone,
      codex,
      currentRun,
      other,
      fullRound,
      cloneSharePercent: (clone.medianMs / fullRound.medianMs) * 100
    },
    heapTrend
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  rng: {
    injection: "runCombatRoundCalculation(..., { rng }) from Issue #1263",
    sequence: FIXED_RNG_SEQUENCE,
    freshSequencePerRound: true
  },
  methodology: {
    warmupRounds: WARMUP_ROUNDS,
    samples: SAMPLE_COUNT,
    roundsPerSample: BATCH_SIZE,
    statistic: "median per invocation",
    heapTrend: "1000 clone calls; post-GC retained-heap estimate when run with --expose-gc"
  },
  scenarios: Object.entries(CONDITIONS).map(([name, condition]) => runScenario(name, condition))
};

console.log(JSON.stringify(report, null, 2));
