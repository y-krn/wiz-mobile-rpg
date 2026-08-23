// Optional, side-effect-free diagnostics for deterministic simulation wiring.
// Production callers omit this context; simulations provide an explicit
// callback so reachability evidence cannot depend on result values alone.
export function recordRuntimeCall(runtimeDiagnostics, mechanism, details = null) {
  if (typeof runtimeDiagnostics?.onCall !== "function") return;
  runtimeDiagnostics.onCall(mechanism, details);
}
