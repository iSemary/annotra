#!/usr/bin/env bash
# Create backend/.venv and install requirements (avoids PEP 668 "externally-managed-environment").
set -euo pipefail
cd "$(dirname "$0")"
echo "Creating Python venv in $(pwd)/.venv …"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt
echo ""
echo "Done. Activate the venv, then run the API or Celery worker:"
echo "  source .venv/bin/activate"
echo "Optional ML worker deps:"
echo "  pip install -r requirements-ml.txt"
