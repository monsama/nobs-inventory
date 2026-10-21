import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { bootstrap } from '../server/index.js';

export function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ni-test-'));
}

/* Starts the app on a random port with its own database file. */
export async function startServer({ dir = tempDataDir(), ldap = null } = {}) {
  const db = openDb(path.join(dir, 'inventory.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  const app = createApp({ db, ldap });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, dir, db,
    close: () => new Promise(resolve => { server.close(() => { db.close(); resolve(); }); }),
    async call(method, url, { body, cookie, type = 'json' } = {}) {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      let payload;
      if (body !== undefined) {
        if (type === 'json') { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
        else { headers['Content-Type'] = 'text/csv'; payload = body; }
      }
      const r = await fetch(base + url, { method, headers, body: payload });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
      return { status: r.status, json, text, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
    }
  };
}

export async function signIn(srv, login, password) {
  const r = await srv.call('POST', '/api/login', { body: { login, password } });
  return { status: r.status, cookie: r.cookie, user: r.json?.user };
}
