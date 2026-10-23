/* The panels of an object stay open or closed as the person left them, across redraws and a reload. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-panels-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js'), import('/js/02-views.js')]); localStorage.removeItem('ni-collapsed-panels'); __mods[0].st.tab = 'cards'; __mods[1].render(); __mods[2].openObj('o1'); });
  await p.waitForSelector('.obj');
  const state = title => p.evaluate(t => { const h = [...document.querySelectorAll('.obj .panelbox > .hdr')].find(x => x.childNodes[0].textContent.trim() === t); return h ? h.parentNode.classList.contains('collapsed') : null; }, title);
  assert.equal(await state('Properties'), false, 'Properties does not open by default');
  await p.click('.obj .panelbox > .hdr:has-text("Properties")');
  assert.equal(await state('Properties'), true, 'the panel did not close');
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render-plans.js'), import('/js/02-views.js')]); __mods[0].render(); __mods[1].openObj('o1'); });
  await p.waitForSelector('.obj');
  assert.equal(await state('Properties'), true, 'the closed panel opened again after a redraw');
  await p.reload(); await p.waitForSelector('#lgUser, #tabsbar');
  if (await p.isVisible('#lgUser')) { await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); }
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js'), import('/js/02-views.js')]); __mods[0].st.tab = 'cards'; __mods[1].render(); __mods[2].openObj('o1'); });
  await p.waitForSelector('.obj');
  assert.equal(await state('Properties'), true, 'the closed panel opened again after a reload');
  assert.equal(await state('Relations'), false, 'an open panel closed by itself');
  await p.click('.obj .panelbox > .hdr:has-text("Properties")');
  assert.equal(await state('Properties'), false, 'the panel did not open again');
  assert.deepEqual(errors, [], 'page errors');
  console.log('panels: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
