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
2. The evidence records the reviewed commit/head SHA.
3. The reviewed SHA equals the current pull request head, and no push occurred
   after that review. Otherwise, obtain a new review for the current head.
4. There are zero unresolved actionable P0-P2 findings.

For a same-owner pull request, GitHub may record that review with state
`COMMENTED` rather than `APPROVED`. That state is valid evidence when the
record explicitly contains the independent `APPROVE` verdict and reviewed
head SHA. A formal GitHub `APPROVED` state is not required; a generic comment
without that evidence is insufficient.

## Required CI

Evaluate required checks for the current pull request head only. Never reuse a
result from an older head. Interpret check-run state as follows:

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
for the current head and passing required CI, while GitHub's repository
protections remain in force.
