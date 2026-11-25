/* Browser test: Buy me a coffee is always in the top bar (in the account menu on a phone, where the search needs the
   room), and the version is always at the right end of the status bar, once: a button to About on a screen with room,
   text on a phone. */
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
    assert.equal(await p.getAttribute('#coffeeBtn', 'href'), 'https://buymeacoffee.com/monsama');
    if (name === 'desktop') {
      assert.equal(await p.isVisible('header #coffeeBtn'), true, 'coffee in the top bar');
      assert.equal((await p.textContent('#coffeeBtn')).trim(), 'Buy me a coffee');
      assert.equal(await p.isVisible('#verTxt'), false, 'the version once');
      assert.equal(await p.textContent('#verBtn'), 'v' + version);
      await p.click('#verBtn'); await p.waitForSelector('#setPane');
      assert.match(await p.textContent('#setPane'), new RegExp(version.replace(/\./g, '\\.')), 'About says the version');
      await p.keyboard.press('Escape');
      // every width with room for the bar: nothing overlaps, the coffee never spills its words (a bell with a count too)
      await p.evaluate(() => { const b = document.getElementById('bellBtn'); b.hidden = false; const n = document.getElementById('bellN'); n.hidden = false; n.textContent = '1'; });
      for (let w = 770; w <= 1600; w += 30) {
        await p.setViewportSize({ width: w, height: 800 });
        const bad = await p.evaluate(() => {
          const c = document.getElementById('coffeeBtn');
          const items = [...document.querySelectorAll('#bar > *')].filter(e => e.offsetParent && !e.matches('[popover]')).map(e => e.getBoundingClientRect()).filter(r => r.width);
          const over = items.some((a, i) => items.slice(i + 1).some(b => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
          return c.scrollWidth > c.clientWidth + 1 || over;
        });
        assert.equal(bad, false, `the top bar at ${w}px`);
      }
    } else {
      assert.equal(await p.isVisible('header #coffeeBtn'), false, 'the search keeps the room');
      assert.ok((await p.locator('#gsBox').boundingBox()).width > 90, 'the search is usable');
      await p.click('#barMoreBtn'); assert.equal(await p.isVisible('#barMore #coffeeMenu'), true, 'coffee in the account menu');
      await p.keyboard.press('Escape');
      assert.equal(await p.isVisible('#verBtn'), false); assert.equal(await p.isVisible('#verTxt'), true);
      assert.equal(await p.textContent('#verTxt'), 'v' + version);
    }
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('coffee and version: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
