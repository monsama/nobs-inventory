/* Walks through the main features against a server that holds the sample inventory, and fails on any page
   error: every object page, every view and Settings tab, duplicating an object, CSV parsing; then a new
   object is kept after a reload and a user is added. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-flows-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const watch = async (p) => { p.on('pageerror', e => errors.push(e.message)); return p; };
const signIn = async (p) => { await p.goto(base + '/'); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); }); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await watch(await ctx.newPage());
  await signIn(p);
  const ids = await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.map(o => o.id)); });
  for (const id of ids) await p.evaluate(async id => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render.js')]); __mods[0].st.open = [id]; __mods[0].st.tab = id; __mods[1].render(); }, id);
  for (const t of ['cards', 'table', 'map', 'net', 'rack', 'sw']) await p.evaluate(async t => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render.js')]); __mods[0].st.tab = t; __mods[1].render(); }, t);
  for (const tab of ['feed', 'locations', 'types', 'users', 'maintenance', 'log', 'about']) await p.evaluate(async tab => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/04-settings.js')]); __mods[0].st.setTab = tab; __mods[1].openSettings(); }, tab);
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/19-modal.js')]); __mods[0].closeModal(); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/05-new-object.js')]); const o = __mods[0].byName('ZH-PC-0142'); __mods[1].newObjModal({copy: o}); __mods[0].$('#nName').value = 'COPY-CHECK'; __mods[0].$('#nOk').click(); });
  assert.ok(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (!!__mods[0].byName('COPY-CHECK')); }), 'duplicating an object did not create it');
  // Sites and rooms: a site is added on its own, a room is added under a site, and the sidebar shows both.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=locations]');
  await p.fill('#nsName', 'Basel / X'); await p.click('#nsAdd');
  assert.match(await p.textContent('#nsMsg'), /without a slash/, 'a slash in a site name is not refused');
  await p.fill('#nsName', 'Basel'); await p.press('#nsName', 'Enter');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].SITES.includes('Basel')); }), true, 'Enter did not add the site');
  await p.selectOption('#nlSite', 'Basel'); await p.fill('#nlRoom', 'Lager'); await p.click('#nlAdd');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].LOCS.includes('Basel / Lager')); }), true, 'the room was not added under the site');
  await p.click('#setClose');
  assert.ok((await p.textContent('#locList')).includes('Basel'), 'the sidebar does not show the site');
  // Addresses: a bad IP is refused with the reason and nothing is saved; corrected values are saved in the form they are kept in.
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/02-views.js'), import('/js/01-core.js')]); return (__mods[0].openObj(__mods[1].byName('SRV-ZH-HV01').id)); });
  const sid = await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').id); });
  await p.fill(`#f_${sid}_ip`, '10.10.0.300'); await p.click('#saveBtn');
  await p.waitForFunction(() => /not an IPv4 address/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').ip); }), undefined, 'a bad IP was saved');
  await p.fill(`#f_${sid}_ip`, '10.10.0.20'); await p.fill(`#f_${sid}_ip6`, '2001:DB8::20'); await p.fill(`#f_${sid}_mac`, 'AA-BB-CC-DD-EE-FF');
  await p.click('#saveBtn');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').ip === '10.10.0.20'); }, null, { timeout: 5000 });
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').ip6); }), '2001:db8::20', 'the IPv6 address was not saved in lower case');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').mac); }), 'aa:bb:cc:dd:ee:ff', 'the MAC address was not stored with colons');
  // Feed: the Lansweeper address is kept after a reload; Sync now waits for a token on the server.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=feed]');
  await p.selectOption('#lsSource', 'api');
  await p.fill('#ls_endpoint', 'https://lansweeper.example.ch/api/v2/graphql'); await p.press('#ls_endpoint', 'Tab');
  // wait until the server holds the change (the page saves in the background)
  await until(p, async () => (await (await fetch('api/state', { credentials: 'same-origin' })).json()).lansweeper?.endpoint === 'https://lansweeper.example.ch/api/v2/graphql', null, { timeout: 10000, polling: 200 });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render.js')]); return (__mods[0].reloadFromServer()); });
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].st.lansweeper.endpoint); }), 'https://lansweeper.example.ch/api/v2/graphql', 'the Lansweeper address was not kept');
  assert.equal(await p.isDisabled('#lsSync'), true, 'Sync now is on without a token');
  await p.click('#setClose');
  // Object types: adding a custom type keeps the built-in ones after a reload from the server.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=types]');
  await p.fill('#ntName', 'Note'); await p.click('#ntAdd');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (Object.values(__mods[0].TYPES).some(t => t.label === 'Note')); }, null, { timeout: 5000 });
  await until(p, async () => Object.values((await (await fetch('api/state', { credentials: 'same-origin' })).json()).types).some(t => t.label === 'Note'), null, { timeout: 10000, polling: 200 });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render.js')]); return (__mods[0].reloadFromServer()); });
  const types = await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (Object.keys(__mods[0].TYPES)); });
  assert.ok(types.includes('pc') && types.includes('switch'), 'the built-in types are gone after a reload: ' + types.join(','));
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/19-modal.js')]); return (__mods[0].closeModal()); });
  await p.click('#setBtn'); await p.click('#setTabs [data-st=types]');
  await p.click('.icondd-btn[aria-label$="icon for PC"]');
  if (!(await p.isVisible('.icondd-list:not([hidden]) .icondd-up'))) throw new Error('the icon dropdown does not open');
  await p.click('.icondd-item[data-ic=pc][data-icon=server]');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].TYPES.pc.icon); }), 'server', 'the icon was not chosen');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await p.click('.icondd-btn[aria-label$="icon for PC"]'); await p.click('.icondd-item[data-ic=pc][data-icon=pc]');
  await p.click('#setClose');
  assert.deepEqual(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/02-views.js')]); return (__mods[0].parseCsv('Name,Type\nX1,pc')); }), [['Name', 'Type'], ['X1', 'pc']], 'CSV parsing');
  await ctx.close();

  // The Users table has room for its columns, so the Password button is not cut off.
  const ctxU = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const u = await watch(await ctxU.newPage());
  await signIn(u);
  await u.click('#setBtn'); await u.click('#setTabs [data-st=users]');
  const box = await u.locator('#setUsers table').boundingBox();
  assert.ok(box.width >= 900, 'the Users table is squeezed: ' + box.width);
  await ctxU.close();

  // A new object is kept after a reload, and a user is added.
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const q = await watch(await ctx2.newPage());
  await signIn(q);
  // Two objects may share a name: each has its own code.
  await q.click('#newBtn'); await q.waitForSelector('#nName');
  await q.fill('#nName', 'SAME-NAME'); await q.click('#nOk');
  await q.click('#newBtn'); await q.waitForSelector('#nName');
  await q.fill('#nName', 'SAME-NAME'); await q.click('#nOk');
  await until(q, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.filter(o => o.name === 'SAME-NAME').length === 2); }, null, { timeout: 5000 });
  assert.equal(await q.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (new Set(__mods[0].objs.filter(o => o.name === 'SAME-NAME').map(o => o.code)).size); }), 2, 'the two objects share a code');
  await q.click('#newBtn'); await q.waitForSelector('#nName');
  await q.fill('#nName', 'PERSIST-CHECK-1'); await q.click('#nOk');
  await until(q, async () => (await (await fetch('api/state', { credentials: 'same-origin' })).json()).objs.some(o => o.name === 'PERSIST-CHECK-1'), null, { timeout: 10000, polling: 200 });
  await q.reload(); await q.waitForSelector('#lgUser, #tabsbar');
  if (await q.isVisible('#lgUser')) await signIn(q);
  await until(q, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('PERSIST-CHECK-1') !== undefined); }, null, { timeout: 10000 });
  const hist = await q.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].HISTORY[__mods[0].byName('PERSIST-CHECK-1').id].map(h => h.msg).join(' ')); });
  assert.match(hist, /Created manually by Administrator/, 'the history does not name the person who made the change: ' + hist);
  await q.click('#setBtn'); await q.click('#setTabs [data-st=users]');
  await q.fill('#nuFirst', 'Test'); await q.fill('#nuLast', 'Person'); await q.fill('#nuDept', 'QA'); await q.click('#nuAdd');
  assert.equal(await q.locator('#setUsers [aria-label="Name of Test Person"]').count(), 1, 'the user was not added');
  await ctx2.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser flows: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
