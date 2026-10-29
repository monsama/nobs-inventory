/* Picking several cards: Ctrl+click or a card's corner picks one, Shift+click a range. In Cards the pick is the Table's
   selection and opens as tabs; in To review it is accepted or ignored at once, with one Undo. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { mergeRecords } from '../../server/feed.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-pick-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db);
mergeRecords(s, Array.from({ length: 6 }, (_, i) => ({ name: 'NEW-PC-' + i, serial: 'NS' + i, ip: '10.9.0.' + (i + 1), assetType: 'Windows', model: 'HP', ref: String(900 + i) })), new Date());
saveState(db, s);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const core = fn => p.evaluate(fn);

  // Cards: Ctrl+click one, Shift+click to the fourth: four picked, shared with the Table
  await p.click('#tabsbar [data-tab=cards]'); await p.waitForSelector('#cards .card');
  const cards = p.locator('#cards .card');
  const names = await cards.evaluateAll(cs => cs.slice(0, 4).map(c => c.dataset.open));
  await cards.nth(0).click({ modifiers: ['Control'] });
  assert.equal(await p.locator('#tabsbar [data-tab]').count() > 0, true);
  assert.equal(await core(async () => (await import('/js/01-core.js')).st.tab), 'cards', 'a Ctrl+click does not open the card');
  await cards.nth(3).click({ modifiers: ['Shift'] });
  await until(p, async () => (await import('/js/01-core.js')).st.bulk.size === 4);
  assert.match(await p.textContent('#toolbar'), /4 selected/);
  assert.equal(await p.locator('#cards .card.picked').count(), 4);
  // Open them all as tabs
  await p.click('#cdOpen');
  await until(p, async () => (await import('/js/01-core.js')).st.open.length === 4);
  assert.deepEqual(await core(async () => (await import('/js/01-core.js')).st.open), names);
  // the same pick in the Table, which can open them too
  await p.click('#tabsbar [data-tab=table]'); await p.waitForSelector('#bkOpen');
  assert.match(await p.textContent('#toolbar'), /4 selected/);
  // a plain click still opens a card
  await p.click('#tabsbar [data-tab=cards]'); await p.click('#cdClear');
  await cards.nth(1).click();
  await until(p, async () => (await import('/js/01-core.js')).st.tab !== 'cards');

  // To review: the corner picks one, Shift+click the range; Accept takes those three in, Undo puts them back
  await p.click('#tabsbar [data-tab=review]'); await p.waitForSelector('.rv-item .card');
  const rv = p.locator('.rv-item .card');
  await rv.nth(0).locator('.cardtick').click();
  await rv.nth(2).click({ modifiers: ['Shift'] });
  await p.waitForSelector('#rvSelAccept');
  assert.match(await p.textContent('#toolbar'), /3 selected/);
  await p.click('#rvSelAccept');
  await until(p, async () => { const c = await import('/js/01-core.js'); return c.REVIEW.length === 3 && c.objs.filter(o => /^NEW-PC/.test(o.name)).length === 3; });
  await p.click('#toast .t-undo');
  await until(p, async () => (await import('/js/01-core.js')).REVIEW.length === 6);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('picking cards: all checks passed');
} finally { await browser.close(); server.close(); }
