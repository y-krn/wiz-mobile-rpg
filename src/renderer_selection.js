// balance-impact: none — renderer selection only; gameplay rules unchanged.
// Renderer selection is presentation state. It must never become part of the
// gameplay/save state or alter the RendererInput contract.

export const RENDERER_NAMES = Object.freeze({
  PIXI: "pixi",
  CANVAS: "canvas"
});

export const DEFAULT_RENDERER = RENDERER_NAMES.PIXI;

const FAILURE_PHASES = new Set([
  "import",
  "application-create",
  "canvas/context",
  "mount",
  "initial-render"
]);

export function resolveRendererRequest(search = "") {
  const rawValue = new URLSearchParams(search).get("renderer");
  const requestedRenderer = rawValue === RENDERER_NAMES.CANVAS
    ? RENDERER_NAMES.CANVAS
    : DEFAULT_RENDERER;

  return Object.freeze({
    requestedRenderer,
    requestedValue: rawValue,
    normalization: rawValue === null
      ? "production-default"
      : rawValue === requestedRenderer
        ? "explicit"
        : "unknown-default"
  });
}

export function createRendererSelectionState(search = "") {
  return {
    ...resolveRendererRequest(search),
    selectedRenderer: null,
    fallbackOccurred: false,
    fallbackReason: null,
    pixiPhase: null
  };
}

export function selectRenderer(state, selectedRenderer) {
  return {
    ...state,
    selectedRenderer,
    fallbackOccurred: false,
    fallbackReason: null,
    pixiPhase: null
  };
}

export function selectCanvasFallback(state, { reason, pixiPhase }) {
  return {
    ...state,
    selectedRenderer: RENDERER_NAMES.CANVAS,
    fallbackOccurred: true,
    fallbackReason: reason,
    pixiPhase: pixiPhase || null
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

export function isRendererName(value) {
  return value === RENDERER_NAMES.PIXI || value === RENDERER_NAMES.CANVAS;
}
