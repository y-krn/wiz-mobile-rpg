# Issue #1228 — Dark Archive visual-system audit

## Baseline and scope

- Baseline source: `origin/main`, fetched on 2026-09-13 (Asia/Tokyo).
- Baseline SHA: `0a45d920745c3efc6f7bc7839b94c06cfcbf81ad`.
- Current PR base SHA: `6bbd07738af3fe60dab18f5627d1ef9192f4cbd0` (`origin/main`),
  freshly fetched before the correction push.
- Preconditions: PR #1249 is merged; Issue #1227 is completed/closed; Issue
  #1225 and #1226 are completed/closed.
- Renderer boundary: `src/renderer.js` Canvas is default; `src/pixi_renderer.js`
  is the opt-in Pixi implementation. Three.js is retired and is not restored.
- In scope: shared DOM/CSS shell, overlays, controls, semantic state, motion
  ownership, floor-theme interaction, and small evidence-backed drift fixes.
- Out of scope: dungeon geometry, projection, materials, fog, lighting,
  particles, monster art, Pixi architecture, gameplay, balance, telemetry,
  and screen information-architecture redesign.

The audit reused the #1225 Golden Journey owners and #1226 accessibility
journeys rather than adding a fixture for each screen. The cross-surface pass
covered Town, Preparation, Explore normal/danger, Combat, combat target
selection, Bag/equipment comparison, full-bag replacement, Chest, Trap,
Portal, Wing, successful Result, and death/loss Result. Stable DOM/CSS
surfaces were treated as evidence candidates; renderer pixels were not made a
new immutable canon.

## Audited ownership

| Domain | Owner inspected | Audit decision |
| --- | --- | --- |
| Tokens/base | `src/styles/tokens.css`, `src/styles/base.css` | Canonical palette, type, spacing, radius, tap, safe-area, shadow, and motion inventory. |
| Shell/HUD | `src/styles/app-shell.css`, `src/styles/solo-hud.css`, `src/styles/common-shell.css` | Current four-region dungeon model and shared event/dock contracts retained. |
| Controls/actions | `src/styles/buttons.css`, `src/styles/controls.css`, `src/styles/mobile-touch.css` | Shared focus, pressed, disabled, and tap ownership retained. |
| Decisions | `src/styles/overlays-combat.css`, `overlays-equip.css`, `overlays-spell.css`, `overlays-result.css`, `overlays-rewards.css`, `overlays-archives.css` | Repeated dark surface/motion values tokenized; local tag and archive art retained. |
| Runtime DOM | `src/ui/*`, `src/menu/*`, `src/combat_ui/*`, `src/spell_menu.js`, `src/pending_rewards.js` | State meaning and CSS ownership checked at the DOM boundary. |
| Floor interaction | `src/styles/floor-themes.css`, `src/ui/ui_root.js`, `src/data/biomes.js` | Floor variables remain identity-only; shared semantic state is not overridden. |
| Renderer boundary | `src/renderer.js`, `src/pixi_renderer.js`, `src/state/renderer_view.js`, `src/rules/renderer_topology.js` | Canvas/Pixi responsibilities remain separate from the DOM visual contract. |

## Canonical token inventory

The existing names remain the source of truth. New names make repeated
responsibilities explicit without changing the current palette.

