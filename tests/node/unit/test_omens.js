// Mock minimal environment for state and DOM (configured BEFORE imports)
const makeDummyElement = () => ({
  style: {},
  appendChild: () => {},
  replaceChildren: () => {},
  addEventListener: () => {},
  innerHTML: "",
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {}
  },
  setAttribute: () => {},
  getAttribute: () => ""
});

global.document = {
  getElementById: () => makeDummyElement(),
  createElement: () => makeDummyElement(),
  querySelector: () => makeDummyElement()
};
global.window = {};
global.localStorage = {
  getItem: () => "false",
  setItem: () => {}
};

const facade = await import("../../../src/systems/omens.js");
const owner = await import("../../../src/systems/omens.ts");
const { state } = await import("../../../src/state.js");
const { createRng } = await import("../../../src/seed_rng.js");
const assert = (await import("assert")).default;

const { checkFloorOmenMessage, getOmenForFloor, OMENS } = facade;

console.log("=== OMEN SYSTEM VERIFICATION ===");

// 0. Preserve the facade, export, content, and runtime-shape contracts.
assert.strictEqual(facade.OMENS, owner.OMENS, "facade and owner must share OMENS identity");
assert.strictEqual(facade.getOmenForFloor, owner.getOmenForFloor, "facade and owner must share getOmenForFloor identity");
assert.strictEqual(facade.checkFloorOmenMessage, owner.checkFloorOmenMessage, "facade and owner must share checkFloorOmenMessage identity");
assert.deepEqual(OMENS, [
  { id: "claw_marks", text: "壁に細い爪痕が続いている。" },
  { id: "scorched_floor", text: "床石が黒く焦げている。" },
  { id: "broken_sigil", text: "聖印が削られている。" },
  { id: "blood_chest", text: "宝箱の前で血が乾いている。" },
  { id: "dry_bell", text: "乾いた鈴の音がする。" },
  { id: "stale_air", text: "空気が重く、息が詰まる。" },
  { id: "cold_draft", text: "背後から冷たい風が吹く。" },
  { id: "iron_dust", text: "床に鉄粉が積もっている。" }
], "OMENS order and content must remain unchanged");
assert.equal(Object.isFrozen(OMENS), false, "OMENS array must remain mutable");
assert.equal(Object.isFrozen(OMENS[0]), false, "OMENS elements must remain mutable");
const originalOmenText = OMENS[0].text;
OMENS[0].text = OMENS[1].text;
assert.strictEqual(OMENS[0].text, OMENS[1].text, "OMENS elements must remain writable");
OMENS[0].text = originalOmenText;

// 0a. Preserve falsey seed behavior and template-string coercion.
for (const seed of ["", null, undefined, 0, false, NaN]) {
  assert.strictEqual(getOmenForFloor(seed, 3), null, "falsey seed must return null");
}
const coercionSeed = 123;
const coercionFloor = 4;
const expectedRng = createRng(`${coercionSeed}-omen-floor-${coercionFloor}`);
const expectedOmen = OMENS[Math.floor(expectedRng() * OMENS.length)];
assert.strictEqual(
  getOmenForFloor(coercionSeed, coercionFloor),
  expectedOmen,
  "truthy seed and floor must preserve template-string coercion and element identity"
);
const selectedOmen = getOmenForFloor("IDENTITY-SEED", 2);
assert.ok(OMENS.some(omen => omen === selectedOmen), "selected omen must be an existing OMENS element");

// 0b. Preserve floor-message state reads, exact log boundary, and return value.
const originalFloor = state.floor;
const originalSeed = state.seed;
const originalLogs = state.logs;
const originalLogEntries = state.logEntries;
try {
  state.floor = 2;
  state.seed = "LOG-SEED";
  state.logs = [];
  state.logEntries = [];
  const loggedOmen = getOmenForFloor(state.seed, state.floor);
  assert.strictEqual(checkFloorOmenMessage(), undefined, "checkFloorOmenMessage return must remain undefined");
  assert.deepEqual(state.logs, loggedOmen ? [`[予兆] ${loggedOmen.text}`] : [], "omen log must remain exact");

  state.seed = "";
  state.logs = [];
  state.logEntries = [];
  assert.strictEqual(checkFloorOmenMessage(), undefined, "falsey seed return must remain undefined");
  assert.deepEqual(state.logs, [], "falsey seed must not add a log");
} finally {
  state.floor = originalFloor;
  state.seed = originalSeed;
  state.logs = originalLogs;
  state.logEntries = originalLogEntries;
}

// 1. Check Deterministic Omen Selection
console.log("\n[1] Verifying seed-based deterministic selection:");
const omenDist = {};
OMENS.forEach(o => omenDist[o.id] = 0);

for (let i = 0; i < 1000; i++) {
  const seed = `CASTLE-TEST${i}`;
  for (let floor = 1; floor <= 5; floor++) {
    const omen = getOmenForFloor(seed, floor);
    if (omen) {
      omenDist[omen.id]++;
    }
  }
}
console.log("Omen Distribution over 5000 floor samples:");
console.log(omenDist);

// Assert all omens are selected roughly equally
const values = Object.values(omenDist);
const max = Math.max(...values);
const min = Math.min(...values);
console.log(`Min: ${min}, Max: ${max}, Ratio Max/Min: ${(max / min).toFixed(2)}`);
assert.ok(max / min <= 1.5, `Omen distribution is highly skewed (ratio ${(max / min).toFixed(2)})`);
console.log("Omen distribution is reasonably uniform.");

console.log("\n=== VERIFICATION COMPLETE ===");
