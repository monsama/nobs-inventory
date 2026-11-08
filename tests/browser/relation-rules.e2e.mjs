/* Relations follow one rule (relations.js): linking moves a monitor instead of giving it a second computer, the Relations
   panel offers only the kinds that fit, a port is asked only where a cable goes, a type change keeps what is related
   sensible, a new switch on a switch is its uplink, and retiring gives up every link. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until, storedBy } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-relrules-'));
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
  const relsOf = id => p.evaluate(async id => (await import('/js/01-core.js')).rels.filter(r => r.from === id).map(r => [r.to, r.kind]), id);
  const toastHas = re => until(p, re => new RegExp(re).test(document.querySelector('#toast')?.textContent || ''), re.source);

  // a monitor on the notebook; linked to the PC it moves there, it is not on both
  await p.evaluate(async () => { const c = await import('/js/01-core.js');
    c.objs.push({ id: 'm1', code: 'INV-0701', type: 'monitor', name: 'MON-1', status: 'active', loc: c.byId('o2').loc, feed: null, ovr: {} });
    c.rels.push({ id: 'rm1', from: 'm1', to: 'o2', kind: 'attached', port: null, vlan: null }); (await import('/js/07-render.js')).queueServerSave(); });
  await p.evaluate(async () => (await import('/js/05-new-object.js')).linkObjModal({ obj: 'm1' }));
  await p.waitForSelector('#lkTo'); await p.selectOption('#lkTo', 'o3'); await p.click('#lkOk');
  await until(p, async () => (await import('/js/01-core.js')).rels.some(r => r.from === 'm1' && r.to === 'o3'));
  assert.deepEqual(await relsOf('m1'), [['o3', 'attached']], 'the monitor is on two computers');
  await storedBy(() => loadState(db), t => t.rels.filter(r => r.from === 'm1').length === 1 && t.rels.some(r => r.from === 'm1' && r.to === 'o3'));

  // its page: no port box for an attachment, and only the kinds a monitor can have are offered
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('m1'));
  await p.waitForSelector('#arKind');
  assert.equal(await p.locator('[data-rport]').count(), 0, 'a port is asked for an attachment');
  const kinds = await p.$$eval('#arKind option', os => os.map(o => o.value));
  assert.ok(kinds.includes('attached') && !kinds.includes('hosted') && !kinds.includes('uplink'), 'kinds offered: ' + kinds);
  assert.equal(await p.inputValue('#arKind'), 'attached');
  // a second computer by hand is refused, with the reason
  await p.selectOption('#arTo', 'o2'); await p.click('#arAdd');
  await toastHas(/already attached/);
  assert.deepEqual(await relsOf('m1'), [['o3', 'attached']]);

  // the PC with a monitor on it does not become a monitor
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('o3'));
  await p.waitForSelector('#f_o3_type');
  await p.selectOption('#f_o3_type', 'monitor');
  await toastHas(/cannot become a Monitor/);
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('o3').type), 'pc');

  // a new switch put on the switch is its uplink
  await p.evaluate(async () => (await import('/js/05-new-object.js')).newObjModal());
  await p.waitForSelector('#nType'); await p.selectOption('#nType', 'switch'); await p.fill('#nName', 'SW-ACCESS-9');
  await p.click('#nMore > summary'); await p.selectOption('#nUp', 'o1'); await p.fill('#nPort', '20'); await p.click('#nOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(o => o.name === 'SW-ACCESS-9'));
  const up = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const o = c.objs.find(x => x.name === 'SW-ACCESS-9'); return c.rels.filter(r => r.from === o.id).map(r => [r.to, r.kind, r.port]); });
  assert.deepEqual(up, [['o1', 'uplink', 20]]);

  // retiring without the dialog (bulk, Retire and exclude) gives up the port and what is attached
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.rels.push({ id: 'rp3', from: 'o3', to: 'o1', kind: 'connected', port: 5, vlan: null }); (await import('/js/03-object-modals.js')).retireLinks(c.byId('o3')); });
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).rels.filter(r => r.from === 'o3' || r.to === 'o3').length), 0, 'a retired PC still holds its port or its monitor');
  assert.deepEqual(errors, [], 'page errors');
  console.log('relation rules: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
