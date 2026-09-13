# Issue #1238 PixiJS navigation motion evidence

- BASE_SHA: `2d128e31fa1fa9fa9bf75d7e866d96fbed843202`
- captured renderer code HEAD: `b11f3e18` (clean-rebase equivalent of the tested renderer change)
- evidence is included in the current PR HEAD; the final browser CI run verifies that HEAD
- renderer: PixiJS `8.19.0`, opt-in with `?renderer=pixi`
- browser: Chromium `@playwright/test 1.61.0`, viewport `390x844`
- physical-device status: not available in Codex; human iPhone review required

## Deterministic actual-motion frames

The PNGs in `issue-1238-pixi/` were captured by
`tests/ui-pixi-navigation-comfort-1238.spec.js` against the captured code
HEAD. Each navigation action has `before`, `mid`, and `after` frames:

- forward: transition duration `125ms`, mid scene depth displacement
  `±1.90px` in the latest serial run; scale delta `<0.018`; rotation `0`;
  shake `0`.
- left turn: mid position displacement `±2.96px`; rotation `0`.
- right turn: mid position displacement `±4.03px`; rotation `0`.
- reduced motion: no transition, no shake, no hit animation, no ambient danger
  pulse, and no continuous redraw.
- combat feedback: localized combat FX and damage text with scene position
  `(0, 0)` and shake `0`.

## Lifecycle and performance

The same suite exercised forward ×20, left ×20, right ×20, transition
replacement, explicit cancellation, resize ×10, combat feedback ×10, and
renderer create/dispose ×5. Latest serial metrics: initialization/first render
`1.0ms`, maximum render `4.8ms`, all forward/turn/combat/resize samples below
`1.6ms`, scene children `8`, max children `8`, disposed `5/5`.

## Regression coverage

The #1230 Pixi visual/material/biome suite passed `5/5`, including six
topology archetypes at 320/360/390/430px, production-backed B1F side opening,
flat/arch biome, combat target staging, and minimap coexistence.
