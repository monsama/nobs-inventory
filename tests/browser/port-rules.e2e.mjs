/* Ports stay consistent: a port is typed as a number or as its label, within the device's ports (SFP too), never inside
   a LAG; a patch panel's ports stop at its count; a duplicated panel has no cords; the type and port count of a device
   cannot change under its cabling; a group with devices on it becomes a LAG only when they moved. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until, storedBy } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-portrules-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const toastHas = re => until(p, re => new RegExp(re).test(document.querySelector('#toast')?.textContent || ''), re.source);
  const relPort = () => p.evaluate(async () => (await import('/js/01-core.js')).rels.find(r => r.id === 'rPC').port);

  // the PC on port 3 of the 24 + 4 switch (naming 1/)
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.rels.push({ id: 'rPC', from: 'o2', to: 'o1', kind: 'connected', port: 3, vlan: null }); (await import('/js/02-views.js')).openObj('o2'); });
  await p.waitForSelector('[data-rport="rPC"]');
  const setPort = async v => { await p.fill('[data-rport="rPC"]', v); await p.dispatchEvent('[data-rport="rPC"]', 'change'); };
  await setPort('26'); await until(p, async () => (await import('/js/01-core.js')).rels.find(r => r.id === 'rPC').port === 26);   /* an SFP port */
  await setPort('1/5'); await until(p, async () => (await import('/js/01-core.js')).rels.find(r => r.id === 'rPC').port === 5);   /* typed as its label */
  await setPort('0'); await toastHas(/has ports 1 to 28/); assert.equal(await relPort(), 5);
  await setPort('Gi7'); await toastHas(/has ports 1 to 28/); assert.equal(await relPort(), 5);
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('o1').portGroups = [{ name: 'Up', from: 25, to: 28, lag: true }]; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('[data-rport="rPC"]');
  await setPort('27'); await toastHas(/part of the LAG Up/); assert.equal(await relPort(), 5);
  await storedBy(() => loadState(db), t => t.rels.find(r => r.id === 'rPC')?.port === 5);

  // the switch's SFP count cannot drop below its LAG
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('o1'));
  await p.waitForSelector('#f_o1_sfp');
  await p.fill('#f_o1_sfp', '2'); await p.keyboard.press('Tab');
  await toastHas(/port group Up reaches port 28/);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('o1').sfp), 4);

  // a plain group with a device on it becomes a LAG only after the device moved
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('o1').portGroups = [{ name: 'Edge', from: 4, to: 6 }]; c.st.portsDevice = 'o1'; c.st.tab = 'net'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('[data-editgroup="0"]'); await p.click('[data-editgroup="0"]');
  await p.check('#pgLag'); await p.click('#pgAdd');
  await toastHas(/a LAG is linked as a whole/);
  assert.equal(await p.evaluate(async () => !!(await import('/js/01-core.js')).byId('o1').portGroups[0].lag), false);

  // a patch panel: ports stop at its count; a copy of it has no cords; it does not turn into a switch under its cabling
  await p.evaluate(async () => { const c = await import('/js/01-core.js');
    c.objs.push({ id: 'pp1', code: 'INV-0801', type: 'patch', name: 'PP-01', status: 'active', loc: c.byId('o1').loc, feed: null, ovr: {}, ports: 24, outlets: { P01: { name: 'R1-01' } } });
    c.rels.push({ id: 'rCord', from: 'pp1', to: 'o1', kind: 'patched', fromPort: 'P01', port: 10, vlan: null });
    c.rels.push({ id: 'rWall', from: 'o3', to: 'pp1', kind: 'connected', port: 'P02', vlan: null });
    (await import('/js/07-render.js')).queueServerSave(); });
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).portRangeError({ name: 'PP-01', type: 'patch', ports: 24 }, 'P30')), 'PP-01 has ports P01 to P24.');
  await p.evaluate(async () => (await import('/js/05-new-object.js')).newObjModal({ copy: (await import('/js/01-core.js')).byId('pp1') }));
  await p.waitForSelector('#nOk'); await p.click('#nOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.filter(o => o.type === 'patch').length === 2);
  assert.equal(await p.evaluate(async () => { const c = await import('/js/01-core.js'); const n = c.objs.find(o => o.type === 'patch' && o.id !== 'pp1'); return c.rels.filter(r => r.from === n.id && r.kind === 'patched').length; }), 0, 'the copy has the cords of the panel copied');
  await storedBy(() => loadState(db), t => t.objs.filter(o => o.type === 'patch').length === 2);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('pp1'));
  await p.waitForSelector('#f_pp1_type');
  await p.selectOption('#f_pp1_type', 'switch');
  await toastHas(/cannot become a Switch with its wall outlets and patch cords/);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('pp1').type), 'patch');
  // the switch the cord ends on does not become a patch panel
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('o1'));
  await p.waitForSelector('#f_o1_type');
  await p.selectOption('#f_o1_type', 'patch');
  await toastHas(/the patch cords that end on it/);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('o1').type), 'switch');

  // the Ports tab opened from another device does not keep the port picked on the last one
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.objs.push({ id: 'sw2', code: 'INV-0802', type: 'switch', name: 'SW-2', status: 'active', loc: '', feed: null, ovr: {}, ports: 8, sfp: 0 }); c.st.portsDevice = 'o1'; c.st.portNo = 7; (await import('/js/02-views.js')).openObj('sw2'); });
  await p.waitForSelector('#tabsbar [data-tab=net]'); await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'sw2');
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).st.portNo), null);
  assert.deepEqual(errors, [], 'page errors');
  console.log('port rules: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
