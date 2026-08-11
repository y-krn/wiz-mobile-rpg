#!/usr/bin/env bash
# セッション肥大化ガード。
#   pre  (PreToolUse/Bash) : 環境に無いコマンドを 1 回で止める。
#   post (PostToolUse/*)   : ツール呼び出し数と重複実行を数え、閾値で警告を返す。
# 状態は session_id 単位の一時ディレクトリに置く。
set -u

mode=${1:-post}
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)

if [ "$mode" = "pre" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  [ -n "$cmd" ] || exit 0
  # 行頭 / パイプ / && の直後に来るものだけを「コマンドとしての実行」とみなす。
  # 文字列や引数の中の timeout という語では止めない。
  if printf '%s\n' "$cmd" | grep -Eq '(^|[;|&][[:space:]]*)g?timeout[[:space:]]'; then
    printf '%s\n' 'Blocked: timeout/gtimeout はこの macOS に存在しない。同じ形での再試行は禁止。長時間処理は Bash の run_in_background、または Bash tool の timeout パラメータを使う。' >&2
    exit 2
  fi
  exit 0
fi

root="${TMPDIR:-/tmp}/claude-session-guard"
sid=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')
dir="$root/$sid"
mkdir -p "$dir/keys" 2>/dev/null || exit 0

n=$(( $(cat "$dir/n" 2>/dev/null || echo 0) + 1 ))
printf '%s' "$n" >"$dir/n"
if [ "$n" -eq 1 ]; then
  find "$root" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
fi

warn=""
if [ $((n % 40)) -eq 0 ]; then
  warn="ツール呼び出し ${n} 回。ここで 現状 / 残作業 / 次の一手 を要約せよ。Issue を跨ぐ・性質が変わるなら /handoff で畳んで新セッションへ。"
fi

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
key=""
thr=3
case "$tool" in
  Bash)
    key=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//')
    ;;
  Read)
    key=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  Edit|Write|NotebookEdit)
    key=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    thr=8
    ;;
esac

if [ -n "$key" ]; then
  h=$(printf '%s\t%s' "$tool" "$key" | shasum -a 256 | cut -c1-16)
  c=$(( $(cat "$dir/keys/$h" 2>/dev/null || echo 0) + 1 ))
  printf '%s' "$c" >"$dir/keys/$h"
  if [ "$c" -ge "$thr" ] && [ $((c % thr)) -eq 0 ]; then
    label=$(printf '%s' "$key" | cut -c1-90)
    warn="${warn:+$warn }同一 ${tool} が ${c} 回目: ${label} 。既出の結果を使えないか確認し、繰り返すなら理由を述べよ。"
  fi
fi

[ -n "$warn" ] || exit 0
jq -cn --arg c "$warn" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
