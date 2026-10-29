/* The Model field's pick list is the app's own: it opens from the arrow, filters while typing, works with the keyboard,
   and a picked model is saved. A model the feed sets cannot be picked. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-combo-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const pc = (id, name, model, extra = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, model, status: 'active', loc: '', ovr: {}, feed: null, ...extra });
saveState(db, { ...loadState(db), objs: [
  pc('o1', 'PC-1', 'Dell OptiPlex 7010'), pc('o2', 'PC-2', 'HP EliteDesk 800 G6'), pc('o3', 'PC-3', 'Lenovo ThinkCentre M70q'),
  pc('o4', 'PC-4', 'Dell Latitude 5440', { feed: { sys: 'Lansweeper', ref: 'x', seen: '01.10.2026 10:00' } }),
], rels: [], history: {}, policy: { model: true } });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 }, colorScheme: process.env.NI_SCHEME || 'light' })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card[data-open=o1]'); await page.click('.card[data-open=o1]');
  const field = '[data-k=model]', list = '.combo:has([data-k=model]) .combo-list', arrow = '.combo:has([data-k=model]) .combo-arrow';
  await page.waitForSelector(field);
  assert.equal(await page.locator('datalist').count(), 0, 'the browser\'s own list is not used');
  // the arrow opens every model; typing filters
  await page.click(arrow);
  assert.equal(await page.locator(list + ' li').count(), 4);
  if (process.env.NI_SHOTS) await page.locator('.obj .col .panelbox').first().screenshot({ path: path.join(process.env.NI_SHOTS, 'model-combo.png') });
  await page.fill(field, 'dell');
  assert.deepEqual(await page.locator(list + ' li').allTextContents(), ['Dell Latitude 5440', 'Dell OptiPlex 7010']);
  // keyboard: down, down, Enter picks the second; Escape closes
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.inputValue(field), 'Dell OptiPlex 7010');
  assert.equal(await page.isHidden(list), true, 'the list closes after a pick');
  // a pick is saved when the field is left
  await page.fill(field, 'HP'); await page.click(list + ' li >> text=HP EliteDesk 800 G6');
  await page.locator(field).press('Tab');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('o1').model === 'HP EliteDesk 800 G6');
  await page.fill(field, 'Len'); await page.keyboard.press('Escape');
  assert.equal(await page.isHidden(list), true, 'Escape closes the list');
  // the empty field says what it is for; a new model is marked; a near miss offers the model in the list
  assert.equal(await page.getAttribute(field, 'placeholder'), 'Type or pick a model');
  const note = '#f_o1_model_note';
  await page.fill(field, 'Fujitsu Esprimo P758');
  assert.match(await page.textContent(note), /New model – added to the list when saved/);
  await page.fill(field, 'Dell Latitde 5440');
  assert.match(await page.textContent(note), /Did you mean Dell Latitude 5440\?/);
  await page.click(note + ' .combo-use');
  assert.equal(await page.inputValue(field), 'Dell Latitude 5440');
  assert.equal(await page.isHidden(note), true, 'the note goes once the model is one in the list');
  await page.waitForFunction(async () => (await import('/js/01-core.js')).byId('o1').model === 'Dell Latitude 5440');
  // a model from the feed can be typed over: the typed model is kept on save, and its source mark shows it is kept as typed
  await page.evaluate(async () => (await import('/js/02-views.js')).openObj('o4'));
  await page.waitForSelector('[data-k=model]');
  assert.equal(await page.locator('[data-ovr=model]').count(), 0, 'no From feed box: the source mark says it');
  assert.equal(await page.isDisabled('[data-k=model]'), false, 'a feed field is editable');
  await page.fill('[data-k=model]', 'HP EliteDesk 800 G9');
  await page.press('[data-k=model]', 'Tab');
  await page.waitForFunction(async () => { const o = (await import('/js/01-core.js')).byId('o4'); return o.model === 'HP EliteDesk 800 G9' && o.ovr.model === false; });
  await page.waitForSelector('#f_o4_model >> xpath=ancestor::div[contains(@class,"ctlrow")][1]//span[contains(@class,"fsrc-picked")][@data-src="hand"]');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('model pick list: all checks passed');
} finally { await browser.close(); server.close(); }
