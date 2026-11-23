#!/bin/zsh
cd "$(dirname "$0")"
if ! lsof -i :4478 >/dev/null 2>&1; then
  nohup node server.js > server.log 2>&1 &
  sleep 1
fi
open http://localhost:4478/admin
