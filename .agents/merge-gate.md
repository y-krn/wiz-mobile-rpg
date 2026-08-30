# Merge gate

The merge gate has two separate responsibilities:

- **GitHub protections** are objective repository controls. Keep pull requests
  required, required status checks enabled, the branch up to date with its
  base, and bypass prohibited. Do not add an approval requirement. These
  protections must not be weakened to accommodate the review workflow.
- **Independent review** is a Codex-native safety check recorded on the pull
  request. It supplements GitHub's protections; it does not replace them.

## Independent review

A review passes only when all of the following are true:

1. An independent native review records `APPROVE`.
2. The evidence records the reviewed head SHA, the base SHA used for the
   review, and enough information to verify the PR-specific diff.
3. The reviewed change set is unchanged since the review. A changed head SHA
   does not by itself invalidate the evidence when the change is a clean
   rebase with no conflict resolution and the PR-specific diff is verified to
   be unchanged against the updated base.
4. Obtain a new review when changes after the review include any code, test, or
   configuration modification; conflict resolution; a changed PR-specific
   diff; or a base update that changes the meaning or safety of the PR. If
   equivalence cannot be established, obtain a new review.
5. There are zero unresolved actionable P0-P2 findings.

### Reusing review evidence after a base update

Record the base and head SHAs before the update, then compare the
PR-specific diff before and after the update (for example, the changed-file
set plus a stable patch identity, with the full binary diff when applicable).
Review evidence may be reused only when the rebase completed without
conflicts, no PR-specific change was added, and that comparison is identical.
The current pull request head still needs fresh required CI; prior check-run
results must not be reused.

For a same-owner pull request, GitHub may record that review with state
`COMMENTED` rather than `APPROVED`. That state is valid evidence when the
record explicitly contains the independent `APPROVE` verdict and the required
reviewed head SHA, base SHA, and PR-specific diff evidence. A formal GitHub
`APPROVED` state is not required; a generic comment without that evidence is
insufficient.

## Required CI

Evaluate required checks for the current pull request head only. Never reuse a
result from an older head. Interpret check-run state as follows:

For one unchanged head SHA, wait for required CI once and reuse that completed
result for the remainder of the session. Re-fetch only when the head changes,
the previously observed run was incomplete, or GitHub reports an ambiguous
state. Do not repeatedly poll a completed successful head.

| Observed state | Gate state |
| --- | --- |
| No check-run exists yet | `PENDING_NOT_REGISTERED` |
| `queued` or `in_progress` | `PENDING` |
| Every required check is successful | `PASS` |
| Any required check is `failure`, `timed_out`, or `cancelled` | `FAIL` |

`PENDING_NOT_REGISTERED` and `PENDING` require a bounded,
completion-aware wait and refetch. They are not failures, but the gate must
not pass until the current head's required checks succeed. A failed,
cancelled, or timed-out required check stops the merge.

The final merge decision therefore requires both a passing independent review
whose evidence is valid for the current change set and passing required CI for
the current pull request head, while GitHub's repository protections remain in
force.
