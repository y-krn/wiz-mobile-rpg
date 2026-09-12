# Issue delivery lifecycle

This reference connects the `#<issue>着手` contract in the root
[`AGENTS.md`](../AGENTS.md) to the existing repository guidance. It is a
routing and evidence contract, not a replacement for domain checklists,
`qa-regression.md`, or `merge-gate.md`.

## Before editing

1. Read the Issue's goal, acceptance criteria, constraints, related links, and
   current state. Treat the Issue as the product objective, not as an
   implementation instruction.
2. Check readiness. Map every acceptance criterion to the evidence that can
   prove it: source behavior, an existing or focused test, lint, build,
   browser evidence, simulation, or a documented manual inspection. If a
   missing decision could materially change the result, inspect repository
   evidence first and ask only for that decision. Otherwise record a
   reasonable assumption and continue.
3. Route the work through [the file map](file-map.md) and the [skill ownership
   map](README.md#conditional-skill-routing). Load only the matching checklist
   and conditional skill. Use `diagnosing-bugs` when QA triage cannot establish
   the cause or a red-capable reproduction, or when the report is a performance
   regression; keep a known-cause bug on the QA path. Use `writing-for-agents`
   when creating or materially revising repository skills or agent guidance.
   The checklist owns the review lens; a skill owns only its repeatable
   conditional workflow. Do not invent a new lifecycle skill when the existing
   references are sufficient.
4. Choose the lightest planning artifact that preserves continuity. A small,
   clear change needs only a local plan and the Issue/PR evidence. Create a
   repository plan only when the work is complex, long-running, or needs a
   durable handoff between sessions.

The acceptance-to-evidence map is a working contract. Update it when the
implementation changes the proof needed; do not postpone an untestable or
ambiguous acceptance criterion until review.

## Validating this lifecycle reference

When changing this lifecycle reference, dry-run one recent ready Issue with a
real domain path in addition to checking the reference itself. Record the
short route from goal and acceptance criteria through the file map, applicable
checklist or conditional skill, acceptance-to-evidence mapping, material
ambiguity decision, and final verification owner. The lifecycle Issue itself
can prove self-routing, but it is not sufficient as the sole representative
task for domain routing.

The #1198 dry-run follows this route: its goal, acceptance criteria, and
conditional cadence rule route through the progression/economy path in the file
map, `balance-simulation.md`, and the `balance-simulation` skill; its matched
resource-cadence evidence shows increased resource opportunity but nearly
unchanged immediate continuation and next-entry HP. No material ambiguity
remains, so the decision gate selects cadence-only rejection and probe
retention: keep production unchanged and return the unresolved question to
follow-up Cost/amount work. `qa-regression.md` owns the local verification, and
`merge-gate.md` owns immutable review and current-head CI. This example validates
the gate without copying balance-specific thresholds or checklist rules into
this lifecycle reference.

## During implementation

- Keep one Issue and one concern in scope. Preserve unrelated worktree
  changes and do not broaden the task because a nearby cleanup is convenient.
- Use the narrowest deterministic feedback loop that covers the change. The
  verification cadence and final local gate belong to
  [`qa-regression.md`](qa-regression.md); do not copy their test matrix here.
- Keep executable rules, current data, and exact scenario inventories in
  source and tests. Guidance should explain routing, evidence, and stop
  conditions rather than mirror implementation details.
- When a domain rule, balance claim, or player-facing contract changes, apply
  the matching canon and checklist from [the review map](README.md). If the
  canon is unaffected, state that explicitly in the PR.

## Before the first push

Perform a lightweight self-review after the relevant content is complete:

- Compare the current diff with every Issue acceptance criterion, stated
  boundary, applicable canon, and the acceptance-to-evidence map.
- When the Issue defines a conditional adoption, rejection, or selection
  criterion, apply a decision gate before declaring self-review complete:
  - Apply current evidence to the criterion and record the resulting branch.
  - Check that the final diff and disposition, such as a production change,
    retained probe, no change, or follow-up, agree with that branch.
  - When required evidence cannot select a branch, return to the existing
    ambiguity/evidence flow and withhold the success claim.
- Inspect the changed-file set and run `git diff --check`. Fix obvious
  blocking defects before handoff.
- Run the smallest sufficient final local gate owned by `qa-regression.md`.
  Apply any additional validator required by the owning domain guidance.
- Record assumptions, omitted surfaces, and evidence limitations instead of
  turning an unexercised path into a success claim.

Do not rerun a passing local check merely because of status, commit, or PR
metadata operations. Rerun the invalidated check when relevant code, tests,
configuration, documentation, or other proof-bearing content changes. The
full cadence and CI rules remain owned by `qa-regression.md` and
`merge-gate.md`.

## Pull request handoff

Open or update the PR that closes the Issue. Keep the PR body concise but make
the evidence traceable:

- Summary and scope, including why the change is the minimum harness needed.
- Make each acceptance criterion's disposition and evidence traceable in the
  PR or a linked review/evidence artifact. For a conditional criterion, include
  the applied rule, evidence, resulting branch, and disposition. Use a table
  when it is the clearest minimal representation; do not require a dedicated
  format.
- Verification results, the base/head revision used, and any omitted checks
  with their reason.
- Canon impact and assumptions, including an explicit unaffected statement
  when appropriate.
- `Closes #<issue>` and the current review/CI state.

Self-review is a defect filter, not independent review. After the head is
fixed, use [`merge-gate.md`](merge-gate.md) for immutable `BASE_SHA` /
`HEAD_SHA` evidence, the changed-file set and patch identity, independent
review, and required current-head CI. A code, test, configuration, conflict
resolution, or changed PR-specific diff after review requires the corresponding
fresh evidence; do not silently reuse the old verdict.

## After review findings

Fix actionable findings within the Issue scope, then rerun only the checks and
review evidence invalidated by the fix. Promote a finding into a test, lint
rule, structural check, durable guidance, or tooling only when it represents a
repeatable failure class. Keep one-off implementation mistakes out of the
permanent harness and record genuinely out-of-scope follow-ups separately.

The delivery is complete when the Issue acceptance criteria have a disposition
and evidence, the scoped local verification is current, independent review is
valid for the current change set, and required CI passes for the current PR
head. Merge and deploy remain outside the `#<issue>着手` authorization.
