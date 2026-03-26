#!/usr/bin/env bash
# Open two GUI terminal windows (Linux): Next.js (default :3000) and FastAPI (:8006).
# Backend terminal: same flow as backend/README.md (venv, pip, alembic) → seed_db → uvicorn; local Postgres.
# Requires: npm (frontend), python3-venv, a supported terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
_AUTORUN_LAUNCH_N=0

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
echo "Backend expects PostgreSQL reachable via DATABASE_URL in backend/.env (local install, not started by this script)."
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
echo "Annotra backend — seed, API http://127.0.0.1:\${API_PORT:-8006}"
python -m scripts.seed_db
API_PORT="\${API_PORT:-8006}"
set +e
uvicorn app.main:app --reload --host 0.0.0.0 --port "\$API_PORT"
exec bash -i
EOF
)"

launch_terminal() {
  local title=$1
  local cmd=$2
  _AUTORUN_LAUNCH_N=$((_AUTORUN_LAUNCH_N + 1))

  if [[ -x /usr/bin/gnome-terminal.real ]]; then
    # Ubuntu/Debian shim at /usr/bin/gnome-terminal can funnel launches into one
    # factory; gnome-terminal.real + distinct WM role yields separate top-level windows.
    /usr/bin/gnome-terminal.real --window --title="$title" --role="annotra-${_AUTORUN_LAUNCH_N}" -- bash -c "$cmd" &
  elif command -v gnome-terminal >/dev/null 2>&1; then
    # --disable-factory forces a new app instance on Ubuntu's python gnome-terminal shim.
    if IFS= read -r _gt_line < "$(command -v gnome-terminal)" && [[ "$_gt_line" == '#!'*python* ]]; then
      gnome-terminal --disable-factory --window --title="$title" --role="annotra-${_AUTORUN_LAUNCH_N}" -- bash -c "$cmd" &
    else
      gnome-terminal --window --title="$title" --role="annotra-${_AUTORUN_LAUNCH_N}" -- bash -c "$cmd" &
    fi
  elif command -v konsole >/dev/null 2>&1; then
    konsole --new-window -p tabtitle="$title" -e bash -c "$cmd" &
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
