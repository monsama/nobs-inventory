/* Ticking a device in a long, grouped list keeps the list where it is (the browser's scroll anchoring moved it). */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-tick-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const objs = [];
for (let i = 0; i < 300; i++) objs.push({ id: 'd' + i, code: 'INV-' + i, type: ['pc','printer','plc','notebook'][i % 4], name: 'DEV-' + i, purpose: i % 3 ? 'Desc ' + i : '', status: 'active', loc: 'Main / Office', ovr: {}, inAd: i % 2 === 0 });
saveState(db, { ...loadState(db), sites: ['Main'], locs: ['Main / Office'], objs, rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); await p.waitForSelector('#cards .lrow');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.group = 'type'; (await import('/js/07-render.js')).view(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const v = document.querySelector('#view'); (v.scrollHeight > v.clientHeight ? v : document.scrollingElement).scrollTop = 1500; });
  await p.waitForTimeout(300);
  const id = await p.evaluate(() => { const r = [...document.querySelectorAll('#cards .lrow')].find(x => { const b = x.getBoundingClientRect(); return b.top > 400 && b.top < 500; }); return r.dataset.open; });
  const top = () => p.evaluate(id => Math.round(document.querySelector(`#cards .lrow[data-open="${id}"]`).getBoundingClientRect().top), id);
  const before = await top();
  await p.click(`#cards .lrow[data-open="${id}"] .cardtick`);
  await p.waitForTimeout(500);
  assert.equal(await top(), before, 'the ticked row stays where it was');
  await p.click(`#cards .lrow[data-open="${id}"] .cardtick`); await p.waitForTimeout(300);
  assert.equal(await top(), before, 'and when it is ticked off again');
  console.log('tick scroll: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
