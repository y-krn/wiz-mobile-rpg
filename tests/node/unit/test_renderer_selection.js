import assert from "assert";
import {
  createRendererSelectionState,
  getInjectedFailurePhase,
  resolveRendererRequest,
  selectCanvasFallback,
  selectRenderer
} from "../../../src/renderer_selection.js";

assert.deepEqual(resolveRendererRequest(""), {
  requestedRenderer: "pixi",
  requestedValue: null,
  normalization: "production-default"
});
assert.equal(resolveRendererRequest("?renderer=pixi").requestedRenderer, "pixi");
assert.equal(resolveRendererRequest("?renderer=canvas").requestedRenderer, "canvas");
assert.deepEqual(resolveRendererRequest("?renderer=foo").normalization, "unknown-default");
assert.equal(resolveRendererRequest("?renderer=foo").requestedRenderer, "pixi");

const initial = createRendererSelectionState("?renderer=pixi");
const selected = selectRenderer(initial, "pixi");
assert.deepEqual(selected, {
  ...initial,
  selectedRenderer: "pixi",
  fallbackOccurred: false,
  fallbackReason: null,
  pixiPhase: null
});
assert.deepEqual(selectCanvasFallback(selected, {
  reason: "pixi-init-failed",
  pixiPhase: "canvas/context"
}), {
  ...initial,
  selectedRenderer: "canvas",
  fallbackOccurred: true,
  fallbackReason: "pixi-init-failed",
  pixiPhase: "canvas/context"
});

assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "import" }), "import");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: { phase: "mount" } }), "mount");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "not-a-phase" }), null);

console.log("RENDERER SELECTION TEST PASSED");
