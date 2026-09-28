#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set to the Neon PostgreSQL URI (including sslmode=require)." >&2
  exit 2
fi

cd "$(dirname "$0")/../backend"
python -m pip install --no-cache-dir -r requirements.txt
alembic upgrade head
