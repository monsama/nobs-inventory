/* The objects table: the Rack column is hidden until it is wanted, the Columns menu shows and hides columns, and the choice is kept. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cols-'));
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
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); localStorage.removeItem('ni-hidden-cols'); __mods[0].st.hiddenCols = null; __mods[0].st.tab = 'table'; __mods[1].render(); });
  const heads = () => p.$$eval('#view thead th', ths => ths.map(t => t.textContent.trim()));
  let h = await heads();
  assert.ok(!h.includes('Rack'), 'Rack is shown by default: ' + h.join(','));
  await p.click('#colMenu > summary');
  await p.check('[data-col="rack"]');
  assert.equal(await p.evaluate(() => document.querySelector('#colMenu').open), true, 'the menu closed after a change');
  h = await heads();
  assert.ok(h.includes('Rack'), 'Rack did not appear: ' + h.join(','));
  await p.uncheck('[data-col="model"]');
  assert.ok(!(await heads()).includes('Model'), 'Model did not hide');
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('ni-hidden-cols'))), ['price', 'supplier', 'invoice', 'resp', 'urls', 'model'], 'the choice was not remembered (the cost, Responsible and Links columns are hidden until picked)');
  await p.reload(); await p.waitForSelector('#lgUser, #tabsbar');
  if (await p.isVisible('#lgUser')) { await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); }
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'table'; __mods[1].render(); });
  assert.ok(!(await heads()).includes('Model'), 'the choice was lost after a reload');
  assert.deepEqual(errors, [], 'page errors');
  console.log('columns: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
