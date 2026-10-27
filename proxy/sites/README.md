One file per service, named <service>.caddy. NOBS Inventory writes inventory.caddy from NI_HOST in its .env
(deploy-nobs.sh and update.sh do it); other services add their own. After a change: docker restart nobs-proxy
A site uses the default certificate ("import tls_and_headers") until it gets its own:
  sudo ./scripts/install-cert.sh <service> <bundle.pem>
which puts it in ../certificates/sites/ and changes that line to "tls /certs/sites/<service>.crt ..." with "import headers".
