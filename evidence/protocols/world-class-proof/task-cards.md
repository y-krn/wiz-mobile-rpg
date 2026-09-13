# World-class Proof task cards

These cards define the repeatable sole-user observations for the ten Golden
Journeys. The journey ID is resolved from `tests/golden-journeys.js`; this file
is not a second journey registry. Use the operator prompt consistently across
longitudinal records and comparative products.

## TASK-01 — Fresh start → starting kit → B1F

- Golden Journey ID: `fresh-start-to-b1f`
- Player goal: Start a new run, make a starting preparation choice, and reach B1F gameplay.
- Starting state: Fresh browser context; starting-kit preparation surface is visible; no Workshop ranks.
- Usage prompt: “Start a new run and get into the dungeon. Make the choices that seem right to you.”
- Success: Reaches B1F/explore with the selected kit and recognizes gameplay has begun.
- Success with friction: Reaches B1F/explore with one or more recorded friction codes.
- Blocked: Cannot reach B1F because the product/device path prevents continuation.
- Critical failure: Run cannot start, selected preparation is silently lost, or a fundamental input/navigation break prevents continuation.
- Observable events: preparation recognition, first correct action, departure acknowledgement, B1F arrival, `wrong_primary_action`, `blank_or_unacknowledged_input`, `lost_focus_or_context`, `task_abandon`.
- Follow-up question: “What did you expect to happen next, and what made that clear or unclear?”

## TASK-02 — Explore → Combat → result → Explore

- Golden Journey ID: `explore-combat-result-explore`
- Player goal: Recognize an encounter, complete the combat objective, understand the result, and continue exploring.
- Starting state: Deterministic B1F encounter and seeded result path are available.
- Usage prompt: “Explore until you encounter a fight, handle it, and continue when the result is shown.”
- Success: Discovers/uses the primary combat action, reaches a readable result, and returns to an understandable exploration state.
- Success with friction: Reaches the result and exploration state with recorded friction.
- Blocked: Cannot complete or interpret the encounter/result path.
- Critical failure: Combat/result prevents continuation, duplicates a world action, or hides whether the run succeeded or failed.
- Observable events: encounter recognition, primary action, accepted/pending/result feedback, continuation, `repeated_rejected_action`, `duplicate_action_attempt`, `blank_or_unacknowledged_input`.
- Follow-up question: “What happened in the fight, and what could you do after the result?”

## TASK-03 — Target → Back → reselect

- Golden Journey ID: `combat-target-back-reselect`
- Player goal: Choose a combat target, reconsider it before commitment, and complete the intended target action.
- Starting state: Two-target combat fixture; target selection can be opened from the available combat action.
- Usage prompt: “Choose a target for the combat action. Reconsider it before committing, then complete the action you intend.”
- Success: Enters target selection, exits the uncommitted choice through the available recovery path, reselects, and commits once.
- Success with friction: Completes the target action with recorded navigation, focus, or feedback friction.
- Blocked: Cannot recover/reselect or cannot complete the intended target action.
- Critical failure: Exiting target selection commits an action, changes world state, or leaves no usable resume route.
- Observable events: target entry, target identity/state, exit/reselection, single commit, `avoidable_back`, `reopen_same_surface`, `lost_focus_or_context`, `focus_not_restored`, `duplicate_action_attempt`.
- Follow-up question: “When you reconsidered the target, what did you expect before committing?”

## TASK-04 — Loot / Equipment comparison

- Golden Journey ID: `loot-inspect-compare-settle`
- Player goal: Understand a loot item, compare it with the current state, and decide whether to equip, keep, or discard it.
- Starting state: Identified and unresolved equipment candidates are available with explicit ownership context.
- Usage prompt: “Inspect the reward and decide what to do with it. Explain the decision in a short note after the task.”
- Success: Reads the current/proposed comparison, makes a deliberate choice, and reaches the explicit committed or cancelled state.
- Success with friction: Reaches a settled decision with lookup, hierarchy, reach, or reopen friction.
- Blocked: Cannot distinguish the comparison or cannot reach a terminal decision.
- Critical failure: Draft changes the live build before commitment, ownership is lost unexpectedly, or commit/cancel semantics are reversed.
- Observable events: current/proposed state, ownership/knowledge, commit/cancel, `information_lookup_cost`, `visual_hierarchy_confusion`, `reopen_same_surface`, `lost_focus_or_context`, `destructive_near_miss`.
- Follow-up question: “What did you compare, and what consequence did you expect?”

## TASK-05 — Full-bag replacement

- Golden Journey ID: `full-bag-replacement`
- Player goal: Resolve a full inventory without losing the wrong item and reach a settled state.
- Starting state: 20-slot inventory is full; replacement candidate and commit/cancel routes are available.
- Usage prompt: “Your inventory is full and a new item is available. Resolve the situation in the way that seems safest.”
- Success: Recognizes capacity pressure, understands what would be replaced, and commits or cancels with the intended inventory result.
- Success with friction: Reaches a settled inventory result with recorded safety, lookup, scroll, or feedback friction.
- Blocked: Cannot resolve the full bag or leaves inventory state uncertain.
- Critical failure: Wrong item is destroyed, cancellation destroys an item, or replacement cannot continue.
- Observable events: capacity recognition, candidate/current comparison, commit/cancel, `destructive_near_miss`, `misunderstood_consequence`, `repeated_rejected_action`, `scroll_trap`, `task_abandon`.
- Follow-up question: “What information did you use to decide what would be kept or replaced?”

