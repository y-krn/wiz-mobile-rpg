// sim-scope: infra — deterministic Pixi/browser frame-cost probe for Issue #1284; no production or test caller.
// Start Vite first, then run: node scratch/benchmarks/bench_renderer_frame_cost_browser.js

import { chromium } from "@playwright/test";

const BASE_URL = process.env.RENDERER_BENCHMARK_URL || "http://127.0.0.1:5173/?renderer=pixi";
const MAP_SIZE = 30;
const WARMUP = 50;
const SAMPLES = 40;
const BATCH = 100;
const REDUCED_MOTION = process.env.REDUCED_MOTION === "1";

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ reducedMotion: REDUCED_MOTION ? "reduce" : "no-preference" });
  await page.goto(BASE_URL);
  await page.waitForFunction(() => document.querySelector("#dungeon-canvas")?.dataset.renderer === "pixi");
  const report = await page.evaluate(async ({ scenarioIds, mapSize, warmup, samples, batch }) => {
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
    const { EVENT_TYPES } = await import("/src/constants/events.js");
    const { getRendererInput } = await import("/src/state/renderer_view.js");
    const { getScreenViewState, isUsableMap } = await import("/src/state/view_state.ts");
    const { isMiniMapAnimating } = await import("/src/minimap.js");
    const { createStartingKitCharacter } = await import("/src/state/initial_state.js");
    const { dungeonRenderer } = await import("/src/renderer.js");

    const playerX = 15;
    const playerY = 15;
    function makeMap(event = null) {
      const map = Array.from({ length: mapSize }, () => Array.from({ length: mapSize }, () => ({
        type: "empty", walls: [true, true, true, true], blockEnter: [false, false, false, false]
      })));
      if (event) map[playerY][playerX + 4].event = event;
      return map;
    }
    function makeRoamingMonsters(count) {
      return Array.from({ length: count }, (_, index) => ({
        id: `issue-1284-roaming-${index}`, floor: 1, x: (index * 3) % mapSize,
        y: (index * 7) % mapSize, kind: index === count - 1 ? "elite" : "normal", perception: "visible"
      }));
    }
    function makeState(id) {
      const base = {
        floor: 1, x: playerX, y: playerY, dir: 0, map: makeMap(),
        visitedMap: Array.from({ length: mapSize }, () => Array(mapSize).fill(true)), mapRevision: 1284,
        lightTurns: 0, lightPower: "", roamingMonsters: [], dungeonMemory: { mapFragments: { 1: [] } },
        party: [createStartingKitCharacter("vanguard")], combatState: null, chestState: null,
        transitioning: false, gameState: "explore"
      };
      if (id === "nearby-boss") return { ...base, map: makeMap(EVENT_TYPES.BOSS) };
      if (id === "nearby-midboss") return { ...base, map: makeMap(EVENT_TYPES.MIDBOSS) };
      if (id === "roaming-few") return { ...base, roamingMonsters: makeRoamingMonsters(3) };
      if (id === "roaming-many") return { ...base, roamingMonsters: makeRoamingMonsters(100) };
      if (id === "combat") return { ...base, gameState: "combat", combatState: {
        phase: "choose_actions", monsters: ["front", "back", "support"].map((row, index) => ({
          name: `測定用モンスター ${index}`, hp: 100, maxHp: 100, color: "#ff3b30", row, status: "ok"
        })), isBoss: true, isMidboss: false, isRoamingFlack: false
      } };
      if (id === "animated-environment") return { ...base, floor: 5, map: makeMap(), dungeonMemory: { mapFragments: { 5: [] } } };
      if (id === "town-map-hidden") return { ...base, gameState: "town", map: null, visitedMap: null };
      return base;
    }
    function probeDangerMap(map, x, y) {
      let nearbyMapThreat = false;
      const playerXValue = Number.isInteger(x) ? x : 0;
      const playerYValue = Number.isInteger(y) ? y : 0;
      if (Array.isArray(map)) {
        const minY = Math.max(0, playerYValue - 4);
        const maxY = Math.min(map.length - 1, playerYValue + 4);
        for (let mapY = minY; mapY <= maxY && !nearbyMapThreat; mapY += 1) {
          const row = Array.isArray(map[mapY]) ? map[mapY] : [];
          const minX = Math.max(0, playerXValue - 4);
          const maxX = Math.min(row.length - 1, playerXValue + 4);
          for (let mapX = minX; mapX <= maxX; mapX += 1) {
            if (Math.abs(mapX - playerXValue) + Math.abs(mapY - playerYValue) > 4) continue;
            const event = row[mapX]?.event;
            if (event === EVENT_TYPES.BOSS || event === EVENT_TYPES.MIDBOSS) { nearbyMapThreat = true; break; }
          }
        }
      }
      return nearbyMapThreat;
    }
    function probeDangerRoaming(monsters, floor, hasArcaneSense = false) {
      return monsters.some((monster) => {
        if (monster?.floor !== floor) return false;
        if (monster.perception === "afterimage" && !hasArcaneSense) return false;
        return monster.kind === "elite";
      });
    }
    function probeDangerCue(input, combatThreatActive) {
      const combatThreat = input.view.hasCombat && combatThreatActive && input.combatMonsters.some(monster => monster?.hp > 0);
      return combatThreat || probeDangerMap(input.map, input.x, input.y) || probeDangerRoaming(input.roamingMonsters, input.floor, input.hasArcaneSense);
    }
    function measureTimer() {
      const values = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const startedAt = performance.now();
        for (let index = 0; index < batch; index += 1) void 0;
        values.push((performance.now() - startedAt) / batch);
      }
      return summarize(values);
    }
    const timerOverhead = measureTimer();
    const overhead = timerOverhead.medianMs;
    function measure(fn) {
      for (let index = 0; index < warmup; index += 1) fn();
      const values = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const startedAt = performance.now();
        for (let index = 0; index < batch; index += 1) fn();
        values.push(Math.max(0, (performance.now() - startedAt) / batch - overhead));
      }
      return summarize(values);
    }
    const scenarios = scenarioIds.map(id => {
      const state = makeState(id);
      const input = getRendererInput(state, null);
      const combatThreatActive = Boolean(state.combatState?.isBoss || state.combatState?.isMidboss || state.combatState?.isRoamingFlack);
      const operations = {
        getRendererInput: () => getRendererInput(state, null),
        getScreenViewState: () => getScreenViewState(state, null),
        isUsableMap: () => isUsableMap(state.map),
        dangerMapProximity: () => probeDangerMap(input.map, input.x, input.y),
        dangerRoaming: () => probeDangerRoaming(input.roamingMonsters, input.floor, input.hasArcaneSense),
        dangerCalculationProbe: () => probeDangerCue(input, combatThreatActive),
        pixiIsAnimating: () => dungeonRenderer.isAnimating(input),
        pixiGetDrawSignature: () => dungeonRenderer.getDrawSignature(input),
        isMiniMapAnimating: () => isMiniMapAnimating(input)
      };
      const deterministicChecks = {
        dangerCueMatchesProduction: probeDangerCue(input, combatThreatActive) === input.dangerCue.active,
        repeatedInputSignatureStable: JSON.stringify(getRendererInput(state, null)) === JSON.stringify(getRendererInput(state, null))
      };
      if (!Object.values(deterministicChecks).every(Boolean)) throw new Error(`Deterministic check failed: ${id}`);
      return {
        id, mapSize: state.map ? `${state.map[0].length}x${state.map.length}` : "hidden", gameState: state.gameState,
        floor: state.floor, roamingCount: state.roamingMonsters.length, productionDangerCue: input.dangerCue,
        deterministicChecks, measurements: Object.fromEntries(Object.entries(operations).map(([name, fn]) => [name, measure(fn)]))
      };
    });
    return { benchmark: "issue-1284-renderer-frame-cost-browser", browser: navigator.userAgent, rendererMode: dungeonRenderer.mode, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, viewport: [innerWidth, innerHeight], methodology: { mapSize: `${mapSize}x${mapSize}`, warmup, samples, batch }, timerOverhead, scenarios };
  }, { scenarioIds, mapSize: MAP_SIZE, warmup: WARMUP, samples: SAMPLES, batch: BATCH });
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

await main();
