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
| `promoted` | Elevated to AGENTS.md |
| `promoted_to_skill` | Extracted as a reusable skill |

Entry format: see the self-improvement skill's "Error Entry" section. IDs use `ERR-YYYYMMDD-XXX`.

---

## [ERR-20260811-002] gh-api-sandbox-network

**Logged**: 2026-08-11T16:30:00+09:00
**Priority**: medium
**Status**: promoted
**Area**: infra

### Summary
Sandbox内のGitHub CLI API接続が失敗した場合、権限付き再試行で成功する。

### Error
```text
error connecting to api.github.com
check your internet connection or https://githubstatus.com
```

### Context
- GitHub Issue作成時に `gh issue create` がsandbox接続失敗。
- 同じ操作を `sandbox_permissions: require_escalated` で再実行し成功。

### Suggested Fix
GitHub CLI API接続エラー検出後、同じ操作を権限付きで再試行する。

### Metadata
- Reproducible: yes
- Related Files: AGENTS.md
- See Also: ERR-20260811-001

### Resolution
- **Resolved**: 2026-08-11T16:30:00+09:00
- **Promoted**: AGENTS.md
- **Notes**: GitHub CLI接続失敗時の権限付き再試行ルールを永続化。

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

## [ERR-20260811-001] gh-comment-shell-quoting

**Logged**: 2026-08-11T00:00:00+09:00
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary
gh issue comment の本文をJSON.stringifyしたままシェルへ渡し、バッククォートがコマンド置換された。

### Error
```text
zsh: command not found: HEAL_POTION_THRESHOLD
zsh: permission denied: src/rules/recovery_rules.js
```

### Context
- Issue #489 の検証結果本文にMarkdownバッククォートを含め、`gh issue comment 489 --body ${JSON.stringify(body)}` を実行した。
- シェルのダブルクォート内でもバッククォートが解釈され、本文のコード表記とハッシュが欠落した。

### Suggested Fix
外部サービスへ複数行本文を送る際は、一時本文ファイルを使うか、シェル単一引用符用に安全にエスケープする。本文中のバッククォートや `$()` を未検証のままコマンド文字列へ埋め込まない。

### Metadata
- Reproducible: yes
- Related Files: .agents/AGENTS.md, scratch/results/issue-489-heal-flee-threshold.md

### Resolution
- **Resolved**: 2026-08-11T00:00:00+09:00
- **Notes**: 破損コメントを残したまま訂正版を追記し、Issue本文を完全な結果へ復旧した。

---
