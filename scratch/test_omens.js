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

const { getOmenForFloor, OMENS, isMatchedMonster } = await import("../src/systems/omens.js");
const { generateEncounter, ENCOUNTER_PACKS } = await import("../src/combat_ui/encounter.js");
const { setupChestState } = await import("../src/chest.js");
const { state } = await import("../src/state.js");
const { MONSTERS } = await import("../src/data.js");
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

// 2. Verify Encounter Biases
console.log("\n[2] Verifying Encounter Pack Rerolls:");
const floor = 2;
const testPacks = ENCOUNTER_PACKS[floor];
const beastPacks = testPacks.filter(pack => pack.members.some(member => {
  const template = MONSTERS.find(m => m.name === member.name);
  return template && isMatchedMonster("claw_marks", [template]);
}));
const totalPacks = testPacks.length;
console.log(`Floor 2 total packs: ${totalPacks}, Beast packs: ${beastPacks.length} (${(beastPacks.length / totalPacks * 100).toFixed(1)}%)`);

const iterations = 5000;
state.floor = floor;

// Programmatically override getOmenForFloor temporarily to isolate test conditions
const originalGetOmen = getOmenForFloor;

// We will inject a custom forced omen hook in the system so we can force omens in tests
// Let's modify our test setup: we will temporarily override the getOmenForFloor function in the test environment.
// Simulate with claw_marks Omen
let beastSelected = 0;
let totalExp = 0;
let totalGold = 0;

// Since import is read-only, we can override state.seed dynamically to map to desired omens in our test,
// or we can just mock state.seed + floor to resolve to claw_marks.
// To keep it simple, let's find seeds that map to claw_marks vs iron_dust.
const clawMarksSeeds = [];
const ironDustSeeds = [];
let seedCounter = 0;
while (clawMarksSeeds.length < iterations || ironDustSeeds.length < iterations) {
  const s = `SEED_SEARCH_${seedCounter++}`;
  const o = originalGetOmen(s, 2);
  if (o.id === "claw_marks" && clawMarksSeeds.length < iterations) {
    clawMarksSeeds.push(s);
  } else if (o.id === "iron_dust" && ironDustSeeds.length < iterations) {
    ironDustSeeds.push(s);
  }
}

for (let i = 0; i < iterations; i++) {
  state.seed = clawMarksSeeds[i];
  state.floor = 2;
  
  const enc = generateEncounter(state, false, false, false);
  const matched = enc.monsters.some(m => ["rabbit", "orc"].includes(m.spriteType) || m.name.includes("ネズミ"));
  if (matched) beastSelected++;
  
  enc.monsters.forEach(m => {
    totalExp += m.exp;
    totalGold += m.gold;
  });
}

// Simulate without claw_marks Omen (using iron_dust)
let beastSelectedNoOmen = 0;
let totalExpNoOmen = 0;
let totalGoldNoOmen = 0;

for (let i = 0; i < iterations; i++) {
  state.seed = ironDustSeeds[i];
  state.floor = 2;
  
  const enc = generateEncounter(state, false, false, false);
  const matched = enc.monsters.some(m => ["rabbit", "orc"].includes(m.spriteType) || m.name.includes("ネズミ"));
  if (matched) beastSelectedNoOmen++;
  
  enc.monsters.forEach(m => {
    totalExpNoOmen += m.exp;
    totalGoldNoOmen += m.gold;
  });
}

console.log(`Simulation Results (${iterations} iterations):`);
console.log(`With Omen (claw_marks): Beast encounters = ${beastSelected} (${(beastSelected / iterations * 100).toFixed(1)}%)`);
console.log(`Without Omen (iron_dust): Beast encounters = ${beastSelectedNoOmen} (${(beastSelectedNoOmen / iterations * 100).toFixed(1)}%)`);

const biasRatio = beastSelected / beastSelectedNoOmen;
console.log(`Encounter bias ratio: ${biasRatio.toFixed(2)}x`);
// claw_marks must actually bias encounters toward beasts (observed ~2.1x).
assert.ok(biasRatio > 1.3, `claw_marks should bias toward beast encounters (ratio ${biasRatio.toFixed(2)})`);

// Check XP/Gold inflation
const expInflation = totalExp / totalExpNoOmen;
const goldInflation = totalGold / totalGoldNoOmen;
console.log(`XP Inflation ratio: ${expInflation.toFixed(3)}x (Limit: 1.08x)`);
console.log(`GOLD Inflation ratio: ${goldInflation.toFixed(3)}x (Limit: 1.08x)`);

assert.ok(expInflation <= 1.08, `XP total expectation inflated by omen (${expInflation.toFixed(3)}x)`);
assert.ok(goldInflation <= 1.08, `Gold total expectation inflated by omen (${goldInflation.toFixed(3)}x)`);
console.log("PASS: XP/Gold totals remain stable.");

// 3. Verify Chest Trap Biases
console.log("\n[3] Verifying Chest Trap Biases:");
// Find seeds that resolve to stale_air vs iron_dust for B2F
const staleAirChestSeeds = [];
const ironDustChestSeeds = [];
seedCounter = 0;
while (staleAirChestSeeds.length < iterations || ironDustChestSeeds.length < iterations) {
  const s = `SEED_CHEST_SEARCH_${seedCounter++}`;
  const o = originalGetOmen(s, 2);
  if (o.id === "stale_air" && staleAirChestSeeds.length < iterations) {
    staleAirChestSeeds.push(s);
  } else if (o.id === "iron_dust" && ironDustChestSeeds.length < iterations) {
    ironDustChestSeeds.push(s);
  }
}

let poisonOrGasCount = 0;
let poisonOrGasCountNoOmen = 0;
let totalChestGold = 0;
let totalChestGoldNoOmen = 0;

for (let i = 0; i < iterations; i++) {
  state.floor = 2;
  state.seed = staleAirChestSeeds[i];
  
  setupChestState(null, null, null);
  if (["poison needle", "gas bomb"].includes(state.chestState.trap)) {
    poisonOrGasCount++;
  }
  totalChestGold += state.chestState.gold;
}

for (let i = 0; i < iterations; i++) {
  state.floor = 2;
  state.seed = ironDustChestSeeds[i];
  
  setupChestState(null, null, null);
  if (["poison needle", "gas bomb"].includes(state.chestState.trap)) {
    poisonOrGasCountNoOmen++;
  }
  totalChestGoldNoOmen += state.chestState.gold;
}

console.log(`With Omen (stale_air): Poison/Gas traps = ${poisonOrGasCount} (${(poisonOrGasCount / iterations * 100).toFixed(1)}%)`);
console.log(`Without Omen (iron_dust): Poison/Gas traps = ${poisonOrGasCountNoOmen} (${(poisonOrGasCountNoOmen / iterations * 100).toFixed(1)}%)`);
const trapBias = poisonOrGasCount / poisonOrGasCountNoOmen;
console.log(`Trap bias ratio: ${trapBias.toFixed(2)}x`);
// stale_air must actually increase poison/gas trap frequency (observed ~1.5x).
assert.ok(trapBias > 1.15, `stale_air should bias toward poison/gas traps (ratio ${trapBias.toFixed(2)})`);

const goldRatio = totalChestGold / totalChestGoldNoOmen;
console.log(`Chest Gold Expectation ratio: ${goldRatio.toFixed(3)}x (Limit: 1.05x)`);

assert.ok(goldRatio <= 1.05, `Chest gold expectation inflated by omen (${goldRatio.toFixed(3)}x)`);
console.log("PASS: Chest gold remains stable.");

console.log("\n=== VERIFICATION COMPLETE ===");
