import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { isSafePwaUpdateBoundary } from "../../../src/ui/pwa_update_manager.js";
import { isPrecacheCandidate } from "../../../scripts/pwa-service-worker-plugin.js";

const template = readFileSync(new URL("../../../scripts/service-worker.template.txt", import.meta.url), "utf8");
const workerSource = template
  .replaceAll("__APP_CACHE_NAME__", "depthward-static-test")
  .replace("__PRECACHE_PATHS__", JSON.stringify(JSON.stringify(["/", "/index.html", "/assets/app.js"])));

function createWorkerHarness() {
  const listeners = new Map();
  const deleted = [];
  const added = [];
  const fallbackResponse = { source: "cached-index" };
  const cache = {
    async addAll(paths) { added.push(...paths); },
    async match(request) {
      if (request === "/index.html") return fallbackResponse;
      return undefined;
    },
  };
  const caches = {
    async open(name) { assert.equal(name, "depthward-static-test"); return cache; },
    async keys() { return ["depthward-static-old", "other-cache", "depthward-static-test"]; },
    async delete(name) { deleted.push(name); return true; },
  };
  let skippedWaiting = 0;
  const self = {
    location: { origin: "https://depthward.example" },
    addEventListener(type, listener) { listeners.set(type, listener); },
    skipWaiting() { skippedWaiting += 1; },
  };
  runInNewContext(workerSource, { self, caches, URL, fetch: async () => { throw new Error("offline"); } });
  return { listeners, added, deleted, fallbackResponse, get skippedWaiting() { return skippedWaiting; } };
}

test("PWA update is available only at an idle town boundary", () => {
  assert.equal(isSafePwaUpdateBoundary({ gameState: "town", isSubmenu: false, hasChest: false }), true);
  assert.equal(isSafePwaUpdateBoundary({ gameState: "town", isSubmenu: true, hasChest: false }), false);
  assert.equal(isSafePwaUpdateBoundary({ gameState: "explore", isSubmenu: false, hasChest: false }), false);
  assert.equal(isSafePwaUpdateBoundary({ gameState: "town", isSubmenu: false, hasChest: true }), false);
});

test("App shell list leaves out source maps and opt-in chunks", () => {
  assert.equal(isPrecacheCandidate("index.html"), true);
  assert.equal(isPrecacheCandidate("assets/pixi_renderer-CE6ExBvR.js"), true);
  assert.equal(isPrecacheCandidate("assets/index-B8qM_3f_.js.map"), false);
  // The Three.js explore-view prototype loads only behind ?view3d= (#2042).
  assert.equal(isPrecacheCandidate("assets/three_dungeon_view-BY7k4Qpc.js"), false);
});

test("Service Worker installs only the generated same-origin app shell list", async () => {
  const harness = createWorkerHarness();
  let installPromise;
  harness.listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.deepEqual(harness.added, ["/", "/index.html", "/assets/app.js"]);
});

test("Service Worker removes prior app caches and waits for an explicit apply message", async () => {
  const harness = createWorkerHarness();
  let activationPromise;
  harness.listeners.get("activate")({ waitUntil(promise) { activationPromise = promise; } });
  await activationPromise;
  assert.deepEqual(harness.deleted, ["depthward-static-old"]);

  harness.listeners.get("message")({ data: { type: "UNRELATED" } });
  assert.equal(harness.skippedWaiting, 0);
  harness.listeners.get("message")({ data: { type: "APPLY_UPDATE" } });
  assert.equal(harness.skippedWaiting, 1);
});

test("Service Worker leaves APIs alone and serves the cached app shell offline", async () => {
  const harness = createWorkerHarness();
  let apiResponded = false;
  harness.listeners.get("fetch")({
    request: { method: "GET", url: "https://depthward.example/api/telemetry", mode: "cors" },
    respondWith() { apiResponded = true; },
  });
  assert.equal(apiResponded, false);

  let responsePromise;
  harness.listeners.get("fetch")({
    request: { method: "GET", url: "https://depthward.example/", mode: "navigate" },
    respondWith(promise) { responsePromise = promise; },
  });
  assert.equal(await responsePromise, harness.fallbackResponse);
});
