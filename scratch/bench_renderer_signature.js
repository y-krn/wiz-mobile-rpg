globalThis.document = {
  getElementById: () => ({
    getContext: () => ({}),
    width: 0,
    height: 0
  })
};

const { performance } = await import("node:perf_hooks");
const { generateRunFloor } = await import("../src/run_map_generator.js");
const { state } = await import("../src/state.js");
const { DungeonRenderer } = await import("../src/renderer.js");

const generated = generateRunFloor({ runSeed: "issue-227-signature-benchmark", floor: 1 });
const grid = generated.grid;
state.floor = 1;
state.x = 1;
state.y = 1;
state.dir = 0;
state.gameState = "explore";
state.maps = [grid];
state.visitedMaps = [grid.map(row => row.map(() => false))];
state.mapRevision = 1;
state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
state.roamingMonsters = [];
state.combatState = null;
state.chestState = null;
state.party = [];

const renderer = new DungeonRenderer("dungeon-canvas");
for (let i = 0; i < 100; i++) renderer.getDrawSignature();

const iterations = 300;
const start = performance.now();
let signature = "";
for (let i = 0; i < iterations; i++) signature = renderer.getDrawSignature();
const averageMs = (performance.now() - start) / iterations;

console.log(`map=${grid[0].length}x${grid.length}`);
console.log(`iterations=${iterations}`);
console.log(`averageMs=${averageMs.toFixed(6)}`);
console.log(`signatureLength=${signature.length}`);
