export const TELEMETRY_SCHEMA_VERSION = 1;

const VALID_OUTCOMES = new Set(["death", "retreat", "abandon"]);
const VALID_COMBAT_RESULTS = new Set([
  "victory",
  "fled",
  "escape_to_town",
  "gameover",
  "other"
]);
const VALID_DEATH_TYPES = new Set(["combat", "trap", "status"]);
const PRE_INIT_BUFFER_LIMIT = 64;

let client = null;
let telemetryState = "uninitialized";
let pendingEvents = [];
let runId = null;
let combatId = null;
let combatEnded = false;
let fallbackIdCounter = 0;

function getPublicEnv() {
  return import.meta.env ?? {};
}

export function resolvePostHogApiHost(configuredHost, { isProduction = Boolean(getPublicEnv().PROD) } = {}) {
  const host = typeof configuredHost === "string" ? configuredHost.trim() : "";
  if (!host) return "";

  // Production uses the same-origin Vercel proxy to avoid Safari/WebKit CORS failures.
  return isProduction ? "/ingest" : host;
}

function createRuntimeId(prefix) {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return `${prefix}_${randomUuid.call(globalThis.crypto)}`;
  }

  const randomValues = globalThis.crypto?.getRandomValues;
  if (typeof randomValues === "function") {
    const bytes = randomValues.call(globalThis.crypto, new Uint8Array(16));
    const suffix = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${suffix}`;
  }

  fallbackIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackIdCounter.toString(36)}`;
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== undefined).map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

export function normalizeEnemyId(name) {
  const normalized = String(name ?? "").replace(/\s[A-Z]$/, "").trim();
  return normalized || "unknown";
}

export function normalizeOutcome(outcome) {
  return VALID_OUTCOMES.has(outcome) ? outcome : null;
}

export function normalizeCombatResult(result) {
  const normalized = {
    endCombat: "victory",
    fleeCombat: "fled",
    escapeToTown: "escape_to_town",
    runEscape: "fled",
    milestoneVictory: "victory",
    giveKey: "victory",
    triggerChest: "victory"
  }[result] ?? result;
  return VALID_COMBAT_RESULTS.has(normalized) ? normalized : "other";
}

export function normalizeDeathType(type) {
  return VALID_DEATH_TYPES.has(type) ? type : null;
}

function normalizeDeathCause(cause) {
  if (typeof cause !== "string") return null;
  const normalized = cause.trim();
  return normalized || null;
}

function initializeTelemetry() {
  const env = getPublicEnv();
  const key = typeof env.VITE_POSTHOG_KEY === "string" ? env.VITE_POSTHOG_KEY.trim() : "";
  const configuredHost = typeof env.VITE_POSTHOG_HOST === "string" ? env.VITE_POSTHOG_HOST : "";
  const host = resolvePostHogApiHost(configuredHost);
  if (!key || !configuredHost.trim() || !host) {
    telemetryState = "disabled";
    return;
  }

  telemetryState = "loading";

  import("posthog-js")
    .then(({ posthog, default: defaultPosthog }) => {
      const sdk = posthog ?? defaultPosthog;
      if (!sdk || typeof sdk.init !== "function") throw new Error("PostHog SDK unavailable");
      sdk.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        persistence: "memory"
      });
      client = sdk;
      telemetryState = "ready";
      flushPendingEvents();
    })
    .catch(() => {
      client = null;
      telemetryState = "disabled";
      pendingEvents = [];
    });
}

function captureWithClient(eventName, properties) {
  if (!client) return;
  try {
    const result = client.capture(eventName, properties);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // Analytics must never affect gameplay.
  }
}

