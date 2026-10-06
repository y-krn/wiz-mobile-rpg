/* global console, process, window, document */
// Seeded browser playtest runner (#1799).
//
// Drives the real game in headless Chromium through browser_playtest_driver.js. Each
// seed gets a fresh browser context (empty save), a seeded Math.random,
// and a fixed run seed, so the same seed replays the same floors and the
// same combat/loot rolls as long as the bot makes the same choices.
//
//   npm run dev -- --port 5173
//   node scratch/measurements/run_browser_playtest.js --url http://localhost:5173 \
//     --seeds 1-10 --kit vanguard --equip greedy --out /tmp/pt.json
//
// Vite pushes a full-reload to every open page when a module it serves changes
// (an edit or a branch switch in the served checkout).
// The init script drops those HMR messages so a running seed keeps the code it
// loaded; suppressed updates are reported per seed (`hmrSuppressed`), because
// the next seed's fresh page loads the changed source. Pass --allowHmr to keep
// Vite's reloads. For clean measurements still prefer a dev server whose source
// is not being edited (e.g. a separate worktree of a commit).
//
// Each seed has a wall-clock limit (--seedTimeout seconds, default 900). A
// failed seed is retried once, then recorded with `error` and the run moves on.
// --out is rewritten after every seed and on Ctrl-C, with `complete: false`
// until all seeds finish.
//
// Speed. The game redraws on every animation frame, and without a GPU that
// drawing (not the game logic) is what a headless run spends its CPU on. --fps
// limits the page's animation frames (default 1 per second headless, no limit
// with --headed; --fps 0 = no limit), and --jobs N plays N runs at once, each
// in its own browser. Neither changes how a seed plays out (same fights, loot
// and result). The journal's bookkeeping lines (the log line or status the bot
// samples around a tap) can differ by a line when the machine is overloaded,
// so keep --jobs at about twice the CPU cores.
//
// Before/after comparison on identical maps: start two dev servers from two
// worktrees (e.g. main and your branch) and pass both:
//   node scratch/measurements/run_browser_playtest.js --url http://localhost:5173 \
//     --compare http://localhost:5174 --seeds 1-10
//
// Floors come from runSeed (independent of combat RNG), so both sides see the
// same maps. Combat/loot rolls share one Math.random stream, so they diverge
// after the first point where the two builds consume randomness differently.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const HELPER_SOURCE = fs.readFileSync(path.join(here, "browser_playtest_driver.js"), "utf8");

function parseArgs(argv) {
  const opts = {
    url: "http://localhost:5173", compare: null, seeds: "1-5", kit: "vanguard",
    explore: 0.6, equip: "greedy", maxFloor: null, speed: 0.1, out: null,
    // Run policy; null keeps the driver's default (see browser_playtest_driver.js).
    recovery: null, rooms: null, cores: null,
    boss: false, bossLevel: 3, bossMaxHp: 55, bossHp: 40, headed: false,
    seedTimeout: 900, allowHmr: false, fps: null, jobs: 1
  };
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].replace(/^--/, "").split("=", 2);
    const v = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true");
    if (k === "maxFloor" || k === "bossLevel" || k === "bossMaxHp" || k === "bossHp") opts[k] = Number(v);
    else if (k === "explore" || k === "speed" || k === "seedTimeout" || k === "fps" || k === "jobs") opts[k] = Number(v);
    else if (k === "boss" || k === "headed" || k === "allowHmr") opts[k] = v !== "false";
    else opts[k] = v;
  }
  // Watching a headed run at one frame a second is useless; measuring at 60 is waste.
  if (opts.fps === null) opts.fps = opts.headed ? 0 : 1;
  if (!Number.isFinite(opts.fps) || opts.fps < 0) throw new Error(`--fps must be 0 (no limit) or a positive number, got ${opts.fps}`);
  if (!Number.isInteger(opts.jobs) || opts.jobs < 1) throw new Error(`--jobs must be a positive integer, got ${opts.jobs}`);
  return opts;
}

