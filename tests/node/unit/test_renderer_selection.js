import assert from "assert";
import * as facade from "../../../src/renderer_selection.js";
import * as owner from "../../../src/renderer_selection.ts";
import {
  createRendererSelectionState,
  getInjectedFailurePhase,
  normalizeFailurePhase,
  resolveRendererRequest,
  selectRenderer,
  selectRendererFailure
} from "../../../src/renderer_selection.js";

const runtimeExports = [
  "DEFAULT_RENDERER",
  "resolveRendererRequest",
  "createRendererSelectionState",
  "selectRenderer",
  "selectRendererFailure",
  "normalizeFailurePhase",
  "getInjectedFailurePhase"
];
assert.deepEqual(Object.keys(facade).sort(), [...runtimeExports].sort());
assert.deepEqual(Object.keys(owner).sort(), [...runtimeExports].sort());
for (const name of runtimeExports) assert.strictEqual(facade[name], owner[name]);
assert.equal(facade.DEFAULT_RENDERER, "pixi");

assert.deepEqual(resolveRendererRequest(""), {
  requestedRenderer: "pixi",
  requestedValue: null,
  normalization: "production-default"
});
assert.equal(resolveRendererRequest("?renderer=pixi").requestedRenderer, "pixi");
assert.equal(resolveRendererRequest("?renderer=canvas").requestedRenderer, "pixi");
assert.deepEqual(resolveRendererRequest("?renderer=foo").normalization, "unknown-default");
assert.equal(resolveRendererRequest("?renderer=foo").requestedRenderer, "pixi");
assert.equal(resolveRendererRequest("?renderer=").requestedValue, "");
assert.equal(resolveRendererRequest("?renderer=canvas&renderer=pixi").requestedValue, "canvas");
assert.equal(resolveRendererRequest("?renderer=p%69xi").normalization, "explicit");
assert.equal(Object.isFrozen(resolveRendererRequest("")), true);
assert.deepEqual(Object.keys(resolveRendererRequest("")), [
  "requestedRenderer",
  "requestedValue",
  "normalization"
]);

const initial = createRendererSelectionState("?renderer=pixi");
const anotherInitial = createRendererSelectionState("?renderer=pixi");
assert.notStrictEqual(initial, anotherInitial);
assert.equal(Object.isFrozen(initial), false);
assert.deepEqual(Object.keys(initial), [
  "requestedRenderer",
  "requestedValue",
  "normalization",
  "selectedRenderer",
  "failureOccurred",
  "failureReason",
  "failurePhase"
]);
const selected = selectRenderer(initial);
assert.deepEqual(selected, {
  ...initial,
  selectedRenderer: "pixi",
  failureOccurred: false,
  failureReason: null,
  failurePhase: null
});
assert.deepEqual(Object.keys(selected), Object.keys(initial));
assert.notStrictEqual(selected, initial);
assert.equal(initial.selectedRenderer, null);
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

const reason = { detail: "raw" };
const extendedState = {
  selectedRenderer: "old-selection",
  failureOccurred: true,
  failureReason: "old-reason",
  failurePhase: "old-phase",
  extra: reason
};
const recovered = selectRenderer(extendedState);
assert.deepEqual(recovered, {
  ...extendedState,
  selectedRenderer: "pixi",
  failureOccurred: false,
  failureReason: null,
  failurePhase: null
});
assert.strictEqual(recovered.extra, reason);
assert.equal(extendedState.selectedRenderer, "old-selection");
assert.deepEqual(selectRenderer(null), {
  selectedRenderer: "pixi",
  failureOccurred: false,
  failureReason: null,
  failurePhase: null
});

assert.strictEqual(selectRendererFailure({}, { reason, phase: "unknown-phase" }).failureReason, reason);
assert.equal(selectRendererFailure({}, { reason: "x", phase: "unknown-phase" }).failurePhase, "unknown-phase");
for (const phase of [undefined, null, false, 0, ""]) {
  assert.equal(selectRendererFailure({}, { reason: "x", phase }).failurePhase, null);
}
for (const arg of [undefined, null]) {
  assert.throws(() => selectRendererFailure({}, arg), TypeError);
}

