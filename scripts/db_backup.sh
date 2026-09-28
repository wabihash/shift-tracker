#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must contain the PostgreSQL connection URI." >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required; install the PostgreSQL client tools first." >&2
  exit 127
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
mkdir -p -- "$BACKUP_DIR"
chmod 700 -- "$BACKUP_DIR"
umask 077

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.dump"
if [[ -e "$BACKUP_FILE" ]]; then
  echo "Refusing to overwrite existing backup: $BACKUP_FILE" >&2
  exit 1
fi

BACKUP_COMPLETE=0
cleanup_partial_backup() {
  if [[ "$BACKUP_COMPLETE" -ne 1 && -e "$BACKUP_FILE" ]]; then
    rm -f -- "$BACKUP_FILE"
  fi
}
trap cleanup_partial_backup EXIT

# PGDATABASE accepts a libpq URI and avoids exposing credentials in pg_dump's arguments.
PGDATABASE="$DATABASE_URL" pg_dump -Fc --no-owner --file="$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  rm -f -- "$BACKUP_FILE"
  echo "pg_dump completed without producing a non-empty backup." >&2
  exit 1
fi
BACKUP_COMPLETE=1

find "$BACKUP_DIR" -type f -name 'backup_*.dump' -mmin +20160 -print -delete
printf 'Backup created: %s\n' "$BACKUP_FILE"
