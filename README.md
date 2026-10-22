# NOBS Inventory

Inventory for PCs, servers, storage, phones, network gear, patch panels and racks. A small Node/Express API stores everything in one SQLite file. The page in `public/` is the same file as the mockup: without a server it keeps its data in the browser, with the server it signs in and saves there.

## Releases

Each version is a tag (`v0.2.0`) with a downloadable archive and checksum on the GitHub releases page, and a Docker image `ghcr.io/monsama/nobs-inventory:<version>`. The install pulls that image; it builds from source only if the pull fails.

## Set up

On a Linux server with Docker and the Compose plugin:

    git clone https://github.com/monsama/nobs-inventory && cd nobs-inventory
    sudo NI_HOST=inventory.example.ch ./deploy-nobs.sh

The script creates `.env` (settings) and `secrets/` (admin password, LDAP service password, Lansweeper token), builds the image, starts the app and Caddy, and waits until everything is healthy. It shows the first admin password once. Change it after the first sign-in (Settings → Users).

Requirements: Docker Engine with the Compose plugin, ports 80 and 443 reachable, and a DNS name (internal or public) pointing at the server.

Certificates: the install creates a self-signed certificate in `certificates/`, so the site works at once with a browser warning. To replace it with your company certificate (PEM, with its key):

    sudo ./scripts/install-cert.sh inventory.pem inventory.key [chain.pem]
    sudo ./scripts/install-cert.sh --info


Secrets live in `secrets/` and are mounted into the app container as files. They are never in `.env`, and `docker inspect` does not show them. Add the LDAP service password or the Lansweeper token by writing the value into the matching file in `secrets/`, then `docker compose restart app`.

## Operations

| Task | Command |
| --- | --- |
| Update to the latest code | `sudo ./scripts/update.sh` (backs up first; rolls back automatically if unhealthy) |
| Update to a release | `sudo ./scripts/update.sh 0.3.0` |
| Current version | `cat VERSION` and `grep NI_IMAGE .env` |
| Back up | `sudo ./scripts/backup.sh` → `backup/nobs-inventory-<time>.tar.gz` (checksummed, kept 14 days) |
| Restore | `sudo ./scripts/restore.sh backup/<file>.tar.gz` (type RESTORE to confirm) |
| Daily backup | installed by `deploy-nobs.sh` at 03:15 (set `INSTALL_BACKUP_CRON=false` to skip) |
| Logs | `docker compose logs -f` |

Backups contain the database, certificates, `.env`, the Compose and Caddy files and the secrets. Copy them off the server; keep them as private as the secrets. Restore replaces the inventory data; settings and secrets are restored only with `RESTORE_SECRETS=yes`.

## Accounts and directory

- Local accounts: each user with a login gets a password under Settings → Users → Password. Passwords are stored as salted scrypt hashes.
- Active Directory sign-in: set `NI_LDAP_URL`, `NI_LDAP_BIND`, `NI_LDAP_BASE`, `NI_LDAP_GROUP` and `NI_LDAP_ADMIN_GROUP`. People sign in with their directory password, which is never stored. Only members of `NI_LDAP_GROUP` may sign in; members of `NI_LDAP_ADMIN_GROUP` are admins, everyone else is a viewer.
- Directory sync: set `NI_LDAP_SERVICE_DN` and `NI_LDAP_SERVICE_PASSWORD` for a read-only service account. The sync runs nightly at 06:00, or from Settings → LDAP sync. Users who left the directory are deactivated, not deleted, so their devices keep their owner.
- Roles: admins change everything; viewers read and filter but cannot save or import. The server enforces this, not only the page.

## Lansweeper

- Direct API: set `NI_LS_TOKEN`. The sync runs nightly at 06:00 and from Settings → Feed. Before the first real sync, check the asset query against your Lansweeper schema:

      NI_LS_TOKEN=... npm run lansweeper:introspect -- AssetResources

  The query in `server/lansweeper.js` is written from public examples and has not been checked against a live tenant. Correct its field names there if introspection shows different ones.
- Report file: upload a CSV under Settings → Feed, or set `NI_FEED_CSV=/feed/report.csv` with the report in `./feed`. Used when no token is set.
- Matching is by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.

## Updating

Run `./update.sh` from this folder. It pulls the latest code, rebuilds and restarts. The data stays in the `ni-data` volume.

## Backup

Copy the database while the app runs with the file in the volume:

    docker compose exec app node -e "require('node:fs').copyFileSync('/data/inventory.db','/data/backup.db')"

Or stop the stack and copy the `ni-data` volume.

## Development

    npm install
    npm test          # API, LDAP and feed tests
    NI_ADMIN_PASSWORD=dev-password-123 NI_DATA=./data npm start

Without a server, open `public/index.html` in a browser (or serve `public/` with any static server). The page then works from browser storage.
