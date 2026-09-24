#!/usr/bin/env bash
# Build frontend lalu jalankan backend (yang juga menyajikan frontend) di port 8770.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run build

cd "$ROOT/backend"
exec "$UV" run uvicorn app.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8770}"
