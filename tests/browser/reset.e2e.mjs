/* Factory reset in the page: the confirmation needs the typed word; afterwards the page starts as a new server does,
   and the admin who reset can sign in again. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-reset-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.click('#setBtn'); await p.click('#setTabs [data-st=maintenance]');
  await p.click('#frReset'); await p.waitForSelector('#frOk');
  await p.fill('#frWord', 'factory reset'); assert.equal(await p.isDisabled('#frOk'), true, 'a wrong word confirms');
  assert.equal(await p.isChecked('#frBackups'), false, 'backups are kept unless asked');
  await p.fill('#frWord', 'FACTORY RESET'); await p.click('#frOk');
  /* the admin who reset keeps the session, so the page reloads straight into the empty inventory */
  await p.waitForSelector('text=The inventory is empty', { timeout: 15000 });
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length); }), 0, 'devices are still there after the reset');
  assert.deepEqual(errors, [], 'page errors');
  console.log('browser factory reset: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
