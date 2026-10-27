#!/bin/bash
# Certificates of the shared proxy. Each site (a file in proxy/sites) can have a certificate of its own; the others, and
# a name no site answers to, get the default certificate (nobs.crt, self-signed after the install).
#   sudo ./scripts/install-cert.sh <site> <bundle.pem>        a site's own certificate: key, certificate and CA in one
#                                                             file (as an AD CS script writes it), or a .pfx
#   sudo ./scripts/install-cert.sh <site> <cert.pem> <key.pem> [chain.pem]
#   sudo ./scripts/install-cert.sh default <bundle.pem>       the default certificate (or <cert> <key> [chain])
#   sudo ./scripts/install-cert.sh --remove <site>            the site goes back to the default certificate
#   sudo ./scripts/install-cert.sh --info                     which site has which certificate, valid until when
# <site> is the name of its file in proxy/sites (inventory, dokuwiki) or one of its host names (wiki.example.ch).
# Checks that the key matches the certificate, that it is valid and carries the site's names, keeps the old files,
# checks the proxy's configuration with the new files, and restarts the proxy. --yes answers the question with yes.
set -Eeuo pipefail
cd "${NI_BASE:-$(dirname "$0")/..}"
CERT_DIR=proxy/certificates
SITES=proxy/sites
PROXY="${NI_PROXY_CONTAINER:-nobs-proxy}"
WARN_DAYS=30

err() { echo "[ERROR] $*" >&2; exit 1; }
warn() { echo "[WARN]  $*"; }
info() { echo "[INFO]  $*"; }
usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

YES=false; ARGS=()
for a in "$@"; do [ "$a" = --yes ] && YES=true || ARGS+=("$a"); done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# The names a site file answers to (https://a.example.ch, https://a → a.example.ch a).
site_names() { { grep -hoE 'https://[^ ,{]+' "$1" 2>/dev/null || true; } | sed 's#https://##; s#:[0-9]*$##' | sort -u; }
# The site a name or file name stands for: the file's name without .caddy.
site_of() {
  local f
  [ "$1" = default ] && { echo default; return; }
  [ -f "$SITES/$1.caddy" ] && { echo "$1"; return; }
  for f in "$SITES"/*.caddy; do [ -f "$f" ] && site_names "$f" | grep -qxi "$1" && { basename "$f" .caddy; return; }; done
  return 1
}
cert_file() { [ "$1" = default ] && echo "$CERT_DIR/nobs.crt" || echo "$CERT_DIR/sites/$1.crt"; }
key_file() { [ "$1" = default ] && echo "$CERT_DIR/nobs.key" || echo "$CERT_DIR/sites/$1.key"; }
# The sites that use a site's own certificate, and those on the default one.
uses_own() { grep -q "/certs/sites/$1\.crt" "$SITES/$1.caddy" 2>/dev/null; }
days_left() { local end; end="$(openssl x509 -in "$1" -noout -enddate | cut -d= -f2)"; echo $(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 )); }
describe() {
  local c="$1" sans
  sans="$(openssl x509 -in "$c" -noout -ext subjectAltName 2>/dev/null | tail -n +2 | sed 's/^ *//; s/DNS://g; s/IP Address://g')"
  echo "      For:       ${sans:-$(openssl x509 -in "$c" -noout -subject -nameopt multiline | sed -n 's/^ *commonName *= //p')}"
  echo "      Issued by: $(openssl x509 -in "$c" -noout -issuer -nameopt multiline | sed -n 's/^ *commonName *= //p' | head -1)"
  echo "      Valid to:  $(date -d "$(openssl x509 -in "$c" -noout -enddate | cut -d= -f2)" +%F) ($(days_left "$c") days left)"
}

restart_proxy() {
  command -v docker >/dev/null 2>&1 && docker inspect "$PROXY" >/dev/null 2>&1 || { warn "The proxy $PROXY is not running here: start it (sudo ./scripts/update.sh) for the change to take effect."; return 0; }
  docker restart "$PROXY" >/dev/null
  info "Proxy restarted."
}
# The proxy's configuration, read with the files as they are now (the certificates included). Without Docker it is
# not checked.
check_proxy() {
  command -v docker >/dev/null 2>&1 && docker inspect "$PROXY" >/dev/null 2>&1 || return 0
  docker exec "$PROXY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$TMP/validate.log" 2>&1 && return 0
  sed 's/^/        /' "$TMP/validate.log" | tail -5 >&2
  return 1
}