| Token group | Semantic role | Allowed usage | Prohibited interpretation |
| --- | --- | --- | --- |
| `--bg-color`, `--panel-bg` | Base shell/persistent shell | App background, persistent shell panel | Selected, recommended, or danger state |
| `--surface-raised` | Raised information surface | Event/result/decision groups that need separation | Every section, or a recommendation cue |
| `--surface-inset` | Recessed/list region | Inventory, logs, compact internal lists | Disabled state by itself |
| `--surface-control` | Repeated dark control fill | Existing overlay/control cards with the same responsibility | Success or optimal answer |
| `--surface-neutral` | Passive low-neutral surface | Information cards/sections that are not interactive controls | Selection, recommendation, or unavailable state |
| `--surface-deep` | Deep detail surface | Detail panels retaining current dark hierarchy | Hidden knowledge disclosure |
| `--surface-unavailable` | Unavailable/inert fill | Disabled controls and invalid choices | Current selection |
| `--surface-meter-track` | Passive meter/stat surface | Empty HP/MP track and passive equipment stat readouts | Disabled or unavailable control |
| `--border-color`, `--border-strong` | Neutral hierarchy | Standard and elevated boundaries | Recommendation |
| `--border-control` | Repeated control boundary | Existing dark control/card borders | Destructive commitment |
| `--border-unavailable`, `--border-disabled` | Unavailable/disabled boundary | Disabled or unavailable native controls | Focus or current choice |
| `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled` | Reading hierarchy | Titles, copy, annotations, unavailable copy | Color-only state signaling |
| `--semantic-life`, `--vital-hp` | Life/HP | HP, healing consequence, life feedback | Recommendation or success shortcut |
| `--semantic-magic`, `--vital-mp` | Magic/MP | MP, spell resource, magic feedback | Selected target |
| `--semantic-unknown` | Partial knowledge | Unidentified/unknown information | Actual rarity, curse, or correct answer |
| `--semantic-discovery` | New information/loot | Discovery and newly learned information | Selection or danger |
| `--semantic-curse` | Curse state | Known curse information | Hidden curse preview |
| `--semantic-danger` | Danger/damage/loss | Risk, damage, loss, lethal consequence | Player recommendation |
| `--semantic-selected` | Current player choice | Selected target, current option, active choice | Recommended/optimal option |
| `--neutral-iron`, `--neutral-brass` | Material/neutral identity | Secondary chrome and restrained brass accents | Universal selected or success state |
| `--neon-*` aliases | Legacy names with semantic use | Existing correct semantic consumers | Rename target or a free-floating meaning |
| `--shadow-soft`, `--shadow-inset` | Elevation/inset depth | Surface hierarchy | State meaning alone |
| `--font-display`, `--font-sans`, `--font-mono` | Type ownership | See typography table below | Decorative font switching per state |
| `--sp-*`, `--fs-*`, `--radius-*` | Spacing/type/radius scale | Shared layout and stable controls | Viewport-specific patches |
| `--tap-min`, `--tap-lg`, safe-area tokens | Mobile reach/insets | Activation area and device insets | Density workaround |
| `--motion-tap`, `--motion-state`, `--motion-shell` | Motion meaning | Input, state, and shell transitions | Decorative animation budget |
| `--hud-frame`, `--hud-frame-glow` | Default shell frame | Town/result/game-over shell accents | Dungeon semantic state override |

## Hard-coded value classification

| Observed value/style | Classification | Decision |
| --- | --- | --- |
| Repeated `#14141a`, `#22222d`, `#101014`, `#0c0c0e` in combat/equipment/spell/result overlays | Token candidate / legacy surface drift | Added semantic owners for interactive controls, passive neutral information, deep detail, unavailable controls, meter tracks, and repeated borders; migrated by responsibility rather than by shared hex value, preserving pixels. |
| Repeated `0.15s`, button `0.1s`, shell `0.2s` transitions | Token candidate | Added motion role tokens and migrated repeated state/tap/shell transitions. |
| `#1a1a24` archive rows and compact archive inline styling | Intentional local archive treatment | Not globally normalized; archive/codex is a distinct information surface. |
| Old palette values in spell/combat tags and dynamic HP/status labels | Intentional local semantic accents | Retained where they identify spell/status/life/damage content, not a shared control state. |
| Inline HP widths, dynamic status color, biome aura/background variables | Biome/art-direction or data-derived local value | Retained; fixed constants would remove state or floor identity. |
| Renderer fill/material/lighting/particle colors | Renderer-specific | Not pulled into DOM tokens or visual snapshots. |
| Undefined `--panel-background` / `--line-color` fallback in pending rewards | Legacy drift | Replaced with canonical `--surface-raised` and `--border-color`. |
| Pending reward inline `minHeight: "44px"` | Style ownership drift | Removed redundant inline style; shared `.btn` owns `--tap-min`. |

Hard-coded values were not mechanically converted wholesale. In particular,
biome identity, spell/status tags, result emphasis, renderer pixels, dynamic
percentages, and archive treatment remain local where their meaning is local.

## Semantic color grammar

