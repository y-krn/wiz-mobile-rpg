// Mock minimal environment for state and DOM (configured BEFORE imports)
const makeDummyElement = () => {
  const listeners = {};
  return {
    style: {},
    appendChild: () => {},
    replaceChildren: () => {},
    addEventListener: (event, cb) => {
      listeners[event] = cb;
    },
    trigger: (event, ...args) => {
      if (listeners[event]) {
        listeners[event](...args);
      }
    },
    innerHTML: "",
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {}
    },
    setAttribute: () => {},
    getAttribute: () => ""
  };
};

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

const { state } = await import("../src/state.js");
const { renderEventTablet } = await import("../src/menu/explore_actions.js");
const assert = (await import("assert")).default;

console.log("=== TABLET EVENT GOLD REMOVAL VERIFICATION ===");

// 1. Setup state party & floor
state.floor = 1;
state.gold = 500;
state.party = [
  { name: "戦士", status: "alive", exp: 0, class: "Fighter", hp: 20, maxHp: 20 },
  { name: "魔法使い", status: "alive", exp: 0, class: "Mage", hp: 10, maxHp: 10 }
];
state.maps[0] = [
  [
    { event: "event_tablet" }
  ]
];
state.x = 0;
state.y = 0;

// Mock Math.random to guarantee tablet success (40% rate -> rand < 0.40)
const originalRandom = Math.random;
Math.random = () => 0.2; // 0.2 < 0.40 (当たり分岐に入る)

// Setup optGrid
const optGrid = {
  children: [],
  appendChild: function(child) {
    this.children.push(child);
  },
  replaceChildren: function(...children) {
    this.children = children;
  }
};

// Execute render
renderEventTablet(optGrid);

// Find "文字を読む" button
const btnRead = optGrid.children[0];
assert.strictEqual(btnRead.textContent, "文字を読む");

// Trigger Click
btnRead.trigger("click");

// Restore Math.random
Math.random = originalRandom;

// Verify results
console.log(`[Result] Gold after event: ${state.gold}G (Expected: 500G)`);
console.log(`[Result] Character 1 EXP: ${state.party[0].exp} (Expected: 200)`);
console.log(`[Result] Character 2 EXP: ${state.party[1].exp} (Expected: 200)`);

// Asserts
assert.strictEqual(state.gold, 500, "Gold must NOT increase from tablet event");
assert.strictEqual(state.party[0].exp, 200, "Alive characters should gain 200 EXP on Floor 1");
assert.strictEqual(state.party[1].exp, 200, "Alive characters should gain 200 EXP on Floor 1");

console.log("\n=== VERIFICATION COMPLETE: ALL PASSED ===");
