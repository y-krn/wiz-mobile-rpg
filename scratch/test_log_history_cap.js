global.document = {
  getElementById: () => ({ textContent: "", style: {} })
};
global.window = {};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

const assert = (await import("assert")).default;
const { state, addLog, LOG_HISTORY_LIMIT } = await import("../src/state/state_core.js");
const { createSavePayload } = await import("../src/state/save_payload.js");

let failed = false;
function check(condition, message) {
  try {
    assert.ok(condition, message);
    console.log(`-> [PASS] ${message}`);
  } catch (error) {
    failed = true;
    console.error(`-> [FAIL] ${message}`);
    console.error(error.message);
  }
}

console.log("=== LOG HISTORY CAP VERIFICATION ===");

state.logs = [];
for (let i = 1; i <= LOG_HISTORY_LIMIT; i += 1) {
  addLog(`log-${i}`);
}

check(state.logs.length === LOG_HISTORY_LIMIT, "runtime logs keep 500 messages");
check(state.logs[0] === "log-1", "first message remains at the 500 message cap");

addLog(`log-${LOG_HISTORY_LIMIT + 1}`);

check(state.logs.length === LOG_HISTORY_LIMIT, "runtime logs stay capped after overflow");
check(state.logs[0] === "log-2", "oldest message is shifted only after 501st message");
check(state.logs[state.logs.length - 1] === "log-501", "newest message remains available after overflow");

const payload = createSavePayload();
check(payload.logs.length === 30, "save payload still persists only the last 30 logs");
check(payload.logs[0] === "log-472", "save payload keeps the expected 30-log tail");

if (failed) {
  console.error("\nLOG HISTORY CAP TESTS FAILED");
  process.exit(1);
}

console.log("\n=== LOG HISTORY CAP TESTS PASSED ===");
