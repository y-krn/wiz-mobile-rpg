# Mobile Game UI/UX Standard

## Role

Review mobile browser UX as a durable player-facing contract. The review asks
whether a player can understand the current state, make the intended choice,
and recover safely on a small touch screen. It does not prescribe the
implementation technique used to produce that result.

## Scope

- Interaction, one-handed reach, touch safety, and transition continuity
- Information hierarchy, state clarity, decision flow, and result visibility
- Accessibility, responsive behavior, safe-area resilience, and browser support
- Game-specific efficiency for exploration, combat, inventory, and settlement
- Rendered geometry, visual legibility, and mobile performance where relevant

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the changed UI
module, its corresponding style module, and the owning `tests/ui-*.spec.js`
file. Expand only to direct callers, shared navigation, or shared shell files
needed to explain the affected flow. Keep source, rendered behavior, and test
ownership aligned.

## Review Inputs

- The player goal and the affected user-facing flow
- Changed files and their direct callers
- Browser observations or screenshots at supported mobile sizes
- The worst-case state: long content, short vertical space, safe-area insets,
  loading or error state, and any scroll position that affects the decision

## Review Method

For each concern, record the player-facing principle, patterns that usually
satisfy it, and the observable condition that rejects it. Convert recurring
incidents into this chain:

> incident -> principle -> observable invariant -> automated verification

Keep implementation choices open when the same outcome can be achieved in
more than one way.

## Interaction and One-Handed Reach

**Principle:** Primary and frequent actions are easy to reach, distinguish, and
activate without accidental input.

**Prefer:**

- An effective rendered activation area of at least 44x44 CSS px in both
  dimensions, with enough separation to distinguish adjacent actions.
- Frequent actions in a comfortable reach zone, with stable placement as
  content grows or a panel becomes scrollable.
- Rare, destructive, or irreversible actions visually and spatially separated
  from frequent actions, with intentional confirmation or an undo path.
- Explicit Back, Close, Cancel, and recovery paths when a choice may be
  abandoned safely.

**Reject when:**

- Any required dimension of a critical activation area falls below the
  minimum, or the target is clipped, overlapped, or hard to distinguish.
- Content pressure makes a frequent action smaller, hidden, or reachable only
  through an unnecessary detour.
- A destructive action is easy to hit while performing a routine action, or a
  recoverable flow has no clear cancellation path.

## Information Hierarchy and State Clarity

**Principle:** The current state, active choice, consequences, and next
meaningful action are understandable without reconstructing hidden history.

**Prefer:**

- State, selection, ownership, capacity, availability, and relevant knowledge
  shown where the player makes the decision.
- Important information preserved when a surface is hidden, replaced,
  collapsed, or made scrollable. Move unique information to a persistent or
  newly visible surface before removing its original surface.
- Comparisons that retain enough context to distinguish the current value, the
  proposed value, and the consequence of committing it.
- Recovery and settlement choices that show the complete candidate set,
  including equipped or otherwise separately stored items, the selection
  limit, and the point at which the choice is committed; cancellation leaves
  the source resource and selection uncommitted.
- A concise, actionable signal when future risk affects the choice, without
  exposing internal labels, probabilities, or implementation state.
- Results that clearly distinguish success, loss, rescue, pending resolution,
  and what is or is not available for the next action.

**Reject when:**

- The player must infer a current state, selected target, failure reason, or
  consequence from an earlier screen or a hidden log.
- Hiding or replacing a surface silently removes the only readable source of
  player-relevant information.
- Routine comparison requires repeated open/back/open navigation because the
  relevant context is not retained.

## Cognitive Load and Decision Flow

**Principle:** Each state presents a focused decision and enough context to
complete it confidently.

**Prefer:**

- One clear primary decision at a time, with unrelated detail behind
  progressive disclosure.
- Labels that describe the player outcome and the next step, including error
  recovery and cancellation choices.
- Player intent preserved across transitions, scrolling, previews, and
  confirmations; routine gameplay actions require no unnecessary taps.
- A visible connection between input, game response, and the resulting state.

**Reject when:**

- Several unrelated actions compete as primary choices, or internal detail
  obscures the decision the player actually needs to make.
- A transition resets selection, scroll context, or pending intent without a
  meaningful reason.
- The player cannot tell whether an action changed the game, was rejected, or
  is still processing.

## Shared Choice and Information Contracts

**Principle:** Shared presentation patterns preserve player intent and
player-relevant information consistently across screens, regardless of the
implementation used to render them.

**Prefer:**

- One coherent primary choice surface for the current state. Equivalent
  controls are not rendered as competing copies in separate surfaces.
- Back and Cancel abandon an uncommitted choice; they do not imply undoing
  movement or another gameplay action that already happened. Confirm actions
  state the outcome the player is committing to.
- Current or unresolved observations are visibly distinct from transient or
  historical log text. Compacting a current-event surface keeps active facts
  available, while the complete history remains reachable when it contains
  information the compact view omits.
- Ownership or provenance is labeled with the same terminology wherever that
  distinction affects a decision. When identity is insufficient to determine
  provenance, show that it is ambiguous instead of guessing.

**Reject when:**

- Duplicate equivalent controls make it unclear which surface owns the current
  decision or allow one choice to be committed through another copy.
- Back changes a completed gameplay action, or Confirm leaves the consequence
  unclear before the action is committed.
- A current observation is presented only as old history, or hiding a compact
  surface also hides information that has no other readable path.
- Equivalent ownership states use conflicting labels, or the interface claims
  a provenance that the available identity data cannot support.

## Feedback and Action/Result Visibility

**Principle:** Every meaningful input has timely, unambiguous feedback and a
safe, understandable outcome.

