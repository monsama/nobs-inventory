<img src="public/logo.svg" alt="" width="56" align="left">

# NOBS Inventory
<br clear="left">

Inventory for PCs, servers, storage, phones, network gear, PLCs, patch panels and racks, with their relations. A small Node/Express API stores everything in one SQLite file. The page is `public/index.html` with its modules in `public/js/`. It shows nothing until you sign in, and saves everything on the server.

## Releases

Each version is a tag (`v0.2.0`) with a downloadable archive and checksum on the GitHub releases page, and a Docker image `ghcr.io/monsama/nobs-inventory:<version>`. The install pulls that image; it builds from source only if the pull fails.

To release, raise the version on main (`node scripts/bump-version.mjs 0.9.7`), then either push the tag with `scripts/release.sh 0.9.7`, or run the **release** workflow by hand on main (Actions → release → Run workflow): it tags the version in `VERSION` and publishes it. A version that is already tagged is refused.

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
| Update to the latest release | `sudo ./scripts/update.sh` (backs up first; rolls back automatically if unhealthy) |
| Update to a release | `sudo ./scripts/update.sh 0.3.0` |
| Current version | `cat VERSION` and `grep NI_IMAGE .env` |
| Back up | `sudo ./scripts/backup.sh` → `backup/nobs-inventory-<time>.tar.gz` (checksummed, kept 14 days) |
| Restore | `sudo ./scripts/restore.sh backup/<file>.tar.gz` (type RESTORE to confirm) |
| Daily backup | installed by `deploy-nobs.sh` at 03:15 (set `INSTALL_BACKUP_CRON=false` to skip) |
| Logs | `docker compose logs -f` |

Backups contain the database, certificates, `.env`, the Compose and Caddy files and the secrets. Copy them off the server; keep them as private as the secrets. Restore replaces the inventory data; settings and secrets are restored only with `RESTORE_SECRETS=yes`.

## Accounts and directory

- Local accounts: each user with a login gets a password under Settings → Users → Password. Passwords are stored as salted scrypt hashes.
- Groups: give `NI_LDAP_GROUP` and `NI_LDAP_ADMIN_GROUP` as the group's distinguished name (`CN=IT-Inventory,OU=Groups,DC=example,DC=ch`) to count people in groups nested inside it too; a plain name counts only direct membership. Plain `ldap://` addresses are refused unless `NI_LDAP_ALLOW_PLAIN=1`.
- Directory settings are edited in Settings → LDAP sync and saved in the inventory: server, sign-in name, search base, groups, service account. The service account password is read from the server environment (`NI_LDAP_SERVICE_PASSWORD` or `NI_LDAP_SERVICE_PASSWORD_FILE`), never stored in the inventory. The `NI_LDAP_*` variables still work as a fallback when nothing is saved.
- Active Directory sign-in: set `NI_LDAP_URL`, `NI_LDAP_BIND`, `NI_LDAP_BASE`, `NI_LDAP_GROUP` and `NI_LDAP_ADMIN_GROUP`. People sign in with their directory password, which is never stored. Only members of `NI_LDAP_GROUP` may sign in; members of `NI_LDAP_ADMIN_GROUP` are admins, everyone else is a viewer.
- Directory sync: set `NI_LDAP_SERVICE_DN` and `NI_LDAP_SERVICE_PASSWORD` for a read-only service account. The sync runs nightly at 06:00, or from Settings → LDAP sync. Users who left the directory are deactivated, not deleted, so their devices keep their owner.
- Roles: admins change everything; viewers read and filter but cannot save or import. The server enforces this, not only the page.
- Sessions: a user can be signed in from up to five browsers at once. A sixth sign-in ends the oldest session. A session lasts 12 hours.

## Entry sheets

Settings → Users → Entry sheet makes a sheet for a person's first day: their devices (inventory number, type, name, model, serial number), their Windows sign-in name, a new initial password and lines to sign. It opens for printing at once and can be printed or downloaded again later.

