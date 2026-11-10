import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
/* A package's name on a device page opens Software with that package unfolded: every device it is on. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-sw-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {}); seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForTimeout(1200);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); const pcs = c.objs.filter(x => x.type === 'pc'); pcs.forEach((o, i) => { o.software = [{ name: 'KeePass Password Safe', version: '2.5' + i }, { name: 'Zoom', version: '5' }]; }); c.st.tab = pcs[0].id; const r = await import('/js/07-render.js'); r.queueServerSave(); r.render(); });
  await p.click('[data-swgo="KeePass Password Safe"]');
  await p.waitForSelector('#swBody .sw-row.open[data-sw="KeePass Password Safe"]');
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).st.tab), 'sw');
  assert.equal(await p.locator('.sw-detail[data-swd="KeePass Password Safe"] .sw-dev').count(), 2, 'every device with the package');
  assert.equal(await p.locator('.sw-row.open').count(), 1, 'only that package is unfolded');
  assert.deepEqual(errs, [], 'page errors');
  console.log('software link: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
