#!/bin/bash
# Update: backup -> pull the latest code -> rebuild -> restart -> wait for health.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
IMAGE=nobs-inventory:0.2
APP=nobs-inventory-app-1
echo "[INFO]  Backup first ..."
./scripts/backup.sh
if [ -d .git ]; then
  echo "[INFO]  Pulling the latest code ..."
  git pull --ff-only
fi
OLD="$(docker inspect -f '{{.Image}}' "$APP" 2>/dev/null || echo none)"
echo "[INFO]  Rebuilding $IMAGE ..."
ARGS=()
[ -n "${BUILD_NETWORK:-}" ] && ARGS+=(--network "$BUILD_NETWORK")
docker build "${ARGS[@]}" -t "$IMAGE" .
docker compose up -d --no-build
for i in $(seq 1 40); do
  s="$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo starting)"
  [ "$s" = healthy ] && { docker image prune -f >/dev/null; echo "[INFO]  Update finished."; exit 0; }
  [ "$s" = unhealthy ] && break
  sleep 3
done
echo "[ERROR] The app is not healthy after the update. Check: docker compose logs app" >&2
echo "        To go back: git checkout <previous commit> && sudo ./scripts/restore.sh backup/<latest>.tar.gz" >&2
exit 1
