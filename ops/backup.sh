#!/bin/bash
set -e

# Backup script for database and configuration
# This script is intended to run as a cron job in the operations environment

echo "Starting backup process..."
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/tmp/backups/$DATE"
mkdir -p "$BACKUP_DIR"

# 1. PostgreSQL Backup (using pg_dump if credentials are provided)
DB_CONN="${DATABASE_URL:-${POSTGRES_URL:-$SUPABASE_DB_URL}}"

if [ -n "$DB_CONN" ]; then
    echo "Dumping PostgreSQL database..."
    pg_dump "$DB_CONN" > "$BACKUP_DIR/db_backup.sql"
else
    echo "Warning: DATABASE_URL / POSTGRES_URL not set. Skipping DB logical backup."
fi

# 2. Archive local state/config if any
# (Not storing secrets, just non-sensitive configs)
echo "Archiving configs..."
tar -czf "$BACKUP_DIR/configs.tar.gz" .env.example railway.json

echo "Backup completed successfully at $BACKUP_DIR"
