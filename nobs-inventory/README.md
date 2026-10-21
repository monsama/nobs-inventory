# NOBS Inventory

Inventory for PCs, servers, storage, phones, network gear, patch panels and racks. A small Node/Express API stores everything in one SQLite file. The page in `public/` is the same file as the mockup: without a server it keeps its data in the browser, with the server it signs in and saves there.

## Set up (Docker Compose, HTTPS with Caddy)

1. Point a DNS name at the server, for example `inventory.monsama.ch`.
2. Copy `.env.example` to `.env` and set `NI_HOST` to that name and `NI_ADMIN_PASSWORD` to a strong password.
3. Start it:

       docker compose up -d --build

4. Open `https://inventory.monsama.ch` and sign in as `admin` with the password from `.env`. Change that password under Settings → Users, then add the people.

Caddy gets the certificate by itself. Ports 80 and 443 must reach the server, so that Let's Encrypt can check the name. For a name that is only inside the network, use a DNS challenge in the Caddyfile or Caddy's internal CA instead.

The app itself is not published; only Caddy is reachable, and the session cookie is marked Secure.

## Accounts and LDAP

- Local accounts: each user with a login gets a password under Settings → Users → Password. Passwords are stored as salted scrypt hashes.
- Active Directory: set `NI_LDAP_URL`, `NI_LDAP_BIND` (for example `{login}@monsama.ch`), `NI_LDAP_BASE` and `NI_LDAP_ADMIN_GROUP` in `.env`. People sign in with their directory password, and members of the admin group become admins. The password is never stored.
- Roles: admins change everything; viewers read and filter but cannot save or import. The server enforces this, not only the page.

## Lansweeper

- Upload a report (CSV) under Settings → Feed. Matches are by serial number, then name. Only the fields the policy allows are changed; what you set by hand stays.
- Nightly: put the report in `./feed` and set `NI_FEED_CSV=/feed/report.csv`. It is imported at 06:00.
- A direct connection to the Lansweeper API is not built yet; it needs your tenant's token and query.

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
