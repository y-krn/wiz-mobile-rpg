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

## Fixture and evidence contract

The synthetic six-archetype fixture and a production-backed fixture answer
different questions. Synthetic straight corridor, dead end, left turn, right
turn, T junction, and cross junction cases isolate topology truth and silhouette.
They do not prove that real neighboring geometry composes into a readable route.

For topology, side-opening, corridor-geometry, camera/FOV/profile, or
navigation-hierarchy-changing lighting/material/fog changes, add at least one
production-backed dungeon state. It must:

- use the real production map, generation, and topology path;
- include normal neighboring walls and depth, not a hand-built all-empty cell
  grid;
- include at least one near side opening;
- use a deterministic seed or equivalent reproducible fixture setup; and
- retain a Dungeon View screenshot with the mini-map hidden.

The production-backed state tests composition, occlusion, tonal hierarchy, and
route dominance around real geometry. Both the synthetic and production-backed
fixture families must pass before spatial readability is claimed. The
production-backed screenshot is a success CI artifact and must be tied to the
current HEAD so a reviewer can inspect the actual pixels for the reviewed
change.

For production-backed and physical-device screenshots, reviewers must record
the following observations:

- floor continuity: forward and side floor read as the same walkable system;
- side-passage semantics: the opening reads as a passage rather than a wall,
  panel, ramp, or window;
- route dominance: the navigation-critical floor/opening reads before
  decorative cues;
- occlusion truth: foreground geometry hides and reveals the expected topology;
- synthetic-proxy smell: a billboard, raised tongue, fake vestibule, or large
  inset has not replaced the real topology.

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
direct tap is the primary single-enemy action. If direct canvas targeting is
unavailable or an assistive technology needs another input, retain an
equivalent target-selection path, but do not prescribe a target-list
implementation. Do not reintroduce visible enemy target buttons into the
normal visual UI. When the target-selection flow is touched, Back/cancel must
abandon an uncommitted target without moving or otherwise changing the world.

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

Browser viewport screenshots are browser evidence, not physical-device proof.
For camera, FOV, eye/look-at, or corridor-geometry changes that materially
change mobile spatial composition, production adoption and any claim that the
dungeon is readable on a device require at least one physical-device screenshot
or recorded inspection. If that evidence cannot be obtained, mark the claim
unverified and do not mark production-readability Done. This is a high-risk
spatial-grammar boundary, not an unconditional requirement for every small
renderer change.
