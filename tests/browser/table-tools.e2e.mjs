/* The table tools: select all ticks and unticks every row shown, Clear filters also clears the column filters, and the
   Buy me a coffee button has its icon and no underline. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-tools-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });

  await p.click('#setBtn'); await p.click('#setTabs [data-st=about]');
  await p.waitForSelector('.btnlike[href*="buymeacoffee"]');
  assert.equal(await p.evaluate(() => !!document.querySelector('.btnlike[href*="buymeacoffee"] svg')), true, 'the coffee button has no icon');
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.btnlike[href*="buymeacoffee"]')).textDecorationLine), 'none', 'the coffee button is underlined');
  await p.click('#setClose');

  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render.js')]); __mods[0].st.tab = 'table'; __mods[1].render(); });
  await p.waitForSelector('#selAll');
  await p.click('#selAll');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].st.bulk.size); }), 7, 'select all did not select every row');
  assert.equal(await p.isChecked('#selAll'), true, 'select all is not ticked when every row is selected');
  await p.click('#selAll');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].st.bulk.size); }), 0, 'a second tick did not clear the selection');
  assert.equal(await p.isChecked('#selAll'), false, 'select all is still ticked after clearing');
  await p.click('#selAll');
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].st.bulk.size); }), 7, 'a third tick did not select again');
  await p.click('#selAll');

  // A filter typed under a column is cleared by Clear filters.
  await p.fill('thead tr.fr input[aria-label="Filter Name"]', 'ZH-PC');
  await p.dispatchEvent('thead tr.fr input[aria-label="Filter Name"]', 'input');
  await p.dispatchEvent('thead tr.fr input[aria-label="Filter Name"]', 'input');
  await p.waitForTimeout(150);
  const shown = () => p.evaluate(() => [...document.querySelectorAll('#view tbody tr')].filter(r => r.style.display !== 'none').length);
  assert.ok(await shown() < 7, 'the column filter did not narrow the table');
  await p.click('#clearF'); await p.waitForTimeout(150);
  assert.equal(await p.inputValue('thead tr.fr input[aria-label="Filter Name"]'), '', 'Clear filters left the column filter in place');
  assert.equal(await shown(), 7, 'the table did not show every row after Clear filters');

  // A filter stays on its column when another column before it is hidden or shown again
  await p.fill('thead tr.fr input[aria-label="Filter Name"]', 'ZH-PC');
  await p.dispatchEvent('thead tr.fr input[aria-label="Filter Name"]', 'input'); await p.waitForTimeout(150);
  const narrowed = await shown();
  await p.evaluate(async () => { const v = await import('/js/02-views.js'); window.__hid = v.hiddenCols().slice(); v.setHiddenCols([...window.__hid, 'code']); (await import('/js/07-render.js')).render(); });
  await p.waitForTimeout(200);
  assert.equal(await p.inputValue('thead tr.fr input[aria-label="Filter Name"]'), 'ZH-PC', 'the filter moved off its column');
  assert.equal(await shown(), narrowed, 'the filter applies to another column now');
  await p.evaluate(async () => { const v = await import('/js/02-views.js'); v.setHiddenCols(window.__hid); (await import('/js/07-render.js')).render(); });
  await p.waitForTimeout(200);
  assert.equal(await p.inputValue('thead tr.fr input[aria-label="Filter Name"]'), 'ZH-PC');
  assert.equal(await shown(), narrowed);
  await p.click('#clearF'); await p.waitForTimeout(150);

  assert.deepEqual(errors, [], 'page errors');
  console.log('table tools: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
