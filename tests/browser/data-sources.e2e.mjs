/* Settings → Data sources: the page lists every field a sync knows (from sync-map.js, the lists the syncs use) and says
   what each source does with it under the current settings, changing as they change. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { AD_FILL, GRAPH_FILL, LS_FIELDS } from '../../public/js/sync-map.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ds-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), policy: { ...(loadState(db).policy || {}), ip: true, disk: false }, intake: { lansweeper: 'direct' } });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  await p.click('#setBtn'); await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  // one row per field any sync knows
  const fields = new Set([...LS_FIELDS, ...Object.keys(GRAPH_FILL), ...Object.keys(AD_FILL)]);
  assert.equal(await p.locator('.ds-matrix tbody tr').count(), fields.size);
  const row = label => p.locator('.ds-matrix tbody tr', { has: p.locator(`th:text-is("${label}")`) });
  assert.equal((await row('IP address').locator('td').nth(0).textContent()).trim(), 'Writes');
  assert.equal((await row('Disks').locator('td').nth(0).textContent()).trim(), 'Shown only');
  assert.equal((await row('Description').locator('td').nth(0).textContent()).trim(), '—', 'Lansweeper does not know it');
  assert.match(await p.textContent('.ds-cards'), /Lansweeper[\s\S]*New devices go straight into the inventory/);
  assert.match(await p.textContent('#setSources'), /LAPS passwords and BitLocker recovery keys are never read/);
  // a setting changed on the Lansweeper tab shows here at once
  await p.click('#setTabs [data-st=feed]'); await p.waitForSelector('[data-pol=disk]');
  await p.check('[data-pol=disk]');
  await p.click('#setTabs [data-st=sources]'); await p.waitForSelector('.ds-matrix');
  assert.equal((await row('Disks').locator('td').nth(0).textContent()).trim(), 'Writes');
  assert.deepEqual(errors, []);
  console.log('data sources: all checks passed');
} finally { await browser.close(); server.close(); }
