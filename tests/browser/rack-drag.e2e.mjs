/* Racks: a mounted device is moved by dragging it, or with the arrow keys; it never lands on another one, and a
   click without a drag still opens it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';
import { loadState } from '../../server/state.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rackdrag-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 1300 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const u = id => p.evaluate(async id => (await import('/js/01-core.js')).byId(id).u, id);
  await p.evaluate(async () => { const c = await import('/js/01-core.js');
    Object.assign(c.byId('o1'), { rack: 'R-SRV', u: 10, h: 1 }); Object.assign(c.byId('o5'), { rack: 'R-SRV', u: 20, h: 2 });
    c.st.rackId = 'R-SRV'; c.st.tab = 'rack'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('.rack [data-unit="o1"]');
  const units = await p.evaluate(async () => { const c = await import('/js/01-core.js'); return c.rackUnits(c.byId('R-SRV')); });
  /* The middle of unit n of the rack, on the page. */
  const at = async n => { const r = await p.locator('.rack').boundingBox(); return { x: r.x + r.width / 2, y: r.y + 1 + (units - n) * 24 + 12 }; };
  const drag = async (from, to) => {
    const a = await at(from), b = await at(to);
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x, a.y - 8, { steps: 2 });
    await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up();
  };
  await drag(10, 15);
  await until(p, async () => (await import('/js/01-core.js')).byId('o1').u === 15);
  assert.equal(await p.locator('#objHead, .obj').count(), 0, 'the drag opened the device');
  assert.match(await p.textContent('#toast'), /moved to U15/);
  // onto the server: refused, the switch stays
  await drag(15, 21);
  await p.waitForTimeout(300);
  assert.equal(await u('o1'), 15, 'it was dropped onto another device');
  assert.match(await p.textContent('#toast'), /taken by/);
  // a two-unit server grabbed at its upper unit keeps that unit under the pointer: dropped with its top at U30
  await drag(21, 30);
  await until(p, async () => (await import('/js/01-core.js')).byId('o5').u === 29);
  // the arrow keys move a unit at a time
  await p.focus('.rack [data-unit="o1"]'); await p.keyboard.press('ArrowUp');
  await until(p, async () => (await import('/js/01-core.js')).byId('o1').u === 16);
  // Undo in the toast puts it back
  await p.click('#toast .t-undo');
  await until(p, async () => (await import('/js/01-core.js')).byId('o1').u === 15);
  // a click without a drag opens the device
  await p.click('.rack [data-unit="o1"]');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'o1');
  /* saved on the server */
  for (let i = 0; i < 50 && loadState(db).objs.find(o => o.id === 'o1').u !== 15; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(loadState(db).objs.find(o => o.id === 'o1').u, 15, 'the move was not saved');
  assert.deepEqual(errors, [], 'page errors');
  console.log('rack drag: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
