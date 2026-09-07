# Codex environment workflow

This document contains the repository's detailed workflow for Codex-managed
worktrees, Git base provenance, independent review, subagents, and sandbox
boundaries. `AGENTS.md` contains only the durable rules that apply at a glance.

## Fix the intended base before editing

At the start of an Issue, record the worktree start commit and the intended
base. For a normal `main`-based change, compare the local remote-tracking ref
with the remote before assigning `BASE_SHA`:

```bash
START_SHA=$(git rev-parse HEAD)
REMOTE_MAIN_SHA=$(git ls-remote origin refs/heads/main | cut -f1)
ORIGIN_MAIN_SHA=$(git rev-parse origin/main)
```

Record `START_SHA`, both observed main SHAs, their sources, and whether
`ORIGIN_MAIN_SHA == REMOTE_MAIN_SHA`. A locally readable `origin/main` is not
proof of freshness. For a normal `main`-based change, do not assign a stale
`ORIGIN_MAIN_SHA` to `BASE_SHA` or begin implementation against it. If the SHAs
differ, refresh/fetch the ref through the permitted path, recompute the remote
and local SHAs, and assign `BASE_SHA` only after they match. If refresh or
freshness verification is not permitted, record that limitation and do not
begin the main-based implementation until the intended current base can be
established.

An Issue may intentionally use an unmerged PR, parent Issue, or another commit
as its base. In that case, set `BASE_SHA` to the chosen commit, record its
source and reason, verify the intended ancestry or dependency, and do not
silently replace it with `origin/main`.

The base is fixed for the implementation and review evidence. If the base
moves, re-evaluate the PR-specific diff and the merge-gate evidence before
reusing any result.

## Managed worktrees and branches

Codex-managed worktrees normally start at the selected starting commit in a
detached HEAD. Detached HEAD is a supported working state, not a failure.
Do not switch branches, rebase, or edit shared worktree metadata merely to
make a managed worktree look like a normal checkout.

Stay detached while the task only needs inspection or local exploration. When
the task needs a commit, push, or pull request, create a branch through the
Codex branch-creation flow. If the work should continue in the ordinary local
checkout, use Handoff so Codex performs the checkout transition safely. Do not
manually rebuild managed worktree topology during ordinary Issue work.

## Immutable review evidence

Development review may inspect a branch or working tree. Merge-gate review is
different: fix both revisions before starting it and review the immutable
commit objects they identify.

```bash
BASE_SHA=<fixed-base-sha>
HEAD_SHA=<fixed-head-sha>
git diff --name-status "$BASE_SHA...$HEAD_SHA"
git diff --binary "$BASE_SHA...$HEAD_SHA"
git show "$HEAD_SHA:path/to/file"
```

Record `BASE_SHA`, `HEAD_SHA`, the changed-file set, and a stable patch identity
(including the full binary diff when applicable). The reviewer's checkout
`HEAD` does not need to equal `HEAD_SHA`; the reviewer must be able to resolve
and inspect the requested commit objects.

Any code, test, configuration, conflict-resolution, or PR-specific diff
change after review requires a new review. A clean base update may reuse
evidence only when the before/after PR-specific diff is demonstrably identical,
as defined in `.agents/merge-gate.md`; a changed head must still receive fresh
required CI.

## Subagents and waiting

Use subagents only for bounded, independent work such as read-heavy
exploration, test analysis, log triage, or independent review. Keep the main
agent responsible for requirements, decisions, edits, and final evidence.
Start independent work in parallel, continue useful local verification, then
collect summaries. Do not run a short `wait -> timeout -> wait` loop or treat an
unchanged status poll as progress. Use one bounded, completion-aware wait and
back off when work remains; a timeout is not a failure by itself.

## Sandbox-first execution

Prefer the normal `workspace-write` sandbox with approval requested only when
an operation must cross the workspace or network boundary. Keep edits,
commands, and temporary files inside the permitted workspace whenever possible.
Use a narrow, explicit approval for an unavoidable boundary operation; do not
disable sandboxing or request full access to work around a detached worktree,
shared Git metadata, or a routine local command.

Known environment constraints are handled as constraints: do not repeatedly
attempt blocked writes to shared `.git/worktrees` metadata or blocked process
inspection commands. If a required Git, network, or GitHub operation crosses
the boundary, report the exact impact and use the approved escalation path.

## Official references

- [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Code review](https://learn.chatgpt.com/docs/code-review)
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Sandbox](https://learn.chatgpt.com/docs/sandboxing)
- [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