function flushPendingEvents() {
  const events = pendingEvents;
  pendingEvents = [];
  events.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

function capture(eventName, properties) {
  const normalizedProperties = removeUndefined({
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    ...properties
  });
  if (client) {
    captureWithClient(eventName, normalizedProperties);
    return;
  }
  if (telemetryState !== "loading") return;

  if (pendingEvents.length >= PRE_INIT_BUFFER_LIMIT) pendingEvents.shift();
  pendingEvents.push({ eventName, properties: normalizedProperties });
}

function isTelemetryAvailable() {
  return telemetryState === "loading" || telemetryState === "ready";
}

export function trackEvent(eventName, properties = {}) {
  capture(eventName, properties);
}

export function trackRunStart(run, character) {
  if (!isTelemetryAvailable()) return;
  runId = createRuntimeId("run");
  combatId = null;
  combatEnded = false;

  capture("run_start", {
    runId,
    playerClass: character?.class ?? run?.characterClass ?? null,
    level: character?.level,
    startFloor: run?.startFloor,
    maxHp: character?.maxHp,
    maxMp: character?.maxMp,
    equipmentIds: Object.values(character?.equipment ?? {}).filter(value => typeof value === "string")
  });
}

export function trackCombatStart(combat) {
  if (!isTelemetryAvailable() || !runId) return;
  combatId = createRuntimeId("combat");
  combatEnded = false;

  capture("combat_start", {
    runId,
    combatId,
    floor: combat?.floor,
    playerClass: combat?.player?.class,
    playerHp: combat?.player?.hp,
    playerMp: combat?.player?.mp,
    enemyIds: (combat?.monsters ?? []).map(monster => normalizeEnemyId(monster?.name)),
    isBoss: Boolean(combat?.isBoss),
    isMidboss: Boolean(combat?.isMidboss),
    isRoamingFlack: Boolean(combat?.isRoamingFlack)
  });
}

export function trackDamageReceived(damage) {
  if (!isTelemetryAvailable() || !runId || !combatId) return;

  capture("damage_received", {
    runId,
    combatId,
    floor: damage?.floor,
    playerClass: damage?.playerClass,
    enemyId: normalizeEnemyId(damage?.enemyId),
    attackType: damage?.attackType ?? "other",
    rawDamage: damage?.rawDamage,
    finalDamage: damage?.finalDamage,
    finalDef: damage?.finalDef,
    defResistance: damage?.defResistance,
    playerHpBefore: damage?.playerHpBefore,
    playerHpAfter: damage?.playerHpAfter,
    playerMp: damage?.playerMp,
    mpWardActive: Boolean(damage?.mpWardActive),
    isDefending: Boolean(damage?.isDefending)
  });
}

export function trackCombatEnd(result, combat) {
  if (!isTelemetryAvailable() || !runId || !combatId || combatEnded) return;
  combatEnded = true;

  capture("combat_end", {
    runId,
    combatId,
    floor: combat?.floor,
    result: normalizeCombatResult(result),
    turns: combat?.turns,
    playerHp: combat?.player?.hp,
    playerMp: combat?.player?.mp,
    enemiesDefeated: (combat?.monsters ?? []).filter(monster => monster?.hp <= 0 && !monster?.fled).length
  });
}

export function trackRunEnd(run, outcome) {
  if (!isTelemetryAvailable() || !runId) return;

  const latestDeath = Array.isArray(run?.deathLogs) ? run.deathLogs.at(-1) : null;
  const deathType = normalizeDeathType(latestDeath?.type);
  const deathSource = latestDeath?.source ? normalizeEnemyId(latestDeath.source) : null;
  capture("run_end", {
    runId,
    playerClass: run?.characterClass,
    outcome: normalizeOutcome(outcome),
    returnReason: run?.returnReason ?? null,
    deepestFloor: run?.deepestFloor,
    steps: run?.steps,
    battles: run?.battles,
    kills: run?.kills,
    elitesKilled: run?.elitesKilled,
    bossesKilled: run?.bossesKilled,
    chestsOpened: run?.chestsOpened,
    trapsTriggered: run?.trapsTriggered,
    durationMs: Number.isFinite(run?.startedAt) && run.startedAt > 0
      ? Math.max(0, Date.now() - run.startedAt)
      : null,
    deathType,
    deathSource,
    deathCause: normalizeDeathCause(latestDeath?.cause)
  });
  runId = null;
  combatId = null;
  combatEnded = false;
}

export function __setTelemetryClientForTests(testClient) {
  const queuedEvents = testClient ? pendingEvents : [];
  pendingEvents = [];
  client = testClient ?? null;
  telemetryState = testClient ? "ready" : "disabled";
  runId = null;
  combatId = null;
  combatEnded = false;
  queuedEvents.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

export function __setTelemetryInitializationForTests({ enabled = false } = {}) {
  client = null;
  telemetryState = enabled ? "loading" : "disabled";
  pendingEvents = [];
  runId = null;
  combatId = null;
  combatEnded = false;
}

export function __resetTelemetryForTests() {
  __setTelemetryClientForTests(null);
}

initializeTelemetry();
