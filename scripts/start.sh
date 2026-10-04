#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)
test -x "$ROOT/.venv/bin/python" || { echo 'Create .venv and install backend requirements first.'; exit 1; }
cd frontend
test -d node_modules || npm ci
npm run build
cd dist
exec "$ROOT/.venv/bin/python" -m http.server 8000 --bind 127.0.0.1
