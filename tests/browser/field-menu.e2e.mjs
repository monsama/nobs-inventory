/* The ⋯ menu of a field on the object page: hide it on this device or on every device of the type (values kept),
   bring hidden fields back through "Show hidden fields", clear a value after asking, and delete a field of the
   type's own. Name, type, status and location have no menu. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-fmenu-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const pc = (id, name, extra = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: 'HQ', ovr: {}, feed: null, fw: 'BIOS 1.2', purpose: 'Office', ...extra });
saveState(db, { ...s0, locs: ['HQ'], sites: ['HQ'], typeFields: { pc: [{ key: 'tag', label: 'Asset tag', kind: 'text' }] },
  objs: [pc('a', 'PC-A', { custom: { tag: 'T-1' } }), pc('b', 'PC-B', { custom: { tag: 'T-2' } })], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const open = id => p.evaluate(async i => (await import('/js/02-views.js')).openObj(i), id);
  const menu = async (k, act) => { await p.click(`.ctlrow:has([data-k="${k}"]) details.fmenu > summary`); await p.click(`[data-fm="${act}"][data-fk="${k}"]`); };
  const saved = f => until(p, f);

  await open('a'); await p.waitForSelector('#f_a_fw');
  assert.equal(await p.locator('.ctlrow:has([data-k="name"]) details.fmenu').count(), 0, 'no menu on the name');
  assert.equal(await p.locator('.ctlrow:has([data-k="fw"]) details.fmenu').count(), 1);
  if (process.env.SHOTS){ await p.click('.ctlrow:has([data-k="fw"]) details.fmenu > summary'); await p.locator('.obj .panelbox').first().screenshot({ path: path.join(process.env.SHOTS, 'field-menu.png') }); await p.keyboard.press('Escape'); }

  // hide on this device: gone here, still on PC-B, value kept; shown again through Show hidden fields
  await menu('fw', 'hide');
  await p.waitForSelector('#f_a_fw', { state: 'detached' });
  assert.equal(await p.textContent('#fmReveal'), 'Show 1 hidden field');
  await saved(async () => { const o = (await import('/js/01-core.js')).byId('a'); return o.hide && o.hide[0] === 'fw' && o.fw === 'BIOS 1.2'; });
  await open('b'); await p.waitForSelector('#f_b_fw');
  await open('a'); await p.click('#fmReveal');
  await p.waitForSelector('label.fm-hid[for="f_a_fw"]');
  await menu('fw', 'show');
  await saved(async () => !(await import('/js/01-core.js')).byId('a').hide);
  assert.equal(await p.locator('#fmReveal').count(), 0);

  // hide on every PC: gone on both, back from the menu
  await menu('purpose', 'hidetype');
  await p.waitForSelector('#f_a_purpose', { state: 'detached' });
  await open('b'); await p.waitForSelector('#f_b_fw');
  assert.equal(await p.locator('#f_b_purpose').count(), 0);
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).FIELD_LAYOUT.pc.hidden), ['purpose']);
  await p.click('#fmReveal'); await menu('purpose', 'showtype');
  await p.waitForSelector('#f_b_purpose:not(.x)');
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).FIELD_LAYOUT.pc.hidden), []);

  // clear asks first; Cancel keeps the value
  await menu('fw', 'clear'); await p.click('#fmCancel');
  assert.equal(await p.inputValue('#f_b_fw'), 'BIOS 1.2');
  await menu('fw', 'clear'); await p.click('#fmOk');
  await saved(async () => (await import('/js/01-core.js')).byId('b').fw === '');
  assert.equal(await p.isDisabled('[data-fm="clear"][data-fk="fw"]'), true, 'an empty field has nothing to clear');

  // delete a field of the type's own: gone from every PC, values kept on the devices
  await menu('custom.tag', 'delete'); await p.click('#fmOk');
  await p.waitForSelector('[data-k="custom.tag"]', { state: 'detached' });
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).byId('a').custom.tag), 'T-1');

  // the saves reached the server
  await until(p, async () => document.querySelector('#stSave').textContent.trim() === 'All changes saved');
  await new Promise(r => setTimeout(r, 600));
  const s = loadState(db);
  assert.equal(s.objs.find(o => o.id === 'b').fw, '');
  assert.deepEqual(errors, []);
  console.log('field menu: ok');
} finally { await browser.close(); server.close(); }