function parseSeeds(spec) {
  return String(spec).split(",").flatMap(part => {
    const [a, b] = part.split("-").map(Number);
    return Number.isFinite(b) ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}

// Runs before any page script: seeded Math.random + optional timer speed-up,
// an optional animation-frame limit, and (unless allowHmr) a filter that keeps
// Vite HMR from reloading the page.
function initScript({ seed, speed, allowHmr, fps }) {
  let a = (seed * 2654435761) >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const realSetTimeout = window.setTimeout.bind(window);
  window.__realSetTimeout = realSetTimeout;
  if (speed > 0 && speed < 1) {
    window.setTimeout = (fn, delay, ...args) => realSetTimeout(fn, (delay || 0) > 40 ? delay * speed : delay, ...args);
  }
  if (fps > 0) {
    // Frames are handed out on a real timer, so the game loop draws `fps`
    // times a second instead of at the display rate.
    const frameMs = 1000 / fps;
    const pendingFrames = new Map();
    let nextFrameId = 0;
    window.requestAnimationFrame = callback => {
      const id = ++nextFrameId;
      pendingFrames.set(id, realSetTimeout(() => {
        pendingFrames.delete(id);
        callback(performance.now());
      }, frameMs));
      return id;
    };
    window.cancelAnimationFrame = id => {
      clearTimeout(pendingFrames.get(id));
      pendingFrames.delete(id);
    };
  }
  window.__hmrSuppressed = [];
  if (allowHmr) return;
  // The Vite client opens `new WebSocket(url, "vite-hmr")` and reacts to
  // "update" / "full-reload" / "prune" by swapping modules or reloading. Keep
  // the socket open (a closed socket also ends in location.reload()) but never
  // deliver those payloads.
  const RealWebSocket = window.WebSocket;
  const DROP = new Set(["update", "full-reload", "prune"]);
  window.WebSocket = class extends RealWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      const isHmr = [].concat(protocols ?? []).includes("vite-hmr");
      if (!isHmr) return;
      const add = this.addEventListener.bind(this);
      this.addEventListener = (type, listener, options) => {
        if (type !== "message") return add(type, listener, options);
        return add(type, event => {
          let payload = null;
          try { payload = JSON.parse(event.data); } catch { /* pass through */ }
          if (payload && DROP.has(payload.type)) {
            const paths = payload.type === "update" ? (payload.updates || []).map(u => u.path) : [payload.path || payload.type];
            window.__hmrSuppressed.push(...paths);
            return;
          }
          listener.call(this, event);
        }, options);
      };
    }
  };
}

