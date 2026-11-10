import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
/* Boxes with a list: a relation's port offers the free ports of its switch, a device's supplier the suppliers already
   used; a value picked from the list is saved at once. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-dd-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {}); seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForTimeout(1200);
  const pc = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const o = c.objs.find(x => x.type === 'pc'); const sw = c.objs.find(x => x.type === 'switch');
    c.objs.find(x => x.type === 'server').supplier = 'Acme Distribution'; c.rels.push({ id: 'rx1', from: o.id, to: sw.id, kind: 'connected', port: 5, vlan: null });
    c.st.tab = o.id; const r = await import('/js/07-render.js'); r.queueServerSave(); r.render(); return o.id; });
  await p.waitForSelector('.rportbox');
  await p.click('.rportbox .combo-arrow'); await p.waitForTimeout(200);
  assert.equal(await p.locator('.rportbox li').count(), 27, 'the free ports of the switch (28, one taken)');
  await p.locator('.rportbox li').nth(0).click(); await p.waitForTimeout(400);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).rels.find(r => r.id === 'rx1').port), 1, 'the picked port was not saved');
  await p.click('#fmAll'); await p.waitForTimeout(300);
  const sup = `#f_${pc}_supplier`;
  await p.locator(sup).scrollIntoViewIfNeeded();
  await p.click(`${sup} + .combo-arrow`); await p.waitForTimeout(200);
  assert.ok((await p.locator(`#f_${pc}_supplier_list li`).allTextContents()).includes('Acme Distribution'));
  await p.locator(`#f_${pc}_supplier_list li`).first().click(); await p.waitForTimeout(400);
  assert.equal(await p.evaluate(async id => (await import('/js/01-core.js')).byId(id).supplier, pc), 'Acme Distribution');
  assert.deepEqual(errs, [], 'page errors');
  console.log('list boxes: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
