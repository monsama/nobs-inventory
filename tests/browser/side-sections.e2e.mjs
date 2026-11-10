import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
/* The sidebar's sections fold with a click on their header and move up or down by dragging a header or with Alt +
   arrow keys; both are kept for the next visit. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-side-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {}); seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const order = () => p.$$eval('#side>.sidesec', l => l.filter(s => s.offsetHeight > 0).map(s => s.dataset.sec));
  assert.deepEqual((await order()).slice(0, 3), ['types', 'locs', 'status']);
  // fold Types: its list goes, its header stays; Clear filters does not fold it
  await p.click('[data-sec="types"] #clearF');
  assert.equal(await p.isVisible('#typeList'), true, 'Clear filters folded the section');
  await p.click('[data-sec="types"]>.hdr .sec-t');
  assert.equal(await p.isVisible('#typeList'), false, 'the section did not fold');
  assert.equal(await p.getAttribute('[data-sec="types"]>.hdr>.sec-t', 'aria-expanded'), 'false');
  // drag Status above Locations
  await p.dragAndDrop('[data-sec="status"]>.hdr', '[data-sec="locs"]>.hdr', { targetPosition: { x: 20, y: 4 } });
  assert.deepEqual((await order()).slice(0, 3), ['types', 'status', 'locs'], 'the drag did not move the section');
  // Alt + arrow up moves it once more, past Types
  await p.focus('[data-sec="status"]>.hdr>.sec-t'); await p.keyboard.press('Alt+ArrowUp');
  assert.deepEqual((await order()).slice(0, 3), ['status', 'types', 'locs']);
  // kept on reload
  await p.reload(); await p.waitForSelector('#typeList', { state: 'attached' });
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  assert.deepEqual((await order()).slice(0, 3), ['status', 'types', 'locs'], 'the order was not kept');
  assert.equal(await p.isVisible('#typeList'), false, 'the folded section opened again');
  // Enter opens it again
  await p.focus('[data-sec="types"]>.hdr>.sec-t'); await p.keyboard.press('Enter');
  assert.equal(await p.isVisible('#typeList'), true);
  assert.deepEqual(errs, [], 'page errors');
  console.log('sidebar sections: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
