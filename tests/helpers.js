import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { bootstrap } from '../server/index.js';
import { loadState, saveState } from '../server/state.js';

export function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ni-test-'));
}

/* Starts the app on a random port with its own database file. */
export async function startServer({ dir = tempDataDir(), ldap = null, feedToken = null, graphConfig = null, sheetKey = null, graphFetch = undefined, certProbe = undefined } = {}) {
  const db = openDb(path.join(dir, 'inventory.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  const app = createApp({ db, ldap, feedToken, graphConfig, sheetKey, graphFetch, certProbe });
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
      let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, json, text, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
    }
  };
}

export async function signIn(srv, login, password) {
  const r = await srv.call('POST', '/api/login', { body: { login, password } });
  return { status: r.status, cookie: r.cookie, user: r.json?.user };
}

/* A small inventory for the browser tests: the devices, ports and racks the checks use. Nothing here is shipped. */
export function seedBasics(db) {
  const loc = 'Zürich HQ / Büro 2.OG';
  const base = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id.slice(1).padStart(4, '0'), type, name, status: 'active', feed: null, ovr: {}, model: 'Test model', serial: 'SN-' + name, loc, ...extra });
  const objs = [
    base('o1', 'switch', 'SW-ZH-2OG-01', { ports: 24, pfx: '1/', sfp: 4, ip: '10.10.0.12' }),
    base('o2', 'pc', 'ZH-NB-0201'),
    base('o3', 'pc', 'ZH-PC-0142'),
    base('o4', 'monitor', 'MON-0433', { status: 'stock' }),
    base('o5', 'server', 'SRV-ZH-HV01', { os: 'Windows Server 2022' }),
  ];
  const history = {};
  objs.forEach(o => { history[o.id] = [{ t: '02.09.2026 14:30', msg: 'Created manually' }]; });
  /* Racks are objects of type rack. The ids are kept, so devices mounted in them keep their place. */
  objs.push(base('R-SRV', 'rack', 'ZH-SRV-RACK-01', { code: 'INV-0901', units: 42 }), base('R-2OG', 'rack', 'ZH-2OG-WALL-01', { code: 'INV-0902', units: 12 }));
  objs.forEach(o => { if (o.type === 'rack') history[o.id] = [{ t: '02.09.2026 14:30', msg: 'Created manually' }]; });
  const s = loadState(db);
  const admin = s.users.find(u => u.login === 'admin');
  saveState(db, { objs, rels: [], history, users: admin ? [admin] : [], locs: [loc], racks: [], types: {}, policy: null, ldap: null, mapPos: {}, feedOn: true, feedSync: true, seq: 100 + objs.length, codeN: objs.length, rseq: 0 });
}
