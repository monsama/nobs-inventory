/* Browser test of round 187: plugging a device in has a Find box (same room and site first, with the room) and an Undo;
   a link between two switches is an uplink on both; a person with no devices is told so, with what they last had;
   a tip (no responsible) is left out of the Data quality score; the Table shows Location, User and Status next to the
   model; the search at the top finds lifetimes and the password, kept outside Settings. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-r187-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, type, name, more) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'Zürich / IT', ovr: {}, serial: 'S-' + id, ...more });
const s0 = loadState(db);
saveState(db, { ...s0, locs: ['Zürich / IT', 'Zürich / Office', 'Bern / Lager'], history: { pz: [{ t: '20.11.2026 10:00', msg: 'Taken back into stock from Finn Graf by Admin' }] },
  contacts: [{ id: 'k1', kind: 'internal', name: 'Ivo Intern' }],
  users: [...s0.users, { id: 'p1', name: 'Finn Graf', role: 'none', active: true, source: 'manual', groups: [] }, { id: 'p2', name: 'Gina Gut', role: 'none', active: true, source: 'manual', groups: [] }], objs: [
  dev('core', 'switch', 'SW-CORE', { ports: 24 }), dev('sw2', 'switch', 'SW-2OG', { ports: 24 }),
  dev('pa', 'pc', 'PC-ZH-1', { loc: 'Zürich / Office' }), dev('pb', 'pc', 'PC-BE-1', { loc: 'Bern / Lager' }), dev('pc', 'pc', 'PC-ZH-IT'),
  dev('pz', 'notebook', 'NB-PAST', { status: 'stock' }),
  dev('old', 'pc', 'PC-OLD', { status: 'retired' }), dev('pn', 'pc', 'PC-NEW', { loc: '' }),
  dev('m1', 'pc', 'PC-MIX-1', { uid: 'p2', user: 'Gina Gut', loc: '' }), dev('m2', 'pc', 'PC-MIX-2', { loc: '' }),
], rels: [{ id: 'u1', from: 'sw2', to: 'core', kind: 'connected', port: 24, vlan: null }, { id: 'r9', from: 'old', to: 'core', kind: 'connected', port: 7, vlan: null }] });
const stored = check => storedBy(() => loadState(db), check);

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');
  const ports = id => p.evaluate(async id => { const c = await import('/js/01-core.js'); c.st.portsDevice = id; c.st.tab = 'net'; c.st.portNo = null; (await import('/js/07-render.js')).view(); }, id);

  // 1. switch to switch: an uplink on the core's port, and listed on the other switch as its uplink
  await ports('core'); await p.waitForSelector('.port[data-port="24"]');
  assert.equal(await p.evaluate(() => document.querySelector('.port[data-port="24"]').classList.contains('upl')), true);
  await ports('sw2'); await p.waitForSelector('tr.own-up');
  assert.match(await p.textContent('tr.own-up'), /Its uplink\s*SW-CORE\s*Uplink\s*Trunk\s*on port 24 of SW-CORE/);

  //    the core's port map: the link from the other switch reads Uplink, Trunk
  await ports('core'); await p.waitForSelector('.port[data-port="24"]');
  assert.match(await p.textContent('table.grid.mini tbody'), /24\s*SW-2OG\s*Uplink\s*Trunk/);
  //    a port only a retired device holds: plugged in, then Undo brings the retired device's link back
  await p.click('.port[data-port="7"]').catch(() => {});
  await p.evaluate(async () => (await import('/js/05-new-object.js')).linkObjModal({ to: 'core', port: 7 }));
  await p.waitForSelector('#lkQ'); await p.fill('#lkQ', 'PC-NEW'); await p.press('#lkQ', 'Enter');
  await stored(st => st.rels.some(r => r.from === 'pn' && r.port === 7) && !st.rels.some(r => r.id === 'r9'));
  await p.click('#toast .t-undo');
  await stored(st => !st.rels.some(r => r.from === 'pn') && st.rels.some(r => r.id === 'r9'));

  // 2. plug in from a free port: the switch's room first, then its site; Find narrows; Undo takes it back
  await ports('core'); await p.click('.port[data-port="3"]'); await p.click('#assignBtn'); await p.waitForSelector('#lkQ');
  const opts = () => p.$$eval('#lkObj option', o => o.map(x => x.textContent.trim()));
  assert.deepEqual((await opts()).slice(1, 5).map(t => t.split(' · ')[0]), ['NB-PAST', 'PC-ZH-IT', 'PC-ZH-1', 'PC-BE-1'], (await opts()).join(' | '));
  assert.match((await opts())[2], /Zürich \/ IT/);
  await p.fill('#lkQ', 'bern'); assert.equal((await opts()).length, 2);
  assert.equal(await p.inputValue('#lkObj'), 'pb', 'one match is chosen');
  await p.press('#lkQ', 'Enter');
  await stored(st => st.rels.some(r => r.from === 'pb' && r.to === 'core' && r.port === 3));
  await p.click('#toast .t-undo');
  await stored(st => !st.rels.some(r => r.from === 'pb'));

  // 3. a person with no devices: said, with what they last had
  await p.evaluate(async () => (await import('/js/04-settings.js')).showDevicesOf('p1'));
  await p.waitForSelector('.fb-past');
  assert.match(await p.textContent('.fb-past'), /No devices now\. Last:\s*NB-PAST\s*taken back 20\.11\.2026/);

  //    a hand-out and take-back made now shows at once
  await p.click('[data-pact="give"]'); await p.waitForSelector('[data-hsd="pz"]'); await p.check('[data-hsd="pz"]'); await p.click('#hoOk');
  await stored(st => st.objs.find(o => o.id === 'pz').uid === 'p1');
  await p.click('[data-pact="back"]'); await p.waitForSelector('#tbOk'); await p.click('#tbOk');
  await p.waitForSelector('.fb-past .link');
  await p.waitForFunction(() => /handed out/.test(document.querySelector('.fb-past')?.textContent || ''));

  // 4. the Table: Location, User and Status right after the model
  const heads = await p.$$eval('table.grid thead th', t => t.map(x => x.textContent.trim()).filter(Boolean));
  const at = k => heads.indexOf(k);
  assert.ok(at('Model') >= 0 && at('Location') === at('Model') + 1 && at('User') === at('Model') + 2 && at('Status') === at('Model') + 3, heads.join(' | '));

  //    Set status In stock for a mix (one with a user): the take-back takes in all of them
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.person = null; c.st.bulk = new Set(['m1', 'm2']); (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#bkAct'); await p.selectOption('#bkAct', 'status:stock'); await p.waitForSelector('#tbOk'); await p.click('#tbOk');
  await stored(st => ['m1', 'm2'].every(id => st.objs.find(o => o.id === id).status === 'stock') && !st.objs.find(o => o.id === 'm1').uid);

  // 5. Data quality: no responsible is a tip, not a gap
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.person = null; c.st.tab = 'overview'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('#ovQuality');
  assert.match(await p.textContent('#ovQuality'), /No responsible.*a tip, not counted in the score/s);
  assert.doesNotMatch(await p.textContent('#ovQuality .hdr'), /0 of/);

  // 6. the search at the top: lifetimes and the password, kept outside Settings
  await p.fill('#search', 'lifetime'); await p.waitForSelector('#gsList li[data-i]');
  assert.match(await p.textContent('#gsList'), /Lifetimes and replacement prices\s*Overview → Replacement plan/);
  await p.fill('#search', 'password'); await p.waitForSelector('#gsList li[data-i]:has-text("Change password")');
  await p.click('#gsList li[data-i]:has-text("Change password")'); await p.waitForSelector('#acCur');

  assert.deepEqual(errors, []);
  console.log('round 187: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
