#!/bin/bash
# Backup: a consistent copy of the database (VACUUM INTO, safe while the app runs),
# plus the settings and secrets, as one checksummed archive in ./backup (chmod 600).
set -Eeuo pipefail
cd "$(dirname "$0")/.."
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
VOLUME=nobs-inventory-data
APP=nobs-inventory
mkdir -p backup && chmod 700 backup
exec 9>backup/.lock
flock -n 9 || { echo "[ERROR] Another backup is running." >&2; exit 1; }

docker inspect -f '{{.State.Running}}' "$APP" 2>/dev/null | grep -q true || { echo "[ERROR] $APP is not running." >&2; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[INFO]  Database ..."
# A copy left by a backup that was cut short would make VACUUM INTO fail.
docker exec "$APP" rm -f /data/backup-tmp.db
docker exec "$APP" node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/data/inventory.db');
  db.exec(\"VACUUM INTO '/data/backup-tmp.db'\");
  db.close();"
docker cp "$APP:/data/backup-tmp.db" "$WORK/inventory.db"
docker exec "$APP" rm -f /data/backup-tmp.db
[ -s "$WORK/inventory.db" ] || { echo "[ERROR] Database copy is empty." >&2; exit 1; }

echo "[INFO]  Settings and secrets ..."
mkdir -p "$WORK/config"
cp .env "$WORK/config/" 2>/dev/null || true
cp docker-compose.yml "$WORK/config/"
# The shared proxy: its Caddyfile, every service's site file and the certificate.
cp -a proxy "$WORK/proxy" 2>/dev/null || true
cp -a certificates "$WORK/certificates" 2>/dev/null || true   # installs before 0.9.26
cp -a secrets "$WORK/secrets"
# Without secrets/sheet_key the app keeps its key in the data volume: without it, the entry sheets, the Graph keys
# and the saved LDAP password in the database cannot be opened.
if docker exec "$APP" test -f /data/sheet.key; then docker cp "$APP:/data/sheet.key" "$WORK/data-sheet.key"; fi

ARCHIVE="backup/nobs-inventory-$STAMP.tar.gz"
( umask 077; tar -czf "$ARCHIVE" -C "$WORK" . )
( cd backup && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256"
echo "[INFO]  Backup: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

find backup -maxdepth 1 -name 'nobs-inventory-*.tar.gz*' -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/[INFO]  Removed (older than '"$RETENTION_DAYS"' days): /' || true