**Prefer:**

- Visible feedback for activation, loading, disabled, success, failure, and
  completion states whenever those states apply.
- Errors placed near the affected decision with a concrete next step.
- Cause and effect made visible in game actions: what the player did, what the
  game changed, and what can happen next.
- Repeated input treated as one intentional action while a transition is
  pending, with no duplicate reward, cost, navigation, or state change.

**Reject when:**

- A tap appears to do nothing, produces conflicting states, or triggers the
  same action more than once.
- Success and failure look alike, a disabled action looks available, or a
  loading state permits ambiguous repeated activation.
- A result is visible only as a transient message that disappears before the
  player can understand or act on it.

## Accessibility

**Principle:** Players can perceive, operate, and understand the flow with
different vision, motion, input, and text-scaling needs.

**Prefer:**

- Meaning conveyed by text, structure, labels, or state in addition to color;
  sufficient contrast for text and essential non-text controls.
- Browser zoom and text scaling that preserve critical actions, state, and
  readable relationships.
- Meaningful names, roles, focus order, and visible focus for controls when
  inspected or operated through browser accessibility tooling.
- Motion reduced or removed when it is non-essential, while state changes and
  feedback remain understandable.
- Native interaction semantics where they help keyboard and assistive
  technology users, with equivalent alternatives for touch gestures.

**Reject when:**

- Color, motion, hover, or position is the only way to identify state or an
  action.
- Zoom, text scaling, keyboard focus, or assistive technology makes a critical
  path unusable, hides the focused control, or removes its meaning.
- An icon or control has no understandable accessible name, or a gesture has
  no usable tap or keyboard alternative.

## Game UX and Frequent-Action Efficiency

**Principle:** High-frequency play remains efficient while the player can see
the game state, the stakes, and the result of each action.

**Prefer:**

- Exploration and combat actions grouped by intent, with the next frequent
  action reachable while secondary content may scroll.
- Inventory and equipment surfaces that expose the configured capacity,
  ownership or knowledge state, current-versus-proposed comparisons, and a
  clear discard or cancellation route when an action cannot complete.
- Long comparison and selection surfaces that keep the current state and
  commit/cancel actions available while candidate content scrolls.
- Partial knowledge represented honestly: observed effects are useful, while
  unknown detail is not presented as certainty.
- Settlement and result surfaces that prioritize the outcome, the meaningful
  recovered or lost information, and the next available action before optional
  detail.
- Game visuals that keep entities, depth, and important landmarks legible even
  without relying on color, while keeping rendering work bounded on mobile.

**Reject when:**

- A frequent gameplay action is buried behind avoidable navigation or becomes
  unreachable when logs, lists, or detail content grows.
- Capacity, ownership, knowledge, rescue, or loss state is omitted at the
  point where it changes the decision.
- Visual variation makes same-kind entities indistinguishable, hides important
  landmarks, or causes interaction performance to degrade on a supported
  device.

## Responsive and Mobile Resilience

**Principle:** The complete critical flow remains usable across supported
widths, heights, text lengths, and device insets.

**Prefer:**

- Decisions verified in rendered states, not inferred from a nominal viewport
  or from declared dimensions.
- Critical controls visible or reachable within their visible region; secondary
  content may scroll without carrying away the action needed to finish the
  decision.
- Final rendered positions that clear top notches and bottom home-indicator
  areas, with no accidental horizontal scrolling or clipping.
- Small action sets that stay compact and readable rather than expanding to
  consume unused space; when constraints recur, revisit the information
  structure instead of repeatedly reallocating the same space.
- Text and controls that remain readable at 360x800, 390x844, and 430x932,
  with short-screen coverage added when the flow is vertically constrained.

**Reject when:**

- A critical interaction works only at one nominal size, disappears below the
  fold, or becomes inaccessible after content grows.
- A scrollable region hides required context or the final action cannot be
  brought into view without leaving the flow.
- Any supported state introduces horizontal overflow, accidental clipping, or
  a control that crosses a device inset.

## Verification Expectations

Run the smallest check that proves the changed invariant during development,
then the relevant final checks:

- UI changes: `npm run test:browser`
- Documentation changes: `npm run lint:docs` and `npm run lint:markdown`
- Changed browser specs: `npm run lint:tests`

Use the existing domain ownership under `tests/ui-*.spec.js`. Browser
assertions should prefer behavior and rendered geometry over a particular
markup or styling recipe. Add a guard when a review establishes a concrete
invariant, including:

- effective activation areas meeting 44x44 CSS px in both dimensions;
- required controls fitting inside or being reachable within their visible
  scroll region;
- critical information remaining present and visible after a surface changes;
- safe-area clearance measured from final rendered position;
- long-content and short-screen states preserving usable control geometry;
- primary actions remaining reachable while secondary content scrolls; and
- repeated input producing only one action or transition.

Exercise the worst-case state rather than only the empty state: full histories,
long lists, short screens, injected device insets, loading/error outcomes, and
each affected game state. Use browser-driven checks or screenshots at
360x800, 390x844, and 430x932; include 320x568 or another short viewport when
vertical pressure is part of the risk.

## Must Not Do

- Do not turn this standard into a historical incident archive.
- Do not prescribe a particular markup, styling, positioning, or rendering
  technique when an observable player-facing invariant is sufficient.
- Do not weaken a regression guard merely to shorten the checklist.
- Do not redesign unrelated screens or add explanatory copy when clear layout,
  labels, and state can make the action understandable.
- Do not prioritize novelty over reach, clarity, accessibility, and reliable
  feedback.

## Output

Keep the repository review output unchanged:

1. `Blocking issues`
2. `Non-blocking issues`
3. `Missing verification`
4. `Verdict`
