/* Saved views: an admin saves the Table's filters, search, columns, column filter and sort under a name; the sidebar's
   Views shows it, and one click brings it all back after everything was changed. Rename and delete; a viewer sees
   and opens the views but cannot save, rename or delete them. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until, storedBy } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-views-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
{ const s = loadState(db); saveState(db, { ...s, users: [...s.users, { id: 'u-vera', login: 'vera', name: 'Vera Viewer', role: 'viewer', active: true, source: 'manual' }] }); }
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async (login, pw) => {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', login); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  return p;
};
const rows = p => p.evaluate(() => [...document.querySelectorAll('#view tbody tr')].map(r => r.querySelector('.rowopen').textContent));
const heads = p => p.evaluate(() => [...document.querySelectorAll('#view thead tr:first-child th')].map(th => th.textContent.trim()).filter(Boolean));
const page = p => p.evaluate(async () => { const { st } = await import('/js/01-core.js'); return { tab: st.tab, type: st.type, q: st.q, status: st.status }; });
try {
  /* A password for the viewer, set by the admin. */
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'adminpass123' }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.equal((await fetch(base + '/api/users/u-vera/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ password: 'blue-river-1234' }) })).status, 200);

  const a = await signIn('admin', 'adminpass123');
  assert.equal(await a.isHidden('#viewHdr'), true, 'Views shows while there are none');
  await a.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'table'; (await import('/js/07-render.js')).render(); });
  await a.waitForSelector('#svSave');
  /* The Network columns, PCs only, a search, a filter under Location and the sort by Name, downwards. */
  await a.click('#colMenu > .menu-btn'); await a.click('[data-colpreset="network"]');
  await a.click('#typeList [data-type="pc"]');
  await a.fill('#search', 'ZH'); await a.waitForSelector('#fbar [data-fx=q]');
  await a.fill('thead tr.fr input[aria-label="Filter Location"]', 'Büro');
  await a.dispatchEvent('thead tr.fr input[aria-label="Filter Location"]', 'input');
  await a.click('#view thead th:has-text("Name")'); await a.click('#view thead th:has-text("Name")');
  await until(a, () => [...document.querySelectorAll('#view tbody .rowopen')].map(x => x.textContent).join() === 'ZH-PC-0142,ZH-NB-0201');
  const want = { rows: await rows(a), heads: await heads(a) };
  assert.deepEqual(want.heads, ['Name', 'Type', 'IP', 'MAC', 'Location', 'Connected to', 'Status', 'Last seen']);

  await a.click('#svSave'); await a.fill('#svName', 'Office PCs'); await a.click('#svOk');
  await a.waitForSelector('#viewList .item.sel:has-text("Office PCs")');
  await storedBy(() => loadState(db), s => s.savedViews.length === 1 && s.savedViews[0].name === 'Office PCs');
  const saved = loadState(db).savedViews[0];
  assert.deepEqual([saved.tab, saved.q, saved.filters, saved.sort, saved.colFilters], ['table', 'ZH', { type: 'pc' }, { col: 'name', dir: -1 }, { loc: 'Büro' }]);
  assert.deepEqual(saved.cols, ['name', 'type', 'ip', 'mac', 'loc', 'conn', 'status', 'seen'], 'the columns in the order shown');

  /* Everything changed: filters cleared, other columns, the Cards. */
  await a.click('#clearF');
  await a.click('#colMenu > .menu-btn'); await a.click('[data-colpreset="basic"]');
  await a.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'cards'; (await import('/js/07-render.js')).render(); });
  await a.waitForSelector('#viewList .item:not(.sel):has-text("Office PCs")');
  /* One click brings the view back. */
  await a.click('#viewList [data-savedview]');
  await a.waitForSelector('#view thead');
  assert.deepEqual(await page(a), { tab: 'table', type: 'pc', q: 'ZH', status: null });
  await until(a, w => [...document.querySelectorAll('#view tbody .rowopen')].map(x => x.textContent).join() === w, want.rows.join());
  assert.deepEqual(await heads(a), want.heads);
  assert.equal(await a.inputValue('thead tr.fr input[aria-label="Filter Location"]'), 'Büro');
  assert.equal(await a.inputValue('#search'), 'ZH');
  await a.waitForSelector('#viewList .item.sel:has-text("Office PCs")');

  /* A second view from the Cards; then rename the first and delete the second. */
  await a.click('#clearF');
  await a.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'cards'; (await import('/js/07-render.js')).render(); });
  await a.click('#statList [data-status="stock"]');
  await a.click('#svSave'); await a.fill('#svName', 'In stock'); await a.press('#svName', 'Enter');
  await a.waitForSelector('#viewList .item.sel:has-text("In stock")');
  /* Saving under the name of another view says so first; Save again replaces it, and Undo gives it back. */
  const office = () => JSON.stringify(loadState(db).savedViews.find(x => x.name === 'Office PCs'));
  const before = office();
  await a.click('#svSave'); await a.fill('#svName', 'office pcs'); await a.click('#svOk');
  await a.waitForSelector('#svTwin:has-text("already called “Office PCs”")');
  assert.equal(office(), before, 'replaced without asking');
  await a.click('#svOk');
  await a.waitForSelector('#toast:has-text("replaced")');
  await storedBy(() => loadState(db), t => !t.savedViews.some(x => x.name === 'Office PCs'));
  await a.click('#toast .t-undo');
  await storedBy(() => loadState(db), () => office() === before);
  await a.hover('#viewList .svrow:has-text("Office PCs")'); await a.click('#viewList [data-svren]');
  await a.fill('#svName', 'in stock'); await a.click('#svOk');
  await a.waitForSelector('#toast:has-text("already called")');
  await a.fill('#svName', 'PCs at the office'); await a.click('#svOk');
  await a.waitForSelector('#viewList .item:has-text("PCs at the office")');
  await a.hover('#viewList .svrow:has-text("In stock")'); await a.click('#viewList .svrow:has-text("In stock") [data-svdel]'); await a.click('#cfOk');
  await storedBy(() => loadState(db), s => s.savedViews.map(v => v.name).join() === 'PCs at the office');

  /* A viewer: sees the views and opens them, but has no Save view, Rename or Delete. */
  const v = await signIn('vera', 'blue-river-1234');
  await v.waitForSelector('#viewList .item:has-text("PCs at the office")');
  assert.equal(await v.locator('#viewList [data-svren], #viewList [data-svdel]').count(), 0, 'a viewer can rename or delete a view');
  assert.equal(await v.locator('#svSave').count(), 0, 'a viewer can save a view');
  await v.click('#viewList [data-savedview]');
  await v.waitForSelector('#view thead');
  assert.deepEqual(await page(v), { tab: 'table', type: 'pc', q: 'ZH', status: null });
  await until(v, w => [...document.querySelectorAll('#view tbody .rowopen')].map(x => x.textContent).join() === w, want.rows.join());
  assert.equal(await v.locator('#svSave').count(), 0);

  assert.deepEqual(errors, [], 'page errors');
  console.log('saved views: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
