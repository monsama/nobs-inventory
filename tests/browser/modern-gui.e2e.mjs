/* Browser test of the modern parts: the device page's key facts and tabs (arrow keys, a new device on Details), the
   filters as a drawer with Keep open, the floating bar for the selected, quick edit from a row (with Undo), a link to a
   page of Settings, and compact rows. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-modern-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, name, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: '', ovr: {}, feed: null, added: '2026-03-01T08:00:00.000Z', ...more });
saveState(db, { ...s0, locs: ['HQ / Office 1', 'HQ / Office 2'], objs: [dev('a', 'PC-A', { loc: 'HQ / Office 1', ip: '10.0.0.5', user: 'Alex Example' }), dev('b', 'PC-B')], rels: [], history: {} });

const stored = check => storedBy(() => loadState(db), check);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async (vp, url = '/') => {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + url); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  return p;
};
try {
  const p = await signIn({ width: 1400, height: 900 });
  await p.waitForSelector('#cards .lrow');

  // the device page: key facts on top, the parts as tabs; arrow keys move between them; another device opens on Details
  await p.click('#cards .lrow[data-open="a"] .card-open'); await p.waitForSelector('.obj .ofacts');
  assert.match(await p.textContent('.obj .ofacts'), /User\s*Alex Example.*Location\s*HQ \/ Office 1.*IP\s*10\.0\.0\.5.*Last seen/s);
  assert.equal(await p.getAttribute('.obj', 'data-otab'), 'details');
  assert.equal(await p.isVisible('#arOpen'), false, 'relations are on their own tab');
  await p.focus('[data-otabgo="details"]'); await p.keyboard.press('ArrowRight');
  assert.equal(await p.getAttribute('.obj', 'data-otab'), 'relations');
  assert.equal(await p.isVisible('#arOpen'), true);
  assert.equal(await p.getAttribute('[data-otabgo="relations"]', 'aria-selected'), 'true');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('b'));
  await p.waitForSelector('.obj[data-otab="details"]');

  // a link to a page of Settings opens it there, and the address follows the page
  const s = await signIn({ width: 1400, height: 900 }, '/#settings/types');
  await s.waitForSelector('#setPane [data-tsel]');
  assert.match(s.url(), /#settings\/types$/);
  await s.click('#setTabs [data-st="locations"]');
  await until(s, () => /#settings\/locations$/.test(location.hash));
  await s.click('#setClose');
  await until(s, () => !location.hash);

  // a link to a page that is not one is left alone: no Settings, no error
  const bad = await signIn({ width: 1400, height: 900 }, '/#settings/constructor');
  await bad.waitForSelector('#cards .lrow');
  assert.equal(await bad.locator('#setPane').count(), 0);

  // a smaller screen: the filters are a drawer, with the number in force on the button; Keep open docks them
  const d = await signIn({ width: 1100, height: 800 });
  await d.waitForSelector('#cards .lrow');
  assert.equal(await d.isVisible('#side'), false);
  await d.click('#sideBtn'); await d.waitForSelector('#side', { state: 'visible' });
  await d.click('#typeList [data-type="pc"]');
  await until(d, () => document.querySelector('#sideN').textContent === '1');
  // picking a filter closes the drawer, as on a phone; open it again to keep it open
  if (!(await d.isVisible('#side'))) await d.click('#sideBtn');
  await d.click('#sidePin');
  assert.equal(await d.isVisible('#side'), true, 'kept open');
  assert.equal(await d.evaluate(() => localStorage.getItem('ni-side-pin')), '1');
  await d.click('#sidePin');
  assert.equal(await d.isVisible('#side'), false, 'a drawer again');

  // the bar for the selected floats at the bottom
  await p.click('#tabsbar [data-tab=cards]').catch(() => {});
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'cards'; c.st.type = null; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('#cards .lrow');
  await p.click('#cards .lrow[data-open="a"] .cardtick');
  await p.waitForSelector('#toolbar .pickrow');
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#toolbar .pickrow')).position), 'fixed');
  await p.keyboard.press('Escape');

  // quick edit from a row: move it, with Undo
  await p.hover('#cards .lrow[data-open="a"]'); await p.click('#cards .lrow[data-open="a"] [data-qedit]');
  await p.waitForSelector('#qedit:popover-open');
  // the box opens right at the pencil (under it, or above it near the bottom of the window), inside the window
  { const [btn, bx] = await p.evaluate(() => [document.querySelector('#cards .lrow[data-open="a"] [data-qedit]').getBoundingClientRect().toJSON(), document.querySelector('#qedit').getBoundingClientRect().toJSON()]);
    assert.ok(Math.abs(bx.top - btn.bottom) <= 12 || Math.abs(bx.bottom - btn.top) <= 12, `next to the pencil: box ${Math.round(bx.top)}-${Math.round(bx.bottom)}, pencil ${Math.round(btn.top)}-${Math.round(btn.bottom)}`);
    assert.ok(Math.abs(bx.right - btn.right) <= 12 && bx.left >= 0 && bx.bottom <= await p.evaluate(() => innerHeight), 'right edge on the pencil, in the window'); }
  await p.selectOption('#qeLoc', 'HQ / Office 2');
  await stored(st => st.objs.find(o => o.id === 'a').loc === 'HQ / Office 2');
  assert.match(await p.textContent('#toast'), /PC-A: moved to hq \/ office 2/i);
  await p.click('#toast button');
  await stored(st => st.objs.find(o => o.id === 'a').loc === 'HQ / Office 1');

  // In stock on a device someone has: the take-back dialog, as on the device page
  await p.hover('#cards .lrow[data-open="a"]'); await p.click('#cards .lrow[data-open="a"] [data-qedit]');
  await p.waitForSelector('#qedit:popover-open');
  await p.selectOption('#qeStatus', 'stock');
  await p.waitForSelector('#mdl');
  assert.match(await p.textContent('#mdl'), /Take back PC-A/);
  await p.keyboard.press('Escape');

  // compact rows from the account menu, kept in this browser
  const h = await p.evaluate(() => document.querySelector('#cards .lrow').getBoundingClientRect().height);
  await p.click('#barMoreBtn'); await p.click('#denseBtn');
  await until(p, () => document.body.classList.contains('dense'));
  assert.ok(await p.evaluate(() => document.querySelector('#cards .lrow').getBoundingClientRect().height) < h, 'rows are lower');

  assert.deepEqual(errors, [], 'page errors');
  console.log('modern gui: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
