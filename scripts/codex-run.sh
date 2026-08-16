#!/usr/bin/env bash
# Codex を 1 run 1 目的で回すラッパー。
#
#   scripts/codex-run.sh <label> --branch <type>/<issue-number>-<slug> \
#     [codex-args...] < prompt.txt
#
# label は目的を表す 1 語 + Issue 番号にする（investigate-271 / implement-271 /
# verify-271）。1 つの run に調査・実装・検証を詰め込まない。
#
# やること:
#   - origin/main を fetch し、Codex 用 worktree を作成または再利用する
#   - Codex を worktree を cwd にして起動する
#   - プロンプトを stdin から渡す（`</dev/null` 不要、対話待ちで固まらない）
#   - 最終メッセージを .codex-log/<stamp>-<label>.md へ
#   - JSONL イベントを .codex-log/<stamp>-<label>.jsonl へ（--json）
#   - 終了時にターン数・トークン・ツール呼び出し数を要約し、肥大していたら警告
# 呼び出し側は要約と .md だけ読む。JSONL は本文を読まず jq で絞る。
set -uo pipefail

usage() {
  printf 'usage: scripts/codex-run.sh <label> --branch <type>/<issue-number>-<slug> [codex-args...] < prompt.txt\n' >&2
}

label=${1:-}
if [ -z "$label" ]; then
  usage
  exit 64
fi
shift

branch=
codex_args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf 'error: --branch requires a branch name\n' >&2
        usage
        exit 64
      fi
      branch=$2
      shift 2
      ;;
    --branch=*)
      branch=${1#--branch=}
      if [ -z "$branch" ]; then
        printf 'error: --branch requires a branch name\n' >&2
        usage
        exit 64
      fi
      shift
      ;;
    *)
      codex_args+=("$1")
      shift
      ;;
  esac
done

if [ -z "$branch" ]; then
  printf 'error: --branch is required; Codex must run in a feature worktree\n' >&2
  usage
  exit 64
fi

if [ "$branch" = "main" ]; then
  printf 'error: --branch main is not allowed; use a feature branch\n' >&2
  exit 64
fi

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  printf 'error: invalid branch name: %s\n' "$branch" >&2
  exit 64
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
repo_status=$?
if [ "$repo_status" -ne 0 ] || [ -z "$repo_root" ]; then
  printf 'error: scripts/codex-run.sh must run inside a git worktree\n' >&2
  exit 64
fi

git -C "$repo_root" fetch origin
fetch_status=$?
if [ "$fetch_status" -ne 0 ]; then
  printf 'error: git fetch origin failed\n' >&2
  exit "$fetch_status"
fi

origin_main_sha=$(git -C "$repo_root" rev-parse origin/main 2>/dev/null)
origin_main_status=$?
if [ "$origin_main_status" -ne 0 ] || [ -z "$origin_main_sha" ]; then
  printf 'error: cannot resolve origin/main\n' >&2
  exit 1
fi

branch_ref="refs/heads/$branch"
worktree_path=$(git -C "$repo_root" worktree list --porcelain 2>/dev/null |
  awk -v target="$branch_ref" '
    /^worktree / { path = substr($0, 10) }
    $0 == "branch " target { print path; exit }
  ')

if [ -n "$worktree_path" ]; then
  printf 'reusing worktree: %s (branch %s)\n' "$worktree_path" "$branch"
else
  branch_name=${branch##*/}
  worktree_path="$repo_root/.claude/worktrees/issue-$branch_name"

  if git -C "$repo_root" show-ref --verify --quiet "$branch_ref"; then
    printf 'error: branch %s exists without a registered worktree; inspect git worktree list before retrying\n' "$branch" >&2
    exit 1
  fi

  if [ -e "$worktree_path" ] || [ -L "$worktree_path" ]; then
    printf 'error: worktree path already exists but is not registered: %s\n' "$worktree_path" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$worktree_path")"
  mkdir_status=$?
  if [ "$mkdir_status" -ne 0 ]; then
    printf 'error: cannot create worktree parent: %s\n' "$(dirname "$worktree_path")" >&2
    exit "$mkdir_status"
  fi

  git -C "$repo_root" worktree add -b "$branch" "$worktree_path" origin/main
  add_status=$?
  if [ "$add_status" -ne 0 ]; then
    printf 'error: cannot create worktree for branch %s\n' "$branch" >&2
    exit "$add_status"
  fi
  printf 'created worktree: %s (branch %s)\n' "$worktree_path" "$branch"
fi

printf 'worktree: %s\n' "$worktree_path"
worktree_base_sha=$(git -C "$worktree_path" merge-base HEAD "$origin_main_sha" 2>/dev/null)
worktree_base_status=$?
if [ "$worktree_base_status" -ne 0 ] || [ -z "$worktree_base_sha" ]; then
  printf 'error: cannot resolve worktree base for %s\n' "$worktree_path" >&2
  exit 1
fi
printf 'origin-main  : %s\n' "$origin_main_sha"
printf 'worktree-base: %s\n' "$worktree_base_sha"
if [ "$worktree_base_sha" = "$origin_main_sha" ]; then
  printf 'base-status  : current origin/main\n'
elif git -C "$repo_root" merge-base --is-ancestor "$worktree_base_sha" "$origin_main_sha" >/dev/null 2>&1; then
  printf 'base-status  : behind origin/main\n'
else
  printf 'base-status  : diverged from origin/main\n'
fi

model_args=()
has_model=0
for arg in ${codex_args[@]+"${codex_args[@]}"}; do
  case "$arg" in
    -m|--model|--model=*) has_model=1 ;;
  esac
done
[ "$has_model" -eq 1 ] || model_args=(-m gpt-5.6-luna -c model_reasoning_effort=max)

dir=${CODEX_LOG_DIR:-.codex-log}
case "$dir" in
  /*) ;;
  *) dir="$PWD/$dir" ;;
esac
mkdir -p "$dir"
base="$dir/$(date +%Y%m%d-%H%M%S)-$label"

codex exec -C "$worktree_path" --json ${model_args[@]+"${model_args[@]}"} -o "$base.md" ${codex_args[@]+"${codex_args[@]}"} - \
  >"$base.jsonl" 2>"$base.stderr.log"
status=$?

printf 'result : %s.md\n' "$base"
printf 'events : %s.jsonl\n' "$base"
[ "$status" -eq 0 ] || printf 'exit   : %s (stderr: %s.stderr.log)\n' "$status" "$base"

command -v jq >/dev/null 2>&1 || exit "$status"

jq -rs '
  [ .[] | select(.type == "turn.completed") | .usage ] as $u
  | [ .[] | select(.type == "item.completed") | .item.type ] as $items
  | "turns  : \($u | length)",
    "tokens : in \(($u | map(.input_tokens) | add) // 0) / out \(($u | map(.output_tokens) | add) // 0) / max-in \(($u | map(.input_tokens) | max) // 0)",
    "items  : \($items | group_by(.) | map("\(.[0])=\(length)") | join(" "))",
    ( if (($u | map(.input_tokens) | max) // 0) > 100000
      then "WARN   : 入力 10 万トークン超のターンあり。この run に目的を詰め込みすぎ。次は分割する。"
      else empty end ),
    ( if ([ $items[] | select(. == "command_execution") ] | length) > 60
      then "WARN   : コマンド実行 60 回超。run を分割するか対象を絞る。"
      else empty end )
' "$base.jsonl"

exit "$status"
