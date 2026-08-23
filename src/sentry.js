// Runtime-neutral Sentry facade.
//
// The browser SDK is configured by sentry_browser.js. Keeping this module free
// of browser-only imports lets Node simulations and state modules load without
// pulling in @sentry/browser or requiring DOM globals.
let sentryApi = null;
let enabled = false;
let snapshotProvider = null;

export function configureSentry(api, isEnabled) {
  sentryApi = isEnabled ? api : null;
  enabled = Boolean(isEnabled && api);
}

// Live game state provider registered by game.js through error_context.js.
export function setGameSnapshotProvider(fn) {
  snapshotProvider = fn;
}

export function getGameSnapshotProvider() {
  return snapshotProvider;
}

// Game event breadcrumb wrapper. Disabled environments remain a no-op.
export function addGameBreadcrumb(category, message, data) {
  if (!enabled) return;
  sentryApi.addBreadcrumb({ category, message, data, level: "info" });
}

// Save/storage telemetry uses these wrappers so importing state in Node does
// not import the browser SDK. The configured browser API is still used during
// normal browser execution.
export function captureException(error, context) {
  if (!enabled) return;
  sentryApi.captureException(error, context);
}

export function captureMessage(message, context) {
  if (!enabled) return;
  sentryApi.captureMessage(message, context);
}

// Compatibility surface for callers that imported Sentry from this module.
// It intentionally contains only the runtime-neutral methods used by the app.
export const Sentry = Object.freeze({
  addBreadcrumb: addGameBreadcrumb,
  captureException,
  captureMessage,
});