| Meaning | Current role | Cue rule |
| --- | --- | --- |
| HP/life | `--semantic-life` / `--vital-hp` | Vital label and value; not a recommendation. |
| MP/magic | `--semantic-magic` / `--vital-mp` | Resource/spell information. |
| Unknown | `--semantic-unknown` | What the player knows is incomplete; never actual item truth. |
| Discovery/loot | `--semantic-discovery` | New information or found material. |
| Curse | `--semantic-curse` | Curse already exposed to the player. |
| Danger/damage/loss | `--semantic-danger` | Risk and consequence, including failed result/lost loot. |
| Destructive | danger treatment plus explicit consequence/native control state | High-loss action being committed; not merely an alarming label. |
| Selected/current | `--semantic-selected` | The player's current choice/target. Must remain distinct from danger and recommendation. |
| Disabled/unavailable | disabled text, reduced opacity, unavailable fill/border, native `disabled` | Cannot currently act; never selected. |
| Pending/busy | existing pending/native state and visible unresolved copy | Accepted but unresolved; never silently becomes disabled. |
| Success/completed | existing result/completed treatment | Resolution happened; not a general green recommendation cue. |
| Neutral/secondary | `--neutral-iron`, `--neutral-brass`, text hierarchy | Supporting information and chrome. |

The removed ally-spell `recommended` class was the only audited case where a
player-facing choice used a recommendation-specific green border/glow and
`回復推奨` copy. All valid healing targets now use `回復可` and the same
availability treatment. The UI does not tell the player which target is the
optimal strategy.

## Surface hierarchy

| Surface role | Background | Border | Shadow | Radius/spacing | Weight |
| --- | --- | --- | --- | --- | --- |
| Base shell | `--bg-color` | shell/frame token where needed | none/inset | shell spacing | quiet, persistent |
| Raised surface | `--surface-raised` | `--border-color` | `--shadow-soft` where elevation matters | `--radius-sm`/existing role spacing | grouped information |
| Inset/list | `--surface-inset` | neutral separator | `--shadow-inset` where already present | compact `--sp-*` | scan-oriented |
| Current Event Strip | shared raised/inset shell role | event semantic border | restrained | existing shell spacing | immediate context |
| Action Dock | existing dock surface | action role border | restrained | tap-safe spacing | primary verbs |
| Expanded decision | existing decision surface | stronger boundary | restrained | existing decision padding | focused choice |
| Overlay/modal | existing overlay surface | overlay frame | `--shadow-soft` | existing overlay radius | temporary focus |
| Destructive confirmation | overlay/raised surface plus danger cues | `--semantic-danger` | no extra glow required | existing confirmation spacing | commitment risk |
| Result/settlement | result surface | success/danger/discovery role | restrained seal/emphasis | existing result spacing | resolved outcome |

Whitespace, separators, and type remain valid region boundaries. No new
all-sections-card treatment was introduced.

## Typography roles

| Role | Ownership | Current use/guard |
| --- | --- | --- |
| Location/dungeon identity | `--font-display` | Floor/location identity and restrained lore weight. |
| Major result | `--font-display` plus result scale | Success/death/loss emphasis. |
| Screen title | display or existing title class | Overlay/screen identity, not every label. |
| Section heading | sans/display by existing owner | Scannable grouping. |
| Action label | `--font-mono`/sans action owner | Operational verbs and native controls. |
| Item/spell/status label | sans plus local semantic accent | Reading and known state; unknown remains unknown. |
| Numeric value | `--font-mono`, existing `font-variant-numeric: tabular-nums` where owned | HP/MP/material/floor/count scanning and label/value separation. |
| Annotation/helper | sans, `--fs-sm`/`--fs-xs` within existing role | Supporting copy; not a critical action substitute. |
| Log | mono/system role | Compact chronology. |
| Warning | semantic danger/neutral role | Risk or consequence, never recommendation. |
| Destructive consequence | danger role plus explicit copy/native state | Explains loss before commit. |

Long Japanese item, unknown, status, Portal, Chest/Trap, Result-cause, and
Preparation copy remains wrapped by existing overlay/list layout. The #1225/
#1226 viewport journeys cover 320×568, 360×800, 390×844, and 430×932 risk
points; no small-font escape or action ellipsis was added.

## Interactive state matrix

| State | Meaning | Required observable cues |
| --- | --- | --- |
| Default | Actionable | Native actionable control, neutral role styling, tap-safe geometry. |
| Pressed | Physical input accepted | Transient transform/background/border feedback (`--motion-tap`). |
| Focused | Keyboard/AT navigation context | Persistent `:focus-visible` outline and offset; survives floor themes. |
| Selected/current | Persistent player choice | Selected border/color/fill and text/native state; not a recommendation. |
| Disabled/unavailable | Cannot act now | Native `disabled`, opacity/text, unavailable fill/border, and no pointer action. |
| Pending/busy | Accepted but unresolved | Existing unresolved copy/state remains visible; not silently disabled. |
| Destructive/high-loss | Commitment risk | Danger border/text and explicit consequence; distinct from selected. |
| Success/completed | Resolution happened | Result/completed state and copy; no implication that another option was “best”. |

