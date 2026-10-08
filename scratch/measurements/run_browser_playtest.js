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
//
// Measuring a commit (#2079): --ref <git ref> (and --compareRef <git ref>)
// checks the commit out into a temporary worktree, serves it from its own dev
// server on a free port, and stops both afterwards, so edits in your checkout
// cannot reach the run. Each finished seed is cached under the shared git
// directory, keyed by the game's source tree at that commit, this runner and
// its driver, the options that change play, and the seed. A later run with the
// same key reads the cache instead of playing (only the missing seeds play);
// --fresh ignores it. Failed, timed-out and HMR-touched runs are never cached.
//   node scratch/measurements/run_browser_playtest.js --ref origin/main \
//     --compareRef HEAD --seeds 1-10 --kit vanguard --dungeon mine

import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const HELPER_SOURCE = fs.readFileSync(path.join(here, "browser_playtest_driver.js"), "utf8");
const RUNNER_SOURCE = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");

function parseArgs(argv) {
  const opts = {
    url: "http://localhost:5173", compare: null, ref: null, compareRef: null, fresh: false, seeds: "1-5", kit: "vanguard",
    explore: 0.6, equip: "greedy", maxFloor: null, speed: 0.1, out: null,
    // Run policy; null keeps the driver's default (see browser_playtest_driver.js).
    recovery: null, rooms: null, cores: null, roundTrip: null, turnBack: null, dungeon: null,
    boss: false, bossLevel: 3, bossMaxHp: 55, bossHp: 40, headed: false,
    seedTimeout: 900, allowHmr: false, fps: null, jobs: os.availableParallelism()
  };
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].replace(/^--/, "").split("=", 2);
    const v = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true");
    if (k === "maxFloor" || k === "bossLevel" || k === "bossMaxHp" || k === "bossHp") opts[k] = Number(v);
    else if (k === "turnBack") opts[k] = Number(v);
    else if (k === "explore" || k === "speed" || k === "seedTimeout" || k === "fps" || k === "jobs") opts[k] = Number(v);
    else if (k === "boss" || k === "headed" || k === "allowHmr" || k === "fresh") opts[k] = v !== "false";
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
        recovery: opts.recovery, rooms: opts.rooms, cores: opts.cores, roundTrip: opts.roundTrip, turnBack: opts.turnBack,
        dungeon: opts.dungeon
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
  // Floors are counted inside the dungeon (#2060): B5 is its bottom floor.
  const depthOf = r => r.depth ?? r.deepest;
  const deepest = results.map(r => depthOf(r) ?? "-");
  const reachedB5 = results.filter(r => (depthOf(r) ?? 0) >= 5).length;
  const cleared = results.filter(r => r.cleared).length;
  const guardianWins = results.filter(r => r.guardian?.some(g => g.includes("WON"))).length;
  const cores = results.reduce((n, r) => n + (r.loot || []).filter(l => l.core).length, 0);
  const stuck = results.filter(r => r.end === "stuck").map(r => r.seed);
  const returned = results.filter(r => r.returned).length;
  const potions = results.reduce((n, r) => n + (r.purchases || []).reduce((m, p) => m + p.count, 0), 0);
  const rooms = results.reduce((n, r) => n + (r.roomActions || []).length, 0);
  const refusedEquips = results.reduce((n, r) => n + (r.equipLog || []).filter(l => l.includes("cannot equip")).length, 0);
  console.log(`${label}: deepest [${deepest.join(",")}] reachedB5 ${reachedB5}/${results.length} guardianWins ${guardianWins} coreItemsSeen ${cores}${failed.length ? ` failedSeeds [${failed.map(r => r.seed).join(",")}]` : ""}`);
  console.log(`${label}: stuck [${stuck.join(",")}] returned ${returned} cleared ${cleared} potionsBought ${potions} roomActions ${rooms} cannotEquip ${refusedEquips}`);
  // Round-trip prototype (#2066): how the way back went.
  const roundTrips = results.filter(r => r.roundTrip);
  if (roundTrips.length > 0) {
    const walkedOut = roundTrips.filter(r => r.returnReason === "surface").length;
    const treasureOut = roundTrips.filter(r => r.returnReason === "surface" && r.roundTrip.treasure).length;
    const diedOnWayBack = roundTrips.filter(r => r.died && r.roundTrip.awake).length;
    const caught = roundTrips.reduce((n, r) => n + (r.returnFlees || 0), 0);
    const closest = roundTrips.flatMap(r => Object.values(r.hunterMin || {})).sort((a, b) => a - b);
    const median = closest.length ? closest[Math.floor(closest.length / 2)] : "-";
    console.log(`${label}: roundTrip walkedOut ${walkedOut}/${roundTrips.length} treasureOut ${treasureOut} diedOnWayBack ${diedOnWayBack} caughtOnWayBack ${caught} hunterClosestMedian ${median}`);
  }
}

