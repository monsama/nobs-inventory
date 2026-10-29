/* Changes are sent in batches: with a small batch size, a save of many objects is split and every object still arrives. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-batch-'));
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
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js'); const r = await import('/js/07-render.js');
    r.BATCH.bytes = 500;
    const loc = core.objs[0].loc;
    for (let i = 0; i < 12; i++) core.objs.push({ id: 'bt' + i, code: 'INV-' + (9300 + i), type: 'pc', name: 'BATCH-PC-' + i, status: 'active', loc, ovr: {}, feed: null, purpose: 'batch ' + i });
    r.queueServerSave();
  });
  for (let i = 0; i < 150 && loadState(db).objs.filter(o => o.name.startsWith('BATCH-PC-')).length < 12; i++) await new Promise(res => setTimeout(res, 100));
  assert.equal(loadState(db).objs.filter(o => o.name.startsWith('BATCH-PC-')).length, 12, 'every object of the batched save reached the server');
  assert.ok(!(await p.textContent('#toast')).includes('Not saved'), 'no refused save was reported');
  assert.deepEqual(errors, [], 'page errors');
  console.log('batched saves: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); }
