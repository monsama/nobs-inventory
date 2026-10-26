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

The script creates `.env` (settings) and `secrets/` (admin password, LDAP service password, Lansweeper token), starts the app, waits until it is healthy, and starts the shared proxy. It shows the first admin password once. Change it after the first sign-in (Settings → Users).

Requirements: Docker Engine with the Compose plugin, ports 80 and 443 reachable, and a DNS name (internal or public) pointing at the server.

### The shared proxy

HTTPS comes from one Caddy for the whole server, in `proxy/`: its own Compose project (`nobs-proxy`), so other services (a wiki, say) can run next to the inventory behind the same ports 80 and 443. Each service has a file in `proxy/sites/`; the inventory's, `inventory.caddy`, is written from `NI_HOST` by `deploy-nobs.sh` and `update.sh`. The services reach each other on the Docker network `nobs-proxy`.

An install from before 0.9.26 had its own Caddy in the inventory's Compose file. `update.sh` moves it over: the certificate goes to `proxy/certificates/`, the site is written, the old Caddy is removed and the shared one started (a few seconds without HTTPS). The old `Caddyfile` and `certificates/` are kept in `backup/before-shared-proxy-*`. If the update fails, everything is switched back.

With another proxy already in front, leave it out: `sudo ./deploy-nobs.sh --no-proxy` (writes `NI_PROXY=none` to `.env`). That proxy then joins the network `nobs-proxy` and forwards to `nobs-inventory:8080`.

To add a service, put it on the network and give it a site file, e.g. `proxy/sites/wiki.caddy`:

    https://wiki.example.ch {
    	import tls_and_headers
    	reverse_proxy dokuwiki:8080
    }

then `docker restart nobs-proxy`. In the service's own Compose file:

    services:
      dokuwiki:
        container_name: dokuwiki
        networks: [nobs-proxy]
    networks:
      nobs-proxy:
        external: true

Certificates: one certificate in `proxy/certificates/` serves every name, so it must carry all of them (`inventory.example.ch` and `wiki.example.ch`, say). The install creates a self-signed one, so the site works at once with a browser warning. To replace it with your company certificate (PEM, with its key):

    sudo ./scripts/install-cert.sh company.pem company.key [chain.pem]
    sudo ./scripts/install-cert.sh --info

It warns about every site name the new certificate does not carry.


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
| Logs | `docker compose logs -f` (the app), `docker logs nobs-proxy` (the proxy) |

Backups contain the database, `.env`, the Compose file, the proxy (`proxy/`: its Caddyfile, every site file and the certificate) and the secrets. Copy them off the server; keep them as private as the secrets. Restore replaces the inventory data; secrets (with `secrets/sheet_key`) are restored only with `RESTORE_SECRETS=yes`, and restore warns when the key on the server is not the backup's.

## Accounts and directory

