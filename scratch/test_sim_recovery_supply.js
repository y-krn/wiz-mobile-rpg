/* global console, process */

const failures = [];
const { parseHealPotionMerchantPolicy } = await import("./sim_depth_material_ev.js");

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(
  JSON.stringify(parseHealPotionMerchantPolicy("never")) ===
    JSON.stringify({ id: "never", maxPurchases: 0 }),
  "never policy should disable purchases"
);
check(
  JSON.stringify(parseHealPotionMerchantPolicy("missing")) ===
    JSON.stringify({ id: "missing", maxPurchases: 1 }),
  "missing policy should retain one-purchase behavior"
);
check(
  JSON.stringify(parseHealPotionMerchantPolicy("up-to-8")) ===
    JSON.stringify({ id: "up-to-8", maxPurchases: 8 }),
  "up-to-N policy should parse the run purchase cap"
);

try {
  parseHealPotionMerchantPolicy("up-to-21");
  failures.push("up-to-21 should be rejected by the inventory-sized cap");
} catch {
  // expected
}

if (failures.length > 0) {
  failures.forEach(message => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] recovery merchant policy parser");
