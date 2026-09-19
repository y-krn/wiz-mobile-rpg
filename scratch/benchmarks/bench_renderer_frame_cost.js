// sim-scope: infra — deterministic renderer frame-cost probe for Issue #1284; no production or test caller.
// Run with: node scratch/benchmarks/bench_renderer_frame_cost.js

globalThis.document = {
  getElementById: () => ({
    getContext: () => ({}),
    width: 0,
    height: 0
  })
};

const { performance } = await import("node:perf_hooks");
const { EVENT_TYPES } = await import("../../src/constants/events.js");
const { getRendererInput } = await import("../../src/state/renderer_view.js");
const { getScreenViewState, isUsableMap } = await import("../../src/state/view_state.js");
const { isMiniMapAnimating } = await import("../../src/minimap.js");
const { createStartingKitCharacter } = await import("../../src/state/initial_state.js");
const { DungeonRenderer } = await import("../../src/renderer.js");

const MAP_SIZE = 30;
const WARMUP = 100;
const SAMPLES = 80;
const BATCH = 200;
const PLAYER_X = 15;
const PLAYER_Y = 15;
const FLOOR = 1;

function makeMap(event = null) {
  const map = Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, () => ({
    type: "empty",
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false]
  })));
  if (event) map[PLAYER_Y][PLAYER_X + 4].event = event;
  return map;
}

function makeRoamingMonsters(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `issue-1284-roaming-${index}`,
    floor: FLOOR,
    x: (index * 3) % MAP_SIZE,
    y: (index * 7) % MAP_SIZE,
    kind: index === count - 1 ? "elite" : "normal",
    perception: "visible"
  }));
}

function makeCombatMonsters() {
  return ["front", "back", "support"].map((row, index) => ({
    name: `測定用モンスター ${index}`,
    hp: 100,
    maxHp: 100,
    color: "#ff3b30",
    row,
    status: "ok"
  }));
}

function makeScenario(id) {
  const base = {
    floor: FLOOR,
    x: PLAYER_X,
    y: PLAYER_Y,
    dir: 0,
    map: makeMap(),
    visitedMap: Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(true)),
    mapRevision: 1284,
    lightTurns: 0,
    lightPower: "",
    roamingMonsters: [],
    dungeonMemory: { mapFragments: { [FLOOR]: [] } },
    party: [createStartingKitCharacter("vanguard")],
    combatState: null,
    chestState: null,
    transitioning: false,
    gameState: "explore"
  };

  switch (id) {
    case "idle-exploration":
      return base;
    case "nearby-boss":
      return { ...base, map: makeMap(EVENT_TYPES.BOSS) };
    case "nearby-midboss":
      return { ...base, map: makeMap(EVENT_TYPES.MIDBOSS) };
    case "roaming-few":
      return { ...base, roamingMonsters: makeRoamingMonsters(3) };
    case "roaming-many":
      return { ...base, roamingMonsters: makeRoamingMonsters(100) };
    case "combat":
      return {
        ...base,
        gameState: "combat",
        combatState: {
          phase: "choose_actions",
          monsters: makeCombatMonsters(),
          isBoss: true,
          isMidboss: false,
          isRoamingFlack: false
        }
      };
    case "animated-environment":
      return { ...base, floor: 5, map: makeMap(), dungeonMemory: { mapFragments: { 5: [] } } };
    case "town-map-hidden":
      return { ...base, gameState: "town", map: null, visitedMap: null };
    default:
      throw new Error(`Unknown scenario: ${id}`);
  }
}

function percentile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * probability) - 1)];
}

function summarize(values) {
  return {
    meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    minMs: Math.min(...values),
    maxMs: Math.max(...values)
  };
}

function measure(fn, timerOverheadMs) {
  for (let index = 0; index < WARMUP; index += 1) fn();
  const samples = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const startedAt = performance.now();
    for (let index = 0; index < BATCH; index += 1) fn();
    samples.push(Math.max(0, (performance.now() - startedAt) / BATCH - timerOverheadMs));
  }
  return summarize(samples);
}

function measureTimerOverhead() {
  for (let index = 0; index < WARMUP; index += 1) void 0;
  const samples = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const startedAt = performance.now();
    for (let index = 0; index < BATCH; index += 1) void 0;
    samples.push((performance.now() - startedAt) / BATCH);
  }
  return summarize(samples);
}

