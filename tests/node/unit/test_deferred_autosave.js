import assert from "node:assert/strict";

// #1973: plain exploration steps defer their autosave instead of writing the
// whole save synchronously on every step.
const store = new Map();
const writes = [];
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => { writes.push(key); store.set(key, String(value)); },
  removeItem: key => store.delete(key),
  clear: () => store.clear()
};

// Deterministic timers and clock.
let now = 1_000_000;
let nextId = 1;
const timers = new Map();
globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; };
globalThis.clearTimeout = id => { timers.delete(id); };
Date.now = () => now;
function advance(ms) {
  const target = now + ms;
  for (;;) {
    const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    now = due[1].at;
    timers.delete(due[0]);
    due[1].fn();
  }
  now = target;
}

const {
  DEFERRED_AUTOSAVE_IDLE_MS,
  DEFERRED_AUTOSAVE_MAX_MS,
  flushAutosave,
  hasPendingAutosave,
  saveAutosave,
  scheduleAutosave
} = await import("../../../src/state/save_storage.ts");
const { SAVE_KEYS } = await import("../../../src/save_keys.js");
const { state } = await import("../../../src/state.js");

const saveWrites = () => writes.filter(key => key === SAVE_KEYS.save).length;
const backupWrites = () => writes.filter(key => key === SAVE_KEYS.backup).length;
const reset = () => { writes.length = 0; flushAutosave(); writes.length = 0; };

// A step does not write; the save lands once input has been quiet.
{
  reset();
  scheduleAutosave();
  assert.equal(saveWrites(), 0, "a step does not write synchronously");
  assert.equal(hasPendingAutosave(), true);
  advance(DEFERRED_AUTOSAVE_IDLE_MS - 1);
  assert.equal(saveWrites(), 0, "still waiting for quiet input");
  advance(1);
  assert.equal(saveWrites(), 1, "written once input is quiet");
  assert.equal(hasPendingAutosave(), false);
  assert.equal(backupWrites(), 0, "a step save does not rotate the backup");
}

// A burst of steps writes once, and continuous walking still saves by the cap.
{
  reset();
  for (let step = 0; step < 5; step++) { scheduleAutosave(); advance(150); }
  assert.equal(saveWrites(), 0, "steps inside the idle window coalesce");
  advance(DEFERRED_AUTOSAVE_IDLE_MS);
  assert.equal(saveWrites(), 1, "one write for the whole burst");

  reset();
  let elapsed = 0;
  while (elapsed < DEFERRED_AUTOSAVE_MAX_MS + 200) { scheduleAutosave(); advance(150); elapsed += 150; }
  assert.ok(saveWrites() >= 1, "continuous walking still saves within the max wait");
}

// The saved payload is the state at write time, not at schedule time.
{
  reset();
  state.x = 3;
  scheduleAutosave();
  state.x = 7;
  advance(DEFERRED_AUTOSAVE_IDLE_MS);
  assert.equal(JSON.parse(store.get(SAVE_KEYS.save)).x, 7, "the deferred save carries the latest position");
}

// An immediate save covers the pending one; flush writes it on demand.
{
  reset();
  scheduleAutosave();
  saveAutosave();
  assert.equal(saveWrites(), 1);
  assert.equal(hasPendingAutosave(), false, "an immediate save cancels the deferred one");
  advance(DEFERRED_AUTOSAVE_MAX_MS);
  assert.equal(saveWrites(), 1, "no second write afterwards");

  reset();
  scheduleAutosave();
  assert.equal(flushAutosave(), true, "flush writes a pending save");
  assert.equal(saveWrites(), 1);
  assert.equal(flushAutosave(), false, "nothing left to flush");
}

console.log("[PASS] Issue #1973 step autosave is deferred, coalesced, capped, and flushable.");
