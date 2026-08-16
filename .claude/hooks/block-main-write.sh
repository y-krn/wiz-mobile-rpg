#!/usr/bin/env bash

command -v jq >/dev/null || { printf '%s\n' 'block-main-write.sh: jq not found' >&2; exit 2; }
input=$(jq -c .) || exit 2
tool_name=$(jq -r '.tool_name // empty' <<<"$input") || exit 2
command=$(jq -r '.tool_input.command // empty' <<<"$input") || exit 2
file_path=$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<<"$input") || exit 2

project_dir=${CLAUDE_PROJECT_DIR:-}
if [ -z "$project_dir" ]; then
  project_dir=$(pwd -P)
fi

if [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ] || \
   { [ -n "$file_path" ] && [ -z "$command" ]; }; then
  if [ -z "$file_path" ]; then
    printf '%s\n' 'Blocked: cannot determine the Edit/Write target. Use a feature worktree before editing files.' >&2
    exit 2
  fi

  normalise_path() {
    local input=$1
    local parent name

    case "$input" in
      /*) ;;
      *) input="$project_dir/$input" ;;
    esac
    parent=${input%/*}
    name=${input##*/}
    [ -n "$parent" ] || parent=/
    [ -d "$parent" ] || return 1
    parent=$(cd "$parent" 2>/dev/null && pwd -P) || return 1
    printf '%s/%s\n' "$parent" "$name"
  }

  is_under() {
    case "$1" in
      "$2"|"$2"/*) return 0 ;;
      *) return 1 ;;
    esac
  }

  target_path=$(normalise_path "$file_path") || {
    printf 'Blocked: cannot resolve the Edit/Write target: %s. Use a feature worktree before editing files.\n' "$file_path" >&2
    exit 2
  }

  main_root=$(git -C "$project_dir" worktree list --porcelain 2>/dev/null |
    awk '
      /^worktree / { path = substr($0, 10) }
      $0 == "branch refs/heads/main" { print path; exit }
    ')
  if [ -z "$main_root" ]; then
    current_branch=$(git -C "$project_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
    [ "$current_branch" = "main" ] || exit 0
    main_root=$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null || true)
  fi

  if [ -n "$main_root" ]; then
    main_root=$(cd "$main_root" 2>/dev/null && pwd -P) || exit 0
    if is_under "$target_path" "/private/tmp" || \
       is_under "$target_path" "$main_root/.claude/worktrees" || \
       is_under "$target_path" "$main_root/.codex-log"; then
      exit 0
    fi

    if is_under "$target_path" "$main_root"; then
      printf 'Blocked: refusing to edit/write in the main worktree (%s). Create or use a feature worktree first. Allowed operational paths: %s/.claude/worktrees/, %s/.codex-log/, and /private/tmp/.\n' \
        "$target_path" "$main_root" "$main_root" >&2
      exit 2
    fi
  fi

  exit 0
fi

[ "$tool_name" = "Bash" ] || exit 0
[ -n "$command" ] || exit 0

branch=$(git -C "$project_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
[ "$branch" = "main" ] || exit 0

git_write_pattern='(^|[[:space:];|&])git([[:space:]]+(-[cC][[:space:]]+[^[:space:];|&]+|-[^-[:space:];|&][^[:space:];|&]*|--[^[:space:];|&]+))*[[:space:]]+(commit|push)([[:space:];|&]|$)'
command_for_match=${command//$'\n'/ }
command_for_match=${command_for_match//$'\r'/ }

if printf '%s\n' "$command_for_match" | grep -Eq "$git_write_pattern"; then
  printf '%s\n' 'Blocked: git commit and git push are not allowed on main. Use a feature branch and open a pull request.' >&2
  exit 2
fi

exit 0
