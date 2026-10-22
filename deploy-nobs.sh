#!/bin/bash
# ============================================================
# deploy-nobs.sh - NOBS Inventory with Docker Compose and Caddy (HTTPS)
#
#   sudo ./deploy-nobs.sh          first install, or re-run after changes (safe to repeat)
#
# Creates (never overwrites existing values):
#   .env                        non-secret settings (missing keys are added)
#   secrets/admin_password      first admin password (generated, shown once at the end)
#   secrets/ldap_service_password, secrets/ls_token   empty unless you fill them in
#
# Then builds the image, starts app + Caddy, and waits until the app is healthy.
#
# Environment overrides (optional):
#   NI_HOST=inventory.example.ch   name people type (required on first run; asked for otherwise)
#   BUILD_NETWORK=host             build with host networking (needed behind some proxies)
#   INSTALL_BACKUP_CRON=true       daily backup at 03:15 (default: true)
# ============================================================
set -Eeuo pipefail
trap 'echo "[ERROR] Failed at line $LINENO: $BASH_COMMAND" >&2' ERR
cd "$(dirname "$0")"
BASE_DIR="$(pwd)"
PROJECT=nobs-inventory
VERSION="$(cat VERSION)"
IMAGE="${NI_IMAGE:-ghcr.io/monsama/nobs-inventory:$VERSION}"
INSTALL_BACKUP_CRON="${INSTALL_BACKUP_CRON:-true}"

info() { echo "[INFO]  $*"; }
warn() { echo "[WARN]  $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

gen_secret() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

step_preflight() {
    echo; echo "Step 1: Preflight"
    if [ "$(id -u)" -ne 0 ] && ! id -nG | grep -qw docker; then fail "Run with sudo (or as a member of the docker group)."; fi
    command -v docker >/dev/null || fail "Docker is not installed. Install Docker Engine and the compose plugin first."
    docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing."
    command -v openssl >/dev/null || fail "openssl is missing."
    docker info >/dev/null 2>&1 || fail "The Docker daemon is not running."
    local mem; mem="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
    [ "$mem" -gt 0 ] && [ "$mem" -lt 1024 ] && warn "Only ${mem} MB RAM. 1 GB or more is recommended."
    info "OK"
}

step_env() {
    echo; echo "Step 2: Settings (.env)"
    local env="$BASE_DIR/.env" host="${NI_HOST:-}"
    if [ -f "$env" ] && grep -q '^NI_HOST=' "$env"; then
        [ -z "$host" ] && host="$(grep '^NI_HOST=' "$env" | cut -d= -f2-)"
    fi
    if [ -z "$host" ] || [ "$host" = "inventory.example.ch" ]; then
        if [ -t 0 ]; then read -r -p "Name people will type (e.g. inventory.example.ch, or localhost for testing): " host; fi
        [ -n "$host" ] || fail "Set NI_HOST (the address people type), e.g. NI_HOST=inventory.example.ch sudo ./deploy-nobs.sh"
    fi
    if [ ! -f "$env" ]; then
        cp "$BASE_DIR/.env.example" "$env"
        info ".env created from .env.example"
    fi
    if grep -q '^NI_HOST=' "$env"; then
        sed -i "s#^NI_HOST=.*#NI_HOST=$host#" "$env"
    else
        echo "NI_HOST=$host" >> "$env"
    fi
    # The image follows the release that was installed. A custom image name is kept as it is.
    if grep -q '^NI_IMAGE=ghcr.io/monsama/nobs-inventory:' "$env" || ! grep -q '^NI_IMAGE=' "$env"; then
        sed -i -E "/^NI_IMAGE=/d" "$env"
        echo "NI_IMAGE=ghcr.io/monsama/nobs-inventory:$VERSION" >> "$env"
    fi
    # Old installs kept secrets here; they move to ./secrets below
    sed -i -E '/^(NI_ADMIN_PASSWORD|NI_LDAP_SERVICE_PASSWORD|NI_LS_TOKEN)=/d' "$env"
    chmod 640 "$env"
    info ".env: NI_HOST=$host"
}

step_secrets() {
    echo; echo "Step 3: Secrets (./secrets, never committed)"
    mkdir -p "$BASE_DIR/secrets"; chmod 700 "$BASE_DIR/secrets"
    FIRST_PASSWORD=""
    if [ ! -s "$BASE_DIR/secrets/admin_password" ]; then
        FIRST_PASSWORD="$(gen_secret 24)"
        ( umask 077; printf '%s' "$FIRST_PASSWORD" > "$BASE_DIR/secrets/admin_password" )
        info "secrets/admin_password generated"
    else
        info "secrets/admin_password exists - kept"
    fi
    for s in ldap_service_password ls_token; do
        [ -f "$BASE_DIR/secrets/$s" ] || { ( umask 077; : > "$BASE_DIR/secrets/$s" ); info "secrets/$s created (empty = unused)"; }
    done
    # The app runs as the 'node' user (UID 1000) in the container: it must own the files to read them.
    chown 1000:1000 "$BASE_DIR/secrets/"*
    chmod 400 "$BASE_DIR/secrets/"*
}

step_build_start() {
    echo; echo "Step 4: Build and start"
    local net="${BUILD_NETWORK:-}"
    local args=()
    [ -n "$net" ] && args+=(--network "$net")
    [ -n "${HTTP_PROXY:-}" ] && args+=(--build-arg "HTTP_PROXY=$HTTP_PROXY")
    [ -n "${HTTPS_PROXY:-}" ] && args+=(--build-arg "HTTPS_PROXY=$HTTPS_PROXY")
    if docker pull "$IMAGE" >/dev/null 2>&1; then
        info "Pulled release image $IMAGE"
    else
        warn "Could not pull $IMAGE - building it from this folder instead."
        docker build "${args[@]}" -t "$IMAGE" "$BASE_DIR" >/dev/null
    fi
    info "Starting containers ..."
    docker compose -p "$PROJECT" up -d --no-build
    info "Waiting for the app to be healthy ..."
    local i status
    for i in $(seq 1 30); do
        status="$(docker inspect -f '{{.State.Health.Status}}' "$PROJECT" 2>/dev/null || echo starting)"
        [ "$status" = healthy ] && { info "App healthy"; return 0; }
        [ "$status" = unhealthy ] && { docker logs --tail 20 "$PROJECT" 2>&1 | sed 's/^/        /'; fail "The app is unhealthy. See the log above."; }
        sleep 3
    done
    fail "The app did not become healthy. Check: docker compose logs app"
}

step_certificate() {
    echo; echo "Step 3b: TLS certificate (./certificates)"
    local crt="$BASE_DIR/certificates/nobs.crt" key="$BASE_DIR/certificates/nobs.key"
    local host; host="$(grep '^NI_HOST=' "$BASE_DIR/.env" | cut -d= -f2-)"
    mkdir -p "$BASE_DIR/certificates"; chmod 750 "$BASE_DIR/certificates"
    if [ -s "$crt" ] && [ -s "$key" ]; then
        info "Certificate exists - kept ($(openssl x509 -in "$crt" -noout -enddate | cut -d= -f2))"
        return
    fi
    local sans="DNS:$host"
    local short="${host%%.*}"; [ "$short" != "$host" ] && sans="$sans,DNS:$short"
    local ip; ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$ip" ] && sans="$sans,IP:$ip"
    ( umask 077
      openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825 -keyout "$key" -out "$crt" \
        -subj "/CN=$host" -addext "subjectAltName=$sans" \
        -addext "basicConstraints=critical,CA:FALSE" -addext "extendedKeyUsage=serverAuth" 2>/dev/null )
    chmod 644 "$crt"; chmod 600 "$key"
    info "Self-signed certificate created for: $sans"
    warn "Browsers will warn until you install your company certificate: sudo ./scripts/install-cert.sh <cert.pem> <key.pem>"
}

step_check() {
    echo; echo "Step 5: Check through the proxy"
    local host code
    host="$(grep '^NI_HOST=' .env | cut -d= -f2-)"
    local port; port="$(grep '^HTTPS_PORT=' .env | cut -d= -f2- || true)"; port="${port:-443}"
    sleep 4
    code="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$host:$port:127.0.0.1" "https://$host:$port/api/health" || true)"
    if [ "$code" = 200 ]; then info "HTTPS OK: https://$host/"; else warn "HTTPS check returned ${code:-none}. Check: docker compose logs caddy"; fi
}

