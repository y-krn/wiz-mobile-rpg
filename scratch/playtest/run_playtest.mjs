/* global console, process, window, document */
// Seeded browser playtest runner (#1799).
//
// Drives the real game in headless Chromium through play_helpers.js. Each
// seed gets a fresh browser context (empty trial save), a seeded Math.random,
// and a fixed run seed, so the same seed replays the same floors and the
// same combat/loot rolls as long as the bot makes the same choices.
//
//   npm run dev -- --port 5173
//   node scratch/playtest/run_playtest.mjs --url http://localhost:5173 \
//     --seeds 1-10 --kit vanguard --equip greedy --out /tmp/pt.json
//
// Before/after comparison on identical maps: start two dev servers from two
// worktrees (e.g. main and your branch) and pass both:
//   node scratch/playtest/run_playtest.mjs --url http://localhost:5173 \
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
const HELPER_SOURCE = fs.readFileSync(path.join(here, "play_helpers.js"), "utf8");

function parseArgs(argv) {
  const opts = {
    url: "http://localhost:5173", compare: null, seeds: "1-5", kit: "vanguard",
    explore: 0.6, equip: "greedy", maxFloor: null, speed: 0.1, out: null,
    boss: false, bossLevel: 3, bossMaxHp: 55, bossHp: 40, headed: false
  };
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].replace(/^--/, "").split("=", 2);
    const v = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true");
    if (k === "maxFloor" || k === "bossLevel" || k === "bossMaxHp" || k === "bossHp") opts[k] = Number(v);
    else if (k === "explore" || k === "speed") opts[k] = Number(v);
    else if (k === "boss" || k === "headed") opts[k] = v !== "false";
    else opts[k] = v;
  }
  return opts;
}

function parseSeeds(spec) {
  return String(spec).split(",").flatMap(part => {
    const [a, b] = part.split("-").map(Number);
    return Number.isFinite(b) ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}

// Runs before any page script: seeded Math.random + optional timer speed-up.
function initScript({ seed, speed }) {
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
}

async function playOne(browser, baseUrl, seed, opts) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  await page.addInitScript(initScript, { seed, speed: opts.speed });
  await page.goto(`${baseUrl}/?tryout=vnext&trialProfile=phase3-equipment`, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.innerText.includes("準備を整える"), null, { timeout: 30000 });
  await page.addScriptTag({ content: HELPER_SOURCE, type: "module" });
  await page.waitForFunction(() => typeof window.__playRun === "function", null, { timeout: 30000 });
  const started = Date.now();
  const result = opts.boss
    ? await page.evaluate(o => window.__bossTest(o), { floor: 5, level: opts.bossLevel, maxHp: opts.bossMaxHp, hp: opts.bossHp, seed })
    : await page.evaluate(o => window.__playRun(o), {
      kit: opts.kit, seed, explore: opts.explore, maxFloor: opts.maxFloor, equip: opts.equip
    });
  await context.close();
  return { url: baseUrl, seed, seconds: Math.round((Date.now() - started) / 1000), ...result };
}

function summarize(label, results) {
  const deepest = results.map(r => r.deepest ?? "-");
  const reachedB5 = results.filter(r => (r.deepest ?? 0) >= 5).length;
  const guardianWins = results.filter(r => r.guardian?.some(g => g.includes("WON"))).length;
  const cores = results.reduce((n, r) => n + (r.loot || []).filter(l => l.core).length, 0);
  console.log(`${label}: deepest [${deepest.join(",")}] reachedB5 ${reachedB5}/${results.length} guardianWins ${guardianWins} coreItemsSeen ${cores}`);
}

const opts = parseArgs(process.argv.slice(2));
const seeds = parseSeeds(opts.seeds);
const targets = [opts.url, ...(opts.compare ? [opts.compare] : [])];
const browser = await chromium.launch({ headless: !opts.headed });
const all = {};
try {
  for (const url of targets) {
    all[url] = [];
    for (const seed of seeds) {
      const r = await playOne(browser, url, seed, opts);
      all[url].push(r);
      const line = opts.boss
        ? `${url} seed ${seed}: ${r.result || r.error}`
        : `${url} seed ${seed}: deepest B${r.deepest} Lv${r.level} ${r.died ? "died" : r.end} ${r.guardian?.join(" ") || ""} (${r.seconds}s)`;
      console.log(line);
    }
  }
} finally {
  await browser.close();
}
if (!opts.boss) for (const url of targets) summarize(url, all[url]);
if (opts.compare && !opts.boss) {
  const [a, b] = targets;
  const same = all[a].filter((r, i) => r.start?.mapFingerprint && r.start.mapFingerprint === all[b][i]?.start?.mapFingerprint).length;
  console.log(`same B1 map on both sides: ${same}/${seeds.length}`);
}
if (opts.out) {
  fs.writeFileSync(opts.out, `${JSON.stringify({ options: opts, seeds, results: all }, null, 2)}\n`);
  console.log(`wrote ${opts.out}`);
}
