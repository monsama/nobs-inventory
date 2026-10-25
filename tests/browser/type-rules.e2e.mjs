/* Browser test of the type rules in Settings → Feed: the shipped list is shown, a change makes it the inventory's own,
   Back to the defaults returns to the shipped one, and Apply to existing devices previews, then changes only the ticked
   devices. Notebooks and cameras get their own types. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { DEFAULT_TYPE_RULES } from '../../public/js/type-rules.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rules-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, name, type, model, assetType) => ({ id, code: 'INV-' + id, name, type, model, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: id, assetType } });
const s0 = loadState(db);
saveState(db, { ...s0, useLansweeper: true, lsSource: 'push', objs: [
  dev('o1', 'NB-1', 'pc', 'Lenovo ThinkPad T14', 'Windows'),
  dev('o2', 'CAM-1', 'other', 'Hikvision DS-2CD2643G1-IZS', 'Network device'),
  dev('o3', 'NB-2', 'pc', 'HP EliteBook 840', 'Windows'),
], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
const saved = async () => { await page.evaluate(async () => (await import('/js/07-render-plans.js')).flushSave()); return loadState(db).typeRules; };
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  await page.click('#setBtn'); await page.click('#setTabs [data-st=feed]');
  await page.waitForSelector('.trules');
  assert.equal(await page.locator('.trules tbody tr').count(), DEFAULT_TYPE_RULES.length, 'the shipped rules are shown');
  assert.match(await page.textContent('#setTypeRules .hdr'), /as shipped/);
  if (shots) await page.locator('#setTypeRules').screenshot({ path: path.join(shots, 'type-rules.png') });

  // a change makes the list the inventory's own; back to the defaults returns to the shipped one
  await page.uncheck('[data-tron="0"]');
  await page.waitForSelector('#trReset');
  assert.match(await page.textContent('#setTypeRules .hdr'), /changed/);
  assert.equal((await saved())[0].on, false);
  await page.click('#trAdd');
  assert.equal(await page.locator('.trules tbody tr').count(), DEFAULT_TYPE_RULES.length + 1);
  await page.fill('[data-trw="0"]', 'thinkpad'); await page.locator('[data-trw="0"]').press('Tab');
  await page.selectOption('[data-trt="0"]', 'notebook');
  assert.deepEqual((await saved())[0], { field: 'model', words: 'thinkpad', to: 'notebook', on: true });
  await page.click('#trReset');
  await page.waitForFunction(() => !document.querySelector('#trReset'));
  assert.equal((await saved()) ?? null, null, 'back to the shipped rules');

  // apply to existing devices: a preview; untick one; only the ticked ones change
  await page.click('#trApply');
  await page.waitForSelector('[data-rt]');
  assert.deepEqual(await page.locator('[data-rt]').evaluateAll(b => b.map(x => x.dataset.rt)), ['o1', 'o2', 'o3']);
  if (shots) await page.locator('#mdl .box').screenshot({ path: path.join(shots, 'type-rules-apply.png') });
  await page.uncheck('[data-rt="o3"]');
  assert.match(await page.textContent('#rtOk'), /Change 2 devices/);
  await page.click('#rtOk');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('o1').type === 'notebook');
  const after = loadState(db).objs;
  assert.deepEqual(after.map(o => o.type), ['notebook', 'camera', 'pc']);
  assert.ok(await page.evaluate(async () => (await import('/js/01-core.js')).TYPES.camera.label === 'Camera / Recorder'));
  assert.deepEqual(errors, [], 'no page errors');
  console.log('type rules: all checks passed');
} finally { await browser.close(); server.close(); }
