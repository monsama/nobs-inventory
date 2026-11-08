/* Racks stay consistent: whole U only, a rack never lower than what is in it, the location follows the rack, a device
   that leaves the rack types leaves the rack, and what sat on a deleted device leaves the rack too. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until, storedBy } from './until.mjs';
import { loadState } from '../../server/state.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-racklogic-'));
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
  const obj = id => p.evaluate(async id => { const o = (await import('/js/01-core.js')).byId(id); return o && JSON.parse(JSON.stringify(o)); }, id);

  // the server room rack is somewhere else: a device mounted there takes its location
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byId('R-SRV').loc = 'Zürich HQ / Serverraum'; if (!c.LOCS.includes('Zürich HQ / Serverraum')) c.LOCS.push('Zürich HQ / Serverraum'); c.st.rackId = 'R-SRV'; (await import('/js/07-render.js')).queueServerSave(); });
  await p.click('#tabsbar [data-tab=rack]'); await p.waitForSelector('#rkMount');
  await p.click('#rkMount'); await p.waitForSelector('#mdDev');
  await p.selectOption('#mdDev', 'o5'); await p.fill('#mdU', '2.5'); await p.click('#mdOk');
  assert.match(await p.textContent('#mdErr'), /whole numbers/, 'a half U is taken');
  await p.fill('#mdU', '10'); await p.fill('#mdH', '2'); await p.click('#mdOk');
  await until(p, async () => (await import('/js/01-core.js')).byId('o5').u === 10);
  assert.equal((await obj('o5')).loc, 'Zürich HQ / Serverraum', 'the mounted device is not where its rack is');
  await storedBy(() => loadState(db), t => t.objs.find(o => o.id === 'o5')?.u === 10 && t.objs.find(o => o.id === 'o5').loc === 'Zürich HQ / Serverraum');

  // the rack cannot be made lower than U11, nor a half U high
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('R-SRV'));
  await p.waitForSelector('#f_R-SRV_units');
  await p.fill('#f_R-SRV_units', '8'); await p.keyboard.press('Tab');
  await until(p, async () => /U11 is in use/.test(document.querySelector('#toast')?.textContent || ''));
  assert.equal((await obj('R-SRV')).units, 42); assert.equal(await p.inputValue('#f_R-SRV_units'), '42');
  await p.fill('#f_R-SRV_units', '20.5'); await p.keyboard.press('Tab');
  await until(p, async () => /whole units/.test(document.querySelector('#toast')?.textContent || ''));
  assert.equal((await obj('R-SRV')).units, 42);
  await p.fill('#f_R-SRV_units', '24'); await p.keyboard.press('Tab');
  await until(p, async () => (await import('/js/01-core.js')).byId('R-SRV').units === 24);

  // a switch on top of the server; deleting the server takes the switch out of the rack, not half in it
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); Object.assign(c.byId('o1'), { rack: 'R-SRV', ontop: 'o5' }); (await import('/js/03-object-modals.js')).deleteObject('o5'); });
  const sw = await obj('o1');
  assert.deepEqual([sw.rack, sw.u, sw.ontop], [undefined, undefined, undefined], 'what sat on the deleted device stays half in the rack');

  // a mounted switch that becomes a PC leaves the rack
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); Object.assign(c.byId('o1'), { rack: 'R-SRV', u: 1, h: 1 }); (await import('/js/02-views.js')).openObj('o1'); });
  await p.waitForSelector('#f_o1_type');
  await p.selectOption('#f_o1_type', 'pc');
  await until(p, async () => { const o = (await import('/js/01-core.js')).byId('o1'); return o.type === 'pc' && !o.rack; });
  assert.equal((await obj('o1')).u, undefined);

  // a retired device does not take its units: the rack view leaves it out and its place can be used
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); Object.assign(c.byId('o3'), { type: 'server', rack: 'R-SRV', u: 5, h: 1, status: 'retired' }); c.st.rackId = 'R-SRV'; c.st.tab = 'rack'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('.rack');
  assert.equal(await p.locator('.rack .unit[data-open="o3"]').count(), 0, 'a retired device is drawn in the rack');
  assert.equal(await p.evaluate(async () => (await import('/js/04-settings.js')).rackCheck('R-SRV', 5, 1, 'o2')), '');
  assert.deepEqual(errors, [], 'page errors');
  console.log('rack logic: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
