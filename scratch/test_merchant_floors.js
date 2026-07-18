import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const router = readFileSync(new URL("../src/menu/submenu_router.js", import.meta.url), "utf8");
assert.equal(router.includes("event_merchant"), false);
assert.equal(router.includes('"shop_main"'), false);
console.log("[PASS] legacy merchants and town shop are disabled pending #152");
