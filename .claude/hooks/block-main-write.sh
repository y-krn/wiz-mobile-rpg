#!/usr/bin/env bash

json=$(cat)
[ -n "$json" ] || exit 0

json_pos=0
json_len=${#json}
json_string=
json_command=
json_command_found=0
json_had_unicode_escape=0

json_skip_whitespace() {
  while [ "$json_pos" -lt "$json_len" ]; do
    case "${json:$json_pos:1}" in
      ' '|$'\t'|$'\n'|$'\r') json_pos=$((json_pos + 1)) ;;
      *) return 0 ;;
    esac
  done
}

json_parse_string() {
  json_string=
  json_had_unicode_escape=0
  [ "${json:$json_pos:1}" = '"' ] || return 1
  json_pos=$((json_pos + 1))

  while [ "$json_pos" -lt "$json_len" ]; do
    json_char=${json:$json_pos:1}
    json_pos=$((json_pos + 1))
    case "$json_char" in
      '"') return 0 ;;
      \\)
        [ "$json_pos" -lt "$json_len" ] || return 1
        json_escape=${json:$json_pos:1}
        json_pos=$((json_pos + 1))
        case "$json_escape" in
          '"') json_string="${json_string}\"" ;;
          \\) json_string="${json_string}\\" ;;
          /) json_string="${json_string}/" ;;
          b) json_string="${json_string}"$'\b' ;;
          f) json_string="${json_string}"$'\f' ;;
          n) json_string="${json_string}"$'\n' ;;
          r) json_string="${json_string}"$'\r' ;;
          t) json_string="${json_string}"$'\t' ;;
          u)
            [ "$((json_len - json_pos))" -ge 4 ] || return 1
            json_unicode=${json:json_pos:4}
            case "$json_unicode" in
              *[!0123456789abcdefABCDEF]*|'') return 1 ;;
            esac
            json_pos=$((json_pos + 4))
            json_had_unicode_escape=1
            json_string="${json_string}?"
            ;;
          *) return 1 ;;
        esac
        ;;
      *) json_string="${json_string}${json_char}" ;;
    esac
  done

  return 1
}

json_skip_primitive() {
  json_start=$json_pos
  while [ "$json_pos" -lt "$json_len" ]; do
    case "${json:$json_pos:1}" in
      ' '|$'\t'|$'\n'|$'\r'|','|']'|'}') break ;;
      *) json_pos=$((json_pos + 1)) ;;
    esac
  done
  [ "$json_pos" -gt "$json_start" ]
}

json_skip_value() {
  json_skip_whitespace
  case "${json:$json_pos:1}" in
    '"') json_parse_string ;;
    '{') json_skip_object ;;
    '[') json_skip_array ;;
    *) json_skip_primitive ;;
  esac
}

json_skip_object() {
  [ "${json:$json_pos:1}" = '{' ] || return 1
  json_pos=$((json_pos + 1))
  json_skip_whitespace
  if [ "${json:$json_pos:1}" = '}' ]; then
    json_pos=$((json_pos + 1))
    return 0
  fi

  while :; do
    json_parse_string || return 1
    json_skip_whitespace
    [ "${json:$json_pos:1}" = ':' ] || return 1
    json_pos=$((json_pos + 1))
    json_skip_value || return 1
    json_skip_whitespace
    case "${json:$json_pos:1}" in
      ',')
        json_pos=$((json_pos + 1))
        ;;
      '}')
        json_pos=$((json_pos + 1))
        return 0
        ;;
      *) return 1 ;;
    esac
  done
}

json_skip_array() {
  [ "${json:$json_pos:1}" = '[' ] || return 1
  json_pos=$((json_pos + 1))
  json_skip_whitespace
  if [ "${json:$json_pos:1}" = ']' ]; then
    json_pos=$((json_pos + 1))
    return 0
  fi

  while :; do
    json_skip_value || return 1
    json_skip_whitespace
    case "${json:$json_pos:1}" in
      ',')
        json_pos=$((json_pos + 1))
        ;;
      ']')
        json_pos=$((json_pos + 1))
        return 0
        ;;
      *) return 1 ;;
    esac
  done
}

json_parse_tool_input() {
  [ "${json:$json_pos:1}" = '{' ] || return 1
  json_pos=$((json_pos + 1))
  json_skip_whitespace
  if [ "${json:$json_pos:1}" = '}' ]; then
    json_pos=$((json_pos + 1))
    return 0
  fi

  while :; do
    json_parse_string || return 1
    json_key=$json_string
    json_skip_whitespace
    [ "${json:$json_pos:1}" = ':' ] || return 1
    json_pos=$((json_pos + 1))
    json_skip_whitespace

    if [ "$json_key" = command ]; then
      json_parse_string || return 1
      [ "$json_had_unicode_escape" -eq 0 ] || return 1
      json_command=$json_string
      json_command_found=1
    else
      json_skip_value || return 1
    fi

    json_skip_whitespace
    case "${json:$json_pos:1}" in
      ',')
        json_pos=$((json_pos + 1))
        ;;
      '}')
        json_pos=$((json_pos + 1))
        return 0
        ;;
      *) return 1 ;;
    esac
  done
}

json_find_command() {
  json_skip_whitespace
  [ "${json:$json_pos:1}" = '{' ] || return 1
  json_pos=$((json_pos + 1))
  json_skip_whitespace
  if [ "${json:$json_pos:1}" = '}' ]; then
    json_pos=$((json_pos + 1))
    return 0
  fi

  while :; do
    json_parse_string || return 1
    json_key=$json_string
    json_skip_whitespace
    [ "${json:$json_pos:1}" = ':' ] || return 1
    json_pos=$((json_pos + 1))
    json_skip_whitespace

    if [ "$json_key" = tool_input ]; then
      json_parse_tool_input || return 1
    else
      json_skip_value || return 1
    fi

    json_skip_whitespace
    case "${json:$json_pos:1}" in
      ',')
        json_pos=$((json_pos + 1))
        ;;
      '}')
        json_pos=$((json_pos + 1))
        return 0
        ;;
      *) return 1 ;;
    esac
  done
}

if ! json_find_command || [ "$json_pos" -ne "$json_len" ]; then
  printf '%s\n' 'block-main-write.sh: unable to parse tool_input.command' >&2
  exit 2
fi

[ "$json_command_found" -eq 1 ] || exit 0
command=$json_command
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
