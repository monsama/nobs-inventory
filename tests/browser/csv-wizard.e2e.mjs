/* The CSV import wizard: a file with odd headings and semicolons, the delimiter shown, columns matched by their names
   (and one mapped by hand, remembered for the next file), the problems of each row, one duplicate found by its serial
   number that fills only its empty fields, the import saved, and one Undo that takes it all back. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until, storedBy } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-csvwiz-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const file = path.join(dir, 'devices.csv');
fs.writeFileSync(file, [
  'Hostname;Device Type;Serial Number;Room;IP Address;Bought;Kit;Junk',
  'NEW-NB-01;Laptop;SN-NEW-1;Büro 2.OG;10.1.2.3;31.12.2025;Latitude 7450;x',
  'OTHER-NAME;pc;SN-ZH-PC-0142;;10.9.9.9;;Ignored model;y',
  'BAD-1;toaster;;;300.1.1.1;32.13.2025;;z',
].join('\r\n') + '\r\n');
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const count = () => p.evaluate(async () => (await import('/js/01-core.js')).objs.length);
  const before = await count();

  await p.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'table'; (await import('/js/07-render.js')).render(); });
  await p.click('#csvImp');
  // (a) the file, and the delimiter found in it
  await p.setInputFiles('#csvFile', file);
  await p.waitForSelector('#csvDelim');
  assert.equal(await p.textContent('#csvDelim'), 'semicolon');
  assert.match(await p.textContent('#csvInfo'), /8 columns · 3 rows/);
  await p.click('#csvNext');

  // (b) the columns: matched by their headings, Kit mapped by hand, Junk left out
  const field = h => p.inputValue(`select[aria-label="Field for the column ${h}"]`);
  assert.deepEqual(await Promise.all(['Hostname', 'Device Type', 'Serial Number', 'Room', 'IP Address', 'Bought', 'Kit', 'Junk'].map(field)),
    ['name', 'type', 'serial', 'loc', 'ip', 'purchased', '', '']);
  await p.selectOption('select[aria-label="Field for the column Kit"]', 'model');
  assert.equal(await field('Kit'), 'model');
  await p.click('#csvNext');

  // (c) the preview: one new, one duplicate (by serial number), one with its problems
  await p.waitForSelector('#csvPrev');
  assert.match(await p.textContent('#csvCounts'), /1 new.*1 duplicate.*1 with problems/);
  const bad = await p.textContent('tr[data-csvline="4"]');
  assert.match(bad, /unknown type "toaster"/); assert.match(bad, /bad IP address "300\.1\.1\.1"/); assert.match(bad, /bad date "32\.13\.2025"/);
  const dup = await p.textContent('tr[data-csvline="3"]');
  assert.match(dup, /Same serial number as ZH-PC-0142/);
  assert.match(dup, /empty there: IP address/, 'only the empty IP address is offered, not the model it has');
  assert.equal(await p.textContent('#csvGo'), 'Import 1', 'a duplicate is skipped unless picked');
  await p.selectOption('select[data-csvdup="3"]', 'update');
  assert.equal(await p.textContent('#csvGo'), 'Add 1 and update 1');
  await p.click('#csvGo');

  const dev = name => p.evaluate(async n => { const o = (await import('/js/01-core.js')).byName(n); return o ? { type: o.type, loc: o.loc, ip: o.ip, model: o.model, serial: o.serial, purchased: o.purchased } : null; }, name);
  await until(p, async () => !!(await import('/js/01-core.js')).byName('NEW-NB-01'));
  assert.deepEqual(await dev('NEW-NB-01'), { type: 'notebook', loc: 'Zürich HQ / Büro 2.OG', ip: '10.1.2.3', model: 'Latitude 7450', serial: 'SN-NEW-1', purchased: '2025-12-31' });
  assert.deepEqual(await dev('ZH-PC-0142'), { type: 'pc', loc: 'Zürich HQ / Büro 2.OG', ip: '10.9.9.9', model: 'Test model', serial: 'SN-ZH-PC-0142', purchased: undefined }, 'the duplicate got more than its empty fields');
  assert.equal(await dev('BAD-1'), null); assert.equal(await dev('OTHER-NAME'), null);
  assert.equal(await count(), before + 1);
  await storedBy(() => loadState(db), s => s.objs.some(o => o.name === 'NEW-NB-01') && s.objs.find(o => o.name === 'ZH-PC-0142').ip === '10.9.9.9');

  // The mapping is kept: the same headings are mapped the same way next time.
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('ni-csv-map')).kit), 'model');
  await p.click('#csvImp'); await p.setInputFiles('#csvFile', file); await p.waitForSelector('#csvDelim'); await p.click('#csvNext');
  assert.equal(await field('Kit'), 'model', 'the mapping was not remembered');
  await p.click('#csvCancel');

  // One Undo takes back both the new device and the filled field.
  await p.click('#toast .t-undo');
  await until(p, async () => !(await import('/js/01-core.js')).byName('NEW-NB-01'));
  assert.equal((await dev('ZH-PC-0142')).ip, undefined);
  assert.equal(await count(), before);
  await storedBy(() => loadState(db), s => !s.objs.some(o => o.name === 'NEW-NB-01') && !s.objs.find(o => o.name === 'ZH-PC-0142').ip);

  assert.deepEqual(errors, [], 'page errors');
  console.log('csv wizard: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