function formatLine(url, seed, r, opts) {
  if (r.error) return `${url} seed ${seed}: FAILED ${r.error}`;
  const notes = [
    r.pageErrors ? `pageErrors ${r.pageErrors.reduce((n, e) => n + e.count, 0)}` : "",
    r.hmrSuppressed ? `hmrSuppressed ${r.hmrSuppressed.length}` : ""
  ].filter(Boolean).join(" ");
  const body = opts.boss
    ? `${r.result || r.error}`
    : `deepest B${r.depth ?? r.deepest} Lv${r.level} ${r.died ? "died" : r.end} ${r.guardian?.join(" ") || ""}`;
  return `${url} seed ${seed}: ${body}${notes ? ` [${notes}]` : ""} (${r.seconds}s)`;
}

// --- Measuring commits (--ref / --compareRef) and the per-seed cache ---

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
// What the served game is built from. A commit that touches none of these
// (design notes, tests, scratch) plays exactly like its parent.
const GAME_PATHS = ["src", "public", "index.html", "vite.config.js", "package-lock.json"];
// Options that change how a seed plays out. url/jobs/fps/seedTimeout/headed do not.
const PLAY_OPTIONS = ["kit", "explore", "equip", "maxFloor", "speed", "recovery", "rooms", "cores", "roundTrip", "turnBack", "dungeon", "boss", "bossLevel", "bossMaxHp", "bossHp"];
const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");
const CACHE_DIR = path.join(path.resolve(git("rev-parse", "--git-common-dir")), "playtest-cache");
const BOT_HASH = sha256(`${RUNNER_SOURCE}\0${HELPER_SOURCE}`);

function resolveRef(ref) {
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  const gameTree = sha256(git("ls-tree", sha, "--", ...GAME_PATHS));
  const play = Object.fromEntries(PLAY_OPTIONS.map(k => [k, opts[k]]));
  const key = sha256(JSON.stringify({ gameTree, bot: BOT_HASH, play })).slice(0, 24);
  return { ref, sha, gameTree, key, label: `${ref}@${sha.slice(0, 8)}` };
}

