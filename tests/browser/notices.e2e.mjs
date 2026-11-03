/* The bell: a count of what needs attention, red when a problem is among it; the list leads to the device, and a notice
   hidden stays hidden in this browser until it changes. A viewer limited to a site sees only that site's notices and
   none about backups. On a phone the bell is in More, which shows a dot. And a saved view sent by mail from its Edit
   dialog: off without a mail server, Send now with one, its last send shown. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb, writeDoc } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until, storedBy } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-notices-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
{
  const s = loadState(db);
  const o = id => s.objs.find(x => x.id === id);
  o('o2').warranty = '2020-01-31';                                    /* Zürich: ended (red) */
  o('o3').reported = { at: '2026-10-30T08:00:00Z', by: 'Anna', text: 'Fan is loud' };
  s.objs.push({ id: 'o9', code: 'INV-0009', type: 'pc', name: 'BE-PC-0009', status: 'active', feed: null, ovr: {}, loc: 'Bern / EG', reported: { at: '2026-10-29T08:00:00Z', by: 'Ben', text: 'No network' } });
  s.locs.push('Bern / EG');
  s.users.push({ id: 'u-vera', login: 'vera', name: 'Vera Viewer', role: 'viewer', active: true, source: 'manual', sites: ['Bern'] });
  s.savedViews = [{ id: 'v1', name: 'All PCs', tab: 'table', filters: { type: 'pc' } }];
  saveState(db, s);
  writeDoc(db, 'setting', 'restoreTest', { at: '2026-11-01T03:30:00Z', ok: false, error: 'The backup could not be opened' });
}
const sent = [];
const server = await new Promise(r => { const s = createApp({ db, mailTransport: { sendMail: async m => { sent.push(m); } } }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const open = async (login, pw, viewport = { width: 1300, height: 900 }) => {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', login); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  return p;
};
const badge = p => p.evaluate(() => { const b = document.querySelector('#bellN'); return b.hidden ? '' : `${b.textContent} ${b.className.replace('bell-n', '').trim()}`; });
const items = p => p.evaluate(() => [...document.querySelectorAll('#bellPop [data-bell]')].map(b => b.dataset.bell));
try {
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'adminpass123' }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.equal((await fetch(base + '/api/users/u-vera/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ password: 'blue-river-1234' }) })).status, 200);

  /* The admin: four notices, a red count. */
  const a = await open('admin', 'adminpass123');
  await until(a, () => !document.querySelector('#bellN').hidden);
  assert.equal(await badge(a), '4 bad');
  await a.click('#bellBtn');
  await a.waitForSelector('#bellPop:popover-open');
  assert.deepEqual(await items(a), ['warranty-ended', 'restore-test', 'reported-o9', 'reported-o3'], 'red first, then the oldest problem');
  assert.equal(await a.locator('#bellPop .bell-item.bad').count(), 2);
  /* A search redraws the page but does not work the notices out again. */
  const before = await a.evaluate(() => document.querySelector('#bellPop .bell-list').outerHTML);
  await a.keyboard.press('Escape');
  await a.fill('#search', 'ZH'); await a.fill('#search', '');
  assert.equal(await a.evaluate(() => document.querySelector('#bellPop .bell-list').outerHTML), before);

  /* Hidden until it changes: gone from the count, kept after a reload, back once the problem is reported again. */
  await a.click('#bellBtn');
  await a.click('#bellPop [data-bellhide="reported-o9"]');
  assert.equal(await badge(a), '3 bad');
  assert.ok(await a.isVisible('#bellPop:popover-open'), 'the list stays open');
  await a.waitForSelector('#bellPop [data-bellall]:has-text("Show 1 hidden")');
  await a.reload(); await until(a, async () => (await import('/js/01-core.js')).objs.length > 0);
  await until(a, () => !document.querySelector('#bellN').hidden);
  assert.equal(await badge(a), '3 bad');
  { const s = loadState(db); s.objs.find(x => x.id === 'o9').reported = { at: '2026-11-02T09:00:00Z', by: 'Ben', text: 'No network again' }; saveState(db, s); }
  await a.evaluate(async () => (await import('/js/07-render.js')).reloadFromServer());
  await until(a, () => document.querySelector('#bellN').textContent === '4');

  /* A notice leads to its device. */
  await a.click('#bellBtn');
  await a.click('#bellPop [data-bell="reported-o3"]');
  await until(a, async () => (await import('/js/01-core.js')).st.tab === 'o3');
  assert.equal(await a.isVisible('#bellPop:popover-open'), false);

  /* The saved view's Edit dialog: no mail server, so mail is off. */
  await a.hover('#viewList .svrow'); await a.click('#viewList [data-svren]');
  await a.waitForSelector('#svMailNote:has-text("No mail server")');
  assert.equal(await a.isDisabled('#svSend'), true);
  await a.click('#svCancel');

  /* The viewer of Bern: only Bern's problem, nothing about backups. */
  const v = await open('vera', 'blue-river-1234');
  await until(v, () => !document.querySelector('#bellN').hidden);
  assert.equal(await badge(v), '1 warn');
  await v.click('#bellBtn');
  assert.deepEqual(await items(v), ['reported-o9']);

  /* A phone: the bell is in More, which shows a dot. */
  const ph = await open('admin', 'adminpass123', { width: 390, height: 800 });
  await until(ph, () => document.querySelector('#barMoreBtn').classList.contains('has-n'));
  assert.ok(await ph.evaluate(() => document.querySelector('#barMoreBtn').classList.contains('bad')));
  await ph.click('#barMoreBtn');
  await ph.click('#bellBtn');
  await ph.waitForSelector('#bellPop:popover-open');
  assert.ok((await items(ph)).length >= 3);
  const box = await ph.locator('#bellPop').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, `the list fits the phone: ${JSON.stringify(box)}`);
  await ph.click('#bellPop [data-bell="warranty-ended"]');
  await until(ph, async () => (await import('/js/01-core.js')).st.tab === 'o2');
  assert.equal(await ph.isVisible('#barMore:popover-open'), false, 'More closes too');

  /* With a mail server: weekly to an address, sent now; the last send is shown, the schedule saved. */
  process.env.NI_SMTP_HOST = 'mail.example';
  await a.hover('#viewList .svrow'); await a.click('#viewList [data-svren]');
  await until(a, () => !document.querySelector('#svSend').disabled);
  await a.selectOption('#svEvery', 'weekly'); await a.selectOption('#svDay', '5'); await a.selectOption('#svHour', '6');
  await a.fill('#svTo', 'not an address');
  await a.click('#svOk');
  await a.waitForSelector('#toast:has-text("not an e-mail address")');
  await a.fill('#svTo', 'it@example.com');
  await a.click('#svSend');
  await a.waitForSelector('#svLast:has-text("Last sent")');
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'it@example.com');
  assert.match(sent[0].subject, /All PCs \(\d+ devices\)/);
  await storedBy(() => loadState(db), s => JSON.stringify(s.savedViews[0].mail) === JSON.stringify({ every: 'weekly', hour: 6, to: ['it@example.com'], day: 5 }));
  await a.click('#svOk');
  await a.waitForSelector('#viewList .svrow .sv-mail-i');
  assert.match(await a.getAttribute('#viewList [data-savedview]', 'title'), /Sent by mail every Friday at 06:00; last sent/);
  delete process.env.NI_SMTP_HOST;

  assert.deepEqual(errors, []);
  console.log('notices: bell, hide until changed, viewer scope, phone, view by mail');
} finally {
  await browser.close(); server.close(); db.close();
}
