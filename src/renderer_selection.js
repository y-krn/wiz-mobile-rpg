// balance-impact: none — PixiJS startup state only; gameplay rules unchanged.
// Renderer state is presentation-only and never enters gameplay/save state.

export const DEFAULT_RENDERER = "pixi";

const FAILURE_PHASES = new Set([
  "import",
  "application-create",
  "pixi/context",
  "mount",
  "initial-render",
  "unsupported",
  "runtime"
]);

export function resolveRendererRequest(search = "") {
  const rawValue = new URLSearchParams(search).get("renderer");

  return Object.freeze({
    requestedRenderer: DEFAULT_RENDERER,
    requestedValue: rawValue,
    normalization: rawValue === null
      ? "production-default"
      : rawValue === DEFAULT_RENDERER
        ? "explicit"
        : "unknown-default"
  });
}

export function createRendererSelectionState(search = "") {
  return {
    ...resolveRendererRequest(search),
    selectedRenderer: null,
    failureOccurred: false,
    failureReason: null,
    failurePhase: null
  };
}

export function selectRenderer(state) {
  return {
    ...state,
    selectedRenderer: DEFAULT_RENDERER,
    failureOccurred: false,
    failureReason: null,
    failurePhase: null
  };
}

export function selectRendererFailure(state, { reason, phase }) {
  return {
    ...state,
    selectedRenderer: null,
    failureOccurred: true,
    failureReason: reason,
    failurePhase: phase || null
  };
}

export function normalizeFailurePhase(value) {
  return FAILURE_PHASES.has(value) ? value : null;
}

export function getInjectedFailurePhase(scope = globalThis) {
  const hook = scope?.__WIZ_RENDERER_FAILURE__;
  const value = typeof hook === "string" ? hook : hook?.phase;
  return normalizeFailurePhase(value);
}
