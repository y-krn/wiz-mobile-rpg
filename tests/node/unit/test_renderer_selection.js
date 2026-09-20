import assert from "assert";
import {
  createRendererSelectionState,
  getInjectedFailurePhase,
  normalizeFailurePhase,
  resolveRendererRequest,
  selectRenderer,
  selectRendererFailure
} from "../../../src/renderer_selection.js";

assert.deepEqual(resolveRendererRequest(""), {
  requestedRenderer: "pixi",
  requestedValue: null,
  normalization: "production-default"
});
assert.equal(resolveRendererRequest("?renderer=pixi").requestedRenderer, "pixi");
assert.equal(resolveRendererRequest("?renderer=canvas").requestedRenderer, "pixi");
assert.deepEqual(resolveRendererRequest("?renderer=foo").normalization, "unknown-default");
assert.equal(resolveRendererRequest("?renderer=foo").requestedRenderer, "pixi");

const initial = createRendererSelectionState("?renderer=pixi");
const selected = selectRenderer(initial);
assert.deepEqual(selected, {
  ...initial,
  selectedRenderer: "pixi",
  failureOccurred: false,
  failureReason: null,
  failurePhase: null
});
assert.deepEqual(selectRendererFailure(selected, {
  reason: "pixi-init-failed",
  phase: "pixi/context"
}), {
  ...initial,
  selectedRenderer: null,
  failureOccurred: true,
  failureReason: "pixi-init-failed",
  failurePhase: "pixi/context"
});

assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "import" }), "import");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: { phase: "mount" } }), "mount");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "not-a-phase" }), null);
assert.equal(normalizeFailurePhase("unsupported"), "unsupported");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "unsupported" }), "unsupported");

console.log("RENDERER SELECTION TEST PASSED");
