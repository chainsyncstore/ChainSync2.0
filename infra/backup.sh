#!/usr/bin/env bash
set -euo pipefail

# Neon PostgreSQL logical backup
# Usage: ./infra/backup.sh [output_dir]

OUTPUT_DIR=${1:-"backups"}
DATE=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
mkdir -p "$OUTPUT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL env var is required (e.g., from Neon)" >&2
  exit 1
fi

FILENAME="chainsync_backup_${DATE}.sql.gz"
echo "Creating backup to ${OUTPUT_DIR}/${FILENAME}"

pg_dump --no-owner --if-exists --clean --format=plain "$DATABASE_URL" | gzip -9 > "${OUTPUT_DIR}/${FILENAME}"

echo "Backup complete: ${OUTPUT_DIR}/${FILENAME}"


