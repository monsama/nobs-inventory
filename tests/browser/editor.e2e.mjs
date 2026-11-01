/* Browser test of the editor role: an editor limited to Bern sees and changes Bern's devices, puts a new one only in a
   room of Bern, and finds Settings and the floor plans read only. An admin gives the role and the sites in Users. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { setPassword } from '../../server/auth.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-editor-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, loc) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc, ovr: {}, feed: null });
saveState(db, { ...s0, history: {}, sites: ['Bern', 'Zürich'], locs: ['Bern / EG', 'Bern / OG', 'Zürich / EG'],
  users: [...s0.users, { id: 'u-ed', login: 'eva', name: 'Eva Editor', role: 'viewer', source: 'manual', active: true, groups: [] }],
  objs: [dev('b1', 'Bern / EG'), dev('z1', 'Zürich / EG')] });
setPassword(db, 'u-ed', 'evapass123456');
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const page = async (user, pw) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', user); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await eventually(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
  return p;
};
const stored = () => loadState(db);
try {
  // the admin makes Eva an editor of Bern
  const a = await page('admin', 'adminpass123');
  await a.click('#setBtn'); await a.click('#setTabs [data-st=users]');
  const i = await a.evaluate(async () => (await import('/js/04-settings.js')).USERS.findIndex(u => u.id === 'u-ed'));
  await a.locator(`[data-role="${i}"]`).selectOption('editor');
  /* Made an editor: which sites is asked at once. */
  await a.waitForSelector('#seOk');
  /* Ticking a site is enough: it chooses "only these sites" with it. */
  await a.check('[data-site="Bern"]');
  assert.equal(await a.isChecked('input[name=sees][value=sites]'), true);
  assert.equal(await a.locator('input[name=sees][value=own]').count(), 0, 'own devices only is for viewers');
  await a.click('#seOk');
  await eventually(() => { const u = stored().users.find(x => x.id === 'u-ed'); return u.role === 'editor' && JSON.stringify(u.sites) === '["Bern"]'; });
  assert.match(await a.locator(`[data-sees="${i}"]`).textContent(), /Changes: Bern/);
  // roles from groups: a rule added, changed and removed (with Undo)
  await a.click('#grAdd'); await a.fill('#grGroup', 'IT-Bern'); await a.selectOption('#grRole', 'editor'); await a.check('[data-grsite="Bern"]'); await a.click('#grOk');
  await eventually(() => JSON.stringify(stored().groupRoles) === '[{"group":"IT-Bern","role":"editor","sites":["Bern"]}]');
  assert.match(await a.textContent('#groupRoles'), /IT-Bern\s*Editor\s*Bern/);
  await a.click('[data-gredit="0"]'); await a.selectOption('#grRole', 'viewer'); await a.uncheck('[data-grsite="Bern"]'); await a.click('#grOk');
  await eventually(() => JSON.stringify(stored().groupRoles) === '[{"group":"IT-Bern","role":"viewer"}]');
  await a.click('[data-grdel="0"]');
  await eventually(() => (stored().groupRoles || []).length === 0);
  await a.click('#toast .t-undo');
  await eventually(() => (stored().groupRoles || []).length === 1);

  const p = await page('eva', 'evapass123456');
  assert.match(await p.textContent('#whoBtn'), /Eva Editor · Editor/);
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).objs.map(o => o.id)), ['b1'], 'only Bern');
  // a device of Bern changed on its page
  await p.evaluate(async () => (await import('/js/02-views.js')).openObjs(['b1']));
  await p.waitForSelector('#f_b1_model');
  assert.equal(await p.isDisabled('#f_b1_model'), false);
  await p.fill('#f_b1_model', 'X1 Carbon'); await p.click('#saveBtn');
  await eventually(() => stored().objs.find(o => o.id === 'b1').model === 'X1 Carbon');
  // a change the server refuses (a device moved to another site) is taken back and does not block the saves after it
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.objs.find(o => o.id === 'b1').loc = 'Zürich / EG'; (await import('/js/07-render.js')).queueServerSave(); });
  await eventually(() => p.evaluate(() => /taken back/.test(document.querySelector('#toast')?.textContent || '')));
  await eventually(() => p.evaluate(async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'b1')?.loc === 'Bern / EG'));
  assert.equal(stored().objs.find(o => o.id === 'b1').loc, 'Bern / EG');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObjs(['b1']));
  await p.waitForSelector('#f_b1_model');
  await p.fill('#f_b1_model', 'X1 Yoga'); await p.click('#saveBtn');
  await eventually(() => stored().objs.find(o => o.id === 'b1').model === 'X1 Yoga');
  // the entry sheet is an admin's: not offered to an editor
  assert.equal(await p.locator('#sheetBtn').count(), 0);
  // photos can be added to it
  await p.waitForSelector('#phAdd'); assert.equal(await p.isDisabled('#phAdd'), false);
  // its location: only the rooms of Bern, no "No location"
  const locs = await p.locator('#f_b1_loc option').allTextContents();
  assert.deepEqual(locs, ['Bern / EG', 'Bern / OG']);
  // a new device: only Bern's rooms
  await p.click('#newBtn'); await p.waitForSelector('#nLoc');
  assert.deepEqual(await p.locator('#nLoc option').allTextContents(), ['Bern / EG', 'Bern / OG']);
  await p.fill('#nName', 'NB-NEW');
  await p.selectOption('#nLoc', 'Bern / OG');
  await p.click('#nOk');
  await eventually(() => stored().objs.some(o => o.name === 'NB-NEW' && o.loc === 'Bern / OG'));
  // Settings: read only, as for a viewer
  await p.click('#setBtn'); await p.click('#setTabs [data-st=locations]');
  await p.waitForSelector('#setPane input, #setPane button');
  const enabled = await p.locator('#setPane input:not([type=search]):enabled, #setPane select:enabled').count();
  assert.equal(enabled, 0, 'nothing in Settings can be changed');
  await p.keyboard.press('Escape');
  // floor plans: no plan editing
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.tab = 'plans'; (await import('/js/07-render.js')).view(); });
  await p.waitForSelector('.pl-bar, .pl-empty');
  assert.equal(await p.locator('#plNew, #plNew2, #plArea, #plDel').count(), 0);
  // the admin's page is not touched by any of it: Zürich unchanged
  assert.equal(stored().objs.find(o => o.id === 'z1').model, undefined);
  assert.deepEqual(errors, []);
  console.log('editor: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
