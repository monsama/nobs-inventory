#!/bin/bash
# The shared HTTPS proxy (proxy/): one Caddy for every service on this server. Sourced by deploy-nobs.sh and
# scripts/update.sh, from the install folder. NI_PROXY=none in .env leaves it out (another proxy is in front).
PROXY_NET=nobs-proxy
PROXY_DIR=proxy

# A value of .env, without the quotes it may be written in (NI_HOST="inv.example.ch" as docker compose reads it).
proxy_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -E "s/^([\"'])(.*)\\1$/\\2/" || true; }
proxy_wanted() { [ "$(proxy_env NI_PROXY)" != none ]; }
proxy_compose() { docker compose -p nobs-proxy -f "$PROXY_DIR/docker-compose.yml" --env-file .env "$@"; }

# The network the proxy reaches the services on. The inventory's Compose file needs it, with or without the proxy.
proxy_network() { docker network inspect "$PROXY_NET" >/dev/null 2>&1 || docker network create "$PROXY_NET" >/dev/null; }

# Installs before 0.9.26 kept the certificate in ./certificates, next to their own Caddy: it is copied over once.
# The old folder stays until the update has gone through.
proxy_take_certificates() {
  mkdir -p "$PROXY_DIR/certificates" "$PROXY_DIR/sites"; chmod 750 "$PROXY_DIR/certificates"
  if [ ! -s "$PROXY_DIR/certificates/nobs.crt" ] && [ -s certificates/nobs.crt ] && [ -s certificates/nobs.key ]; then
    cp -a certificates/nobs.crt certificates/nobs.key "$PROXY_DIR/certificates/"
    echo "[INFO]  Certificate moved to $PROXY_DIR/certificates"
  fi
}

# The inventory's site: the name people type (NI_HOST), and its short form for an internal name. Written each time,
# so a changed NI_HOST takes effect; other services' files in proxy/sites are left alone.
proxy_site() {
  local host short names
  host="$(proxy_env NI_HOST)"; [ -n "$host" ] || { echo "[ERROR] NI_HOST is not set in .env." >&2; return 1; }
  names="https://$host"; short="${host%%.*}"; [ "$short" != "$host" ] && names="$names, https://$short"
  mkdir -p "$PROXY_DIR/sites"
  cat > "$PROXY_DIR/sites/inventory.caddy" <<SITE
# NOBS Inventory. Written from NI_HOST in .env by deploy-nobs.sh and scripts/update.sh: a change here is overwritten.
$names {
	import tls_and_headers
	reverse_proxy nobs-inventory:8080
}
SITE
}

# Starts the proxy, or reloads it when it runs, so a new site file or certificate is used.
proxy_up() {
  proxy_wanted || { echo "[INFO]  NI_PROXY=none: the shared proxy is not started (the app is on the Docker network $PROXY_NET)."; return 0; }
  proxy_compose up -d >/dev/null
  docker restart nobs-proxy >/dev/null
  echo "[INFO]  Proxy running (nobs-proxy): sites in $PROXY_DIR/sites"
}
