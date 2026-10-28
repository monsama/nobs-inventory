/* Browser test of the AD · Entra · Intune marks on the cards, and of fixes from the 0.9.28 review: amounts as people
   type them, a column drop that is not a column, keyboard sorting, the type a rule still names, and the toast read out. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cardjoin-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const nb = (i, name, extra) => ({ id: 'o' + i, code: 'INV-000' + i, type: 'notebook', name, status: 'active', model: 'Latitude 5440', ip: '10.0.0.' + i, ovr: {}, feed: null, ...extra });
saveState(db, { ...s0,
  types: { dect: { label: 'DECT', short: 'DECT', color: '#5a6b7d', icon: 'other' } },
  typeRules: [{ field: 'model', words: 'dect', to: 'dect', on: true }],
  objs: [
    nb(1, 'NB-HYBRID', { inAd: true, graph: { join: 'Hybrid joined', managed: 'Intune', compliance: 'compliant' } }),
    nb(2, 'NB-CLOUD', { graph: { join: 'Entra joined', managed: 'Intune', compliance: 'noncompliant' } }),
    nb(3, 'NB-ADONLY', { inAd: true }),
    nb(4, 'NB-NOTHING', {}),
    { id: 'o5', code: 'INV-0005', type: 'printer', name: 'PRN-1', status: 'active', model: 'HP', ovr: {}, feed: null },
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');

  // on by default: the computers get the three marks and the printer none; unticked they go, and the choice is kept
  assert.ok(await page.isChecked('#cardJoin'));
  assert.equal(await page.locator('.card .jbar').count(), 4);
  await page.uncheck('#cardJoin');
  assert.equal(await page.locator('.card .jbar').count(), 0);
  await page.reload(); await page.waitForSelector('.card');
  assert.equal(await page.isChecked('#cardJoin'), false, 'turned off is kept');
  // without Microsoft Graph set up, what Graph said before is not shown: only AD
  await page.check('#cardJoin');
  assert.deepEqual(await page.locator('.card:has(.nm:text-is("NB-CLOUD")) .jb small').allTextContents(), ['not joined', 'not checked', 'not checked'], 'without Graph, Entra and Intune are not known');
  await page.evaluate(async () => { (await import('/js/01-core.js')).SYNC.graph = true; (await import('/js/07-render-plans.js')).render(); });
  assert.equal(await page.locator('.jbar').count(), 4);
  const marks = name => page.locator(`.card:has(.nm:text-is("${name}")) .jb`).evaluateAll(els => els.map(e => e.className.replace('jb ', '') + ':' + e.querySelector('small').textContent));
  assert.deepEqual(await marks('NB-HYBRID'), ['on ad:hybrid', 'on hy:hybrid', 'on ok:compliant']);
  assert.deepEqual(await marks('NB-CLOUD'), ['no:not joined', 'on en:joined', 'on bad:not compliant']);
  assert.deepEqual(await marks('NB-ADONLY'), ['on ad:joined', 'no:not joined', 'no:not managed']);
  assert.match(await page.getAttribute('.card:has(.nm:text-is("NB-CLOUD")) .jbar', 'aria-label'), /Entra ID \(Azure AD\): Entra joined.*Intune: managed, not compliant/);
  // the device page shows the same marks in its properties
  await page.click('.card:has(.nm:text-is("NB-CLOUD"))');
  await page.waitForSelector('.jbar-page');
  assert.deepEqual(await page.locator('.jbar-page .jb small').allTextContents(), ['not joined', 'joined', 'not compliant']);
  await page.evaluate(async () => { const c = await import('/js/01-core.js'); (await import('/js/02-views.js')).closeObjTab(c.objs.find(o => o.name === 'NB-CLOUD').id); });
  await page.waitForSelector('.card');
  // the choice is kept in this browser
  await page.reload(); await page.waitForSelector('.card');
  assert.ok(await page.isChecked('#cardJoin'), 'the choice is kept');

  // amounts as people type them
  const nums = await page.evaluate(async () => { const { num } = await import('/js/09-costs.js'); return ['1,200', "1'200.50", '1.200,50', '1,200.50', '12,5', '99.9', ''].map(num); });
  assert.deepEqual(nums, [1200, 1200.5, 1200.5, 1200.5, 12.5, 99.9, undefined]);
  assert.equal(await page.evaluate(async () => (await import('/js/09-costs.js')).num('0,500')), 0.5, 'a leading 0 is a decimal comma');

  // the table: a drop that is not a column changes nothing; a header sorts from the keyboard
  await page.click('[data-tab=table]'); await page.waitForSelector('table.grid th');
  const heads = async () => page.locator('table.grid thead th').allTextContents();
  const before = await heads();
  await page.evaluate(() => { const th = document.querySelectorAll('table.grid thead th')[2]; const dt = new DataTransfer(); dt.setData('text/plain', 'cards'); th.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
  assert.deepEqual(await heads(), before, 'a dropped tab is not taken for a column');
  const nameTh = page.locator('table.grid thead th', { hasText: 'Name' }).first();
  await nameTh.focus(); await page.keyboard.press('Enter');
  const first = await page.locator('table.grid tbody tr').first().getAttribute('data-open');
  await nameTh.focus(); await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('table.grid tbody tr').first().getAttribute('data-open'), first, 'Enter on a header sorts the other way');

  // a type a type rule still names is not deleted
  await page.evaluate(async () => { (await import('/js/01-core.js')).st.setTab = 'types'; (await import('/js/04-settings.js')).openSettings(); });
  await page.waitForSelector('[data-td="dect"]');
  await page.click('[data-td="dect"]');
  assert.match(await page.textContent('#toast'), /used by type rule 1/);
  assert.equal(await page.getAttribute('#toast', 'role'), 'status');
  assert.ok(await page.evaluate(async () => !!(await import('/js/01-core.js')).TYPES.dect), 'the type is still there');

  // a name typed by hand stays that person, even when another person has it as login
  const who = await page.evaluate(async () => {
    const m = await import('/js/04-settings.js');
    m.USERS.push({ id: 'ua', login: '', name: 'Anna', role: 'viewer', source: 'manual', active: true }, { id: 'um', login: 'anna', name: 'Anna Muster', role: 'viewer', source: 'lansweeper', active: true });
    return [m.ensureUser('Anna').id, m.ensureUser('ANNA').id];
  });
  assert.deepEqual(who, ['ua', 'um']);

  assert.deepEqual(errors, []);
  console.log('card join: all checks passed');
} finally { await browser.close(); server.close(); }
