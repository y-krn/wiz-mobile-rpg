// Mock minimal environment for state and DOM (configured BEFORE imports)
const makeDummyElement = () => ({
  style: {},
  appendChild: () => {},
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

const { getOmenForFloor, OMENS } = await import("../src/systems/omens.js");
const assert = (await import("assert")).default;

console.log("=== OMEN SYSTEM VERIFICATION ===");

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
