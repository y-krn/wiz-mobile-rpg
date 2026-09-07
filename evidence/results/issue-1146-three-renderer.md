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
npx playwright test tests/ui-three-renderer.spec.js --browser=chromium
npx playwright test tests/ui-three-renderer.spec.js --browser=webkit
```

The test covers 320x568, 360x740, 390x844, 430x932, and a 844x390 landscape
resize. It captures the
following generated artifacts under the Playwright test output directory:

- `three-renderer-320x568.png`
- `three-renderer-360x740.png`
- `three-renderer-390x844.png`
- `three-renderer-430x932.png`
- `canvas-explore-danger.png` / `three-explore-danger.png`
- `canvas-combat-multiple.png` / `three-combat-multiple.png`

The representative scene test verifies:

- corridor floor, ceiling, side walls, depth fog, and floor-theme material;
- a presentation-safe, state-projected elite / midboss danger cue without a
  numeric gauge;
- single and multiple combat enemy placement;
- expanded raycast hit areas (`data-target-hit-area="expanded"`);
- direct enemy hit-testing through the common `game.js` commit path and a DOM
  fallback for keyboard and screen-reader users;
- the same 400x260 render surface, no horizontal overflow, and orientation
  resize handling at all required mobile widths.

The focused run passed 4 tests in both Chromium and WebKit. On the local
headless browser run, the comparison printed:

| browser | renderer | first-render readiness | median rAF interval | max rAF interval | long frames >50ms | JS heap |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | Canvas 2D | 264.3ms | 8.3ms | 9.5ms | 0/31 | 21.7MB |
| Chromium | Three.js WebGL | 790.0ms | 8.3ms | 25.0ms | 0/31 | 21.7MB |
| WebKit | Canvas 2D | 282.7ms | 16.0ms | 25.0ms | 0/31 | unavailable |
| WebKit | Three.js WebGL | 257.3ms | 17.0ms | 24.0ms | 0/31 | unavailable |

Draw-call timing from the same run was 0.0ms median / 0.1ms max for Canvas
2D and 0.1ms median / 0.3ms max for Three.js WebGL in Chromium. These are
JavaScript-side observations, not GPU frame-time claims.

The readings are browser-run proxies only. Physical-device GPU, thermal,
long-session memory, and production-browser profiling remain open in
[#1150](https://github.com/y-krn/wiz-mobile-rpg/issues/1150).

Build output recorded from `npm run build`:

- default entry: 1,148.81 kB raw / 364.92 kB gzip;
- dynamically loaded Three.js chunk: 495.31 kB raw / 124.51 kB gzip.

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
time: lifecycle contract, Explore landmarks, combat feedback, visual
baselines, and only then a production migration decision. Physical-device
profiling is tracked in [#1150](https://github.com/y-krn/wiz-mobile-rpg/issues/1150).

## Ownership and known prototype boundary

- `game.js` owns pointer routing and `commitCombatTarget(...)`; both Canvas and
  Three.js expose only renderer hit-testing against the projected
  `combatTargetSelection` state.
- `renderer_view` projects the presentation-safe `dangerCue`; Three.js does
  not infer danger from raw level or roaming-monster fields.
- Three.js disposes label `CanvasTexture` maps with their owning materials.
- The Three.js scene still uses fixed prototype floor/ceiling/side-wall
  geometry. Actual dungeon map topology, player x/y/dir wall visibility, and
  landmark replacement are not established by this spike.

## Feedback responsibility

- shake: camera offset in Three.js, existing Canvas transform in Canvas mode;
- flash: renderer-local light pulse in Three.js, existing Canvas overlay in
  Canvas mode;
- damage text: DOM overlay in Three.js, existing Canvas floating text in Canvas
  mode.

This split is intentionally prototype-only and does not alter combat result
semantics.