step_cron() {
    echo; echo "Step 6: Backups"
    if [ "$INSTALL_BACKUP_CRON" != true ]; then info "Daily backup not installed (INSTALL_BACKUP_CRON=false)"; return; fi
    if [ "$(id -u)" -ne 0 ]; then warn "Not root - daily backup cron not installed."; return; fi
    cat > /etc/cron.d/nobs-inventory-backup <<CRON
# NOBS Inventory backup - installed by deploy-nobs.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root $BASE_DIR/scripts/backup.sh >> /var/log/nobs-inventory-backup.log 2>&1
CRON
    chmod 644 /etc/cron.d/nobs-inventory-backup
    info "Daily backup at 03:15 -> $BASE_DIR/backup/ (log: /var/log/nobs-inventory-backup.log)"
}

summary() {
    echo; echo "=========================================="
    echo "  NOBS Inventory is running"
    echo "=========================================="
    echo "  URL:       https://$(grep '^NI_HOST=' .env | cut -d= -f2-)/"
    if [ -n "$FIRST_PASSWORD" ]; then
        echo "  Admin:     login 'admin', password below - shown ONCE:"
        echo "             $FIRST_PASSWORD"
        echo "             Change it after the first sign-in (Settings -> Users)."
        echo "             It is also in $BASE_DIR/secrets/admin_password"
    else
        echo "  Admin:     login 'admin'. Password: $BASE_DIR/secrets/admin_password (sudo cat to read it)"
    fi
    echo
    echo "  Certificate: Caddy issues it for a public name automatically (port 80/443"
    echo "               must reach this server). For an internal name, see README."
    echo "  Update:      sudo ./scripts/update.sh"
    echo "  Backup:      sudo ./scripts/backup.sh     (copy backup/ off this server)"
    echo "  Restore:     sudo ./scripts/restore.sh backup/<file>.tar.gz"
    echo "  Logs:        docker compose logs -f"
    echo "=========================================="
}

step_preflight
step_env
step_secrets
step_certificate
step_build_start
step_check
step_cron
summary
