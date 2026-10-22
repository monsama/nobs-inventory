/* Walks through the main features and fails on any page error: every object page, every view and Settings
   tab, the feed and LDAP plans, and on a server: create an object, reload, check it is still there, add a user. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-flows-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const file = 'file://' + path.join(fileURLToPath(new URL('../../public/index.html', import.meta.url)));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const watch = async (p) => { p.on('pageerror', e => errors.push(e.message)); return p; };

try {
  // Browser mode with the demo: every object page, view, Settings tab and feed or directory plan.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await watch(await ctx.newPage());
  await p.goto(file); await p.waitForSelector('#wDemo');
  await p.click('#wDemo'); await p.waitForFunction(() => window.NI_DEMO && objs.length > 0);
  const ids = await p.evaluate(() => objs.map(o => o.id));
  for (const id of ids) await p.evaluate(id => { st.open = [id]; st.tab = id; render(); }, id);
  for (const t of ['cards', 'table', 'map', 'net', 'rack', 'sw']) await p.evaluate(t => { st.tab = t; render(); }, t);
  for (const tab of ['feed', 'locations', 'types', 'users', 'ldap', 'policy', 'about']) await p.evaluate(tab => { st.setTab = tab; openSettings(); }, tab);
  await p.evaluate(() => { closeModal(); });
  const plans = await p.evaluate(() => ({ feed: buildPlan().length, ldap: ldapPlan().length }));
  assert.ok(plans.feed > 0, 'the feed plan is empty with the demo loaded');
  await p.evaluate(() => { const o = byName('ZH-PC-0142'); newObjModal({copy: o}); $('#nName').value = 'COPY-CHECK'; $('#nOk').click(); });
  assert.ok(await p.evaluate(() => !!byName('COPY-CHECK')), 'duplicating an object did not create it');
  await p.evaluate(() => { const s = parseCsv('Name,Type\nX1,pc'); return s; });
  await ctx.close();

  // Server: create an object, reload, and it is still there; add a user.
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const q = await watch(await ctx2.newPage());
  await q.goto(base + '/'); await q.waitForSelector('#lgUser');
  await q.fill('#lgUser', 'admin'); await q.fill('#lgPw', 'adminpass123'); await q.click('#lgOk');
  await q.waitForSelector('#wEmpty'); await q.click('#wEmpty');
  await q.click('#newBtn'); await q.waitForSelector('#nName');
  await q.fill('#nName', 'PERSIST-CHECK-1'); await q.click('#nOk');
  await q.waitForTimeout(1500);
  await q.reload(); await q.waitForSelector('#lgUser, #tabsbar');
  if (await q.isVisible('#lgUser')) { await q.fill('#lgUser', 'admin'); await q.fill('#lgPw', 'adminpass123'); await q.click('#lgOk'); }
  await q.waitForFunction(() => typeof objs !== 'undefined' && objs.length > 0, null, { timeout: 10000 });
  assert.ok(await q.evaluate(() => !!byName('PERSIST-CHECK-1')), 'the object was not kept after reload');
  await q.click('#setBtn'); await q.click('#setTabs [data-st=users]');
  await q.fill('#nuName', 'Test Person'); await q.fill('#nuDept', 'QA'); await q.click('#nuAdd');
  assert.ok((await q.textContent('#setUsers')).includes('Test Person'), 'the user was not added');
  await ctx2.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser flows: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
