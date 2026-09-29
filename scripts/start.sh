#!/usr/bin/env bash
# Build frontend lalu jalankan backend (yang juga menyajikan frontend) di port 8770.
# Gunakan RESTART=1 ./scripts/start.sh untuk mengganti instance proyek yang sedang aktif.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8770}"

port_pid() {
  ss -ltnp "sport = :$PORT" 2>/dev/null | sed -nE 's/.*pid=([0-9]+).*/\1/p' | head -n 1
}

EXISTING_PID="$(port_pid || true)"
if [ -n "$EXISTING_PID" ]; then
  EXISTING_CWD="$(readlink "/proc/$EXISTING_PID/cwd" 2>/dev/null || true)"
  if [ "$EXISTING_CWD" != "$ROOT/apps/backend" ]; then
    echo "Port $PORT sedang dipakai proses lain (PID $EXISTING_PID, cwd: ${EXISTING_CWD:-tidak diketahui})." >&2
    echo "Gunakan PORT=<port-lain> ./scripts/start.sh atau hentikan proses tersebut." >&2
    exit 1
  fi

  if [ "${RESTART:-0}" != "1" ]; then
    echo "Papan Tulis Digital sudah berjalan di http://localhost:$PORT (PID $EXISTING_PID)."
    echo "Untuk restart: RESTART=1 ./scripts/start.sh"
    exit 0
  fi

  echo "Menghentikan instance lama (PID $EXISTING_PID)..."
  kill "$EXISTING_PID"
  for _ in 1 2 3 4 5; do
    [ -z "$(port_pid || true)" ] && break
    sleep 1
  done
  if [ -n "$(port_pid || true)" ]; then
    echo "Instance lama belum melepaskan port $PORT." >&2
    exit 1
  fi
fi

cd "$ROOT/apps/frontend"
[ -d node_modules ] || npm install
npm run build

cd "$ROOT/apps/backend"
exec "$UV" run python -m uvicorn app.main:app --host "$HOST" --port "$PORT"
