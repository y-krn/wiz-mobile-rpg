#!/usr/bin/env bash
# Codex を 1 run 1 目的で回すラッパー。
#
#   scripts/codex-run.sh <label> [codex-args...] < prompt.txt
#
# label は目的を表す 1 語 + Issue 番号にする（investigate-271 / implement-271 /
# verify-271）。1 つの run に調査・実装・検証を詰め込まない。
#
# やること:
#   - プロンプトを stdin から渡す（`</dev/null` 不要、対話待ちで固まらない）
#   - 最終メッセージを .codex-log/<stamp>-<label>.md へ
#   - JSONL イベントを .codex-log/<stamp>-<label>.jsonl へ（--json）
#   - 終了時にターン数・トークン・ツール呼び出し数を要約し、肥大していたら警告
# 呼び出し側は要約と .md だけ読む。JSONL は本文を読まず jq で絞る。
set -uo pipefail

label=${1:-}
if [ -z "$label" ]; then
  printf 'usage: scripts/codex-run.sh <label> [codex-args...] < prompt.txt\n' >&2
  exit 64
fi
shift

model_args=()
case " $* " in
  *" -m "*|*" --model "*) ;;
  *) model_args=(-m gpt-5.6-luna -c model_reasoning_effort=max) ;;
esac

dir=${CODEX_LOG_DIR:-.codex-log}
mkdir -p "$dir"
base="$dir/$(date +%Y%m%d-%H%M%S)-$label"

codex exec --json "${model_args[@]}" -o "$base.md" "$@" - \
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
