# Three.js Dungeon View reference

This document is the durable repository reference for the Three.js Dungeon
View. Source and tests remain authoritative for executable values, schemas, and
scenario data; do not copy those constants here.

## Ownership boundary

Three.js owns Dungeon View presentation only. It consumes the read-only
`RendererInput` projection from `src/state/renderer_view.js` and presents its
validated scene facts. Gameplay modules own movement, combat resolution, loot,
events, and state mutation. Renderer code must not decide whether movement is
legal, resolve a hit, award loot, or mutate the live game state.

When a renderer change needs a new fact, add it to the presentation-safe
projection or its owning rule module rather than reading raw navigation or
gameplay state from `src/three_renderer.js`. Keep Canvas and Three.js aligned on
the shared topology contract while allowing their presentation implementations
to differ.

## Grid topology semantics

`src/rules/renderer_topology.js` is the renderer-neutral topology boundary.
`z: 0, column: 0` is the current cell. Increasing `z` follows the player's
forward direction; positive `column` is the player's right side and negative
`column` is the left side. Every visible cell carries the wall facts needed by
the projection, including its map coordinates and whether an entrance is
blocked by a one-way rule.

The canonical visual fixtures are:

- straight corridor: forward cells continue and both side walls bound the
  near corridor;
- dead end: the current cell has a closed front;
- left turn and right turn: a side opening changes world orientation and the
  forward route closes;
- T junction: both side branches are present while the forward route closes;
- cross junction: forward and both side branches continue.

`frontWall` describes physical wall topology. `frontBlocked` is the movement
fact and can also be true for an open entrance blocked by a one-way barrier or
invalid destination. Do not replace directed movement facts with a visual
shortcut. A side opening must be a traversable-looking volume with a threshold,
floor, and ceiling relationship, not a detached direction marker.

## Camera, profile, and visual grammar

The Three.js corridor profile is a presentation projection of the floor visual
signature. Treat vertical field of view and aspect ratio as a pair: a camera
change is acceptable only when the resulting screen-space composition remains
readable at supported mobile widths. Preserve the player eye inside the current
cell so side walls read as corridor boundaries and the front threshold remains
the spatial anchor.

The visual hierarchy is:

- floor is the primary depth and path carrier;
- an opening communicates traversable volume through visible floor/ceiling
  continuation and a readable threshold;
- walls and ceiling provide a quieter tonal enclosure than navigation-critical
  path surfaces;
- depth seams may clarify cell depth without becoming a neon wireframe;
- fog supports depth but must not mask near, navigation-critical topology.

Flat and arch ceiling profiles are visual signatures, not new map semantics.
Biome changes should preserve the same topology truth while making the intended
material or geometry difference visible in rendered pixels.

## Combat staging and targeting

Combat presentation is staged camera-side of the current-cell front wall so
enemy bodies, labels, and markers remain visible and raycastable. Verify the
single-enemy, pair, and trio compositions independently. Multi-enemy bodies
must remain separated, labels must not overlap one another or the body, and
markers must remain associated with their enemy.

When enemy target selection is active, direct canvas taps use the staged
enemy's bounded enlarged hit region and must return the original combat target
index. Enlarging a hit region must not merge adjacent enemies into one target;
candidate selection must remain deterministic at overlapping boundaries. The
accessible target list is the fallback and must remain present and usable when
direct canvas targeting is unavailable.

## Danger cue and mini-map coexistence

The danger cue is presentation of the projected danger fact. It may be used for
map, roaming, or active combat threat, but it must remain outside the camera's
near space while still reading in the corridor. The shared mini-map overlay is
owned by `src/minimap.js`; Dungeon View must preserve its visibility contract,
including hidden non-exploration states, visible exploration state, and
non-interference with canvas input.

## Resource lifetime

Scene rebuilds replace renderer-owned objects. Every replaced geometry,
material, texture, and `CanvasTexture` must have one clear owner and a matching
release path. Dispose traversed scene resources during replacement, including
material maps and alpha maps. Prototype materials that are cloned into scene
objects are not scene-owned and must be released separately; scene-owned clones
must remain alive until replacement. Use `renderer.info` or dispose spies when a
change could grow resources across repeated rebuilds.

## Mobile performance and evidence

Keep the scene lightweight: avoid unnecessary geometry, materials, lights,
post-processing, and per-frame allocation. For changes that increase scene
complexity, check browser proxy timing, long frames, renderer resource counts,
and bundle impact when relevant. Browser emulation is not physical-device
proof; leave a physical-device claim explicit when it cannot be established
locally.

Quantitative bounds, topology objects, and `getThreeProjectedBounds()` are
supporting evidence only. Claims such as “the opening reads,” “labels do not
overlap,” or “the route remains visible” require inspection of the actual
rendered screenshot/pixels. A passing math-only or CI proxy assertion is not
visual acceptance by itself. Preserve successful visual artifacts for review
and do not leave an unresolved current-head artifact unexamined.
