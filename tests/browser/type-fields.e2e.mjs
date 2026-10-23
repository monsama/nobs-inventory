/* Fields per type: a field added under Object types appears on the object page of that type, and is saved when it is left. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-tf-'));
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
  // Object types: add a text field for PCs.
  await p.click('#setBtn');
  await p.click('#setTabs [data-st=types]');
  await p.waitForSelector('#tfType');
  await p.selectOption('#tfType', 'pc');
  await p.fill('#tfLabel', 'Asset tag');
  await p.click('#tfAdd');
  await until(p, async () => (await import('/js/01-core.js')).TYPE_FIELDS.pc?.[0]?.key === 'asset_tag');
  // The PC's page shows the field; a value entered there is saved when the field is left.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('o2'); });
  await p.waitForSelector('[data-k="custom.asset_tag"]');
  await p.fill('[data-k="custom.asset_tag"]', 'AT-42'); await p.press('[data-k="custom.asset_tag"]', 'Tab');
  for (let i = 0; i < 150 && (loadState(db).objs.find(o => o.id === 'o2').custom || {}).asset_tag !== 'AT-42'; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal((loadState(db).objs.find(o => o.id === 'o2').custom || {}).asset_tag, 'AT-42', 'the value is saved when the field is left');
  assert.deepEqual(errors, [], 'page errors');
  console.log('type fields: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); }