## TASK-06 — Chest / Trap

- Golden Journey ID: `chest-trap-decision`
- Player goal: Inspect a chest/trap situation, choose an action, and understand the result.
- Starting state: Deterministic trapped chest with inspect, disarm, kit, leave, and result states.
- Usage prompt: “Investigate the chest and deal with what you find. Choose the action that seems right.”
- Success: Inspects before deciding, performs or declines an action, and can explain the resulting state.
- Success with friction: Reaches a result with recorded risk, feedback, hierarchy, or motion-comfort friction.
- Blocked: Cannot identify the available decision or result.
- Critical failure: Trap/chest resolution is destructive without an understandable decision or blocks recovery.
- Observable events: inspect-before-decision, risk/cost reading, result reading, `wrong_primary_action`, `misunderstood_consequence`, `destructive_near_miss`, `blank_or_unacknowledged_input`.
- Follow-up question: “What did you think the risk and result of the action were?”

## TASK-07 — Portal Push / Return

- Golden Journey ID: `portal-resolution`
- Player goal: Understand the Portal choice, weigh its consequence, and commit or cancel deliberately.
- Starting state: B5F Portal with HP/MP, bag capacity, and unbanked object-loot candidates visible.
- Usage prompt: “You have reached a Portal. Decide what to do and note the expected consequence before committing.”
- Success: Understands both choices in observable notes, can reconsider without committing, and reaches exactly one resolved result.
- Success with friction: Reaches one result with recorded lookup, hierarchy, reopen, or feedback friction.
- Blocked: Cannot explain the consequence or leaves the choice unresolved.
- Critical failure: Choice is reversed or committed without readable consequence, duplicate confirmation settles twice, or expected stakes are lost.
- Observable events: equal-choice discovery, consequence note, confirm/reconsider, single resolution, `misunderstood_consequence`, `destructive_near_miss`, `reopen_same_surface`, `duplicate_action_attempt`.
- Follow-up question: “What did you believe each choice would do to the run and carried items?”

## TASK-08 — Wing

- Golden Journey ID: `wing-rescue-selection`
- Player goal: Select what to rescue, understand the limit, and commit or cancel safely.
- Starting state: Three eligible unbanked candidates, including equipped loot, with a two-item rescue limit.
- Usage prompt: “Choose what, if anything, to rescue and finish the decision.”
- Success: Finds the eligible set, understands the selection limit, and commits or cancels with ownership preserved.
- Success with friction: Settles the selection with recorded information, reach, focus, or scroll friction.
- Blocked: Cannot make or settle a selection.
- Critical failure: An unselected item is destroyed unexpectedly, the limit is hidden/bypassed, or cancel changes ownership.
- Observable events: candidate set, selection limit, review/commit, `lost_focus_or_context`, `misunderstood_consequence`, `destructive_near_miss`, `scroll_trap`, `focus_not_restored`.
- Follow-up question: “What information did you use to decide what to rescue?”

## TASK-09 — Result → Town

- Golden Journey ID: `death-result-town`
- Player goal: Understand a failure/return result, distinguish loss from retention, and identify Town as the next step.
- Starting state: Death/return result with structured cause, retained record, lost dungeon loot, and named Town action.
- Usage prompt: “Review what happened and decide what to do next.”
- Success: Explains the result, identifies retained/lost information, and reaches Town or the next available action.
- Success with friction: Reaches the next action with recorded hierarchy, lookup, feedback, or context friction.
- Blocked: Cannot explain the result or identify a next action.
- Critical failure: Loss/retention is reversed or hidden, result has no recovery route, or Town cannot be reached.
- Observable events: outcome/cause reading, retained/lost distinction, next action, `misunderstood_consequence`, `visual_hierarchy_confusion`, `lost_focus_or_context`, `task_abandon`.
- Follow-up question: “What was lost, what remained, and what would happen next?”

## TASK-10 — Town → preparation → next run

- Golden Journey ID: `town-preparation-next-run`
- Player goal: Use Town context to prepare and begin the next run without an optimal-strategy cue.
- Starting state: Town home with prior-run memory, preparation surface, and 20-slot load preview.
- Usage prompt: “Prepare for another run and start it when ready. Choose what seems appropriate.”
- Success: Understands preparation context, makes a choice, and starts the next run through the normal contract.
- Success with friction: Starts the next run with recorded lookup, reach, scroll, hierarchy, or feedback friction.
- Blocked: Cannot locate preparation or begin the next run.
- Critical failure: Prior-run state is misleading/lost, selected preparation is not committed, or next run cannot begin.
- Observable events: prior/next context, preparation, selected-state preservation, start acknowledgement, `wrong_primary_action`, `lost_focus_or_context`, `blank_or_unacknowledged_input`, `task_abandon`.
- Follow-up question: “What did Town tell you about the previous run and the next one?”
