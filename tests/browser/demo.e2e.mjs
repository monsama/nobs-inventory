/* Browser test of the start: the sign-in screen shows no inventory even when the server has one, an
   unreachable server says so, a new server starts empty, and About shows the version and licence. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const SAMPLE_DEVICE = 'SRV-ZH-HV01';
const VERSION = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

const serve = async (seed) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-start-'));
  const db = openDb(path.join(dir, 'inventory.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  if (seed) seedBasics(db);
  const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => { server.close(() => { db.close(); r(); }); }) };
};
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
const signIn = async (p) => { await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); };

try {
  // 1. A server that has devices: the sign-in screen shows none of them, and the app is hidden.
  const full = await serve(true);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await page(ctx);
  await p.goto(full.base + '/'); await p.waitForSelector('#lgUser');
  assert.ok(!(await p.textContent('body')).includes(SAMPLE_DEVICE), 'devices are visible before sign-in');
  assert.equal(await p.isVisible('#tabsbar'), false, 'the app is drawn behind the sign-in dialog');
  await signIn(p);
  await p.waitForFunction(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  assert.ok((await p.textContent('#view')).length > 0 && await p.isVisible('#tabsbar'), 'the app is not shown after sign-in');
  // About: the version from the server and the licence text.
  await p.click('#setBtn'); await p.click('#setTabs [data-st=about]');
  await p.waitForSelector('#setAbout:has-text("Version")');
  const about = await p.textContent('#setAbout');
  assert.ok(about.includes(`Version ${VERSION}`), 'About shows the version');
  assert.match(about, /GNU General Public License version 3/, 'About shows the licence');
  assert.match(about, /Copyright © 2026 Viktor Ljuca/);
  await p.click('#setClose');
  assert.equal(await p.textContent('#verFoot'), `NOBS Inventory ${VERSION}`, 'the footer shows the version');
  await ctx.close(); await full.close();

  // 2. A server the page cannot reach: the page says so and offers to try again.
  const down = await serve(false);
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const q = await page(ctx2);
  await q.route('**/api/me', r => r.abort());
  await q.goto(down.base + '/'); await q.waitForSelector('#unTry');
  assert.match(await q.textContent('#mdl'), /cannot be reached/, 'an unreachable server is not reported');
  await ctx2.close(); await down.close();

  // 3. A new server with no devices: it starts empty and asks nothing.
  const empty = await serve(false);
  const ctx3 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const r = await page(ctx3);
  await r.goto(empty.base + '/'); await r.waitForSelector('#lgUser');
  await signIn(r);
  await r.waitForSelector('text=The inventory is empty');
  assert.equal(await r.locator('#mdl').count(), 0, 'a dialog opens on a new server');
  await ctx3.close(); await empty.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser start and about: all checks passed');
} finally {
  await browser.close();
}
