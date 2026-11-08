#!/bin/bash
# Backup: a consistent copy of the database (VACUUM INTO, safe while the app runs),
# plus the settings and secrets, as one checksummed archive in ./backup (chmod 600).
set -Eeuo pipefail
cd "$(dirname "$0")/.."
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
# The passphrase file for encrypted backups, from the environment or .env (BACKUP_PASSPHRASE_FILE=/path).
[ -z "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f .env ] && BACKUP_PASSPHRASE_FILE="$(sed -n 's/^BACKUP_PASSPHRASE_FILE=//p' .env | tail -1)"
# Without a passphrase the archive is not encrypted, so the secrets and the key that opens the saved passwords stay
# out of it (keep secrets/ safe on its own). BACKUP_INCLUDE_SECRETS=yes puts them in all the same.
[ -z "${BACKUP_INCLUDE_SECRETS:-}" ] && [ -f .env ] && BACKUP_INCLUDE_SECRETS="$(sed -n 's/^BACKUP_INCLUDE_SECRETS=//p' .env | tail -1)"
WITH_SECRETS=no
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] || [ "${BACKUP_INCLUDE_SECRETS:-}" = yes ]; then WITH_SECRETS=yes; fi
VOLUME=nobs-inventory-data
APP=nobs-inventory
mkdir -p backup && chmod 700 backup
exec 9>backup/.lock
flock -n 9 || { echo "[ERROR] Another backup is running." >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[INFO]  Database ..."
# A container that keeps restarting counts as running to Docker, but cannot run a command: it takes the other way.
if docker inspect -f '{{and .State.Running (not .State.Restarting)}}' "$APP" 2>/dev/null | grep -q true; then
  RUNNING=yes
  # A copy left by a backup that was cut short would make VACUUM INTO fail.
  docker exec "$APP" rm -f /data/backup-tmp.db
  docker exec "$APP" node -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('/data/inventory.db');
    db.exec(\"VACUUM INTO '/data/backup-tmp.db'\");
    db.close();"
  docker cp "$APP:/data/backup-tmp.db" "$WORK/inventory.db"
  docker exec "$APP" rm -f /data/backup-tmp.db
else
  # The app is stopped or keeps restarting (an update is how that gets repaired): the same copy, made by a one-off
  # container of the app's image on the data volume, with the sheet key if the app keeps it there.
  RUNNING=no
  echo "[WARN]  $APP is not running: the database is copied from its volume."
  mkdir "$WORK/out" && chmod 777 "$WORK/out"
  docker compose run --rm --no-deps -v "$WORK/out:/out" --entrypoint node app -e "
    const fs = require('node:fs'), { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('/data/inventory.db');
    db.exec(\"VACUUM INTO '/out/inventory.db'\");
    db.close();
    if (fs.existsSync('/data/sheet.key')) fs.copyFileSync('/data/sheet.key', '/out/data-sheet.key');" >/dev/null
  mv "$WORK/out/inventory.db" "$WORK/inventory.db"
  if [ -f "$WORK/out/data-sheet.key" ]; then mv "$WORK/out/data-sheet.key" "$WORK/data-sheet.key"; fi
  rmdir "$WORK/out" 2>/dev/null || rm -rf "$WORK/out"
fi
[ -s "$WORK/inventory.db" ] || { echo "[ERROR] Database copy is empty." >&2; exit 1; }

echo "[INFO]  Settings and secrets ..."
mkdir -p "$WORK/config"
cp .env "$WORK/config/" 2>/dev/null || true
cp docker-compose.yml "$WORK/config/"
# The shared proxy: its Caddyfile, every service's site file and the certificate.
cp -a proxy "$WORK/proxy" 2>/dev/null || true
cp -a certificates "$WORK/certificates" 2>/dev/null || true   # installs before 0.9.26
if [ "$WITH_SECRETS" = yes ]; then cp -a secrets "$WORK/secrets"; fi
# Without secrets/sheet_key the app keeps its key in the data volume: without it, the entry sheets, the Graph keys
# and the saved LDAP password in the database cannot be opened.
if [ "$WITH_SECRETS" = no ]; then rm -f "$WORK/data-sheet.key"
  # Not encrypted: the passwords, tokens and keys in .env (SMTP, the backup copy's S3 key or Azure address) and the
  # certificates' private keys stay out too. A restore keeps the .env and the certificates the server has.
  if [ -f "$WORK/config/.env" ]; then
    grep -Ev '^[[:space:]]*(export[[:space:]]+)?[A-Za-z0-9_]*(PASSWORD|PASSPHRASE|SECRET|TOKEN|_KEY|AZURE_URL|SAS)[A-Za-z0-9_]*=' "$WORK/config/.env" > "$WORK/config/.env.tmp" || true
    mv "$WORK/config/.env.tmp" "$WORK/config/.env"
  fi
  for d in "$WORK/proxy" "$WORK/certificates"; do
    if [ -d "$d" ]; then find "$d" -type f \( -name '*.key' -o -name '*.pem' -o -name '*.p12' -o -name '*.pfx' \) -delete; fi
  done
  echo "[WARN]  No BACKUP_PASSPHRASE_FILE: the archive is not encrypted, so secrets/, the sheet key, the passwords and"
  echo "        tokens in .env and the certificates' private keys are left out. Keep a copy of them somewhere safe,"
  echo "        or set BACKUP_PASSPHRASE_FILE in .env (or BACKUP_INCLUDE_SECRETS=yes). The database itself holds the"
  echo "        local accounts' password hashes: keep the backups private either way."
elif [ "$RUNNING" = yes ] && docker exec "$APP" test -f /data/sheet.key; then docker cp "$APP:/data/sheet.key" "$WORK/data-sheet.key"; fi

ARCHIVE="backup/nobs-inventory-$STAMP.tar.gz"
( umask 077; tar -czf "$ARCHIVE" -C "$WORK" . )
# The archive holds the secrets and the key that opens the saved passwords. With BACKUP_PASSPHRASE_FILE (a file kept
# away from this server's backups, e.g. on the backup host or a password safe's export) it is encrypted with that
# passphrase: a copy of the archive alone then opens nothing. restore.sh asks for it, or reads the same file. A check
# made from the same passphrase (backup-mac.sh) goes in front, so restore.sh notices a file changed after it was made.
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  # shellcheck source=backup-mac.sh
  . scripts/backup-mac.sh
  [ -s "$BACKUP_PASSPHRASE_FILE" ] || { echo "[ERROR] BACKUP_PASSPHRASE_FILE is set but $BACKUP_PASSPHRASE_FILE is missing or empty." >&2; rm -f "$ARCHIVE"; exit 1; }
  ( umask 077; openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" -in "$ARCHIVE" -out "$WORK/archive.enc"
    mac_seal "file:$BACKUP_PASSPHRASE_FILE" "$WORK/archive.enc" "$ARCHIVE.enc" ) || { rm -f "$ARCHIVE" "$ARCHIVE.enc"; exit 1; }
  rm -f "$ARCHIVE" "$WORK/archive.enc"; ARCHIVE="$ARCHIVE.enc"
  echo "[INFO]  Encrypted with the passphrase in $BACKUP_PASSPHRASE_FILE"
fi
( cd backup && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256"
echo "[INFO]  Backup: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

find backup -maxdepth 1 -name 'nobs-inventory-*.tar.gz*' -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/[INFO]  Removed (older than '"$RETENTION_DAYS"' days): /' || true
