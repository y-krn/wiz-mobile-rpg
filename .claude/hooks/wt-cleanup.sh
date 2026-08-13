#!/usr/bin/env bash
# Remove worktrees and local branches whose work has landed.
#
# A branch is considered done when it is either an ancestor of origin/<main>
# (plain merge) or its upstream is gone (squash-merged PR whose remote branch
# was deleted). Detached worktrees are checked by commit ancestry or content
# equivalence before they are considered safe to remove. Anything with
# uncommitted work, a lock, or a live checkout is left alone.
#
# Usage: wt-cleanup.sh [--dry-run] [--force]
#   Reads the hook payload on stdin (uses .cwd to protect the calling session).
#   CLAUDE_WT_CLEANUP=0 disables it entirely.
set -uo pipefail

DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
  esac
done

[ "${CLAUDE_WT_CLEANUP:-1}" = "0" ] && exit 0

# The payload is optional so the script stays runnable by hand.
payload=""
if [ ! -t 0 ]; then
  payload=$(cat 2>/dev/null || true)
fi
session_cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null || true)
[ -z "$session_cwd" ] && session_cwd="$PWD"

git_common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
[ -z "$git_common" ] && exit 0

stamp="$git_common/claude-wt-cleanup.stamp"
log="$git_common/claude-wt-cleanup.log"
THROTTLE_SECONDS=1800

if [ "$FORCE" = 0 ] && [ "$DRY_RUN" = 0 ] && [ -f "$stamp" ]; then
  now=$(date +%s)
  last=$(cat "$stamp" 2>/dev/null || echo 0)
  [ $((now - last)) -lt "$THROTTLE_SECONDS" ] && exit 0
fi
[ "$DRY_RUN" = 0 ] && date +%s >"$stamp"

git fetch --prune --quiet 2>/dev/null || true
[ "$DRY_RUN" = 0 ] && git worktree prune 2>/dev/null || true

