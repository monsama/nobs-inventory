#!/bin/bash
# Backup: a consistent copy of the database (VACUUM INTO, safe while the app runs),
# plus the settings and secrets, as one checksummed archive in ./backup (chmod 600).
set -Eeuo pipefail
cd "$(dirname "$0")/.."
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
VOLUME=nobs-inventory-data
APP=nobs-inventory-app-1
mkdir -p backup && chmod 700 backup
exec 9>backup/.lock
flock -n 9 || { echo "[ERROR] Another backup is running." >&2; exit 1; }

docker inspect -f '{{.State.Running}}' "$APP" 2>/dev/null | grep -q true || { echo "[ERROR] $APP is not running." >&2; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[INFO]  Database ..."
docker exec "$APP" node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/data/inventory.db');
  db.exec(\"VACUUM INTO '/data/backup-tmp.db'\");
  db.close();" 2>/dev/null
docker cp "$APP:/data/backup-tmp.db" "$WORK/inventory.db"
docker exec "$APP" rm -f /data/backup-tmp.db
[ -s "$WORK/inventory.db" ] || { echo "[ERROR] Database copy is empty." >&2; exit 1; }

echo "[INFO]  Settings and secrets ..."
mkdir -p "$WORK/config"
cp .env "$WORK/config/" 2>/dev/null || true
cp Caddyfile docker-compose.yml "$WORK/config/"
cp -a secrets "$WORK/secrets"

ARCHIVE="backup/nobs-inventory-$STAMP.tar.gz"
( umask 077; tar -czf "$ARCHIVE" -C "$WORK" . )
( cd backup && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256"
echo "[INFO]  Backup: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

find backup -maxdepth 1 -name 'nobs-inventory-*.tar.gz*' -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/[INFO]  Removed (older than '"$RETENTION_DAYS"' days): /' || true
