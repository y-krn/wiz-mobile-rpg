---
name: verification-loop
description: Bound repeated lint, build, unit, browser, or CI verification when implementation needs more than one check. Excludes domain-specific QA selection and unresolved-bug diagnosis.
---

# Run bounded verification

Use this skill when verification is becoming repetitive, a CI result needs
polling, or a failure may be environmental rather than a product defect.
Apply `AGENTS.md` first and use `qa-regression.md` to select the checks.

## Before running checks

- Define the changed scope, pass condition, smallest sufficient command, retry
  budget, and elapsed-time limit.
- Confirm the current worktree, repository root, `HEAD`, package scripts, and
  required local tools once. If the repository, dependency, browser, or base
  preflight fails, stop and resolve that failure before repeating the check.
- Prefer targeted checks while editing. Run the full local suite once after the
  change is stable and before final handoff.

## Control repetition

- Repeat an identical command only when the input changed, a transient cause is
  established, or the retry budget still permits it.
- Poll CI with an explicit maximum attempt count and elapsed-time limit. A
  pending check is not a failure. When the limit is reached, record the current
  status and stop.
- Inspect `git diff --stat` or `git diff --name-only` before opening a broad
  diff. Read only changed or decision-relevant sections.
- Summarize large outputs and retain the command, revision, result, and relevant
  failure excerpt as evidence.

## Classify failures

- Product or test failure: inspect the failing assertion and fix or report the
  cause before rerunning.
- Environment failure: repair through the permitted environment path; do not
  mask it with repeated product checks.
- Network or CI pending: use the bounded polling policy and report an
  unresolved external condition separately from a code failure.
- Wrong worktree, repository, base, or `HEAD`: stop and re-run preflight; do
  not continue implementation on an unverified target.

## Report evidence

For each check, record the command, revision, result, retry count, and any
omission. Do not claim a full pass when the command was skipped, interrupted,
or only partially observed.