- The app does not change anything in Active Directory. Set the printed password on the person's AD account with "User must change password at next logon".
- The password is four groups of four letters and digits (about 90 bits), without characters that are easily misread, and meets the AD complexity rule.
- Kept sheets are encrypted (AES-256-GCM) with the key in `secrets/sheet_key` (`NI_SHEET_KEY_FILE`), which `deploy-nobs.sh` and `scripts/update.sh` create. Without it the app makes `sheet.key` in the data folder. The key is not in the database or in any backup: **keep a copy of `secrets/sheet_key` apart from the server**, or kept sheets cannot be opened after a move.
- The password is removed from a kept sheet once it is marked as Password changed, and at the latest after 14 days (checked daily at 06:00 and whenever sheets are listed). The rest of the sheet stays. A restore never brings back a removed password.
- Only admins can make, open and delete sheets. The log records who made or opened a sheet, never the password. A downloaded file holds the password while the kept sheet does.

## Lansweeper

- Direct API: set `NI_LS_TOKEN`. The sync runs nightly at 06:00 and from Settings → Feed. Before the first real sync, check the asset query against your Lansweeper schema:

      NI_LS_TOKEN=... npm run lansweeper:introspect -- AssetResources

  The query in `server/lansweeper.js` is written from public examples and has not been checked against a live tenant. Correct its field names there if introspection shows different ones.
- Push from the Lansweeper server (no API needed, works with a local install): in Settings → Feed, click **Create token** (admin), then **Download script**. Copy `Lansweeper-Push.ps1` to the Lansweeper server and run it there as the user that installed Lansweeper: `.\Lansweeper-Push.ps1 -SetCredential` (paste the token), `-DryRun` to check, then `-RegisterTask` for a daily run. The token is shown once; **Revoke** stops the script. The server also accepts a token set in `secrets/feed_token` (`NI_FEED_TOKEN`), but that is not needed.
- Report file: upload a CSV under Settings → Feed, or set `NI_FEED_CSV=/feed/report.csv` with the report in `./feed`. Used when no token is set.
- Matching is by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.
- Besides the device, the push reads what this Lansweeper version has (a column it lacks is skipped and logged):
  - the network adapter's subnet mask, gateway, DNS servers and DHCP. A gateway other than its subnet's is marked on the device, and subnets the adapters are in that the inventory does not list are offered under Settings → Network → Subnets, to add with one click;
  - Lansweeper's IP locations. A device with no location gets the room whose name matches the IP location of its address (`Willisau Lager` → `Willisau / Lager`);
  - purchase date and warranty end. Warranties that end within 90 days, or have ended, are marked and can be filtered in the sidebar;
  - the Windows role (workstation, server, domain controller), which decides PC or server for a new device;
  - the department of the logged-on user, from the Active Directory users Lansweeper scans.

## Updating

`sudo ./scripts/update.sh` downloads the release (the archive and its checksum from GitHub), backs up, replaces the code files and starts the release image. It does not touch `.env`, `secrets/`, `certificates/`, `backup/` or the data volume. On a git clone it pulls `main` instead. The code from before the update is kept in `backup/code-before-update-*.tar.gz`.

The update script needs `curl`, `sha256sum` and `tar` on the host. An install from 0.2.4 cannot update with the script yet, because that version only works with git. Extract the 0.2.12 archive once over the install folder (`tar -xzf nobs-inventory-0.2.12.tar.gz -C /opt/nobs-inventory --strip-components=1`), then run `sudo ./scripts/update.sh 0.2.12`. From 0.2.5 on, the script alone is enough.

## Backup

Copy the database while the app runs with the file in the volume:

    docker compose exec app node -e "require('node:fs').copyFileSync('/data/inventory.db','/data/backup.db')"

Or stop the stack and copy the `ni-data` volume.

## Development

    npm install
    npm test          # API, LDAP and feed tests
    NI_ADMIN_PASSWORD=dev-password-123 NI_DATA=./data npm start

Without a server, open `public/index.html` in a browser (or serve `public/` with any static server). The page then works from browser storage.
