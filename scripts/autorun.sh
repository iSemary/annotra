#!/usr/bin/env bash
# Open two GUI terminal windows (Linux): Next.js (default :3000) and FastAPI (:8006).
# Backend terminal: alembic upgrade head → python -m scripts.seed_db → uvicorn.
# Requires: npm (frontend), Python venv under backend/.venv (recommended), a supported terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE_Q=$(printf '%q' "$ROOT/docker-compose.yml")

FRONTEND_CMD="$(cat <<EOF
set -euo pipefail
cd $(printf '%q' "$ROOT")/frontend
echo "Annotra frontend — http://localhost:3000"
if [[ ! -d node_modules ]]; then
  echo "Running npm install…"
  npm install
fi
npm run dev
exec bash -i
EOF
)"

BACKEND_CMD="$(cat <<EOF
set -euo pipefail
cd $(printf '%q' "$ROOT")/backend
if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  cp .env.example .env
  echo "Created backend/.env from .env.example"
fi
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && [[ -f $COMPOSE_FILE_Q ]]; then
  echo "Starting PostgreSQL (docker compose)…"
  if ! docker compose -f $COMPOSE_FILE_Q up -d --wait db 2>/dev/null; then
    docker compose -f $COMPOSE_FILE_Q up -d db
    echo "Waiting for Postgres (no compose --wait)…"
    sleep 5
  fi
fi
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
RUN_PY=python3
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  RUN_PY=python
  if ! "\$RUN_PY" -c "import fastapi" 2>/dev/null; then
    pip install -q -r requirements.txt
  fi
elif python3 -m venv .venv 2>/dev/null && [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -q -r requirements.txt
  RUN_PY=python
else
  if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "No venv (install python3-venv for an isolated env). Installing deps for system Python…"
    python3 -m pip install -q -r requirements.txt --break-system-packages || {
      echo "pip failed. On Debian/Ubuntu: sudo apt install python3-venv && rm -rf .venv && re-run." >&2
      exit 1
    }
  fi
  RUN_PY=python3
fi
echo "Annotra backend — migrate, seed, API http://127.0.0.1:\${API_PORT:-8006}"
"\$RUN_PY" -m alembic upgrade head
"\$RUN_PY" -m scripts.seed_db
API_PORT="\${API_PORT:-8006}"
set +e
"\$RUN_PY" -m uvicorn app.main:app --reload --host 0.0.0.0 --port "\$API_PORT"
exec bash -i
EOF
)"

launch_terminal() {
  local title=$1
  local cmd=$2

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -c "$cmd" &
  elif command -v konsole >/dev/null 2>&1; then
    konsole -p tabtitle="$title" -e bash -c "$cmd" &
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal -T "$title" -e bash -c "$(printf '%q' "$cmd")" &
  elif command -v alacritty >/dev/null 2>&1; then
    alacritty -t "$title" -e bash -c "$cmd" &
  elif command -v kitty >/dev/null 2>&1; then
    kitty --title "$title" bash -c "$cmd" &
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "$title" -e bash -c "$cmd" &
  elif command -v xterm >/dev/null 2>&1; then
    xterm -T "$title" -e bash -c "$cmd" &
  else
    echo "autorun.sh: no supported terminal emulator found." >&2
    echo "Install one of: gnome-terminal, konsole, xfce4-terminal, alacritty, kitty, xterm" >&2
    exit 1
  fi
}

if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo "autorun.sh: DISPLAY or WAYLAND_DISPLAY should be set for GUI terminals." >&2
  exit 1
fi

launch_terminal "Annotra — frontend :3000" "$FRONTEND_CMD"
launch_terminal "Annotra — backend :8006" "$BACKEND_CMD"

echo "Started two terminals (frontend :3000, backend :8006)."
