#!/bin/bash
# Update to a released version. Works for a git clone and for an archive install (no .git).
#   sudo ./scripts/update.sh            the latest release (archive install), or the latest code on main (git clone)
#   sudo ./scripts/update.sh 0.2.12      that release
#
# Backs up first. If the new version is not healthy, it switches back to the previous
# version automatically (code and image), so a failed update never leaves the app down.
# Only the code is replaced. .env, secrets/, certificates/, backup/ and the data volume stay as they are.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
REGISTRY_IMAGE=ghcr.io/monsama/nobs-inventory
REPO=monsama/nobs-inventory
APP=nobs-inventory
RELEASES="${NI_RELEASE_URL:-https://github.com/$REPO/releases/download}"
LATEST_API="${NI_RELEASE_API:-https://api.github.com/repos/$REPO/releases/latest}"
TARGET="${1:-}"
# What a release archive contains (see .github/workflows/release.yml). These are the files an archive update replaces.
CODE="deploy-nobs.sh scripts Dockerfile docker-compose.yml Caddyfile .env.example package.json package-lock.json server public VERSION README.md"

get_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
set_env() {
  if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi
}
wait_healthy() {
  for _ in $(seq 1 40); do
    s="$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo starting)"
    [ "$s" = healthy ] && return 0
    [ "$s" = unhealthy ] && return 1
    sleep 3
  done
  return 1
}
latest_release() {
  curl -fsSL "$LATEST_API" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1
}
# Copies every file of a code folder over the install. Each file is written under a new name and renamed into place,
# so this script can be replaced while it runs, and a file is never half written.
install_code() {
  (cd "$1" && find . -type f) | while read -r f; do
    f="${f#./}"
    mkdir -p "$(dirname "$f")"
    cp -p "$1/$f" "$f.new" && mv -f "$f.new" "$f"
  done
}
# Downloads the archive and its checksum for a version into a folder, and checks the checksum.
fetch_release() {
  # A tag can exist before its release is published (the release workflow must finish first). Say so, instead of a raw curl error.
  curl -fsSIL -o /dev/null "$RELEASES/v$1/nobs-inventory-$1.tar.gz" 2>/dev/null || { echo "[ERROR] Release v$1 has no archive on GitHub yet. Its release run must finish first: check the release workflow for v$1, then try again." >&2; exit 1; }
  curl -fsSL -o "$2/nobs-inventory-$1.tar.gz" "$RELEASES/v$1/nobs-inventory-$1.tar.gz"
  curl -fsSL -o "$2/nobs-inventory-$1.tar.gz.sha256" "$RELEASES/v$1/nobs-inventory-$1.tar.gz.sha256"
  (cd "$2" && sha256sum -c --quiet "nobs-inventory-$1.tar.gz.sha256")
}

PREV_IMAGE="$(get_env NI_IMAGE)"; PREV_IMAGE="${PREV_IMAGE:-$REGISTRY_IMAGE:$(cat VERSION)}"

echo "[INFO]  Backup before the update ..."
./scripts/backup.sh

if [ -d .git ]; then
  PREV_REV="$(git rev-parse HEAD)"
  if [ -n "$TARGET" ]; then
    TARGET="${TARGET#v}"
    echo "[INFO]  Fetching release v$TARGET ..."
    git fetch --tags --quiet origin
    git rev-parse -q --verify "refs/tags/v$TARGET" >/dev/null || { echo "[ERROR] No release v$TARGET." >&2; exit 1; }
    git checkout --quiet "v$TARGET"
  else
    echo "[INFO]  Pulling the latest code ..."
    git pull --ff-only --quiet origin main
  fi
  restore_code() { git checkout --quiet "$PREV_REV"; }
else
  TARGET="${TARGET:-$(latest_release)}"
  TARGET="${TARGET#v}"
  [ -n "$TARGET" ] || { echo "[ERROR] Could not find the latest release. Give the version: sudo ./scripts/update.sh 0.2.12" >&2; exit 1; }
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  echo "[INFO]  Downloading release v$TARGET ..."
  fetch_release "$TARGET" "$WORK"
  SNAPSHOT="backup/code-before-update-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar --ignore-failed-read -czf "$SNAPSHOT" $CODE
  echo "[INFO]  The code before the update is kept in $SNAPSHOT"
  mkdir "$WORK/new" "$WORK/prev"
  tar -xzf "$WORK/nobs-inventory-$TARGET.tar.gz" -C "$WORK/new" --strip-components=1
  install_code "$WORK/new"
  restore_code() { tar -xzf "$SNAPSHOT" -C "$WORK/prev" && install_code "$WORK/prev"; }
fi

NEW_IMAGE="$REGISTRY_IMAGE:$(cat VERSION)"
rollback() {
  echo "[ERROR] $1 - switching back to the previous version." >&2
  restore_code
  set_env NI_IMAGE "$PREV_IMAGE"
  docker compose up -d --no-build
  if wait_healthy; then
    echo "[INFO]  Back on the previous version. See: docker compose logs app" >&2
  else
    echo "[ERROR] The previous version is not healthy either. Check: docker compose logs app" >&2
  fi
  exit 1
}

# Secrets added in newer versions: Compose refuses to start when a declared secret file is missing, so create it (empty = unused).
[ -f secrets/feed_token ] || { ( umask 077; : > secrets/feed_token ); chown 1000:1000 secrets/feed_token; chmod 400 secrets/feed_token; }
# The entry sheet key: a new random one. Keep a copy apart from the server; without it the kept sheets cannot be opened.
[ -s secrets/sheet_key ] || { ( umask 077; head -c 32 /dev/urandom | base64 > secrets/sheet_key ); chown 1000:1000 secrets/sheet_key; chmod 400 secrets/sheet_key; echo "[INFO]  secrets/sheet_key generated - keep a copy of it"; }

echo "[INFO]  Image: $NEW_IMAGE"
docker pull "$NEW_IMAGE" >/dev/null || rollback "The image $NEW_IMAGE cannot be pulled"
set_env NI_IMAGE "$NEW_IMAGE"
docker compose up -d --no-build || rollback "The containers do not start"
wait_healthy || rollback "The new version is not healthy"

docker image prune -f >/dev/null
echo "[INFO]  Updated to $(cat VERSION). Previous version: $PREV_IMAGE (kept for rollback)."