if [ "${1:-}" = --info ]; then
  echo "Default certificate ($CERT_DIR/nobs.crt): for the sites without their own and for unknown names"
  if [ -s "$CERT_DIR/nobs.crt" ]; then describe "$CERT_DIR/nobs.crt"; else echo "      (none)"; fi
  echo; echo "Sites:"
  for f in "$SITES"/*.caddy; do
    [ -f "$f" ] || continue
    s="$(basename "$f" .caddy)"
    echo "  $s: $(site_names "$f" | paste -sd' ')"
    if uses_own "$s" && [ -s "$(cert_file "$s")" ]; then echo "      Own certificate ($(cert_file "$s"))"; describe "$(cert_file "$s")"
    else echo "      Default certificate"; fi
  done
  exit 0
fi

[ "$(id -u)" -eq 0 ] || [ -n "${NI_BASE:-}" ] || err "Run with sudo."
[ -f proxy/Caddyfile ] && grep -q '^(headers)' proxy/Caddyfile || err "This proxy has no certificates per site yet: update NOBS Inventory first (sudo ./scripts/update.sh)."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ "${1:-}" = --remove ]; then
  [ $# -eq 2 ] || usage
  SITE="$(site_of "$2")" || err "No site $2 in $SITES."
  [ "$SITE" != default ] || err "The default certificate stays: replace it instead."
  OLD="$CERT_DIR/old-$STAMP"; mkdir -p "$OLD"
  cp -a "$SITES/$SITE.caddy" "$TMP/site.bak"
  sed -i "\#tls /certs/sites/$SITE\.crt /certs/sites/$SITE\.key#d; s#^\([[:space:]]*\)import headers\$#\1import tls_and_headers#" "$SITES/$SITE.caddy"
  mv "$(cert_file "$SITE")" "$(key_file "$SITE")" "$OLD/" 2>/dev/null || true
  if ! check_proxy; then cp -a "$TMP/site.bak" "$SITES/$SITE.caddy"; mv "$OLD"/* "$CERT_DIR/sites/" 2>/dev/null || true; err "The proxy refused the change: put back as it was."; fi
  restart_proxy
  info "$SITE uses the default certificate again; its own is kept in $OLD."
  exit 0
fi

[ $# -ge 2 ] || usage
SITE="$(site_of "$1")" || err "No site $1 in $SITES (the sites are: $(ls "$SITES" 2>/dev/null | sed -n 's/\.caddy$//p' | paste -sd' '))."

# Everything given, as one PEM text: Windows line ends removed; a .pfx is opened with its password.
read_pem() {
  if grep -q -- '-----BEGIN' "$1" 2>/dev/null; then tr -d '\r' < "$1"
  else
    echo "[INFO]  $1 is not PEM: opening it as a .pfx (PKCS#12)." >&2
    read -r -s -p "Password of $1: " PFX_PASS </dev/tty >&2; echo >&2; export PFX_PASS
    openssl pkcs12 -in "$1" -nodes -passin env:PFX_PASS 2>/dev/null || openssl pkcs12 -legacy -in "$1" -nodes -passin env:PFX_PASS 2>/dev/null \
      || err "$1 can be read neither as PEM nor as .pfx (wrong password?)."
  fi
}
for f in "${@:2}"; do [ -r "$f" ] || err "Cannot read $f."; read_pem "$f"; echo; done > "$TMP/all.pem"

grep -q 'ENCRYPTED' "$TMP/all.pem" && err "The private key is protected with a password. Write it without one (openssl pkey -in key.pem -out plain.pem)."
# Each block to a file of its own: the certificates in order, the one private key.
awk -v d="$TMP" '
  /^-----BEGIN CERTIFICATE-----/ { n++; out = d "/cert-" n ".pem" }
  /^-----BEGIN .*PRIVATE KEY-----/ { k++; out = d "/key" k ".pem" }
  out { print > out }
  /^-----END / { close(out); out = "" }' "$TMP/all.pem"
ls "$TMP"/key*.pem >/dev/null 2>&1 || err "No private key given: give the bundle with the key in it, or the key file too."
[ ! -e "$TMP/key2.pem" ] || err "More than one private key given."
openssl pkey -in "$TMP/key1.pem" -noout -passin pass: 2>/dev/null || err "The private key cannot be read."
ls "$TMP"/cert-*.pem >/dev/null 2>&1 || err "No certificate given."

# The certificate made for the key comes first, then the CA certificates (a root is left out: browsers have it).
KEYPUB="$(openssl pkey -in "$TMP/key1.pem" -pubout | openssl sha256)"
LEAF=""; : > "$TMP/chain.pem"
for c in $(ls "$TMP"/cert-*.pem | sort -V); do
  openssl x509 -in "$c" -noout 2>/dev/null || err "A certificate in the file cannot be read."
  if [ -z "$LEAF" ] && [ "$(openssl x509 -in "$c" -noout -pubkey | openssl sha256)" = "$KEYPUB" ]; then LEAF="$c"; continue; fi
  [ "$(openssl x509 -in "$c" -noout -subject)" = "subject=$(openssl x509 -in "$c" -noout -issuer | cut -d= -f2-)" ] && continue
  openssl x509 -in "$c" >> "$TMP/chain.pem"
done
[ -n "$LEAF" ] || err "The key does not match any certificate given."
openssl x509 -in "$LEAF" -noout -checkend 0 >/dev/null || err "The certificate has expired."
eku="$(openssl x509 -in "$LEAF" -noout -ext extendedKeyUsage 2>/dev/null || true)"
[ -z "$eku" ] || grep -q 'TLS Web Server Authentication' <<<"$eku" || err "The certificate is not made for a web server (its extended key usage has no Server Authentication)."

echo "New certificate for $([ "$SITE" = default ] && echo 'the default (sites without their own, unknown names)' || echo "the site $SITE"):"
describe "$LEAF"
[ -s "$TMP/chain.pem" ] && echo "      With:      $(grep -c 'BEGIN CERTIFICATE' "$TMP/chain.pem") CA certificate(s)"
left="$(days_left "$LEAF")"; [ "$left" -lt "$WARN_DAYS" ] && warn "It expires in $left days."
bits="$(openssl x509 -in "$LEAF" -noout -text | sed -n 's/.*Public-Key: (\([0-9]*\) bit).*/\1/p')"
[ -n "$bits" ] && [ "$bits" -lt 2048 ] && openssl x509 -in "$LEAF" -noout -text | grep -q rsaEncryption && warn "The key has $bits bits: browsers want at least 2048."

