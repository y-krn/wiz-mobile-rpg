# Errors

Command failures, API errors, and unexpected behavior captured during development.

**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed (add Resolution block) |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, AGENTS.md, or copilot-instructions.md |
| `promoted_to_skill` | Extracted as a reusable skill |

Entry format: see the self-improvement skill's "Error Entry" section. IDs use `ERR-YYYYMMDD-XXX`.

---

## [ERR-20260809-001] zsh-test-wrapper

**Logged**: 2026-08-09T00:00:00+09:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
zsh の予約変数 `status` を終了コード保存に使った検証ラッパーが即時終了した。

### Error
```text
zsh: read-only variable: status
```

### Context
- 必須テスト6本を並列実行するため、`command; status=$?; tail ...; exit $status` を使用した。
- zshでは `status` が読み取り専用のため、テスト本体の終了結果を取得する前にラッパーが失敗した。

### Suggested Fix
終了コード変数に `rc` など予約されていない名前を使う。

### Metadata
- Reproducible: yes
- Related Files: scratch/results/issue-404-affix-volume.md

### Resolution
- **Resolved**: 2026-08-09T00:00:00+09:00
- **Notes**: zsh予約語でない `rc` を使って必須テストを再実行し、全てpass。

---
