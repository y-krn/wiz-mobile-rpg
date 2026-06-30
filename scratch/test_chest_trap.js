// Mock DOM and localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

// Simple DOM Mock
const createdElements = [];
global.document = {
  getElementById: () => {
    return {
      textContent: "",
      innerHTML: "",
      appendChild: () => {},
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
      }
    };
  },
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: "",
      textContent: "",
      disabled: false,
      style: {},
      classList: {
        add: (cls) => {
          el.className += " " + cls;
        },
        remove: (cls) => {
          el.className = el.className.replace(cls, "").trim();
        },
        toggle: () => {},
        contains: () => false
      },
      events: {},
      addEventListener: (evt, cb) => {
        el.events[evt] = cb;
      },
      appendChild: (child) => {
        if (!el.children) el.children = [];
        el.children.push(child);
      }
    };
    createdElements.push(el);
    return el;
  },
  querySelector: () => {
    return {
      setAttribute: () => {},
      removeAttribute: () => {},
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
      }
    };
  },
  querySelectorAll: () => {
    return [];
  }
};

global.window = {
  scrollTo: () => {}
};

// Delayed dynamic imports to ensure global mocks are set up first
const { state, initNewGame } = await import("../src/state.js");
const { setupChestState } = await import("../src/chest.js");
import assert from "assert";

console.log("Starting Chest Trap Inspect Verification Tests...");

// Initialize game state (creates party, map, etc.)
initNewGame();
// Add dummy party members to enable active character check
state.party = [
  { name: "Robin", class: "Thief", status: "ok" }
];

// Set light turns and power
state.lightTurns = 0;
state.lightPower = "";

// Test 1: Setup chest and verify initial state
createdElements.length = 0;
setupChestState("poison needle", 100, null);

assert.ok(state.chestState, "chestState should be created");
assert.strictEqual(state.chestState.trap, "poison needle", "Trap should be poison needle");
assert.strictEqual(state.chestState.inspected, false, "Should not be inspected initially");
assert.strictEqual(state.chestState.identifiedTrap, "", "Identified trap should be empty");

console.log("[PASS] Initial chest state verified.");

// Test 2: Verify UI button configuration before inspection
// Find inspect and disarm buttons in created elements
const getButtons = () => createdElements.filter(el => el.tagName === "BUTTON");

let buttons = getButtons();
const btnInspect = buttons.find(b => b.textContent === "調べる");
const btnDisarmBefore = buttons.find(b => b.textContent.includes("解除"));

assert.ok(btnInspect, "Inspect button should exist");
assert.strictEqual(btnInspect.disabled, false, "Inspect button should be enabled initially");

assert.ok(btnDisarmBefore, "Disarm button should exist");
assert.strictEqual(btnDisarmBefore.textContent, "解除（要調査）", "Disarm button should say '解除（要調査）' before inspection");
assert.strictEqual(btnDisarmBefore.disabled, true, "Disarm button should be disabled before inspection");

console.log("[PASS] Initial UI button states verified.");

// Test 3: Trigger inspection
createdElements.length = 0; // Clear elements log for redraw
assert.ok(btnInspect.events["click"], "Inspect button should have click listener");

// Trigger inspect
btnInspect.events["click"]();

assert.strictEqual(state.chestState.inspected, true, "Chest should be marked as inspected");
assert.ok(["poison needle", "gas bomb", "teleporter", "flash bomb", "none"].includes(state.chestState.identifiedTrap), "Identified trap should be populated");

console.log("[PASS] Inspection execution verified.");

// Test 4: Verify UI button configuration after inspection
buttons = getButtons();
const btnInspectAfter = buttons.find(b => b.textContent === "調査済み");
const btnDisarmAfter = buttons.find(b => b.textContent.includes("解除") || b.textContent === "解除する" || b.textContent === "解除不要");

assert.ok(btnInspectAfter, "Inspect button should change text to '調査済み'");
assert.strictEqual(btnInspectAfter.disabled, true, "Inspect button should be disabled after inspection");

assert.ok(btnDisarmAfter, "Disarm button should exist after inspection");
if (state.chestState.identifiedTrap === "none") {
  assert.strictEqual(btnDisarmAfter.textContent, "解除不要", "Disarm button should say '解除不要' if no trap identified");
  assert.strictEqual(btnDisarmAfter.disabled, true, "Disarm button should be disabled if no trap identified");
} else {
  assert.strictEqual(btnDisarmAfter.textContent, "解除する", "Disarm button should say '解除する' if trap identified");
  assert.strictEqual(btnDisarmAfter.disabled, false, "Disarm button should be enabled if trap identified");
}

console.log("[PASS] Post-inspection UI button states verified.");

console.log("All chest trap inspect tests passed successfully!");
