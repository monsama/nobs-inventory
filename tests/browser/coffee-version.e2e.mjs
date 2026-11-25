/* Browser test: Buy me a coffee is always in the top bar (the cup only on a phone), and the version is always at the
   right end of the status bar: a button to About on a screen with room, text on a phone. */
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const version = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cof-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  for (const [name, opts] of [['desktop', { viewport: { width: 1400, height: 800 } }], ['phone', { ...devices['Pixel 7'] }]]) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
    await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
    await p.waitForSelector('#verBtn:not([hidden])', { state: 'attached' });
    assert.equal(await p.isVisible('header #coffeeBtn'), true, `${name}: coffee in the top bar`);
    assert.equal(await p.getAttribute('#coffeeBtn', 'href'), 'https://buymeacoffee.com/monsama');
    if (name === 'desktop') {
      assert.equal((await p.textContent('#coffeeBtn')).trim(), 'Buy me a coffee');
      assert.equal(await p.textContent('#verBtn'), 'v' + version);
      await p.click('#verBtn'); await p.waitForSelector('#setPane');
      assert.match(await p.textContent('#setPane'), new RegExp(version.replace(/\./g, '\\.')), 'About says the version');
    } else {
      assert.equal(await p.isVisible('#verBtn'), false); assert.equal(await p.isVisible('#verTxt'), true);
      assert.equal(await p.textContent('#verTxt'), 'v' + version);
    }
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('coffee and version: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
