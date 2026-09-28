#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: bash scripts/db_restore.sh <backup_file> <target_database_url>" >&2
  exit 2
fi
BACKUP_FILE="$1"
TARGET_DATABASE_URL="$2"

if [[ ! -f "$BACKUP_FILE" || ! -r "$BACKUP_FILE" ]]; then
  echo "Backup file is missing or unreadable: $BACKUP_FILE" >&2
  exit 2
fi
if [[ -z "$TARGET_DATABASE_URL" ]]; then
  echo "Target database URL must not be empty." >&2
  exit 2
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required; install the PostgreSQL client tools first." >&2
  exit 127
fi
if [[ ! -t 0 ]]; then
  echo "Restore requires an interactive terminal." >&2
  exit 2
fi

printf 'WARNING: this will replace objects in the target database using:\n  %s\n' "$(basename -- "$BACKUP_FILE")"
printf 'Type RESTORE to continue: '
IFS= read -r CONFIRMATION
if [[ "$CONFIRMATION" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 1
fi

# PGDATABASE accepts a libpq URI and keeps the credential URI out of pg_restore's arguments.
PGDATABASE="$TARGET_DATABASE_URL" pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --exit-on-error \
  "$BACKUP_FILE"

printf 'Restore completed from: %s\n' "$BACKUP_FILE"