The focused browser guard checks the representative valid ally-target cards have
one availability grammar across the same semantic state, no `recommended`
class, and no recommendation copy. The existing accessibility journeys remain
the owners for focus, non-color cues, reduced motion, overlay semantics, and
long Japanese behavior.

## Motion matrix

| Motion class | Current evidence/role | Reduced-motion equivalent |
| --- | --- | --- |
| Micro feedback | button acknowledgement uses `--motion-tap` (100ms) | Preserve native/input state; remove decorative transform. |
| State transition | selection/overlay transitions use `--motion-state` (150ms) | Immediate transition with selected/open state visible. |
| Shell transition | shared shell color/border transitions use `--motion-shell` (200ms) | Immediate shell state. |
| Semantic emphasis | damage, discovery, result treatments remain existing local motion | Keep readable consequence/result; suppress decoration. |
| Spatial/world transition | movement/turn/floor renderer feedback remains Canvas/Pixi owner | Renderer equivalent follows #1226/#1238 reduced-motion contract. |
| Floor entry | existing floor stinger remains floor-theme-owned | Existing reduced-motion rule removes transition/aura animation. |

No new loader, glow, bounce, stagger, screen shake, or gameplay-delay
animation was introduced.

## Floor-theme interaction

`floor-themes.css` and `ui_root.js` only apply floor identity variables for
border/glow/background/header/banner/aura. Shared selected, focus, danger,
destructive, disabled, secondary/tertiary text, Current Event Strip, and
Action Dock semantics are not redefined per floor. The existing dungeon-theme
and renderer-owner journeys cover representative floor states; shared DOM
state assertions remain renderer-independent.

## Density and intentional one-offs

The dungeon remains the #1023 four-region model: Minimal HUD, Dungeon View,
Current Event Strip, and Action Dock. The audit found no new constant chrome,
HUD pressure, duplicated event/action hierarchy, or always-on helper copy in
the changed surfaces. Town, Preparation, and Result continue to use their own
hierarchies; the four-region dungeon model was not imposed on them.

Intentional one-offs retained:

- biome-specific floor aura, border, glow, and background identity;
- Canvas/Pixi renderer geometry, materials, lighting, fog, particles, monster
  art, and movement/turn feedback;
- local spell/status/HP accents that disclose known state only;
- compact Archive/Codex treatment and its legacy local inline styling;
- dramatic Result success/death/loss emphasis and discovery/loot grouping;
- data-derived widths and dynamic status/HP values.

These differ because their player-facing meaning or ownership differs. They are
not accidental cross-screen state drift and were not unified.

## Actual drift and transformation

| Incident | Player-facing principle | Intended grammar | Observable invariant | Guard/owner | Fix |
| --- | --- | --- | --- | --- | --- |
| Valid low-HP ally received green border/glow and `回復推奨`; another valid ally used cyan availability styling. | Selection UI must clarify available choices without teaching an optimal answer. | Valid healing targets use availability; selected/current is separate from recommended. | Same valid target state has the same border/fill/status treatment and no recommendation class/copy. | `tests/ui-visual-system.spec.js`; spell targeting owner. | Removed `isRecommended`, renamed copy to `回復可`, removed `.recommended` styling. |
| Pending Reward cards used undefined aliases, producing blue `rgba(8,12,24,.82)` fallback, 8px radius, 10px padding. | Shared raised information must retain Dark Archive surface ownership. | Raised surface uses `--surface-raised`, `--border-color`, `--radius-sm`, and spacing scale. | Computed card surface is `rgb(21,31,39)`, border `rgb(38,52,61)`, radius 5px. | `tests/ui-visual-system.spec.js`; pending reward owner. | Replaced undefined aliases with canonical tokens; aligned gap/padding. |
| Pending Reward action set an inline 44px height despite shared button ownership. | Activation geometry has one shared mobile owner. | `.btn` owns `--tap-min`. | Computed action height/min-height remains at least 44px without feature inline style. | `tests/ui-visual-system.spec.js`; buttons owner. | Removed redundant inline height. |
| The same `#0c0c0e` value had been assigned to unavailable controls, meter tracks, and passive stat surfaces. | Token names must preserve player-facing meaning even when pixel values match. | `--surface-unavailable` is reserved for disabled/inert controls; `--surface-meter-track` owns passive meter tracks; passive stat information uses a neutral surface owner. | Selector-level ownership keeps unavailable styling from spreading to readable passive information. | `tests/node/unit/test_visual_system_tokens.js`; `tokens.css` owner. | Added semantic aliases and split the use sites without changing rendered pixels. |
| The same `#14141a` value had begun to identify both interactive controls and passive combat/spell/result information. | A control token must not become a generic dark panel token. | `--surface-control` remains interactive-only; passive information uses `--surface-neutral`. | Passive information cannot acquire control-state meaning through token reuse. | `tests/node/unit/test_visual_system_tokens.js`; domain CSS owners. | Reassigned passive selectors to `--surface-neutral` without changing rendered pixels. |
| Repeated overlay surfaces and state transitions used raw duplicate values after palette migration. | Same responsibility should not drift silently across domain CSS. | Semantic tokens own repeated control surfaces and motion timings. | Audited domains no longer repeat the selected legacy surface/timing literals. | CSS lint plus code review; `tokens.css` owner. | Added semantic surface/border tokens and three motion tokens; migrated only repeated values. |

