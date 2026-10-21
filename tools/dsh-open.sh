#!/usr/bin/env bash
# 取 lab-ts 上 dsh web 的最新登录 URL 并在本机浏览器打开
set -uo pipefail
URL=$(ssh -o ConnectTimeout=10 lab-ts "bash ~/apps/dsh-url.sh" 2>/dev/null | tail -1)
case "$URL" in
  http*) ;;
  *) echo "取 URL 失败：$URL" >&2; exit 1 ;;
esac
echo "$URL"
if [ "${1:-}" = "--print" ]; then exit 0; fi
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) start "" "$URL" >/dev/null 2>&1 ;;
  Darwin) open "$URL" ;;
  *) xdg-open "$URL" >/dev/null 2>&1 ;;
esac