// Kept structurally identical to getDangerCue's two independent scans. The
// benchmark verifies their combined result against production dangerCue for
// every fixture, without changing the production helper's export surface.
function probeDangerMap(map, x, y) {
  let nearbyMapThreat = false;
  const playerX = Number.isInteger(x) ? x : 0;
  const playerY = Number.isInteger(y) ? y : 0;
  if (Array.isArray(map)) {
    const minY = Math.max(0, playerY - 4);
    const maxY = Math.min(map.length - 1, playerY + 4);
    for (let mapY = minY; mapY <= maxY && !nearbyMapThreat; mapY += 1) {
      const row = Array.isArray(map[mapY]) ? map[mapY] : [];
      const minX = Math.max(0, playerX - 4);
      const maxX = Math.min(row.length - 1, playerX + 4);
      for (let mapX = minX; mapX <= maxX; mapX += 1) {
        if (Math.abs(mapX - playerX) + Math.abs(mapY - playerY) > 4) continue;
        const event = row[mapX]?.event;
        if (event === EVENT_TYPES.BOSS || event === EVENT_TYPES.MIDBOSS) {
          nearbyMapThreat = true;
          break;
        }
      }
    }
  }
  return nearbyMapThreat;
}

function probeDangerRoaming(roamingMonsters, floor, hasArcaneSense = false) {
  return roamingMonsters.some((monster) => {
    if (monster?.floor !== floor) return false;
    if (monster.perception === "afterimage" && !hasArcaneSense) return false;
    return monster.kind === "elite";
  });
}

function probeDangerCue(input, combatThreatActive) {
  const combatThreat = input.view.hasCombat && combatThreatActive &&
    input.combatMonsters.some((monster) => monster?.hp > 0);
  return combatThreat || probeDangerMap(input.map, input.x, input.y) ||
    probeDangerRoaming(input.roamingMonsters, input.floor, input.hasArcaneSense);
}

function scenarioResult(id, timerOverheadMs) {
  const state = makeScenario(id);
  const input = getRendererInput(state, null);
  const combatThreatActive = Boolean(state.combatState?.isBoss || state.combatState?.isMidboss || state.combatState?.isRoamingFlack);
  const canvasRenderer = new DungeonRenderer("dungeon-canvas");
  const mapProbe = () => probeDangerMap(input.map, input.x, input.y);
  const roamingProbe = () => probeDangerRoaming(input.roamingMonsters, input.floor, input.hasArcaneSense);
  const dangerProbe = () => probeDangerCue(input, combatThreatActive);
  const operations = {
    getRendererInput: () => getRendererInput(state, null),
    getScreenViewState: () => getScreenViewState(state, null),
    isUsableMap: () => isUsableMap(state.map),
    dangerMapProximity: mapProbe,
    dangerRoaming: roamingProbe,
    dangerCalculationProbe: dangerProbe,
    canvasIsAnimating: () => canvasRenderer.isAnimating(input),
    canvasIsMiniMapAnimating: () => isMiniMapAnimating(input),
    canvasGetDrawSignature: () => canvasRenderer.getDrawSignature(input)
  };
  const deterministicChecks = {
    mapUsable: state.map === null ? true : isUsableMap(state.map),
    dangerCueMatchesProduction: probeDangerCue(input, combatThreatActive) === input.dangerCue.active,
    repeatedInputSignatureStable: JSON.stringify(getRendererInput(state, null)) === JSON.stringify(getRendererInput(state, null))
  };
  if (!Object.values(deterministicChecks).every(Boolean)) {
    throw new Error(`Deterministic probe check failed for ${id}: ${JSON.stringify(deterministicChecks)}`);
  }
  return {
    id,
    mapSize: state.map ? `${state.map[0].length}x${state.map.length}` : "hidden",
    gameState: state.gameState,
    floor: state.floor,
    roamingCount: state.roamingMonsters.length,
    productionDangerCue: input.dangerCue,
    deterministicChecks,
    measurements: Object.fromEntries(Object.entries(operations).map(([name, fn]) => [name, measure(fn, timerOverheadMs)]))
  };
}

const timerOverhead = measureTimerOverhead();
const timerOverheadMs = timerOverhead.medianMs;
const scenarioIds = [
  "idle-exploration",
  "nearby-boss",
  "nearby-midboss",
  "roaming-few",
  "roaming-many",
  "combat",
  "animated-environment",
  "town-map-hidden"
];

console.log(JSON.stringify({
  benchmark: "issue-1284-renderer-frame-cost-node",
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  methodology: { mapSize: `${MAP_SIZE}x${MAP_SIZE}`, warmup: WARMUP, samples: SAMPLES, batch: BATCH },
  timerOverhead,
  scenarios: scenarioIds.map(id => scenarioResult(id, timerOverheadMs))
}, null, 2));