## Before/after evidence

Both spell images use the same deterministic fixture, 390×844 viewport, party
state, and target-selection state. The before image is the baseline source
behavior; the after image is the patched behavior.

| Surface | Before | After | Player-facing reason |
| --- | --- | --- | --- |
| Ally spell target selection | [spell-target-before.png](issue-1228-visual-system/spell-target-before.png) | [spell-target-after.png](issue-1228-visual-system/spell-target-after.png) | Remove recommendation signal; preserve equal choice clarity. |
| Pending Reward card | Baseline computed style: undefined aliases resolved to `rgba(8, 12, 24, 0.82)`, 8px, 10px | [pending-reward-after.png](issue-1228-visual-system/pending-reward-after.png) and computed canonical values above | Return the card to the existing raised-surface grammar without redesign. |

The after evidence was generated by the new focused browser guard. No
snapshot matrix was added for renderer pixels.

## Child issues and ownership decisions

- Child Issues created: none. No larger redesign was necessary to resolve the
  evidence-backed drift found in this pass.
- Bag information architecture, Portal flow, HUD layout, dungeon readability,
  renderer geometry, and Pixi comfort remain with their existing owners
  (#1181, #1230, #1238, and related work), not #1228.
- No telemetry was added; #1227 remains unchanged.
- No gameplay, balance, or hidden-game-knowledge behavior was changed.

## Verification record

### Baseline

`npm run test:browser:visual` on the baseline current main ran 94 visual tests:
91 passed and 3 failed in the existing `ui-mobile.spec.js` standalone
safe-area chest case because the test expected the stale text `Gedは...` while
current main renders `冒険者は...`. This is unrelated to #1228 CSS/state work
and is reported rather than hidden.

After synchronizing that stale owner-test expectation (without changing
production UI), `npm run test:browser:visual` ran 95 tests with 95 passed.

### After checks

- `PLAYWRIGHT_PORT=39127 npm run test:browser:visual` — 95 passed.
- `npm run test:unit` — 195 passed, 3 skipped, 0 failed.
- Existing #1225 Golden Journey and #1226 accessibility owners were included
  in the final focused browser selection; the post-rebase canonical smoke
  suite ran 86/86
  passed.

### Guard inventory

- Browser-computed selected/recommendation guard for valid spell targets.
- Browser-computed raised-surface, border, radius, and 44px tap guard for
  Pending Reward.
- CSS ownership guard keeps unavailable, passive meter/stat, passive neutral,
  and interactive control selectors on their respective semantic tokens.
- Existing Golden Journey screenshots remain limited to stable Town,
  Preparation, and Result surfaces.
- Existing accessibility guards continue to cover focus-visible, non-color
  state cues, long Japanese, reduced motion, and overlay semantics.

### Freshness

The branch was created from fetched `origin/main` at
`0a45d920745c3efc6f7bc7839b94c06cfcbf81ad`. A later freshness check found
that main had advanced through #1239, #1256, #1257, and #1258. The branch
was rebased cleanly onto the current `origin/main` SHA
`6bbd07738af3fe60dab18f5627d1ef9192f4cbd0`; the intervening changes were
agent guidance, retired-manifest cleanup, and skills-lock cleanup, with no
overlapping production CSS or renderer changes. The PR must remain based on
this SHA.
