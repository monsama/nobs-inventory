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

# The secrets go back before the app starts, so it opens the restored database with the key that sealed it.
RESTORE_SECRETS="${RESTORE_SECRETS:-no}"
docker compose stop app >/dev/null
if [ -d "$WORK/secrets" ] && [ "$RESTORE_SECRETS" = yes ]; then
  cp -a "$WORK/secrets/." secrets/ && chmod 600 secrets/*
  echo "[INFO]  Secrets restored from the backup."
fi
docker run --rm -v "$VOLUME:/data" -v "$WORK:/in:ro" -e RESTORE_SECRETS="$RESTORE_SECRETS" alpine sh -c \
  'rm -f /data/inventory.db-wal /data/inventory.db-shm && cp /in/inventory.db /data/inventory.db && chown 1000:1000 /data/inventory.db &&
   if [ "$RESTORE_SECRETS" = yes ] && [ -f /in/data-sheet.key ]; then cp /in/data-sheet.key /data/sheet.key && chown 1000:1000 /data/sheet.key && chmod 600 /data/sheet.key; fi'
docker compose start app >/dev/null
echo "[INFO]  Database restored."
if [ "$RESTORE_SECRETS" != yes ]; then
  echo "[INFO]  Settings and secrets were NOT changed."
  # Another key than the backup's (a new server, or a new key) cannot open what the backup has sealed.
  if [ -f "$WORK/secrets/sheet_key" ] && ! cmp -s "$WORK/secrets/sheet_key" secrets/sheet_key 2>/dev/null; then
    echo "[WARN]  secrets/sheet_key differs from the backup's: kept entry sheets, the Graph certificates' keys and the saved"
    echo "        LDAP password cannot be opened. Restore again with RESTORE_SECRETS=yes to take the backup's key."
  fi
fi
echo "        Check: docker compose ps"
