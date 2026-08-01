#!/usr/bin/env bash

command=$(jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -n "$command" ] || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
[ "$branch" = "main" ] || exit 0

if printf '%s\n' "$command" | grep -Eq '(^|[[:space:];|&])git[[:space:]]+(commit|push)([[:space:]]|$)'; then
  printf '%s\n' 'Blocked: git commit and git push are not allowed on main. Use a feature branch and open a pull request.' >&2
  exit 2
fi

exit 0
