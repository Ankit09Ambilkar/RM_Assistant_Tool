#!/usr/bin/env bash
# Starts backend (FastAPI :8000) + frontend (Vite :5173) together. Ctrl+C stops both.
# First run installs everything automatically.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "▶ Setting up Python backend…"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "▶ Installing frontend packages…"
  (cd "$ROOT/frontend" && npm install)
fi

(cd "$ROOT/backend" && .venv/bin/uvicorn main:app --reload --reload-include ".env" --port 8000) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT

echo "▶ App:   http://localhost:5173"
echo "▶ Admin: http://localhost:5173/admin"
echo "▶ API:   http://localhost:8000/docs"
cd "$ROOT/frontend" && npm run dev
