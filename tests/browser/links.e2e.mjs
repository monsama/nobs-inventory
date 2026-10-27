/* Browser test of links on a device: quick add of the web interface from its address, a share added by hand, a link
   that could run in the page refused, removing one, and the history lines. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-links-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), objs: [{ id: 'o1', code: 'INV-0001', type: 'storage', name: 'NAS-01', status: 'active', ip: '10.0.0.5', ovr: {}, feed: null }], rels: [], history: {} });
const stored = async (check, ms = 8000) => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > ms) throw new Error('not saved in time'); await new Promise(r => setTimeout(r, 100)); } };

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('o1'));
  await page.waitForSelector('[data-lnkquick]');

  await page.click('[data-lnkquick="https://10.0.0.5"]');
  await stored(st => (st.objs[0].urls || []).length === 1);
  assert.deepEqual(loadState(db).objs[0].urls, [{ url: 'https://10.0.0.5', label: 'Web interface' }]);
  assert.equal(await page.getAttribute('.lnkrow a.lnk', 'target'), '_blank');

  await page.fill('#lnkLabel', 'Scans'); await page.fill('#lnkUrl', '\\\\nas01\\scans'); await page.click('#lnkAdd');
  await stored(st => (st.objs[0].urls || []).length === 2);
  assert.equal(await page.getAttribute('.lnkrow:has-text("Scans") a.lnk', 'href'), 'file://nas01/scans');

  await page.fill('#lnkUrl', 'javascript:alert(1)'); await page.click('#lnkAdd');
  assert.match(await page.textContent('#toast'), /not allowed/);
  if (shots) await page.locator('.panelbox:has(.lnkrow)').screenshot({ path: path.join(shots, 'links.png') });

  await page.click('.lnkrow:has-text("Web interface") [data-lnkdel]');
  await stored(st => (st.objs[0].urls || []).length === 1);
  assert.match(loadState(db).history.o1.map(h => h.msg).join('\n'), /Link added: Web interface[\s\S]*Link removed: Web interface|Link removed: Web interface[\s\S]*Link added: Web interface/);

  assert.deepEqual(errors, []);
  console.log('links: all checks passed');
} finally { await browser.close(); server.close(); }