const cacheFile = (target, seed) => path.join(CACHE_DIR, "runs", target.key, `seed-${seed}.json`);
function readCached(target, seed) {
  if (opts.fresh) return null;
  try {
    return JSON.parse(fs.readFileSync(cacheFile(target, seed), "utf8"));
  } catch {
    return null;
  }
}
function writeCached(target, seed, r) {
  if (r.error || r.hmrSuppressed) return;
  const file = cacheFile(target, seed);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write then rename so a concurrent reader never sees half a file.
  fs.writeFileSync(`${file}.${process.pid}.tmp`, `${JSON.stringify({ ...r, cachedFrom: { sha: target.sha, at: new Date().toISOString() } })}\n`);
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Checks the commit out into a temporary worktree (node_modules linked from
// this checkout) and serves it; returns the url and a stop function.
async function serveCommit(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `playtest-${target.sha.slice(0, 8)}-`));
  git("worktree", "add", "--detach", "--force", dir, target.sha);
  fs.symlinkSync(path.resolve(git("rev-parse", "--show-toplevel"), "node_modules"), path.join(dir, "node_modules"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(dir, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: dir, stdio: "ignore" });
  const stop = () => {
    server.kill();
    try {
      git("worktree", "remove", "--force", dir);
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  for (const started = Date.now(); ;) {
    if (server.exitCode !== null) { stop(); throw new Error(`dev server for ${target.label} exited with ${server.exitCode}`); }
    if (await fetch(url).then(res => res.ok, () => false)) break;
    if (Date.now() - started > 60000) { stop(); throw new Error(`dev server for ${target.label} did not start in 60s`); }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  console.log(`serving ${target.label} at ${url}`);
  return { url, stop };
}

const opts = parseArgs(process.argv.slice(2));
const seeds = parseSeeds(opts.seeds);
// A target is a url you serve yourself, or a commit this runner serves (and caches).
const targets = [
  opts.ref ? resolveRef(opts.ref) : { label: opts.url, url: opts.url },
  ...(opts.compareRef ? [resolveRef(opts.compareRef)] : opts.compare ? [{ label: opts.compare, url: opts.compare }] : [])
];
// One slot per seed and side, filled as runs finish, so each side stays in
// seed order however the runs are interleaved.
const all = Object.fromEntries(targets.map(t => [t.label, new Array(seeds.length).fill(null)]));
const tasks = [];
let cachedRuns = 0;
for (const target of targets) {
  seeds.forEach((seed, index) => {
    const cached = target.key ? readCached(target, seed) : null;
    if (!cached) return tasks.push({ target, seed, index });
    all[target.label][index] = { ...cached, url: target.label, cached: true };
    cachedRuns++;
    console.log(`${formatLine(target.label, seed, cached, opts)} (cached)`);
  });
}

function writeOut(complete) {
  if (!opts.out) return;
  // A partial file holds the finished runs only.
  const results = Object.fromEntries(targets.map(t => [t.label, all[t.label].filter(Boolean)]));
  const refs = targets.filter(t => t.key).map(({ ref, sha, gameTree, key, label }) => ({ ref, sha, gameTree, key, label }));
  fs.writeFileSync(opts.out, `${JSON.stringify({ options: opts, seeds, complete, ...(refs.length ? { refs } : {}), results }, null, 2)}\n`);
}

const servers = [];
const stopServers = () => { for (const s of servers.splice(0)) s.stop(); };
// Ctrl-C: keep the finished seeds and exit at once. Chromium gets the same
// SIGINT, so the seed in flight would otherwise be recorded as a failure.
process.once("SIGINT", () => {
  writeOut(false);
  stopServers();
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
    const { target, seed, index } = tasks[nextTask++];
    const played = await playWithRetry(browser, target.url, seed, opts);
    const r = { ...played, url: target.label };
    if (target.key) writeCached(target, seed, r);
    all[target.label][index] = r;
    console.log(formatLine(target.label, seed, r, opts));
    writeOut(false);
  }
}
const startedAt = Date.now();
try {
  for (const target of targets) {
    if (!target.key || !tasks.some(t => t.target === target)) continue;
    const server = await serveCommit(target);
    servers.push(server);
    target.url = server.url;
  }
  await Promise.all(Array.from({ length: Math.min(opts.jobs, tasks.length) }, runJob));
} finally {
  await Promise.all(browsers.map(browser => browser.close().catch(() => {})));
  stopServers();
}
console.log(`${tasks.length} runs in ${Math.round((Date.now() - startedAt) / 1000)}s (jobs ${opts.jobs}, fps ${opts.fps || "unlimited"})${cachedRuns ? `, ${cachedRuns} from cache` : ""}`);
const labels = targets.map(t => t.label);
if (!opts.boss) for (const label of labels) summarize(label, all[label]);
for (const label of labels) {
  const errors = new Map();
  for (const r of all[label]) for (const e of r.pageErrors || []) errors.set(e.message, (errors.get(e.message) || 0) + e.count);
  for (const [message, count] of errors) console.log(`${label} page error x${count}: ${message}`);
  const reloads = all[label].filter(r => r.hmrSuppressed).map(r => r.seed);
  if (reloads.length) console.log(`${label} source changed during seeds [${reloads.join(",")}]: later seeds ran newer code`);
}
if (labels.length === 2 && !opts.boss) {
  const [a, b] = labels;
  const same = all[a].filter((r, i) => r.start?.mapFingerprint && r.start.mapFingerprint === all[b][i]?.start?.mapFingerprint).length;
  console.log(`same B1 map on both sides: ${same}/${seeds.length}`);
}
if (opts.out) {
  writeOut(true);
  console.log(`wrote ${opts.out}`);
}
