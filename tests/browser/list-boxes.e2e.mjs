import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
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
  // rack: Mount device offers only the free places where the device fits, for its height
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); Object.assign(c.byId('o5'), { rack: 'R-SRV', u: 20, h: 2 }); for (const o of c.objs) if (o.id !== 'o5' && o.rack === 'R-SRV') { delete o.rack; delete o.u; }
    c.st.rackId = 'R-SRV'; c.st.tab = 'rack'; const r = await import('/js/07-render.js'); r.queueServerSave(); r.render(); });
  await p.click('#rkMount'); await p.waitForSelector('#mdU');
  const units = await p.evaluate(async () => { const c = await import('/js/01-core.js'); return c.rackUnits(c.byId('R-SRV')); });
  assert.equal(await p.inputValue('#mdU'), String(units), 'the top free place is proposed');
  await p.selectOption('#mdDev', 'o1');
  const places = () => p.$$eval('#mdU option', l => l.map(x => x.value));
  let v = await places();
  assert.ok(!v.includes('20') && !v.includes('21') && v.includes('19') && v.includes('22'), 'one unit: U20-U21 are taken');
  await p.fill('#mdH', '2'); await p.dispatchEvent('#mdH', 'change');
  v = await places();
  assert.ok(!v.includes('19') && !v.includes('20') && !v.includes('21') && v.includes('18') && v.includes('22'), 'two units: no place overlapping U20-U21');
  await p.selectOption('#mdU', '18'); await p.click('#mdOk');
  await until(p, async () => (await import('/js/01-core.js')).byId('o1').u === 18);
  // the device's own Mounted at: its own place counts as free
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'o1'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('#rk_u');
  await p.click('#rk_u + .combo-arrow'); await p.waitForTimeout(150);
  v = await p.$$eval('#rk_u_list li[data-v]', l => l.map(x => x.dataset.v));
  assert.ok(v.includes('18') && !v.includes('20') && !v.includes('19'), 'its own place is offered, the server\'s is not');
  await p.click('#rk_u_list li[data-v="10"]');
  await until(p, async () => (await import('/js/01-core.js')).byId('o1').u === 10);
  // port naming offers what other switches use
  if (await p.locator('#fmAll').count()) await p.click('#fmAll');
  assert.equal(await p.locator('#f_o1_pfx').evaluate(e => !!e.closest('.combo')), true);
  // a new person's department: the departments in use
  await p.evaluate(async () => { const s = await import('/js/04-settings.js'); s.USERS.push({ id: 'ux', login: '', name: 'Dora', dept: 'Logistics', role: 'none', active: true, groups: [], source: 'manual' }); });
  await p.selectOption('#f_o1_user', '__new');
  await p.waitForSelector('#npDept');
  {
    await p.click('#npDept + .combo-arrow'); await p.waitForTimeout(150);
    assert.ok((await p.$$eval('#npDept_list li', l => l.map(x => x.textContent))).includes('Logistics'));
    await p.click('#npCancel');
  }
  assert.deepEqual(errs, [], 'page errors');
  console.log('list boxes: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
