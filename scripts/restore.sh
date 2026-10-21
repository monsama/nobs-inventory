#!/bin/bash
# Restore: sudo ./scripts/restore.sh backup/nobs-inventory-<stamp>.tar.gz
# Replaces the database with the one in the backup. Settings and secrets are restored only on request.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
ARCHIVE="${1:-}"
[ -f "$ARCHIVE" ] || { echo "Usage: $0 <backup.tar.gz>" >&2; exit 1; }
if [ -f "$ARCHIVE.sha256" ]; then
  ( cd "$(dirname "$ARCHIVE")" && sha256sum -c --quiet "$(basename "$ARCHIVE").sha256" ) || { echo "[ERROR] Checksum mismatch." >&2; exit 1; }
fi
VOLUME=nobs-inventory-data
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
[ -s "$WORK/inventory.db" ] || { echo "[ERROR] The backup has no database." >&2; exit 1; }

echo "This replaces all inventory data on this server with the backup."
read -r -p "Type RESTORE to continue: " confirm
[ "$confirm" = RESTORE ] || { echo "Aborted."; exit 1; }

docker compose stop app >/dev/null
docker run --rm -v "$VOLUME:/data" -v "$WORK:/in:ro" alpine sh -c \
  'rm -f /data/inventory.db-wal /data/inventory.db-shm && cp /in/inventory.db /data/inventory.db && chown 1000:1000 /data/inventory.db'
docker compose start app >/dev/null
echo "[INFO]  Database restored. Settings and secrets were NOT changed."
if [ -d "$WORK/secrets" ] && [ "${RESTORE_SECRETS:-no}" = yes ]; then
  cp -a "$WORK/secrets/." secrets/ && chmod 600 secrets/*
  echo "[INFO]  Secrets restored from the backup."
fi
echo "        Check: docker compose ps"
