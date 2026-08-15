# Project Agent Instructions

AGENTS.md is the canonical instruction file for this repository. Tool-specific
files may point here, but should not duplicate these rules.

## Context and Search Order

- Before broad repository searches, read `.agents/file-map.md`.
- Use `.agents/file-map.md` to choose the smallest relevant source, test, and
  review files for the requested change.
- Start from directly relevant files, direct imports, touched files, and listed
  verification targets.
- Do not read `dist`, `node_modules`, `test-results`, or `*.log` unless the task
  requires it. When logs are needed, inspect only the tail or error area.
- Review checklists live in `.agents/*.md`; apply them by reading the matching
  file. They are review-only unless the user explicitly changes that mode.

## Cross-Tool Tickets

Work is tracked as **GitHub Issues** on `y-krn/wiz-mobile-rpg`
(https://github.com/y-krn/wiz-mobile-rpg/issues), shared across Claude, Codex,
and Antigravity. Use the `gh` CLI.

**Issue and pull-request operations need no prior confirmation.** Creating,
commenting on, labeling, assigning, editing, closing, and reopening issues, and
creating, updating, commenting on, reviewing, and merging pull requests on this
repository are pre-approved — just do them and report the result. Committing and
pushing to a feature branch for that PR is likewise pre-approved. Do not commit
directly to `main`.
Repository policy and remote branch protection prohibit direct commits to
`main`. The local PreToolUse hook blocks `git commit` and `git push` commands
on `main`, but it does not block file edits; the main-worktree checks below
remain required.

- Before starting or resuming work, scan open issues:
  `gh issue list --state open`. Read the target issue with
  `gh issue view <n>`.
- When you pick up an issue, assign yourself and leave a comment noting you
  started (`gh issue comment <n> --body "..."`).
- **Fixes go on a branch + PR, never straight to `main`.** Immediately before
  creating a branch, starting or resuming work, or running a baseline
  measurement, fetch `origin/main`. Always create branches from the freshly
  fetched `origin/main`. If `origin/main` advanced after branch creation, bring
  the working branch up to date before implementation or measurement; never
  rely on a stale local `main` or previously fetched `origin/main`. For each
  issue, use `fix/<n>-<slug>`, `feat/<n>-<slug>`, or
  `measure/<n>-<slug>` (e.g. `fix/33-mana-potion-reprice`), implement or
  measure there, then open a PR that links the issue in its body with
  `Closes #<n>` (`gh pr create`) when the work changes the repository.
  Merging the PR closes the issue automatically.
- One concern per issue. Create with `gh issue create --template task.md`
  (`.github/ISSUE_TEMPLATE/task.md`); fill in Goal / Notes / Verification and
  the coordination checklist.
- Keep coordination notes in the issue thread (append-only comments), not in
  code, so parallel tools don't clobber each other.

The former local `tickets/` board was migrated to Issues and removed; do not
recreate it.

## Worktree and main hygiene

These are repository-wide rules for every agent and human contributor.

- Do not edit the main worktree. Before creating or resuming work, fetch
  `origin/main`, then create a worktree from it:
  `git worktree add -b <type>/<issue-number>-<short-description> <path> origin/main`.
- Never work on a detached `HEAD`. Branch names use
  `fix/<issue-number>-<short-description>` for fixes or balance changes,
  `feat/<issue-number>-<short-description>` for features, and
  `measure/<issue-number>-<short-description>` for measurement-only work.
- A `.claude/worktrees/issue-<number>-<short-description>` path is recommended,
  not required. `git worktree list` is the only inventory; path alone never
  determines whether a worktree is safe to remove.
- Keep local `main` identical to `origin/main` and clean:
  `git rev-parse main` must equal `git rev-parse origin/main`, and
  `git status --porcelain` in the main worktree must be empty. Check both
  before starting or resuming work. If either check fails, synchronize or
  clean the main worktree before continuing. SessionStart warns about a dirty
  or unsynchronized `main`, but the warning does not replace these checks.
- When a branch is merged, remove its worktree. Before any removal, enumerate
  all worktrees from `git worktree list`, record each branch as merged,
  unmerged, or remote-deleted, and check branch state with
  `git merge-base --is-ancestor <branch> origin/main`. A true result makes a
  branch a removal candidate; an unmerged branch stays. For detached worktrees,
  apply the same ancestor check to `HEAD`; do not remove it when the commit is
  not contained in `origin/main`.
- Check candidates with `lsof` before removal. Keep any worktree in use, show
  the remaining candidates, and get user confirmation before deleting them.
  After approval, remove each with `git worktree remove <path>` and run
  `git worktree prune`.
- `node_modules` may be a symlink to the main worktree. Worktree cleanup must
  not follow that symlink or remove the shared directory; worktree creation
  does not require `npm ci` when the SessionStart link exists.

## Large Output and Log Handling

Avoid loading large command output, logs, or files into context in full. Filter
first, then read only the relevant part.

- Filter at the source. Pipe test, build, and log commands through `grep`,
  `head`, or `tail` so only failures or the relevant region are returned, e.g.
  `npm test 2>&1 | grep -E 'FAIL|Error'` or `git log --oneline -20`.
- Locate before reading. For large files, run `grep -n` (or `grep -rn` across a
  directory) to find the line first, then read only that region with a ranged
  read (offset/limit, `head`, `tail`). Do not open a whole large file to find
  one function.
- Map structure cheaply. To learn a file's shape, `grep -nE` its definition
  lines (e.g. `^(export |function |const |class )`) instead of reading the file
  end to end, then read only the parts you need.
- Honor line references. When the user gives a `file:line` pointer, read that
  region directly and skip the search step.
- Read files in ranges. Prefer partial reads (offset/limit, `head`, `tail`,
  targeted `grep -n`) over reading whole large files.
- Default to doing the work yourself. Delegate to a sub-agent only when the user
  asks for it, or when the task is both large and independent — a search that
  fans out across many files or directories and whose volume read greatly
  exceeds the answer returned. A task that is merely multi-part or thorough is
  not a reason to delegate.
- Do not delegate narrow, context-dependent lookups (one function, a few known
  files); a direct `grep`/ranged read is cheaper than a cold-start sub-agent.
- When you do delegate, take back the conclusion, not the raw file dumps.
- If the active tool's own instructions restrict sub-agent use further, follow
  the stricter rule.
- For large command output or logs, prefer the context-mode skill
  (`ctx_execute` / `ctx_execute_file`) so full stdout is summarized outside the
  main context instead of being loaded in full. It is installed cross-agent
  under `~/.agents/skills/context-mode`.
## Tool and Execution Policy

- Use applicable Agent Skills when the task clearly matches one.
- Resolve Agent Skill files only from the skill metadata advertised to the
  active tool. Codex, Claude, and Antigravity may expose the same skill from
  different roots, so expand and read the path shown by that tool's current
  registry, advertised path, or Skill roots before acting. Do not guess or
  probe hardcoded locations such as `~/.codex/skills/<name>/SKILL.md` or
  `~/.agents/skills/<name>/SKILL.md`. If the advertised path is missing, report
  that specific missing path and continue with the best fallback instead of
  trying unrelated paths.
- Do not surface resolved Agent Skill absolute paths in normal user-facing
  progress or summaries. Refer to the skill name, advertised alias, or registry
  label instead. Show the absolute path only when the user asks for it, when
  reporting a missing advertised path, or when it is needed to debug tool
  configuration.
- Safe commands may be run without extra confirmation: reads, searches, diffs,
  builds, tests, dev server startup, and worktree-local `npm ci` (reproducibly
  recreates ignored `node_modules` from `package-lock.json`).
- Ask first before destructive or high-risk operations: `rm`, `git reset`,
  `git clean`, `git checkout --`, broad `mv`, external scripts, deployment, and
  production operations.
- GitHub CLI API: when a `gh` operation fails with sandbox/network connection
  errors (for example `error connecting to api.github.com`), immediately retry
  the same operation with `sandbox_permissions: require_escalated` and a concise
  justification. GitHub Issue/PR operations are pre-approved by this repository
  policy.
- Prefer explicit allowlists, sandboxing, and tool permissions for enforcement.
  Treat this file as behavioral guidance, not a security boundary.
- Make file edits with clear diffs.

## Engineering Policy

- Match existing code structure, naming, and style.
- Keep changes limited to the user's requested behavior.
- Prefer the simplest implementation that satisfies the goal.
- Avoid one-off abstractions, speculative configuration, and unrelated cleanup.
- Remove imports, variables, and functions made unused by your own changes.
- Do not remove unrelated dead code unless asked.
- When adding a `gameState` whose rendering/controls depend on state NOT in the
  save payload (e.g. `menuContext`, `activeTrapState`), never persist that
  transient state directly. Collapse it to a stable base screen before saving in
  `save_payload.js` `resolvePersistedGameState` (mirror `closeSubmenu`); otherwise
  resume renders a broken/wrong screen. Add a save→load roundtrip test.

## Think Before Coding

For implementation work, state the working assumptions and success criteria
before editing. Ask before proceeding when success criteria or requirements
are unclear. For multi-step tasks, use this plan format:

1. [work item] -> verify: [verification method]
2. [work item] -> verify: [verification method]
3. [work item] -> verify: [verification method]

If multiple interpretations are plausible, ask instead of choosing silently.

## Verification

- After implementation, run the narrowest meaningful checks.
- After source code changes, always run `npm run lint` and confirm the result.
- For UI-affecting changes, run `npm run build` and `npm run test:browser` when
  feasible.
- For logic or state changes, run `npm run test:unit` or the matching focused
  test when feasible.
- When writing or touching `scratch/test_*.js`, guard against false-green tests:
  aggregate assertion results and `process.exit(1)` on any failure (never rely on
  bare `console.assert`, and never print an unconditional `[PASS]`). Ensure the
  function under test actually runs its side effects — many take an early guard
  return (e.g. `triggerRunResult` returns when `state.currentRun` is unset), so
  build the minimal state first. Sanity-check a new test by temporarily inverting
  an expectation and confirming it fails with a non-zero exit.
- Report any skipped verification and the reason.
- For one-off Playwright/browser checks, prefer the Playwright test runner
  (`npm run test:browser` or `npx playwright test path/to/spec`) over raw
  `node -e` scripts that launch Chromium directly. In the Codex/macOS sandbox,
  direct Chromium launches can fail with MachPort permission errors and trigger
  unnecessary approval retries. If a one-off flow needs browser automation,
  create a temporary or focused Playwright spec and run it through the test
  runner.

## Design Canon Gate

Changes to game rules, balance, affixes, or the material economy must update
the matching `.agents/game-design*.md` in the same pull request, or state in
the PR why the canon is unaffected. Prefer referencing the source constant
over copying its value into the document.

## UI Change Gate

This gate applies to UI modules (screen rendering, menu navigation, overlays,
styles, and browser tests). Determine target files using the UI-related rows and
CSS Style Routing table in `.agents/file-map.md`.

Mobile browser one-handed use is a hard requirement for UI work. Apply
`.agents/mobile-ui-ux.md` while implementing, not only at review time.

Before editing UI:

1. Use `.agents/file-map.md` to identify the smallest file set.
2. Read `.agents/mobile-ui-ux.md` when the interaction, layout, or tap flow is
   materially affected.
3. Read `.agents/qa-regression.md` when browser or E2E regression risk is
   material.
4. If UI also changes game rules, balance, or content text, read the matching
   `.agents/*.md` review definition.

After editing UI, run the checks in `Verification`. Additionally, when feasible,
verify primary flows at 360x800, 390x844, and 430x932.

## Review Checklists

The `.agents/*.md` files are review checklists, not sub-agents registered with
the Agent tool. Apply them by reading the matching file and reviewing against
it; use them only when the added scrutiny is worth the cost.

- `.agents/qa-regression.md`: tests, reproduction, regression risk, release
  checks.
- `.agents/mobile-ui-ux.md`: UI, CSS, transitions, tap operation, mobile
  display.
- `.agents/game-logic.md`: combat, exploration, state, map generation,
  equipment, spells, run quests, and other game rules.
- `.agents/balance-simulation.md`: enemies, rewards, drops, growth, economy,
  difficulty, and progression speed.
- `.agents/content-design.md`: items, enemies, spells, run quests, descriptions,
  and display text.

Each file owns its own scope, checklist, and required verification; do not
restate them here. Apply a checklist for explicit review requests, broad
multi-file behavior changes, high-risk UI/mobile changes, or game-balance
changes. Skip them for small text, comment, local bug, test expectation, or
import/export-only changes that are verified directly.

When reporting checklist use, include:

1. Checklists applied.
2. Adopted findings.
3. Rejected findings and why.
4. Verification performed.

## Context Hygiene

- `.learnings/` is the self-improvement skill's own log, not project canon.
  Durable rules belong in this file or `.agents/*.md`; do not load it by default.
- Keep always-loaded instructions minimal and durable.
- Design specs and implementation plans are working artifacts, not records.
  When the work ships, distill what stays true into `.agents/*.md` and delete
  the spec or plan file. Git history keeps the rest.
- Raw simulation dumps under `scratch/results/` (`*.raw.txt`, `*.jsonl`,
  `*.txt`) are not committed. Commit only the summary `.md`, and keep it
  self-contained: cite the reproducing command, not a raw-dump path. When an
  Issue closes, `git rm` its `issue-<number>-*` raw dumps.
- Put task-specific, path-specific, or reviewer-specific detail in `.agents/*`
  instead of expanding this file.
- Avoid conflicting rules, repeated lint/test instructions, and tool-specific
  details that do not apply across agents.

## 1 セッションの区切り方

- 原則 1 Issue = 1 セッション。Issue を跨ぐ、約 100 ターン続く、測定・実装・レビューの性質が変わる時点で区切って畳む。
- 「調査 → 実装 → テスト → PR」を 1 セッションで通さない。調査で判明した方針は Issue へ書き、実装は新セッションで始める。
- 畳む前、Issue コメントへ「原因 / 変更対象 / 検証 / 未解決」を残す。次セッションはコメントを起点にし、会話履歴・ログを持ち越さない。
- 引き継ぎコメントは 1 行目に `<!-- handoff -->` を置く。次セッションの起動時フックがこのマーカーを探して自動で読み込むため、人手での再説明は不要。Claude は `/handoff` で生成する。

## 実行効率

無駄なツール呼び出しがコンテキストとトークンの支配項。次を守る。

- 定期的に「現状 / 残作業 / 次の一手」を要約する。目安は対話セッションで 40 ツール呼び出しごと、Codex の 1 run では 8〜12 呼び出しごと。要約できないほど広がっていたら区切る。
- 読み取り専用の確認は並列でまとめて実行する。
- 終了前に必ず「変更したファイル / 実行したテスト / 失敗 / 残作業」を報告する。
- 同じコマンドを目的なく再実行しない。`git fetch`・`git checkout`・ビルドの繰り返しは既出結果を使う。
- 変更していないファイルを読み直さない。必要なら既に読んだ範囲を参照する。
- テストは変更をまとめてから実行する。作業中は対象テストのみ、完了時に `npm run lint` と必要な `test:browser` / `build` を 1 回。
- 存在しないコマンドやオプションは 1 回で停止し、代替を確認する。`timeout` / `gtimeout` はこの環境に無い（フックが実行を拒否する）。長時間処理はバックグラウンド実行にする。
- 同じエラーに対する同一操作の再試行は最大 1 回。2 回目で方法を変えるか、原因を調べる。
- 並列調査は最大 3 件まで。各サブエージェントには結論だけ返させ、生ログを本セッションへ流し込まない。

### Codex run

- `scripts/codex-run.sh` から起動し、第 1 引数に label、プロンプトは stdin で渡す。label は目的 + Issue 番号（`investigate-271` / `implement-271` / `verify-271`）。
- 1 run 1 目的。調査 → 実装 → 検証 を 1 run に通さない。前段の結論は `.codex-log/*.md` か Issue コメントから引き継ぐ。
- ラッパーが `--json` の JSONL と最終メッセージを `.codex-log/` に残し、終了時にターン数・トークン・コマンド実行数を要約する。呼び出し側は要約と `.md` だけ読み、JSONL は `jq` で絞ってから見る。
- 事後分析用にログを残すため `--ephemeral` は付けない。

## 委譲プロンプトの完了報告

- scheduled task 実行セッションから委譲した場合、`notifyOnCompletion` による通知は、自セッション終了と同時に購読対象が消えるため原理的に届かない。`notifyOnCompletion: true` ではタスク作成自体がエラーで失敗するため `false` を渡す。通常の対話セッションから委譲する場合は既定の `true` のままとする。
- 委譲プロンプトの末尾に必ず「完了時に `gh issue comment <n>` で完了報告を投稿せよ」と含める。Issue コメントが依頼元へ確実に届く正規経路であり、`notifyOnCompletion` は補助とする。
- 完了報告は次の形式とする。
  - 対象 Issue 番号
  - 成果物（PR URL またはブランチ名。無ければその旨）
  - 実行した検証コマンドと結果
  - 実行しなかった検証とその理由
  - 無人実行のため自分で判断した箇所
  - 残作業やオーナー判断が必要な点
  - 失敗・中断した場合の事実と停止位置
- 「未実行」「未確認」と書ける欄を用意し、埋めるための憶測を書かせない。

## バックグラウンド実行と `wait` の使い分け

- 30 秒未満と見込めるコマンドは前景で 1 ターン実行する。未知の処理はスモークで測るか背景実行。
- 分単位の処理だけ背景実行 + `wait` とし、背景時 `yield_time_ms` は上限で待つ。例: 本実行シミュレーション、`npm run test:browser`、`FULL_TEST=1`。
