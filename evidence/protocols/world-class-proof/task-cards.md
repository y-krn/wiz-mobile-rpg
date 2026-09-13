# World-class Proof task cards

These cards are the common task definitions for the ten Golden Journeys. The
journey ID is resolved from `tests/golden-journeys.js`; the card is not a
second journey registry. Read only the participant instruction to a participant.
The other fields are moderator/evaluator criteria.

## TASK-01 — Fresh start → starting kit → B1F

- Golden Journey ID: `fresh-start-to-b1f`
- Player goal: Start a new run, make a starting preparation choice, and reach B1F gameplay.
- Starting state: Fresh browser context; the starting-kit preparation surface is visible; no Workshop ranks.
- Participant instruction: “Start a new run and get into the dungeon. Please think aloud and make the choices that seem right to you.”
- Unassisted success: The participant reaches B1F/explore with a selected starting kit and recognizes that gameplay has begun without task-relevant moderator direction.
- Assisted success: The participant reaches B1F/explore after a recorded bounded hint about the task goal or continuation, without the moderator naming a control or choice.
- Failure: The participant cannot reach B1F or leaves the task without a critical break.
- Critical failure: The run cannot start, the selected preparation is silently lost, or a fundamental navigation/input break prevents continuation.
- Observable events: starting-state recognition, first correct preparation action, departure acknowledgement, B1F arrival, `wrong_primary_action`, `lost_focus_or_context`, `blank_or_unacknowledged_input`, `task_abandon`.
- Follow-up question: “What did you think you needed to do next, and what information made that clear or unclear?”

## TASK-02 — Explore → Combat → result → Explore

- Golden Journey ID: `explore-combat-result-explore`
- Player goal: Recognize an encounter, complete the available combat objective, understand the result, and continue exploring.
- Starting state: Deterministic B1F encounter fixture; combat entry and seeded result path are available.
- Participant instruction: “Explore until you encounter a fight, then handle the fight and continue when the result is shown. Please think aloud.”
- Unassisted success: The participant discovers and uses the primary combat action, reaches a readable result, and returns to an understandable exploration state.
- Assisted success: The same terminal state is reached after neutral continuation support or technical recovery is recorded.
- Failure: The participant cannot complete or interpret the encounter/result path.
- Critical failure: Combat or result prevents continuation, applies a duplicate world action, or hides whether the run succeeded or failed.
- Observable events: encounter recognition, primary action discovery, accepted/pending/result feedback, continuation action, `wrong_primary_action`, `repeated_rejected_action`, `duplicate_action_attempt`, `blank_or_unacknowledged_input`.
- Follow-up question: “What happened in the fight, and what did you believe you could do after the result?”

## TASK-03 — Target → Back → reselect

- Golden Journey ID: `combat-target-back-reselect`
- Player goal: Choose a combat target, reconsider it before commitment, and complete the intended target action.
- Starting state: Two-target combat fixture; a target-selection surface can be opened from the available combat action.
- Participant instruction: “Choose a target for the combat action. Before committing, reconsider your choice and then complete the action you intend. Please think aloud.”
- Unassisted success: The participant enters target selection, exits the uncommitted choice through the available recovery path, reselects a target, and commits once without being told which control performs those steps.
- Assisted success: The participant completes the same path after a recorded neutral prompt to continue reconsidering the choice, without naming Back, Cancel, or a target.
- Failure: The participant cannot recover or reselect, or commits an unintended target.
- Critical failure: Exiting target selection commits an action, changes world state, or leaves no usable route to resume.
- Observable events: target-surface entry, target identity/state reading, exit/reselection, one committed action, `avoidable_back`, `reopen_same_surface`, `lost_focus_or_context`, `duplicate_action_attempt`, `focus_not_restored`.
- Follow-up question: “When you reconsidered the target, what did you think would happen before you committed?”

## TASK-04 — Loot / Equipment comparison

- Golden Journey ID: `loot-inspect-compare-settle`
- Player goal: Understand a loot item, compare it with the current state, and decide whether to equip, keep, or discard it.
- Starting state: Identified and unresolved equipment candidates are available with explicit ownership context.
- Participant instruction: “Inspect the reward and decide what you want to do with it. You may equip it, keep it, or discard it if that seems appropriate. Please explain your decision aloud.”
- Unassisted success: The participant identifies the current/proposed comparison, makes a deliberate choice, and reaches the explicit committed or cancelled state without hidden information being supplied.
- Assisted success: The decision is reached after a recorded neutral clarification of the task goal or a technical recovery, not after the moderator recommends an item or build.
- Failure: The participant cannot distinguish the comparison or does not reach a terminal decision.
- Critical failure: A draft changes the live build before commitment, ownership is lost unexpectedly, or commit/cancel semantics are reversed.
- Observable events: current/proposed state reading, ownership/knowledge interpretation, decision commit or cancellation, `reopen_same_surface`, `lost_focus_or_context`, `misunderstood_consequence`, `destructive_near_miss`, `blank_or_unacknowledged_input`.
- Follow-up question: “What did you compare, and what consequence did you expect from your choice?”

## TASK-05 — Full-bag replacement

- Golden Journey ID: `full-bag-replacement`
- Player goal: Resolve a full inventory without losing the wrong item and reach a settled state.
- Starting state: A 20-slot inventory is full; a replacement candidate and explicit commit/cancel routes are available.
- Participant instruction: “Your inventory is full and a new item is available. Resolve the situation in the way you think is safest, and think aloud.”
- Unassisted success: The participant recognizes capacity pressure, understands which item would be replaced, and commits or cancels with the intended inventory result.
- Assisted success: The participant reaches a settled result after a bounded task-goal reminder, with no item or action recommendation from the moderator.
- Failure: The participant cannot resolve the full bag or leaves the inventory state uncertain.
- Critical failure: The wrong item is destroyed, cancellation destroys an item, or the replacement flow cannot continue.
- Observable events: capacity recognition, candidate/current comparison, commit/cancel outcome, `destructive_near_miss`, `misunderstood_consequence`, `repeated_rejected_action`, `task_abandon`.
- Follow-up question: “How did you decide what would be kept or replaced?”