async function playOne(browser, baseUrl, seed, opts) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  let timer = null;
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(0);
    // Game exceptions thrown inside click handlers never reach the driver;
    // keep them so a seed that stalls on one can be diagnosed from the JSON.
    page.on("pageerror", error => {
      const first = String(error.stack || error.message || error).split("\n").slice(0, 2).join(" ").trim();
      const hit = pageErrors.find(e => e.message === first);
      if (hit) hit.count++;
      else if (pageErrors.length < 20) pageErrors.push({ message: first, count: 1 });
    });
    await page.addInitScript(initScript, { seed, speed: opts.speed, allowHmr: opts.allowHmr, fps: opts.fps });
    await page.goto(`${baseUrl}/`, { waitUntil: "load" });
    await page.waitForFunction(() => document.body.innerText.includes("準備を整える"), null, { timeout: 30000 });
    await page.addScriptTag({ content: HELPER_SOURCE, type: "module" });
    await page.waitForFunction(() => typeof window.__playRun === "function", null, { timeout: 30000 });
    // From here on a main-frame navigation means the dev server reloaded the
    // page (HMR with --allowHmr, or a server restart); fail with that reason.
    let navigated = null;
    const onNavigate = frame => { if (frame === page.mainFrame()) navigated = frame.url(); };
    page.on("framenavigated", onNavigate);
    const started = Date.now();
    const run = opts.boss
      ? page.evaluate(o => window.__bossTest(o), { floor: 5, level: opts.bossLevel, maxHp: opts.bossMaxHp, hp: opts.bossHp, seed })
      : page.evaluate(o => window.__playRun(o), {
        kit: opts.kit, seed, explore: opts.explore, maxFloor: opts.maxFloor, equip: opts.equip,
        recovery: opts.recovery, rooms: opts.rooms, cores: opts.cores
      });
    const limit = new Promise((_, reject) => {
      if (opts.seedTimeout > 0) timer = setTimeout(() => reject(new Error(`seed timed out after ${opts.seedTimeout}s`)), opts.seedTimeout * 1000);
    });
    let result;
    try {
      result = await Promise.race([run, limit]);
    } catch (error) {
      // Playwright rejects on the destroyed context before "framenavigated" fires.
      if (navigated || /Execution context was destroyed/.test(error.message)) throw new Error(`page reloaded mid-run (dev server HMR or restart): ${error.message.split("\n")[0]}`);
      // Snapshot where the bot was so a stalled seed can be diagnosed.
      error.snapshot = await Promise.race([
        page.evaluate(() => ({ status: window.__status(), buttons: window.__btns(), log: window.__log(4), journal: window.__journal.slice(-6) })),
        new Promise(resolve => setTimeout(() => resolve(null), 5000))
      ]).catch(() => null);
      throw error;
    }
    page.off("framenavigated", onNavigate);
    const hmrSuppressed = await page.evaluate(() => [...new Set(window.__hmrSuppressed || [])]);
    return {
      url: baseUrl, seed, seconds: Math.round((Date.now() - started) / 1000), ...result,
      ...(pageErrors.length ? { pageErrors } : {}),
      ...(hmrSuppressed.length ? { hmrSuppressed } : {})
    };
  } catch (error) {
    error.pageErrors = pageErrors;
    throw error;
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
  }
}

async function playWithRetry(browser, url, seed, opts) {
  let firstError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await playOne(browser, url, seed, opts);
      return firstError ? { ...r, retried: firstError } : r;
    } catch (error) {
      const reason = String(error.message || error).split("\n")[0];
      if (attempt === 2) {
        return {
          url, seed, error: reason, retried: firstError,
          ...(error.snapshot ? { snapshot: error.snapshot } : {}),
          ...(error.pageErrors?.length ? { pageErrors: error.pageErrors } : {})
        };
      }
      firstError = reason;
      console.log(`${url} seed ${seed}: retry after ${reason}${error.snapshot ? ` at ${error.snapshot.status}` : ""}`);
    }
  }
}

function summarize(label, results) {
  const failed = results.filter(r => r.error);
  results = results.filter(r => !r.error);
  const deepest = results.map(r => r.deepest ?? "-");
  const reachedB5 = results.filter(r => (r.deepest ?? 0) >= 5).length;
  const guardianWins = results.filter(r => r.guardian?.some(g => g.includes("WON"))).length;
  const cores = results.reduce((n, r) => n + (r.loot || []).filter(l => l.core).length, 0);
  const stuck = results.filter(r => r.end === "stuck").map(r => r.seed);
  const returned = results.filter(r => r.returned).length;
  const potions = results.reduce((n, r) => n + (r.purchases || []).reduce((m, p) => m + p.count, 0), 0);
  const rooms = results.reduce((n, r) => n + (r.roomActions || []).length, 0);
  const refusedEquips = results.reduce((n, r) => n + (r.equipLog || []).filter(l => l.includes("cannot equip")).length, 0);
  console.log(`${label}: deepest [${deepest.join(",")}] reachedB5 ${reachedB5}/${results.length} guardianWins ${guardianWins} coreItemsSeen ${cores}${failed.length ? ` failedSeeds [${failed.map(r => r.seed).join(",")}]` : ""}`);
  console.log(`${label}: stuck [${stuck.join(",")}] returned ${returned} potionsBought ${potions} roomActions ${rooms} cannotEquip ${refusedEquips}`);
}

