#!/usr/bin/env bash
# 打印当前 dsh web 的可用登录 URL（对外地址 + 最新 token）
# 用法：bash ~/apps/dsh-url.sh [对外host:port]
set -uo pipefail

EXT=${1:-100.112.92.62:3081}

TOKEN=$(journalctl --user -u dsh-web -n 200 --no-pager 2>/dev/null   | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2)

if [ -z ${TOKEN:-} ]; then
  echo 拿不到 token：dsh-web 服务可能没在跑（journalctl --user -u dsh-web 查） >&2
  exit 1
fi

echo http://${EXT}/?token=${TOKEN}
