/* Browser test of handing devices out and taking them back: from a device's page (a person found by name, or a new one),
   from a person's view (devices in stock), and Take back / Take all back, each with Undo. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-handout-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const dev = (id, name, extra = {}) => ({ id, code: 'INV-' + id, type: 'notebook', name, status: 'stock', loc: 'Bern / Lager', ovr: {}, feed: null, ...extra });
const s0 = loadState(db);
saveState(db, { ...s0, history: {}, sites: ['Bern'], locs: ['Bern / Lager', 'Bern / Büro'], locMap: { 'BE 2. OG': 'Bern / Büro' }, stockRooms: { Bern: 'Bern / Lager' },
  users: [...s0.users, { id: 'u-anna', login: 'amuster', name: 'Anna Muster', dept: 'Sales', role: 'none', groups: [], source: 'manual', active: true, profile: { office: 'BE 2. OG', from: 'ldap' } }],
  objs: [dev('n1', 'NB-01'), dev('n2', 'NB-02'), dev('n3', 'NB-03'), dev('s1', 'SW-CORE', { type: 'switch', status: 'active' }),
    /* named only by its user's name, as a Lansweeper record can be: the person is made and saved, the device linked */
    dev('n4', 'NB-04', { status: 'active', user: 'Lea Lansweeper' })] });
const stored = id => loadState(db).objs.find(o => o.id === id);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await eventually(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
  await eventually(() => { const st = loadState(db), u = st.users.find(x => x.name === 'Lea Lansweeper'); return u && stored('n4').uid === u.id; });
  const open = id => p.evaluate(async i => (await import('/js/02-views.js')).openObj(i), id);

  // a switch nobody carries: no hand out on it
  await open('s1'); await p.waitForSelector('#objTitle');
  assert.equal(await p.locator('#handOutBtn, #takeBackBtn').count(), 0);
  // a device page is short: the empty fields only on request
  assert.equal(await p.locator('#f_s1_mac').count(), 0, 'an empty MAC field is not shown');
  assert.match(await p.textContent('#fmAll'), /Show all fields \(\d+ empty\)/);
  await p.click('#fmAll'); await p.waitForSelector('#f_s1_mac');
  await p.click('#fmAll'); await p.waitForSelector('#f_s1_mac', { state: 'detached' });

  // from the device: found by part of the name, handed out, in use with her
  await open('n1'); await p.waitForSelector('#handOutBtn');
  assert.equal(await p.locator('text=Not confirmed on site yet').count(), 0, 'no "Not confirmed on site yet" before any stocktake');
  assert.equal(await p.locator('[data-verify="n1"]').count(), 1, 'but it can be confirmed on its own page');
  await p.click('#handOutBtn'); await p.waitForSelector('#hoQ');
  assert.equal(await p.isDisabled('#hoOk'), true, 'nobody picked yet');
  await p.fill('#hoQ', 'mus');
  await p.click('[data-hop="u-anna"]');
  assert.equal(await p.inputValue('#hoLoc'), 'Bern / Büro', 'her office room is proposed');
  assert.match(await p.textContent('#hoOk'), /Hand out to Anna Muster/);
  // where it goes with her: a room, picked in the same step
  await p.selectOption('#hoLoc', 'Bern / Büro');
  await p.click('#hoOk');
  await eventually(() => stored('n1').uid === 'u-anna' && stored('n1').status === 'active' && stored('n1').loc === 'Bern / Büro');
  await p.waitForSelector('#takeBackBtn');
  await eventually(() => (loadState(db).history.n1 || []).some(h => /Handed out to Anna Muster, to Bern \/ Büro by Administrator/.test(h.msg)));

  // taken back: asked where it goes (the store room), then in stock with nobody; Undo gives it back to her
  await p.click('#takeBackBtn'); await p.waitForSelector('#tbLoc');
  assert.equal(await p.inputValue('#tbLoc'), 'Bern / Lager', 'the store room of its site is proposed');
  await p.selectOption('#tbLoc', 'Bern / Lager'); await p.click('#tbOk');
  await eventually(() => stored('n1').status === 'stock' && !stored('n1').uid && stored('n1').loc === 'Bern / Lager');
  // the next time, the same store room is proposed
  assert.equal(await p.evaluate(() => localStorage.getItem('ni-stock-room')), 'Bern / Lager');
  await p.click('#toast .t-undo');
  await eventually(() => stored('n1').uid === 'u-anna' && stored('n1').status === 'active');

  // a new person, typed and added on the spot (Enter picks, Enter hands out)
  await open('n2'); await p.waitForSelector('#handOutBtn');
  await p.click('#handOutBtn'); await p.waitForSelector('#hoQ');
  await p.fill('#hoQ', 'Max Neu'); await p.waitForSelector('[data-honew]');
  await p.press('#hoQ', 'Enter'); await p.press('#hoQ', 'Enter');
  await eventually(() => { const st = loadState(db), u = st.users.find(x => x.name === 'Max Neu'); return u && stored('n2').uid === u.id && stored('n2').status === 'active'; });

  // from her view: a device from the stock, then everything back
  await p.evaluate(async () => (await import('/js/04-settings.js')).showDevicesOf('u-anna'));
  await p.waitForSelector('[data-pact="give"]');
  await p.click('[data-pact="give"]'); await p.waitForSelector('#hsQ');
  assert.equal(await p.locator('[data-hsd]').count(), 1, 'only the device still in stock');
  await p.check('[data-hsd="n3"]'); await p.click('#hoOk');
  await eventually(() => stored('n3').uid === 'u-anna' && stored('n3').status === 'active');
  await p.click('[data-pact="back"]'); await p.waitForSelector('#tbOk');
  assert.equal(await p.inputValue('#tbLoc'), 'Bern / Lager', 'the store room used last is proposed'); await p.click('#tbOk');
  await eventually(() => ['n1', 'n3'].every(id => stored(id).status === 'stock' && !stored(id).uid));
  assert.equal(stored('n2').status, 'active', 'Max keeps his');
  assert.deepEqual(errors, []);
  console.log('hand out: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