- Local accounts: each user with a login gets a password under Settings → Users → Password. Passwords are stored as salted scrypt hashes.
- Connection security (Settings → LDAP & Graph): TLS with `ldaps://` (port 636), StartTLS on `ldap://` (port 389, encrypted before anything is sent), or none, which sends passwords readable and has to be chosen knowingly (as before with `NI_LDAP_ALLOW_PLAIN=1`). `NI_LDAP_STARTTLS=1` picks StartTLS for settings from the environment.
- A domain controller whose certificate still has a 1024-bit RSA key is refused ("key too weak"): renew it with a 2048-bit key. Until then, "Accept old certificates" in Settings lets the inventory connect (OpenSSL security level 1 instead of 2; the certificate is still checked against the CA and the name). Not recommended; switch it off once the certificate is renewed.
- When the certificate is the problem, Test connection says what the server presented: for whom, issued by which CA, until when, with which key, and what to do.
- A domain controller whose certificate your company's CA issued (AD Certificate Services) is trusted once that CA's certificate is added under CA certificate: export the root CA certificate as .cer (DER or Base-64). A server's own certificate is refused. `NI_LDAP_CA` (a file on the server) still works. Use the name the certificate is made for (`dc01.example.ch`), not an IP address.
- Groups: give `NI_LDAP_GROUP` and `NI_LDAP_ADMIN_GROUP` as the group's distinguished name (`CN=IT-Inventory,OU=Groups,DC=example,DC=ch`) to count people in groups nested inside it too; a plain name counts only direct membership. Plain `ldap://` addresses are refused unless `NI_LDAP_ALLOW_PLAIN=1`.
- Directory settings are edited in Settings → LDAP sync and saved in the inventory: server, sign-in name, search base, groups, service account. The service account password can be saved there too: it is kept encrypted with the server's secret key in a table of its own, never shown again, and not in the inventory, backups or logs. A password in the server environment (`NI_LDAP_SERVICE_PASSWORD` or `NI_LDAP_SERVICE_PASSWORD_FILE`) takes precedence. The `NI_LDAP_*` variables still work as a fallback when nothing is saved.
- Active Directory sign-in: set `NI_LDAP_URL`, `NI_LDAP_BIND`, `NI_LDAP_BASE`, `NI_LDAP_GROUP` and `NI_LDAP_ADMIN_GROUP`. People sign in with their directory password, which is never stored. Only members of `NI_LDAP_GROUP` may sign in; members of `NI_LDAP_ADMIN_GROUP` are admins, everyone else is a viewer.
- Sync schedule: each sync (Lansweeper API or report file, LDAP directory, Microsoft Graph) has its own interval and start time next to its Sync now button in Settings — off, every 1–12 hours, or daily. Defaults: Lansweeper and LDAP daily at 06:00, Microsoft Graph every 4 hours from 06:00. Syncs due at the same minute run in that order.
- Directory sync: set `NI_LDAP_SERVICE_DN` and `NI_LDAP_SERVICE_PASSWORD` for a read-only service account. The sync runs daily at 06:00 by default, or from Settings → LDAP sync. Users who left the directory are deactivated, not deleted, so their devices keep their owner.
- Roles: admins change everything; viewers read and filter but cannot save or import. The server enforces this, not only the page.
- Sessions: a user can be signed in from up to five browsers at once. A sixth sign-in ends the oldest session. A session ends after 12 hours, or after 2 hours without use.

## Microsoft Graph (Entra and Intune)

Settings → LDAP & Graph reads each device's Entra join status, Intune enrolment and compliance, matched by serial number, else by name. It only reads. The join types are Entra joined, Hybrid joined (Graph's ServerAd) and Entra registered; a device with a computer account in AD (read by the LDAP sync) that Entra does not have shows as AD joined only.

When Entra lists one device more than once (an old record after a reinstall, or a hybrid-joined PC that is also Entra registered), the current record is used: one heard of in the last 30 days, then the one Intune manages, then joined before registered. The others are listed on the device and under the sidebar filter *Duplicates in Entra*, to be deleted in Entra. A record whose serial number or name fits two devices of the inventory is put on neither and listed under *Name or serial used twice*. A device Entra no longer has is marked as gone and counts as not in Entra. Set it up in four steps, all shown in the app:

1. **Register an app in Entra**: Entra admin center → Applications → App registrations → New registration (single tenant, no redirect URI). Enter its Directory (tenant) ID and Application (client) ID in the app and click Save IDs.
2. **Permissions**: in the app registration, API permissions → Add a permission → Microsoft Graph → Application permissions: `Device.Read.All` and `DeviceManagementManagedDevices.Read.All`, then Grant admin consent.
3. **Certificate**: click Create a certificate. The server keeps it with its private key, encrypted with `secrets/sheet_key`; the key never leaves the server and is not in backups. Download the .cer (any time, from the list) and upload it to the app registration under Certificates & secrets → Certificates. Entra shows the same thumbprint as the list.
4. **Test connection**, then **Sync now**. The test names a certificate Entra does not know, a wrong ID, or a missing permission. The sync also runs by itself, every 4 hours from 06:00 by default.

To renew: create a new certificate, upload it, click Use this one, test, then remove the old one in the app and in Entra. `NI_GRAPH_TENANT`, `NI_GRAPH_CLIENT_ID`, `NI_GRAPH_CERT(_FILE)` and `NI_GRAPH_KEY(_FILE)` on the server still work and take precedence when all four are set.

