/* Exclude from sync: an object, or an object with the objects it is related to, is not changed by a Lansweeper
   export. Clear inventory keeps excluded objects unless the box to delete protected objects is ticked. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-excl-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const srv = () => loadState(db);
const waitServer = async (fn, what) => { for (let i = 0; i < 60; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail('the server did not get: ' + what); };
const openByName = async (p, name) => {
  await p.click('#tabsbar [data-tab=table]');
  await p.locator('table.grid td', { hasText: new RegExp(`^${name}$`) }).first().click();
  await p.waitForFunction(async n => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName(n) && __mods[0].st.tab === __mods[0].byName(n).id); }, name);
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForFunction(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });

  // A relation: the laptop is connected to the switch.
  await openByName(p, 'ZH-NB-0201');
  await p.selectOption('#arKind', 'connected');
  await p.selectOption('#arTo', await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SW-ZH-2OG-01').id); }));
  await p.fill('#arPort', '7'); await p.click('#arAdd');
  await waitServer(() => srv().rels.length === 1, 'the relation');

  // Exclude the laptop with its relations: the switch is excluded too; the server is not.
  await p.click('details.menu > summary'); await p.click('#exclRelBtn');
  await waitServer(() => srv().objs.filter(o => o.excluded).length === 2, 'the exclusion');
  const ex = srv().objs.filter(o => o.excluded).map(o => o.name).sort();
  assert.deepEqual(ex, ['SW-ZH-2OG-01', 'ZH-NB-0201'], 'the wrong objects were excluded: ' + ex);

  // A Lansweeper export changes the switch's IP only where it is not excluded: here it is, so nothing changes.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=feed]');
  const csv = path.join(dir, 'export.csv');
  fs.writeFileSync(csv, 'AssetName,Serial,IPAddress\nSW-ZH-2OG-01,SN-SW-ZH-2OG-01,10.9.9.9\nSRV-ZH-HV01,SN-SRV-ZH-HV01,10.9.9.8\n');
  await p.setInputFiles('#feedUp', csv);
  await p.waitForFunction(() => /Import: /.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
  await p.waitForTimeout(300);
  assert.equal(srv().objs.find(o => o.name === 'SW-ZH-2OG-01').ip, '10.10.0.12', 'the sync changed an excluded object');
  assert.equal(srv().objs.find(o => o.name === 'SRV-ZH-HV01').ip, '10.9.9.8', 'the sync did not update a non-excluded object');
  await p.click('#setClose');

  // Clear inventory keeps the excluded objects and the relation between them.
  await p.click('#setBtn'); await p.click('#setReset'); await p.waitForSelector('#clrOk');
  await p.fill('#clrWord', 'CLEAR'); await p.click('#clrOk');
  await waitServer(() => srv().objs.length === 2, 'the clear that keeps excluded objects');
  assert.deepEqual(srv().objs.map(o => o.name).sort(), ['SW-ZH-2OG-01', 'ZH-NB-0201']);
  assert.equal(srv().rels.length, 1, 'the relation between kept objects was removed');

  // With the box ticked, the excluded objects go too.
  await p.click('#setBtn'); await p.click('#setReset'); await p.waitForSelector('#clrOk');
  await p.fill('#clrWord', 'CLEAR'); await p.check('#clrAll'); await p.click('#clrOk');
  await waitServer(() => srv().objs.length === 0 && srv().rels.length === 0, 'the clear of protected objects');

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser exclude from sync: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