function formatLine(url, seed, r, opts) {
  if (r.error) return `${url} seed ${seed}: FAILED ${r.error}`;
  const notes = [
    r.pageErrors ? `pageErrors ${r.pageErrors.reduce((n, e) => n + e.count, 0)}` : "",
    r.hmrSuppressed ? `hmrSuppressed ${r.hmrSuppressed.length}` : ""
  ].filter(Boolean).join(" ");
  const body = opts.boss
    ? `${r.result || r.error}`
    : `deepest B${r.deepest} Lv${r.level} ${r.died ? "died" : r.end} ${r.guardian?.join(" ") || ""}`;
  return `${url} seed ${seed}: ${body}${notes ? ` [${notes}]` : ""} (${r.seconds}s)`;
}

const opts = parseArgs(process.argv.slice(2));
const seeds = parseSeeds(opts.seeds);
const targets = [opts.url, ...(opts.compare ? [opts.compare] : [])];
// One slot per seed and side, filled as runs finish, so each side stays in
// seed order however the runs are interleaved.
const all = Object.fromEntries(targets.map(url => [url, new Array(seeds.length).fill(null)]));
const tasks = targets.flatMap(url => seeds.map((seed, index) => ({ url, seed, index })));

function writeOut(complete) {
  if (!opts.out) return;
  // A partial file holds the finished runs only.
  const results = Object.fromEntries(targets.map(url => [url, all[url].filter(Boolean)]));
  fs.writeFileSync(opts.out, `${JSON.stringify({ options: opts, seeds, complete, results }, null, 2)}\n`);
}

// Ctrl-C: keep the finished seeds and exit at once. Chromium gets the same
// SIGINT, so the seed in flight would otherwise be recorded as a failure.
process.once("SIGINT", () => {
  writeOut(false);
  if (opts.out) console.log(`interrupted; wrote partial ${opts.out}`);
  process.exit(130);
});

// Each job owns a browser: runs that share one also share its GPU process,
// which is the part that runs out of CPU first.
const browsers = [];
let nextTask = 0;
async function runJob() {
  const browser = await chromium.launch({ headless: !opts.headed });
  browsers.push(browser);
  while (nextTask < tasks.length) {
    const { url, seed, index } = tasks[nextTask++];
    const r = await playWithRetry(browser, url, seed, opts);
    all[url][index] = r;
    console.log(formatLine(url, seed, r, opts));
    writeOut(false);
  }
}
const startedAt = Date.now();
try {
  await Promise.all(Array.from({ length: Math.min(opts.jobs, tasks.length) }, runJob));
} finally {
  await Promise.all(browsers.map(browser => browser.close().catch(() => {})));
}
console.log(`${tasks.length} runs in ${Math.round((Date.now() - startedAt) / 1000)}s (jobs ${opts.jobs}, fps ${opts.fps || "unlimited"})`);
if (!opts.boss) for (const url of targets) summarize(url, all[url]);
for (const url of targets) {
  const errors = new Map();
  for (const r of all[url]) for (const e of r.pageErrors || []) errors.set(e.message, (errors.get(e.message) || 0) + e.count);
  for (const [message, count] of errors) console.log(`${url} page error x${count}: ${message}`);
  const reloads = all[url].filter(r => r.hmrSuppressed).map(r => r.seed);
  if (reloads.length) console.log(`${url} source changed during seeds [${reloads.join(",")}]: later seeds ran newer code`);
}
if (opts.compare && !opts.boss) {
  const [a, b] = targets;
  const same = all[a].filter((r, i) => r.start?.mapFingerprint && r.start.mapFingerprint === all[b][i]?.start?.mapFingerprint).length;
  console.log(`same B1 map on both sides: ${same}/${seeds.length}`);
}
if (opts.out) {
  writeOut(true);
  console.log(`wrote ${opts.out}`);
}