## Overview, costs, contracts and licences

- **Overview** (first tab): devices in use, what needs attention (ended or ending warranties, contract notices due, over-used licences, devices in repair), yearly cost of running contracts and licences, the value of the devices in use, and devices by type, site and status. Every line opens the list behind it.
- **Device costs**: each device has Price, Supplier and Invoice no. under Properties. The Table can show them (Columns menu) and the CSV export includes them, with the purchase and warranty dates.
- **Contracts** tab: maintenance, support, leases, subscriptions, licences and extended warranties, each with supplier, contract no., dates, cost (per year, per month or once) and the devices it covers. A contract that renews by itself runs on in terms (every month to every 3 years); its notice date is the notice period before the end of the current term. Notices due and contracts ending within 60 days are marked here and on the Overview. A device page lists the contracts that cover it and can add it to one. The currency (default CHF) is set in the Contracts toolbar.
- **Licences** (Software tab): seats per software. A licence counts the devices, not retired, whose software name contains the licence's name, so “Microsoft 365 Apps” counts every language and version. Over-use is marked on the licence and on the package row.

## Device types from Lansweeper

A device from Lansweeper gets its type in this order:
1. **Lansweeper type names** (Settings → Feed): an exact name, e.g. "DECT base" → VoIP phone.
2. **Type rules** (Settings → Feed): each rule looks at the Lansweeper type, the model, the name, the chassis, or all of the type, model and name, and names a type when any of its words is there. The first rule that matches decides. The app ships with rules for notebooks (chassis and model names), cameras and recorders, PLCs and drives, and switch models, and for Lansweeper's own type names. They can be changed, switched off, reordered or added to; **Back to the defaults** returns to the shipped list.
3. Windows' own role moves a computer between PC and server.

Rules apply to new devices. **Apply to existing devices…** shows which devices from Lansweeper would get another type, and changes only the ticked ones. A type set by hand on a device is never changed.

## Entry sheets

Settings → Users → Entry sheet makes a sheet for a person's first day: their devices (inventory number, type, name, model, serial number), their Windows sign-in name, a new initial password and lines to sign. It opens for printing at once and can be printed again or downloaded as a PDF later. Settings → Users → Company sets the company name and logo the sheets carry instead of NOBS Inventory (any image; it is kept as a PNG).

- The app does not change anything in Active Directory. Set the printed password on the person's AD account with "User must change password at next logon".
- The password is four groups of four letters and digits (about 90 bits), without characters that are easily misread, and meets the AD complexity rule.
- Kept sheets are encrypted (AES-256-GCM) with the key in `secrets/sheet_key` (`NI_SHEET_KEY_FILE`), which `deploy-nobs.sh` and `scripts/update.sh` create. Without it the app makes `sheet.key` in the data folder. The key is not in the database or in any backup: **keep a copy of `secrets/sheet_key` apart from the server**, or kept sheets cannot be opened after a move.
- The password is removed from a kept sheet once it is marked as Password changed, and at the latest after 14 days (checked daily at 06:00 and whenever sheets are listed). The rest of the sheet stays. A restore never brings back a removed password.
- Only admins can make, open and delete sheets. The log records who made or opened a sheet, never the password. A downloaded PDF holds the password while the kept sheet does.

## Lansweeper

- Direct API: set `NI_LS_TOKEN`. The sync runs daily at 06:00 by default, and from Settings → Feed. Before the first real sync, check the asset query against your Lansweeper schema:

      NI_LS_TOKEN=... npm run lansweeper:introspect -- AssetResources

  The query in `server/lansweeper.js` is written from public examples and has not been checked against a live tenant. Correct its field names there if introspection shows different ones.