## TASK-06 — Chest / Trap

- Golden Journey ID: `chest-trap-decision`
- Player goal: Inspect a chest/trap situation, choose an action, and understand the result.
- Starting state: Deterministic trapped chest fixture with inspect, disarm, kit, leave, and result states.
- Participant instruction: “Investigate the chest and deal with what you find. Choose the action that seems right to you, and think aloud.”
- Unassisted success: The participant inspects before deciding, performs or declines an action, and can explain the resulting state.
- Assisted success: The participant reaches the same terminal result after a neutral prompt to continue observing, not a risk or action recommendation.
- Failure: The participant cannot identify the available decision or result.
- Critical failure: Trap/chest resolution is destructive without an understandable decision, or result blocks recovery.
- Observable events: inspect-before-decision, risk/cost reading, result reading, `wrong_primary_action`, `misunderstood_consequence`, `destructive_near_miss`, `blank_or_unacknowledged_input`.
- Follow-up question: “What did you think the risk and result of your action were?”

## TASK-07 — Portal Push / Return

- Golden Journey ID: `portal-resolution`
- Player goal: Understand the available Portal choice, weigh its consequence, and commit or cancel deliberately.
- Starting state: B5F Portal with HP/MP, bag capacity, and unbanked object-loot candidates visible.
- Participant instruction: “You have reached a Portal. Decide what you want to do and explain the expected consequence before you commit. Please think aloud.”
- Unassisted success: The participant understands the two available choices in their own words, can reconsider without committing, and reaches exactly one resolved result.
- Assisted success: The participant reaches one resolved result after a recorded neutral prompt to explain the choice; the moderator does not define Portal semantics or recommend Push/Return.
- Failure: The participant cannot explain the consequence or leaves the choice unresolved.
- Critical failure: The choice is reversed or committed without a readable consequence, duplicate confirmation settles twice, or the return path loses expected stakes.
- Observable events: equal-choice discovery, consequence explanation, confirm/reconsider, single resolution, `misunderstood_consequence`, `destructive_near_miss`, `reopen_same_surface`, `duplicate_action_attempt`, `blank_or_unacknowledged_input`.
- Follow-up question: “What did you believe each choice would do to your run and your carried items?”

## TASK-08 — Wing

- Golden Journey ID: `wing-rescue-selection`
- Player goal: Select what to rescue, understand the limit, and commit or cancel safely.
- Starting state: Three eligible unbanked candidates, including equipped loot, with a two-item rescue limit.
- Participant instruction: “Choose what, if anything, you want to rescue and finish the decision. Please think aloud about the trade-offs.”
- Unassisted success: The participant finds the eligible set, understands the selection limit, and commits or cancels with ownership preserved as intended.
- Assisted success: The participant reaches a settled selection after a neutral prompt to review the visible candidates, without the moderator choosing candidates or explaining hidden value.
- Failure: The participant cannot make or settle a selection.
- Critical failure: An unselected item is destroyed unexpectedly, the limit is hidden or bypassed, or cancel changes ownership.
- Observable events: candidate-set discovery, selection-limit reading, selection/review/commit, `lost_focus_or_context`, `misunderstood_consequence`, `destructive_near_miss`, `focus_not_restored`.
- Follow-up question: “What information did you use to decide what to rescue?”

## TASK-09 — Result → Town

- Golden Journey ID: `death-result-town`
- Player goal: Understand a failure/return result, distinguish loss from retention, and identify Town as the next step.
- Starting state: Death/return result with structured cause, retained record, lost dungeon loot, and a named Town action.
- Participant instruction: “Review what happened and decide what you would do next. Please think aloud.”
- Unassisted success: The participant explains the result, identifies what was retained/lost, and reaches Town or the next available action.
- Assisted success: The participant reaches the next action after a neutral prompt to continue reviewing the result, without explaining the loss or destination.
- Failure: The participant cannot explain the result or identify a next action.
- Critical failure: Loss and retention are reversed/hidden, the result has no recovery route, or the run cannot continue to Town.
- Observable events: outcome/cause reading, retained/lost distinction, next-action discovery, `misunderstood_consequence`, `lost_focus_or_context`, `wrong_primary_action`, `task_abandon`.
- Follow-up question: “What did you think was lost, what remained, and what would happen next?”

## TASK-10 — Town → preparation → next run

- Golden Journey ID: `town-preparation-next-run`
- Player goal: Use Town context to prepare and begin the next run without being told an optimal strategy.
- Starting state: Town home with prior-run memory, preparation surface, and 20-slot load preview.
- Participant instruction: “Prepare for another run and start it when you are ready. Choose what seems appropriate to you, and think aloud.”
- Unassisted success: The participant understands the relevant preparation context, makes a choice, and starts the next run through the normal contract.
- Assisted success: The next run starts after a neutral prompt to continue the task, without a build, item, floor, or target recommendation.
- Failure: The participant cannot locate preparation or begin the next run.
- Critical failure: Prior-run state is misleading or silently lost, the selected preparation is not committed, or the next run cannot begin.
- Observable events: prior/next-context reading, preparation discovery, selected-state preservation, start acknowledgement, `wrong_primary_action`, `lost_focus_or_context`, `blank_or_unacknowledged_input`, `task_abandon`.
- Follow-up question: “What did Town tell you about the previous run and the next one?”
