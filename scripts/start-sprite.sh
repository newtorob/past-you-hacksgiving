#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f .env.sprite ]; then
  set -a
  . ./.env.sprite
  set +a
fi
export HOST=0.0.0.0
export PORT=8080
exec node src/server.js
