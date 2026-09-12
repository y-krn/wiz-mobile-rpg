# Issue #1207 — one-cell-ahead turn / biome silhouette spike

This evidence was corrected after review `5186125464`. The original revision
used a current-cell side opening and did not prove the Issue's one-cell-ahead
turn requirement. The current fixture and screenshots use the topology below.

This evidence is an isolated visual spike. It does not change
`src/three_renderer.js`, map generation, movement rules, minimap semantics, or
combat presentation.

## Candidate matrix

The fixed #1199 camera contract remains `(0, 1.8, 3.0)` looking at
`(0, 0.3, -2.4)` with FOV `90°`, `cellWidth 1.2`, `cellDepth 3.2`,
`wallHeight 2.4`, and `wallThickness 0.18`.

For a north-facing player at `(4,4)`, the corrected turn fixture opens
`(4,4) -> (4,3)` first, then opens `(4,3) -> (3,3)` for left or
`(4,3) -> (5,3)` for right. The current cell has no left/right side opening;
the turn is represented at `z=1`. The spec asserts these facts directly.

Turn candidates apply one global wall-footprint construction to every blocked
wall in the fixture:

| candidate | corner chamfer ratio | disposition |
| --- | ---: | --- |
| square | 0% | baseline; turn remains a narrow slit |
| shallow | 10% | readable, but weaker at 320px |
| medium | 20% | selected |
| strong | 30% | readable, but visually over-heavy at the side opening |

The selected medium rule is a structural chamfer of every wall footprint. It
does not inspect future topology, add a marker, delete a blocked wall, move the
camera, or change materials per branch. Floor geometry remains continuous and
same-height; the renderer-neutral frame still determines every wall surface.

Biome candidates use the same corrected topology and material family, with the
selected turn construction combined explicitly:

| candidate | structure | disposition |
| --- | --- | --- |
| medium+flat | 20% wall chamfer and 2.4-unit flat ceiling | comparison baseline |
| medium+arch | 20% wall chamfer, 1.7-unit spring line, 0.7-unit curved rise | selected |

## Actual-pixel review

The dedicated Playwright spec renders straight, corrected one-cell-ahead left,
and corrected one-cell-ahead right fixtures for all turn candidates, and
straight plus both turn directions for medium+flat/medium+arch. It captures
real WebGL canvas pixels at 390px and 320px, attaches each screenshot, and
checks a WebGL pixel checksum in addition to topology and geometry invariants.

Command:

```sh
npx playwright test tests/ui-three-dungeon-spike-1207.spec.js --grep @visual
```

Review outcome:

- At 390px, square leaves the one-cell-ahead turn nearly unresolved; shallow,
  medium, and strong expose the side continuation at `z=1`. Medium gives the
  clearest balance of turn cue and route dominance.
- The medium left/right distinction remains visible at 320px, and the two
  directions are mirrored by the actual walkable side continuation.
- Medium+flat and medium+arch are distinguishable by ceiling silhouette and
  spring line, not hue; medium+arch retains a continuous route in both widths.
- The generated B1F fixture retains a near side opening and forward depth under
  the selected medium candidate at both review widths.

The browser screenshots are not physical-device evidence. Physical-device
readability remains unverified in this environment; no production adoption is
claimed by this Spike.

## Acceptance disposition

PASS path: the corrected fixture selects the combined medium 20% wall chamfer
and arch `springLine 1.7 / rise 0.7` structural rule for any later production
port.
PR #1193 may resume only by porting these exact rules; it must not add camera,
visibility, marker, or helper geometry changes.