main_ref=$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null || true)
main_branch=${main_ref##*/}
[ -z "$main_branch" ] && main_branch=main
upstream_main="origin/$main_branch"
git rev-parse --verify --quiet "$upstream_main" >/dev/null || upstream_main="$main_branch"

# --- worktree inventory -----------------------------------------------------
# porcelain blocks: "worktree <path>" / "HEAD <sha>" / "branch <ref>"|"detached"
# / optional "locked". The first block is the primary worktree.
inventory=$(git worktree list --porcelain 2>/dev/null | awk '
  /^worktree /  { if (path != "") print path "\t" branch "\t" head "\t" locked; path=substr($0,10); branch=""; head=""; locked="" }
  /^HEAD /      { head=substr($0,6) }
  /^branch /    { branch=substr($0,8); sub(/^refs\/heads\//, "", branch) }
  /^detached$/  { branch="" }
  /^locked/     { locked="locked" }
  END           { if (path != "") print path "\t" branch "\t" head "\t" locked }
')

primary=$(printf '%s\n' "$inventory" | head -n 1 | cut -f1)
session_root=$(git -C "$session_cwd" rev-parse --path-format=absolute --show-toplevel 2>/dev/null || echo "$session_cwd")

# Every live process's cwd. A worktree that any process sits in belongs to
# somebody else's session -- another Claude, a Codex run, or a plain shell --
# and must survive. Without lsof we cannot tell, so no worktree is touched.
have_lsof=1
command -v lsof >/dev/null 2>&1 || have_lsof=0
busy_paths=""
[ "$have_lsof" = 1 ] && busy_paths=$(lsof -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | sort -u)

in_use() { # path -> 0 when a process's cwd is at or below it
  local target="$1" cwd
  while IFS= read -r cwd; do
    [ -z "$cwd" ] && continue
    case "$cwd" in
      "$target" | "$target"/*) return 0 ;;
    esac
  done <<< "$busy_paths"
  return 1
}

is_done() { # branch -> 0 when its work has landed
  local b="$1" track
  [ -z "$b" ] && return 1
  git merge-base --is-ancestor "$b" "$upstream_main" 2>/dev/null && return 0
  track=$(git for-each-ref --format='%(upstream:track)' "refs/heads/$b" 2>/dev/null)
  [ "$track" = "[gone]" ] && return 0
  return 1
}

is_done_head() { # detached HEAD -> 0 when its content has landed
  local sha="$1" cherry
  [ -n "$sha" ] || return 1

  # Fast path for a normal merge.
  git merge-base --is-ancestor "$sha" "$upstream_main" 2>/dev/null && return 0

  # Squash merges have different commit IDs but equivalent patches.
  cherry=$(git cherry "$upstream_main" "$sha" 2>/dev/null) || return 1
  if [ -n "$cherry" ] && ! printf '%s\n' "$cherry" | grep -q '^+'; then
    return 0
  fi

  # Also accept a detached commit whose resulting tree is already identical
  # to main, even when its individual patches do not match one-for-one.
  git diff --quiet "$upstream_main...$sha" 2>/dev/null && return 0
  return 1
}

removed_worktrees=0
deleted_branches=0
removed_codex_dirs=0
entries=""

# --- phase 1: worktrees -----------------------------------------------------
while IFS=$'\t' read -r path branch head locked; do
  [ -z "$path" ] && continue
  [ "$path" = "$primary" ] && continue
  [ "$path" = "$session_root" ] && continue
  [ "$locked" = "locked" ] && continue
  [ -d "$path" ] || continue
  if [ "$have_lsof" = 0 ]; then
    [ "$DRY_RUN" = 1 ] && entries="${entries}skip worktree $path (lsof unavailable)"$'\n'
    continue
  fi
  if in_use "$path"; then
    [ "$DRY_RUN" = 1 ] && entries="${entries}skip worktree $path (in use by a running process)"$'\n'
    continue
  fi
  # Untracked files count as work; status must be completely empty.
  if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
    [ "$DRY_RUN" = 1 ] && entries="${entries}skip worktree $path (uncommitted or untracked work)"$'\n'
    continue
  fi
  if [ -n "$branch" ]; then
    if [ "$branch" = "$main_branch" ]; then
      : # scratch worktree sitting on the main branch, nothing to lose
    elif ! is_done "$branch"; then
      continue
    fi
  elif ! is_done_head "$head"; then
    warning="skip worktree $path (detached HEAD $head not merged)"
    entries="${entries}${warning}"$'\n'
    [ "$DRY_RUN" = 1 ] || printf '%s\n' "$warning" >&2
    continue
  fi
  if [ "$DRY_RUN" = 1 ]; then
    entries="${entries}would remove worktree $path (${branch:-detached}, HEAD $head)"$'\n'
  else
    if git worktree remove "$path" 2>/dev/null; then
      entries="${entries}removed worktree $path (${branch:-detached}, HEAD $head)"$'\n'
      removed_worktrees=$((removed_worktrees + 1))
    fi
  fi
  done < <(printf '%s\n' "$inventory")

# Codex leaves an empty UUID directory after its registered worktree is
# removed. Only remove empty immediate children; never recurse or follow
# symlinks. The lsof guard applies here too.
cleanup_empty_codex_dirs() {
  local codex_root="${HOME:-}/.codex/worktrees" dir
  [ -n "${HOME:-}" ] || return 0
  [ -d "$codex_root" ] || return 0
  if [ "$have_lsof" = 0 ]; then
    [ "$DRY_RUN" = 1 ] && entries="${entries}skip empty Codex worktree directories (lsof unavailable)"$'\n'
    return 0
  fi
  while IFS= read -r -d '' dir; do
    in_use "$dir" && {
      [ "$DRY_RUN" = 1 ] && entries="${entries}skip empty Codex directory $dir (in use by a running process)"$'\n'
      continue
    }
    if [ "$DRY_RUN" = 1 ]; then
      entries="${entries}would remove empty Codex directory $dir"$'\n'
    elif rmdir "$dir" 2>/dev/null; then
      entries="${entries}removed empty Codex directory $dir"$'\n'
      removed_codex_dirs=$((removed_codex_dirs + 1))
    fi
  done < <(find "$codex_root" -mindepth 1 -maxdepth 1 -type d -empty -print0 2>/dev/null)
}

cleanup_empty_codex_dirs

# --- phase 2: branches ------------------------------------------------------
# Recomputed after phase 1 so branches freed by a removed worktree qualify.
checked_out=$(git worktree list --porcelain 2>/dev/null |
  sed -n 's|^branch refs/heads/||p')

while read -r branch; do
  [ -z "$branch" ] && continue
  [ "$branch" = "$main_branch" ] && continue
  printf '%s\n' "$checked_out" | grep -qxF "$branch" && continue
  is_done "$branch" || continue
  sha=$(git rev-parse "$branch" 2>/dev/null)
  if [ "$DRY_RUN" = 1 ]; then
    entries="${entries}would delete branch $branch ($sha)"$'\n'
  else
    # -d refuses unmerged work, so squash-merged (gone) branches need -D.
    if git branch -d "$branch" >/dev/null 2>&1 || git branch -D "$branch" >/dev/null 2>&1; then
      entries="${entries}deleted branch $branch ($sha)"$'\n'
      deleted_branches=$((deleted_branches + 1))
    fi
  fi
  done < <(git for-each-ref --format='%(refname:short)' refs/heads)

[ -z "$entries" ] && exit 0

if [ "$DRY_RUN" = 1 ]; then
  printf '%s' "$entries"
  exit 0
fi

{
  printf '=== %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  printf '%s' "$entries"
} >>"$log"

# Warning-only entries (skips, unmerged detached HEADs) make entries non-empty
# without anything actually removed; do not notify when nothing changed.
total=$((removed_worktrees + deleted_branches + removed_codex_dirs))
[ "$total" -eq 0 ] && exit 0

jq -n --arg msg "worktree ${removed_worktrees} 個 / ブランチ ${deleted_branches} 個 / Codex空ディレクトリ ${removed_codex_dirs} 個を削除 (復元用SHAは ${log})" \
  '{systemMessage: $msg, suppressOutput: true}'
