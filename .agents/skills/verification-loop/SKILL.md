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
- From the repository root, confirm the current worktree, branch, `HEAD`,
  package scripts, and required local tools once. Prefer `npm run check:repo`
  for repository identity and root validation; it does not require a clean
  worktree or a particular branch. For browser checks, run the
  existing `npm run test:browser:preflight` once per unchanged environment;
  this reuses the repository dependency and Playwright preflight scripts. If
  the repository, dependency, browser, or base preflight fails, stop and
  resolve that failure before repeating the check.
- Prefer targeted checks while editing. Run the full local suite once after the
  change is stable and before final handoff.

## Control repetition

- Repeat an identical command only when the input changed, a transient cause is
  established, or the retry budget still permits it.
- Prefer `npm run verify:once -- --name <stable-name> -- <command>` for repeated
  local checks. It records a fingerprint of `HEAD`, changed files, command, and
  relevant environment; it suppresses only a previously successful identical
  target. Use `--force` when a final gate must run again.
- Do not invoke a browser test before a successful browser preflight. Do not
  rerun preflight before every test unless the dependency tree, port, browser,
  or worktree state changed.
- Poll CI with an explicit maximum attempt count and elapsed-time limit. A
  pending check is not a failure. When the limit is reached, record the current
  status and stop.
- The repository helper defaults to 36 attempts, 10 seconds between checks, and
  a 360-second cap. Keep the bound above the observed full-unit duration unless
  the check has a documented shorter budget.
- For GitHub pull requests, prefer `npm run check:ci -- <PR or URL>`; it uses
  the repository's bounded polling helper and returns distinct outcomes for
  pass, failed/cancelled, pending timeout, and query error.
- Inspect `git diff --stat` or `git diff --name-only` before opening a broad
  diff. Read only changed or decision-relevant sections.
- For potentially large inspection, prefer `npm run inspect:bounded -- diff|search|log|file`
  with explicit limits. It excludes generated directories for search, never
  enables binary diff output, and caps displayed bytes and lines.
- Pass search patterns and paths as wrapper arguments, never by constructing a
  shell pipeline or interpolated command string. Search is literal by default;
  opt into regular expressions with `--regex` only when needed.
- Summarize large outputs and retain the command, revision, result, and relevant
  failure excerpt as evidence.

## Classify failures

- Product or test failure: inspect the failing assertion and fix or report the
  cause before rerunning.
- Environment failure: repair through the permitted environment path; do not
  mask it with repeated product checks.
- Playwright preflight `EPERM` or `EACCES` on a port: retry once with a
  task-owned `PLAYWRIGHT_PORT` through the permitted environment path. If the
  retry still fails, report an environment limitation and do not rerun the
  browser suite.
- Network or CI pending: use the bounded polling policy and report an
  unresolved external condition separately from a code failure.
- Wrong worktree, repository, base, or `HEAD`: stop and re-run preflight; do
  not continue implementation on an unverified target.

## Report evidence

For each check, record the command, revision, result, retry count, and any
omission. Do not claim a full pass when the command was skipped, interrupted,
or only partially observed.
