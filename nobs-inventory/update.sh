#!/usr/bin/env sh
# Updates the running inventory: fetches the latest code, rebuilds the image and restarts the container.
set -e
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker compose ps
