#!/bin/bash
# Replace the TLS certificate of the shared proxy with your company certificate. One certificate serves every name on
# this server (inventory.example.ch, wiki.example.ch, ...): it must carry all of them.
#   sudo ./scripts/install-cert.sh <certificate.pem|crt> <private-key.pem> [chain.pem]
#   sudo ./scripts/install-cert.sh --info
# Checks that the key matches the certificate and is still valid, keeps the old files, restarts the proxy.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
CERT_DIR=proxy/certificates
mkdir -p "$CERT_DIR"

if [ "${1:-}" = "--info" ]; then
  openssl x509 -in "$CERT_DIR/nobs.crt" -noout -subject -issuer -enddate -ext subjectAltName
  echo "Sites:"; grep -h '^https://' proxy/sites/*.caddy 2>/dev/null | sed 's/ {$//; s/^/  /'
  exit 0
fi
[ "$(id -u)" -eq 0 ] || { echo "[ERROR] Run with sudo." >&2; exit 1; }
[ $# -ge 2 ] || { sed -n '2,4p' "$0"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$1" "$TMP/cert.pem"; cp "$2" "$TMP/key.pem"
if [ -n "${3:-}" ]; then cp "$3" "$TMP/chain.pem"; else : > "$TMP/chain.pem"; fi

openssl x509 -in "$TMP/cert.pem" -noout 2>/dev/null || { echo "[ERROR] Not a PEM certificate: $1" >&2; exit 1; }
openssl pkey -in "$TMP/key.pem" -noout 2>/dev/null || { echo "[ERROR] Not an unencrypted PEM private key: $2" >&2; exit 1; }
[ "$(openssl x509 -in "$TMP/cert.pem" -noout -pubkey | openssl sha256)" = "$(openssl pkey -in "$TMP/key.pem" -pubout | openssl sha256)" ] \
  || { echo "[ERROR] The key does not match the certificate." >&2; exit 1; }
openssl x509 -in "$TMP/cert.pem" -noout -checkend 0 >/dev/null || { echo "[ERROR] The certificate has expired." >&2; exit 1; }

echo "[INFO]  New certificate:"; openssl x509 -in "$TMP/cert.pem" -noout -subject -issuer -enddate -ext subjectAltName
# Every name a site answers to must be in the certificate, or that site shows a warning.
for n in $(grep -h '^https://' proxy/sites/*.caddy 2>/dev/null | sed 's/ {$//; s/,/ /g; s#https://##g'); do
  openssl x509 -in "$TMP/cert.pem" -noout -checkhost "$n" 2>/dev/null | grep -q 'does match' || echo "[WARN]  $n is not in this certificate: that site will show a warning."
done
read -r -p "Install it? (yes/no): " ok; [ "$ok" = yes ] || { echo "Aborted."; exit 1; }

OLD="$CERT_DIR/old-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OLD"
cp -a "$CERT_DIR/nobs.crt" "$CERT_DIR/nobs.key" "$OLD/" 2>/dev/null || true
awk '/-----BEGIN /{p=1} p{print} /-----END /{p=0}' "$TMP/cert.pem" "$TMP/chain.pem" > "$CERT_DIR/nobs.crt"
openssl pkey -in "$TMP/key.pem" -out "$CERT_DIR/nobs.key"
chmod 644 "$CERT_DIR/nobs.crt"; chmod 600 "$CERT_DIR/nobs.key"
docker restart nobs-proxy >/dev/null
echo "[INFO]  Installed; old files kept in $OLD. Proxy restarted."