const accessOrder = [];
const failureInput = new Proxy({}, {
  get(_target, key) {
    accessOrder.push(`failure:${String(key)}`);
    return key === "reason" ? "raw-reason" : 0;
  }
});
const stateInput = new Proxy({ extra: true }, {
  ownKeys(target) {
    accessOrder.push("state:ownKeys");
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, key) {
    accessOrder.push(`state:descriptor:${String(key)}`);
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  get(target, key, receiver) {
    accessOrder.push(`state:get:${String(key)}`);
    return Reflect.get(target, key, receiver);
  }
});
selectRendererFailure(stateInput, failureInput);
assert.deepEqual(accessOrder, [
  "failure:reason",
  "failure:phase",
  "state:ownKeys",
  "state:descriptor:extra",
  "state:get:extra"
]);
const throwingFailureReads = [];
const throwingFailure = Object.defineProperties({}, {
  reason: { get() { throwingFailureReads.push("reason"); return "x"; } },
  phase: { get() { throwingFailureReads.push("phase"); throw new Error("phase getter"); } }
});
assert.throws(() => selectRendererFailure(new Proxy({}, {
  ownKeys() { throw new Error("state spread"); }
}), throwingFailure), /phase getter/);
assert.deepEqual(throwingFailureReads, ["reason", "phase"]);
assert.throws(() => selectRendererFailure(new Proxy({}, {
  ownKeys() { throw new Error("state spread"); }
}), { reason: "x", phase: "mount" }), /state spread/);

assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "import" }), "import");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: { phase: "mount" } }), "mount");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "not-a-phase" }), null);
assert.equal(normalizeFailurePhase("unsupported"), "unsupported");
assert.equal(getInjectedFailurePhase({ __WIZ_RENDERER_FAILURE__: "unsupported" }), "unsupported");
for (const phase of [
  "import",
  "application-create",
  "pixi/context",
  "mount",
  "initial-render",
  "unsupported",
  "runtime"
]) {
  assert.equal(normalizeFailurePhase(phase), phase);
}
assert.equal(normalizeFailurePhase(new String("mount")), null);

let hookReads = 0;
let phaseReads = 0;
const hookedScope = Object.defineProperty({}, "__WIZ_RENDERER_FAILURE__", {
  get() {
    hookReads += 1;
    return Object.defineProperty({}, "phase", {
      get() {
        phaseReads += 1;
        return "mount";
      }
    });
  }
});
assert.equal(getInjectedFailurePhase(hookedScope), "mount");
assert.equal(hookReads, 1);
assert.equal(phaseReads, 1);
assert.equal(getInjectedFailurePhase(null), null);
assert.throws(() => getInjectedFailurePhase(new Proxy({}, {
  get() { throw new Error("scope getter"); }
})), /scope getter/);
assert.throws(() => getInjectedFailurePhase({
  __WIZ_RENDERER_FAILURE__: Object.defineProperty({}, "phase", {
    get() { throw new Error("phase getter"); }
  })
}), /phase getter/);

const globalHookDescriptor = Object.getOwnPropertyDescriptor(globalThis, "__WIZ_RENDERER_FAILURE__");
try {
  Object.defineProperty(globalThis, "__WIZ_RENDERER_FAILURE__", {
    configurable: true,
    value: "runtime"
  });
  assert.equal(getInjectedFailurePhase(), "runtime");
  assert.equal(getInjectedFailurePhase(undefined), "runtime");
} finally {
  if (globalHookDescriptor) {
    Object.defineProperty(globalThis, "__WIZ_RENDERER_FAILURE__", globalHookDescriptor);
  } else {
    delete globalThis.__WIZ_RENDERER_FAILURE__;
  }
}

console.log("RENDERER SELECTION TEST PASSED");
