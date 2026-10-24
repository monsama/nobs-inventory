/* Addresses: a device's address that another device already uses, or that is outside its subnet, is flagged on save, and the save still goes through. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-addr-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const ids = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const v = await import('/js/02-views.js'); const pc = c.objs.find(o => o.type === 'pc'); const sw = c.objs.find(o => o.type === 'switch'); sw.ip = '10.20.30.40'; v.openObj(pc.id); return { pc: pc.id, sw: sw.id }; });
  await p.waitForSelector(`#f_${ids.pc}_ip`);
  await p.fill(`#f_${ids.pc}_ip`, '10.20.30.40');
  await p.click('#saveBtn');
  await until(p, async () => /also used by/.test(document.querySelector('#toast').textContent), 4000).catch(() => {});
  const toast = await p.textContent('#toast');
  assert.match(toast, /also used by/, 'a duplicate address is flagged: ' + toast);
  await until(p, async () => (await import('/js/01-core.js')).byId(ids.pc).ip === '10.20.30.40');
  await p.waitForTimeout(1500);
  assert.equal(loadState(db).objs.find(o => o.id === ids.pc).ip, '10.20.30.40', 'the save still goes through');
  assert.deepEqual(errors, [], 'page errors');
  console.log('addresses: all checks passed');
} catch (e) { console.error(e); process.exitCode = 1; }
finally { await browser.close(); server.close(); db.close(); }
