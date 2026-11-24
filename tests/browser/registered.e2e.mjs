/* Browser test: devices only registered in Entra (most often personal ones) are kept out of the device types and listed
   on their own under the types in the sidebar, and on the Overview's Devices by type. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-reg-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: '', ovr: {}, ...more });
saveState(db, { ...loadState(db), objs: [
  dev('a', { inAd: true }), dev('b', { graph: { join: 'AzureAd' } }),
  dev('own', { name: 'MY-LAPTOP', graph: { join: 'Registered' } }), dev('ph', { type: 'mobile', name: 'PHONE-1', graph: { join: 'Registered' } }),
], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');
  const cnt = sel => p.textContent(`#typeList ${sel} .cnt`);

  // Notebooks count only the company's two; the registered ones sit on their own row, the phone's type is folded away
  assert.equal(await cnt('[data-type="notebook"]'), '2');
  assert.equal(await p.locator('#typeList [data-type="mobile"]').count(), 0);
  assert.equal(await cnt('[data-type="registered"]'), '2');
  assert.equal(await cnt('[data-type=""]'), '4');
  if (process.env.SHOT) await p.locator('#typeList').screenshot({ path: process.env.SHOT.replace('.png', '-side.png') });

  // picking Notebooks leaves the registered one out; picking Entra registered shows just those
  await p.click('#typeList [data-type="notebook"]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  assert.doesNotMatch(await p.textContent('#cards'), /MY-LAPTOP/);
  await p.click('#typeList [data-type="registered"]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  assert.match(await p.textContent('#cards'), /MY-LAPTOP/); assert.match(await p.textContent('#cards'), /PHONE-1/);
  assert.match(await p.textContent('#fbar'), /Entra registered/);

  // the Overview counts them apart too, and its bar opens the same list
  await p.evaluate(async () => { const m = await import('/js/01-core.js'); m.st.tab = 'overview'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('[data-ovt="registered"]', { state: 'attached' });
  await p.evaluate(() => document.querySelectorAll('#view details').forEach(d => { d.open = true; }));
  if (process.env.SHOT) await p.locator('[data-ovt]').first().locator('xpath=ancestor::div[contains(@class,"panelbox")]').screenshot({ path: process.env.SHOT });
  assert.match(await p.textContent('[data-ovt="registered"]'), /Entra registered/);
  await p.click('[data-ovt="registered"]');
  await until(p, () => document.querySelectorAll('#cards .lrow').length === 2);
  assert.deepEqual(errors, []);
  console.log('registered: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
