#!/usr/bin/env bash
# Start the local backend and frontend. Stop both with Ctrl+C.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PYTHON="$ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo "Missing .venv. Follow docs/development.md to install development dependencies." >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

# Check before starting either server; leave existing instances untouched.
"$PYTHON" - <<'PY'
import socket
import sys

for port in (8000, 8080):
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            sys.exit(f'Port {port} is unavailable. Stop the existing server first.')
PY

backend_pid=''
frontend_pid=''
cleanup() {
  trap - EXIT INT TERM
  for pid in "$frontend_pid" "$backend_pid"; do
    if [[ -n "$pid" ]]; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$frontend_pid" "$backend_pid"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

PYTHONPATH="$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON" -m uvicorn app.main:app \
  --reload --host 127.0.0.1 --port 8000 &
backend_pid=$!

"$PYTHON" scripts/dev_server.py --port 8080 --backend-url http://127.0.0.1:8000 &
frontend_pid=$!

echo "GrooveShelf: http://127.0.0.1:8080"
echo "Backend: http://127.0.0.1:8000/docs"
echo "Press Ctrl+C to stop both servers. Restart this script after changing .env."

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done

echo "A server stopped; shutting down both servers." >&2
exit 1
