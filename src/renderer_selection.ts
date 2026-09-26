// balance-impact: none — PixiJS startup state only; gameplay rules unchanged.
// Renderer state is presentation-only and never enters gameplay/save state.

export const DEFAULT_RENDERER = "pixi";

const FAILURE_PHASES = new Set<unknown>([
  "import",
  "application-create",
  "pixi/context",
  "mount",
  "initial-render",
  "unsupported",
  "runtime"
]);

interface RendererSelectionFailure {
  reason: unknown;
  phase: unknown;
}

interface RendererFailureScope {
  readonly __WIZ_RENDERER_FAILURE__?: unknown;
}

interface RendererFailureHook {
  readonly phase?: unknown;
}

export function resolveRendererRequest(search: unknown = "") {
  const rawValue = new URLSearchParams(
    search as ConstructorParameters<typeof URLSearchParams>[0]
  ).get("renderer");

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

export function createRendererSelectionState(search: unknown = "") {
  return {
    ...resolveRendererRequest(search),
    selectedRenderer: null,
    failureOccurred: false,
    failureReason: null,
    failurePhase: null
  };
}

export function selectRenderer(state: unknown) {
  return {
    ...(state as Record<string, unknown>),
    selectedRenderer: DEFAULT_RENDERER,
    failureOccurred: false,
    failureReason: null,
    failurePhase: null
  };
}

export function selectRendererFailure(
  state: unknown,
  { reason, phase }: RendererSelectionFailure
) {
  return {
    ...(state as Record<string, unknown>),
    selectedRenderer: null,
    failureOccurred: true,
    failureReason: reason,
    failurePhase: phase || null
  };
}

export function normalizeFailurePhase(value: unknown) {
  return FAILURE_PHASES.has(value) ? value : null;
}

export function getInjectedFailurePhase(scope: unknown = globalThis) {
  const hook = (scope as RendererFailureScope | null | undefined)?.__WIZ_RENDERER_FAILURE__;
  const value = typeof hook === "string"
    ? hook
    : (hook as RendererFailureHook | null | undefined)?.phase;
  return normalizeFailurePhase(value);
}