- Push from the Lansweeper server (no API needed, works with a local install): in Settings → Feed, click **Create token** (admin), then **Download script**. Copy `Lansweeper-Push.ps1` to the Lansweeper server and run it there as the user that installed Lansweeper: `.\Lansweeper-Push.ps1`. The first run asks for the inventory's address and the token, checks both (it offers to trust a certificate Windows does not know), keeps them, and pushes. Then `-RegisterTask` for a daily run. `-Setup` asks again; `-DryRun` only shows the data. The token is shown once; **Revoke** stops the script. The server also accepts a token set in `secrets/feed_token` (`NI_FEED_TOKEN`), but that is not needed.
- Report file: upload a CSV under Settings → Feed, or set `NI_FEED_CSV=/feed/report.csv` with the report in `./feed`. Used when no token is set.
- Matching is by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.
- Besides the device, the push reads what this Lansweeper version has (a column it lacks is skipped and logged):
  - the network adapter's subnet mask, gateway, DNS servers and DHCP. A gateway other than its subnet's is marked on the device, and subnets the adapters are in that the inventory does not list are offered under Settings → Network → Subnets, to add with one click;
  - Lansweeper's IP locations. A device with no location gets the room whose name matches the IP location of its address (`Willisau Lager` → `Willisau / Lager`);
  - purchase date and warranty end. Warranties that end within 90 days, or have ended, are marked and can be filtered in the sidebar;
  - the Windows role (workstation, server, domain controller), which decides PC or server for a new device;
  - the department of the logged-on user, from the Active Directory users Lansweeper scans.
- The user Lansweeper reports on a device is a login (its `Username`). A person it names is added under Settings → Users with that login and, from the Active Directory users Lansweeper scans, the full name and department; devices show the full name. Persons from before 0.9.28, whose name was the login, get it as their login on the first start. When the LDAP sync or a directory sign-in brings the same login, the directory takes over that person (same record, so their devices stay assigned); a local account with that login is never taken over.

## Updating

`sudo ./scripts/update.sh` downloads the release (the archive and its checksum from GitHub), backs up, replaces the code files and starts the release image. It does not touch `.env`, `secrets/`, `certificates/`, `backup/` or the data volume. On a git clone it pulls `main` instead. The code from before the update is kept in `backup/code-before-update-*.tar.gz`.

The update script needs `curl`, `sha256sum` and `tar` on the host. An install from 0.2.4 cannot update with the script yet, because that version only works with git. Extract the 0.2.12 archive once over the install folder (`tar -xzf nobs-inventory-0.2.12.tar.gz -C /opt/nobs-inventory --strip-components=1`), then run `sudo ./scripts/update.sh 0.2.12`. From 0.2.5 on, the script alone is enough.

After installing the new code, the script hands over to the new version's own update script, which finishes the update (new secret files, starting the image) or switches back on a failure. Updates from an install of 0.9.11 or newer work this way.

**From 0.9.8 or older to 0.9.9 or newer:** the old script does not create `secrets/sheet_key`, so Compose does not start and the update switches back. Create the key once, then run the update:

    sudo sh -c 'umask 077; head -c 32 /dev/urandom | base64 > secrets/sheet_key'
    sudo chown 1000:1000 secrets/sheet_key && sudo chmod 400 secrets/sheet_key
    sudo ./scripts/update.sh

Keep a copy of `secrets/sheet_key` apart from the server: it encrypts the entry sheets and the Microsoft Graph keys.

## Backup

Use `sudo ./scripts/backup.sh` (see Operations): it copies the database with `VACUUM INTO`, which is consistent while the app runs. A plain file copy of `inventory.db` is not: the database runs in WAL mode, so recent changes may still be in `inventory.db-wal`. Otherwise stop the stack and copy the `nobs-inventory-data` volume.

The backups in Settings → Maintenance hold the inventory (devices, relations, history, types, locations, networks, plans with their pictures, contracts, licences, settings and the sealed entry sheets). They do not hold passwords, the push token, the Graph private keys, the saved LDAP password or the log: for a move to a new server, use `scripts/backup.sh` and restore with `RESTORE_SECRETS=yes`.

## Development

    npm install
    npm test          # API, LDAP and feed tests
    NI_ADMIN_PASSWORD=dev-password-123 NI_DATA=./data npm start

Without a server, open `public/index.html` in a browser (or serve `public/` with any static server). The page then works from browser storage.
