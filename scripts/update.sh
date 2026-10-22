#!/bin/bash
# Update to a released version.
#   sudo ./scripts/update.sh            latest code on main (git pull), with its matching image
#   sudo ./scripts/update.sh 0.3.0      that release: code tag v0.3.0 and image 0.3.0
#
# Backs up first. If the new version is not healthy, it switches back to the previous
# version automatically (code and image), so a failed update never leaves the app down.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
REGISTRY_IMAGE=ghcr.io/monsama/nobs-inventory
APP=nobs-inventory
TARGET="${1:-}"

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

PREV_REV="$(git rev-parse HEAD)"
PREV_IMAGE="$(get_env NI_IMAGE)"; PREV_IMAGE="${PREV_IMAGE:-$REGISTRY_IMAGE:$(cat VERSION)}"

echo "[INFO]  Backup before the update ..."
./scripts/backup.sh

if [ -n "$TARGET" ]; then
  TARGET="${TARGET#v}"
  echo "[INFO]  Fetching release v$TARGET ..."
  git fetch --tags --quiet origin
  git rev-parse -q --verify "refs/tags/v$TARGET" >/dev/null || { echo "[ERROR] No release v$TARGET." >&2; exit 1; }
  git checkout --quiet "v$TARGET"
  NEW_IMAGE="$REGISTRY_IMAGE:$TARGET"
else
  echo "[INFO]  Pulling the latest code ..."
  git pull --ff-only --quiet origin main
  NEW_IMAGE="$REGISTRY_IMAGE:$(cat VERSION)"
fi

echo "[INFO]  Image: $NEW_IMAGE"
docker pull "$NEW_IMAGE" >/dev/null
set_env NI_IMAGE "$NEW_IMAGE"
docker compose up -d --no-build
if wait_healthy; then
  docker image prune -f >/dev/null
  echo "[INFO]  Updated to $(cat VERSION). Previous version: $PREV_IMAGE (kept for rollback)."
  exit 0
fi

echo "[ERROR] The new version is not healthy - switching back to the previous version." >&2
git checkout --quiet "$PREV_REV"
set_env NI_IMAGE "$PREV_IMAGE"
docker compose up -d --no-build
if wait_healthy; then
  echo "[INFO]  Back on the previous version. See: docker compose logs app" >&2
else
  echo "[ERROR] The previous version is not healthy either. Check: docker compose logs app" >&2
fi
exit 1
