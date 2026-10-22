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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-flows-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const watch = async (p) => { p.on('pageerror', e => errors.push(e.message)); return p; };
const signIn = async (p) => { await p.goto(base + '/'); await p.waitForSelector('#lgUser'); await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForFunction(() => objs.length > 0); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await watch(await ctx.newPage());
  await signIn(p);
  const ids = await p.evaluate(() => objs.map(o => o.id));
  for (const id of ids) await p.evaluate(id => { st.open = [id]; st.tab = id; render(); }, id);
  for (const t of ['cards', 'table', 'map', 'net', 'rack', 'sw']) await p.evaluate(t => { st.tab = t; render(); }, t);
  for (const tab of ['feed', 'locations', 'types', 'users', 'ldap', 'policy', 'about']) await p.evaluate(tab => { st.setTab = tab; openSettings(); }, tab);
  await p.evaluate(() => { closeModal(); });
  await p.evaluate(() => { const o = byName('ZH-PC-0142'); newObjModal({copy: o}); $('#nName').value = 'COPY-CHECK'; $('#nOk').click(); });
  assert.ok(await p.evaluate(() => !!byName('COPY-CHECK')), 'duplicating an object did not create it');
  // Sites and rooms: a site is added on its own, a room is added under a site, and the sidebar shows both.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=locations]');
  await p.fill('#nsName', 'Basel / X'); await p.click('#nsAdd');
  assert.match(await p.textContent('#nsMsg'), /without a slash/, 'a slash in a site name is not refused');
  await p.fill('#nsName', 'Basel'); await p.press('#nsName', 'Enter');
  assert.equal(await p.evaluate(() => SITES.includes('Basel')), true, 'Enter did not add the site');
  await p.selectOption('#nlSite', 'Basel'); await p.fill('#nlRoom', 'Lager'); await p.click('#nlAdd');
  assert.equal(await p.evaluate(() => LOCS.includes('Basel / Lager')), true, 'the room was not added under the site');
  await p.click('#setClose');
  assert.ok((await p.textContent('#locList')).includes('Basel'), 'the sidebar does not show the site');
  // Object types: adding a custom type keeps the built-in ones after a reload from the server.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=types]');
  await p.fill('#ntName', 'Note'); await p.click('#ntAdd');
  await p.waitForFunction(() => Object.values(TYPES).some(t => t.label === 'Note'), null, { timeout: 5000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => reloadFromServer());
  const types = await p.evaluate(() => Object.keys(TYPES));
  assert.ok(types.includes('pc') && types.includes('switch'), 'the built-in types are gone after a reload: ' + types.join(','));
  await p.evaluate(() => closeModal());
  await p.click('#setBtn'); await p.click('#setTabs [data-st=types]');
  await p.click('.icondd-btn[aria-label="Icon for PC / Notebook"]'); await p.click('.icondd-item[data-ic=pc][data-icon=server]');
  assert.equal(await p.evaluate(() => TYPES.pc.icon), 'server', 'the icon was not chosen');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await p.click('.icondd-btn[aria-label="Icon for PC / Notebook"]'); await p.click('.icondd-item[data-ic=pc][data-icon=pc]');
  await p.click('#setClose');
  assert.deepEqual(await p.evaluate(() => parseCsv('Name,Type\nX1,pc')), [['Name', 'Type'], ['X1', 'pc']], 'CSV parsing');
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
  await q.waitForFunction(() => objs.filter(o => o.name === 'SAME-NAME').length === 2, null, { timeout: 5000 });
  assert.equal(await q.evaluate(() => new Set(objs.filter(o => o.name === 'SAME-NAME').map(o => o.code)).size), 2, 'the two objects share a code');
  await q.click('#newBtn'); await q.waitForSelector('#nName');
  await q.fill('#nName', 'PERSIST-CHECK-1'); await q.click('#nOk');
  await q.waitForTimeout(1500);
  await q.reload(); await q.waitForSelector('#lgUser, #tabsbar');
  if (await q.isVisible('#lgUser')) await signIn(q);
  await q.waitForFunction(() => byName('PERSIST-CHECK-1') !== undefined, null, { timeout: 10000 });
  const hist = await q.evaluate(() => history[byName('PERSIST-CHECK-1').id].map(h => h.msg).join(' '));
  assert.match(hist, /Created manually by Administrator/, 'the history does not name the person who made the change: ' + hist);
  await q.click('#setBtn'); await q.click('#setTabs [data-st=users]');
  await q.fill('#nuName', 'Test Person'); await q.fill('#nuDept', 'QA'); await q.click('#nuAdd');
  assert.ok((await q.textContent('#setUsers')).includes('Test Person'), 'the user was not added');
  await ctx2.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser flows: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
