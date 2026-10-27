/* Browser test of the note under a device's address when another device has it too: the same MAC (one device recorded
   twice), a DHCP address that has moved (the other record older), and a real clash; and the gateway and DNS servers a
   device takes from its subnet, shown as values without being stored. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ipclash-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, name, ip, more = {}) => ({ id, code: 'INV-' + id, type: 'notebook', name, status: 'active', ip, ovr: {}, feed: null, ...more });
saveState(db, { ...loadState(db),
  subnets: [{ name: 'Clients', cidr: '172.21.103.0/24', vid: null, gateway: '172.21.103.1', dns: ['172.21.103.2'], ranges: [{ from: '172.21.103.50', to: '172.21.103.200', use: 'DHCP' }], types: [] }],
  objs: [
    dev('a', 'ACMENB32', '172.21.103.60', { mac: 'AA-BB-CC-00-11-22', feed: { seen: '20.10.2026 08:00' } }),
    dev('b', 'ACMENB29', '172.21.103.70', { mac: 'aa:bb:cc:00:11:22', feed: { seen: '01.09.2026 08:00' } }),
    dev('c', 'ACMENB10', '172.21.103.80', { feed: { seen: '01.08.2026 08:00' } }),
    dev('d', 'PRINTER-1', '172.21.103.10', { dhcp: 'static' }),
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const note = async ip => {
  await page.fill('#f_a_ip', ip); await page.dispatchEvent('#f_a_ip', 'input');
  await page.waitForFunction(() => !document.getElementById('f_a_ip_note').hidden);
  return { cls: await page.getAttribute('#f_a_ip_note', 'class'), text: (await page.textContent('#f_a_ip_note')).trim() };
};
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await page.waitForSelector('#f_a_ip');

  // the gateway and DNS servers of the subnet read as values, with where they come from, and are not stored
  assert.equal(await page.getAttribute('#f_a_gateway', 'placeholder'), '172.21.103.1 · from Clients');
  assert.equal(await page.inputValue('#f_a_gateway'), '');
  assert.equal(await page.$eval('#f_a_gateway', e => getComputedStyle(e, '::placeholder').fontStyle), 'normal');

  // the same MAC address: one device recorded twice
  let n = await note('172.21.103.70');
  assert.match(n.cls, /warn/); assert.match(n.text, /ACMENB29 has this address and the same MAC address: probably this device recorded twice/);
  // a DHCP address the other device was seen with earlier: it has moved here
  n = await note('172.21.103.80');
  assert.match(n.cls, /info/); assert.match(n.text, /DHCP address[\s\S]*record of ACMENB10 is older \(last seen 01\.08\.2026\)/);
  // a static address outside the DHCP range on a static device: a real clash
  n = await note('172.21.103.10');
  assert.match(n.cls, /warn/); assert.equal(n.text, 'In use by PRINTER-1.');
  // the name opens the other device
  await page.keyboard.press('Escape');
  await page.click('#f_a_ip_note a[data-open="d"]');
  await page.waitForSelector('#f_d_ip');

  assert.deepEqual(errors, []);
  console.log('ip-clash: all checks passed');
} finally { await browser.close(); server.close(); }
