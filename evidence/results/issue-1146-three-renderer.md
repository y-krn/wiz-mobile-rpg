# Issue #1146 Three.js Dungeon View Spike

Date: 2026-09-07  
Decision: **Partial adopt**

## Scope and boundary

- Canvas 2D remains the default renderer.
- `/?renderer=three` dynamically loads the Three.js prototype.
- Both renderers consume the same `getRendererInput(...)` read-only boundary.
- Three.js owns only the Dungeon View. The four DOM shell regions and combat
  action dock remain unchanged.
- No game rules, save shape, map generation, combat formula, or movement input
  changed.

## Evidence

The browser evidence is reproducible with:

```text
npx playwright test tests/ui-three-renderer.spec.js
```

The test covers 320x568, 360x740, 390x844, and 430x932. It captures the
following generated artifacts under the Playwright test output directory:

- `three-renderer-320x568.png`
- `three-renderer-360x740.png`
- `three-renderer-390x844.png`
- `three-renderer-430x932.png`
- `canvas-explore-danger.png` / `three-explore-danger.png`
- `canvas-combat-multiple.png` / `three-combat-multiple.png`

The representative scene test verifies:

- corridor floor, ceiling, side walls, depth fog, and floor-theme material;
- a state-linked elite / midboss danger cue without a numeric gauge;
- single and multiple combat enemy placement;
- expanded raycast hit areas (`data-target-hit-area="expanded"`);
- direct enemy tap selection and a DOM `details` fallback for keyboard and
  screen-reader users;
- the same 400x260 render surface and no horizontal overflow at all required
  mobile widths.

The focused run passed 3 tests. The draw-call comparison printed by the test
was:

| renderer | median draw call | max draw call |
| --- | ---: | ---: |
| Canvas 2D | 0.0ms | 0.1ms |
| Three.js WebGL | 0.1ms | 0.3ms |

These numbers are JavaScript draw-call timings, not a claim of GPU frame time;
the prototype still needs device-level profiling before production adoption.

Build output recorded from `npm run build`:

- default entry: 1,148.36 kB raw / 364.80 kB gzip;
- dynamically loaded Three.js chunk: 496.06 kB raw / 124.70 kB gzip.

The dynamic import keeps the Three.js chunk out of the default request path,
but the optional renderer has a material bundle and lifecycle cost that must be
paid by users who opt into it.

## Decision

**Partial adopt.** Three.js is promising for selected Dungeon View atmosphere
and target presentation: depth/fog, restrained material response, state-linked
danger silhouette, and direct enemy hit testing are viable without moving the
HUD or game rules into the renderer. It is not ready to replace Canvas 2D as
the production default because the spike does not yet establish device-level
long-frame, memory, WebKit, or orientation evidence, and the optional chunk is
substantial.

Follow-up should keep Canvas as fallback and harden one selected scene at a
time: lifecycle contract, Explore landmarks, combat feedback, WebKit/device
profiling, visual baselines, and only then a production migration decision.

## Feedback responsibility

- shake: camera offset in Three.js, existing Canvas transform in Canvas mode;
- flash: renderer-local light pulse in Three.js, existing Canvas overlay in
  Canvas mode;
- damage text: DOM overlay in Three.js, existing Canvas floating text in Canvas
  mode.

This split is intentionally prototype-only and does not alter combat result
semantics.
