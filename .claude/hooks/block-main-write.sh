#!/usr/bin/env bash

command -v jq >/dev/null || { printf '%s\n' 'block-main-write.sh: jq not found' >&2; exit 2; }
command=$(jq -r '.tool_input.command // empty')
[ -n "$command" ] || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
[ "$branch" = "main" ] || exit 0

git_write_pattern='(^|[[:space:];|&])git([[:space:]]+(-[cC][[:space:]]+[^[:space:];|&]+|-[^-[:space:];|&][^[:space:];|&]*|--[^[:space:];|&]+))*[[:space:]]+(commit|push)([[:space:];|&]|$)'
command_for_match=${command//$'\n'/ }
command_for_match=${command_for_match//$'\r'/ }

if printf '%s\n' "$command_for_match" | grep -Eq "$git_write_pattern"; then
  printf '%s\n' 'Blocked: git commit and git push are not allowed on main. Use a feature branch and open a pull request.' >&2
  exit 2
fi

exit 0
