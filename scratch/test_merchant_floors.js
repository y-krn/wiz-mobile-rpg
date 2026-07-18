import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const router = readFileSync(new URL("../src/menu/submenu_router.js", import.meta.url), "utf8");
assert.equal(router.includes("event_merchant"), false);
assert.equal(router.includes('"shop_main"'), false);
assert.equal(router.includes("milestone_merchant"), true);
console.log("[PASS] legacy merchants remain removed and milestone merchant is routed");
