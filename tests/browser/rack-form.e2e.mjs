/* The rack part of an object: the Mounted at row shows only for a device in a rack, and the dropdowns are as wide as the text fields. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rackform-'));
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
  const widths = () => p.evaluate(() => { const w = s => Math.round(document.querySelector(s).getBoundingClientRect().width); return [w('#f_o5_name'), w('#f_o5_loc'), w('#f_o5_status'), w('#rk_rack'), w('#rk_top')]; });
  for (const linked of [false, true]) {
    await p.evaluate(async linked => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js'), import('/js/02-views.js')]); __mods[0].st.useLansweeper = true; __mods[0].st.lsSource = 'push'; __mods[0].st.feedOn = true; const o = __mods[0].byId('o5'); o.rack = 'R-SRV'; o.u = 3; o.h = 2; o.feed = linked ? {sys:'Lansweeper', ref:'9', seen:'22.10.2026 19:30'} : null; __mods[0].st.tab = 'cards'; __mods[1].render(); __mods[2].openObj('o5'); }, linked);
    await p.waitForSelector('#rk_rack');
    const w = await widths();
    assert.equal(new Set(w).size, 1, `the dropdowns and text fields differ in width (${linked ? 'linked' : 'not linked'}): ${w.join(', ')}`);
    assert.equal(await p.evaluate(() => document.querySelector('.rk-mount').hidden), false, 'the Mounted at row is hidden for a device in a rack');
  }
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js'), import('/js/02-views.js')]); __mods[0].byId('o5').rack = null; __mods[0].st.tab = 'cards'; __mods[1].render(); __mods[2].openObj('o5'); });
  await p.waitForSelector('#rk_rack');
  assert.equal(await p.evaluate(() => document.querySelector('.rk-mount').hidden), true, 'the Mounted at row shows for a device not in a rack');
  await p.selectOption('#rk_rack', 'R-2OG');
  assert.equal(await p.evaluate(() => document.querySelector('.rk-mount').hidden), false, 'picking a rack does not show Mounted at');
  await p.selectOption('#rk_rack', '');
  assert.equal(await p.evaluate(() => document.querySelector('.rk-mount').hidden), true, 'choosing no rack does not hide Mounted at');
  assert.deepEqual(errors, [], 'page errors');
  console.log('rack form: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
