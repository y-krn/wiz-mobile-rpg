import { getItemData } from "../src/data.js";

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failures++;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

async function runTests() {
  console.log("=== STARTING EXPLORE ITEM VERIFICATION TESTS ===");

  // Test 1: usable item has effect function
  const potion = getItemData("HEAL_POTION");
  assert(potion !== null, "HEAL_POTION data exists");
  assert(typeof potion.effect === "function", "HEAL_POTION has effect function");

  const greater = getItemData("GREATER_HEAL");
  assert(greater !== null, "GREATER_HEAL data exists");
  assert(typeof greater.effect === "function", "GREATER_HEAL has effect function");

  // Test 2: non-usable item (weapon) does NOT have effect function
  const dagger = getItemData("DAGGER");
  assert(dagger !== null, "DAGGER data exists");
  assert(dagger.effect === undefined, "DAGGER does not have effect function");

  // Test 3: check actual recovery effect execution
  const char = {
    name: "テスト戦士",
    class: "Fighter",
    hp: 5,
    maxHp: 20,
    mp: 0,
    maxMp: 0,
    status: "ok"
  };

  const log = potion.effect(char);
  assert(char.hp === 20, `HP recovered to max (expected 20, got ${char.hp})`);
  assert(log.includes("テスト戦士") && log.includes("15回復"), `Log message correct: "${log}"`);

  // Test 4: status effect cure (ANTIDOTE)
  const poison = getItemData("ANTIDOTE");
  assert(typeof poison.effect === "function", "ANTIDOTE has effect function");
  const poisonedChar = {
    name: "テスト盗賊",
    class: "Thief",
    hp: 10,
    maxHp: 10,
    status: "poisoned"
  };
  const poisonLog = poison.effect(poisonedChar);
  assert(poisonedChar.status === "ok", "Poison cured");
  assert(poisonLog.includes("毒が消え去った"), "Correct cure log message");

  if (failures > 0) {
    console.error(`=== TESTS FAILED WITH ${failures} ERRORS ===`);
    process.exit(1);
  } else {
    console.log("=== ALL EXPLORE ITEM TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
  }
}

runTests();
