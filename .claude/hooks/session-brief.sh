#!/usr/bin/env bash
# SessionStart hook.
# 1. 毎回プローブしがちな環境事実を先に出す。
# 2. ブランチ名から Issue 番号を割り出し、前セッションが残した handoff
#    コメント (<!-- handoff --> マーカー付き) を自動で文脈へ流し込む。
# 人手での引き継ぎを不要にするのが目的。
set -u

cat >/dev/null

ensure_worktree_node_modules() {
  project_dir=${CLAUDE_PROJECT_DIR:-$(pwd -P)}
  [ -f "$project_dir/.git" ] || return 0

  common_dir=$(cd "$project_dir" && git rev-parse --git-common-dir 2>/dev/null) || return 0
  case "$common_dir" in
    /*) ;;
    *) common_dir="$project_dir/$common_dir" ;;
  esac
  main_root=$(cd "$common_dir/.." 2>/dev/null && pwd -P) || return 0

  target="$project_dir/node_modules"
  source="$main_root/node_modules"
  [ -e "$target" ] || {
    if [ -L "$target" ]; then
      rm "$target"
    fi

    if [ -d "$source" ]; then
      ln -s "$source" "$target" || printf -- '- node_modules symlink failed: %s\n' "$target" >&2
      return 0
    fi

    [ -f "$project_dir/package-lock.json" ] || return 0
    printf -- '- node_modules parent absent; running npm ci\n'
    (cd "$project_dir" && npm ci) || printf -- '- node_modules npm ci failed\n' >&2
  }
}

ensure_worktree_node_modules

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')

printf '## セッション初期情報\n'
printf -- '- 環境: timeout/gtimeout は未インストール（長時間処理は background 実行）。rg / gh / jq / node は利用可。\n'
printf -- '- 原則 1 Issue = 1 セッション。40 ツール呼び出しごとに要約し、区切る時は `/handoff` で Issue へ引き継ぐ。\n'
printf -- '- branch: %s\n' "${branch:-unknown}"

issue=$(printf '%s' "$branch" | sed -nE 's#^[a-z]+/(issue-)?([0-9]+)-.*#\2#p')
[ -n "$issue" ] || issue=$(printf '%s' "$branch" | sed -nE 's#.*issue-([0-9]+).*#\1#p')
[ -n "$issue" ] || exit 0
command -v gh >/dev/null 2>&1 || exit 0

meta=$(gh issue view "$issue" --json state,title --template '{{.state}} / {{.title}}' 2>/dev/null) || exit 0
[ -n "$meta" ] || exit 0
printf -- '- Issue #%s: %s\n' "$issue" "$meta"

handoff=$(gh issue view "$issue" --json comments \
  --jq '[.comments[] | select(.body | test("<!-- handoff -->"))] | last | .body' 2>/dev/null)
if [ -n "$handoff" ] && [ "$handoff" != "null" ]; then
  printf '\n### 前セッションからの引き継ぎ (Issue #%s)\n\n' "$issue"
  printf '%s' "$handoff" | head -c 6000
  printf '\n'
else
  printf -- '- handoff コメント無し。必要なら `gh issue view %s --comments` で確認。\n' "$issue"
fi