# Every name the site answers to must be in the certificate, or the browser warns for that name.
if [ "$SITE" = default ]; then
  NAMES="$(for f in "$SITES"/*.caddy; do [ -f "$f" ] && ! uses_own "$(basename "$f" .caddy)" && site_names "$f"; done | sort -u)"
else
  NAMES="$(site_names "$SITES/$SITE.caddy")"
fi
missing=0
for n in $NAMES; do
  openssl x509 -in "$LEAF" -noout -checkhost "$n" 2>/dev/null | grep -q 'does match' || { warn "$n is not in this certificate: the browser will warn for it."; missing=1; }
done
[ "$missing" = 0 ] && [ -n "$NAMES" ] && info "It carries every name of the site: $(echo $NAMES)"
if [ "$YES" != true ]; then read -r -p "Install it? (yes/no): " ok; [ "$ok" = yes ] || { echo "Aborted."; exit 1; }; fi

# Install: the old files kept, the new ones written, the site pointed at them, the proxy's configuration checked.
CRT="$(cert_file "$SITE")"; KEY="$(key_file "$SITE")"
mkdir -p "$CERT_DIR/sites"; chmod 750 "$CERT_DIR" "$CERT_DIR/sites"
OLD="$CERT_DIR/old-$STAMP"; mkdir -p "$OLD"
cp -a "$CRT" "$KEY" "$OLD/" 2>/dev/null || true
[ "$SITE" != default ] && cp -a "$SITES/$SITE.caddy" "$OLD/$SITE.caddy"
{ openssl x509 -in "$LEAF"; cat "$TMP/chain.pem"; } > "$CRT.new"
( umask 077; openssl pkey -in "$TMP/key1.pem" -out "$KEY.new" )
chmod 644 "$CRT.new"; chmod 600 "$KEY.new"
mv "$CRT.new" "$CRT"; mv "$KEY.new" "$KEY"
if [ "$SITE" != default ] && ! uses_own "$SITE"; then
  if grep -qE '^[[:space:]]*import tls_and_headers[[:space:]]*$' "$SITES/$SITE.caddy"; then
    sed -i "s#^\([[:space:]]*\)import tls_and_headers[[:space:]]*\$#\1tls /certs/sites/$SITE.crt /certs/sites/$SITE.key\n\1import headers#" "$SITES/$SITE.caddy"
    info "$SITES/$SITE.caddy now uses it."
  else
    warn "$SITES/$SITE.caddy has no line \"import tls_and_headers\" to replace. Put this in its block:"
    echo "        tls /certs/sites/$SITE.crt /certs/sites/$SITE.key"
  fi
fi
put_back() {
  for f in "$CRT" "$KEY"; do if [ -e "$OLD/$(basename "$f")" ]; then cp -a "$OLD/$(basename "$f")" "$f"; else rm -f "$f"; fi; done
  [ "$SITE" != default ] && cp -a "$OLD/$SITE.caddy" "$SITES/$SITE.caddy"
}
check_proxy || { put_back; err "The proxy refused the new certificate (above): everything is put back as it was."; }
restart_proxy
if rmdir "$OLD" 2>/dev/null; then info "Installed: $CRT."; else info "Installed: $CRT. Old files kept in $OLD."; fi
