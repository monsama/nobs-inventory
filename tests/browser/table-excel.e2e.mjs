/* Browser test of the Table's Export menu: Excel of the columns shown, as the table shows them (order and filter), for
   an admin and for a viewer; the CSV choices stay. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { setPassword } from '../../server/auth.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-xlsx-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0,
  users: [...s0.users, { id: 'u-viewer', login: 'viewer', name: 'Viewer', dept: '', groups: [], source: 'manual', active: true, role: 'viewer' }],
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-ALPHA', model: 'Example Desk 5', serial: 'SN-A1', status: 'active', loc: '', ovr: {}, feed: null },
    { id: 'o2', code: 'INV-0002', type: 'pc', name: 'PC-BRAVO', model: '=SUM(1,2)', serial: 'SN-B2', status: 'active', loc: '', ovr: {}, feed: null },
    { id: 'o3', code: 'INV-0003', type: 'monitor', name: 'MON-CHARLIE', serial: 'SN-C3', status: 'stock', loc: '', ovr: {}, feed: null },
  ], rels: [], history: {} });
setPassword(db, 'u-viewer', 'viewerpass123');

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
/* The Table filtered to PCs; Export → Excel; the workbook's text (stored, not compressed, so it can be read as it is). */
async function excelAs(login, pw) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', login); await page.fill('#lgPw', pw); await page.click('#lgOk');
  await page.waitForSelector('#setBtn');
  await page.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'table'; c.st.type = 'pc'; (await import('/js/07-render.js')).render(); });
  await page.waitForSelector('#xlsxShown', { state: 'attached' });
  assert.equal(await page.locator('#csvShown').count(), 1, 'CSV of the columns shown stays');
  assert.equal(await page.locator('#csvBtn').count(), 1, 'CSV of all fields stays');
  const heads = await page.$$eval('table.grid thead th[data-ck]', ths => ths.map(t => t.textContent.trim()).filter(Boolean));
  await page.click('#csvMenu .menu-btn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#xlsxShown')]);
  assert.match(dl.suggestedFilename(), /^inventory-pc-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const file = fs.readFileSync(await dl.path()).toString('latin1');
  await ctx.close();
  return { file, heads };
}
try {
  for (const [login, pw] of [['admin', 'adminpass123'], ['viewer', 'viewerpass123']]) {
    const { file, heads } = await excelAs(login, pw);
    assert.equal(file.slice(0, 2), 'PK', 'an Excel workbook');
    assert.ok(file.includes('PC-ALPHA') && file.includes('PC-BRAVO'), `${login}: the rows shown`);
    assert.ok(!file.includes('MON-CHARLIE'), `${login}: only the rows the filter shows`);
    for (const h of heads.slice(0, 4)) assert.ok(file.includes(h.replace(/&/g, '&amp;')), `${login}: the heading ${h}`);
    assert.ok(!/<f>SUM/.test(file), `${login}: a value starting with = is text, not a formula`);
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('table excel: all checks passed');
} finally { await browser.close(); server.close(); }
