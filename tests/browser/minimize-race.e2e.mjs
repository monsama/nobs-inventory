/* Browser test: a dialog minimized and restored at once stays open. The close event of minimizing comes a moment later;
   it found the dialog no longer minimized and closed it (and dropped the still copy of Settings behind it). */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-mrace-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#view');
  const open = await p.evaluate(async () => {
    const m = await import('/js/19-modal.js');
    m.modal('<div class="mh">Test</div><div class="mb">x</div>');
    m.minimizeModal(); m.restoreModal();
    await new Promise(res => setTimeout(res, 150));
    const d = document.querySelector('#mdl'); return !!d && d.open && !d.classList.contains('minimized');
  });
  assert.equal(open, true, 'restored at once: still open');
  // a real close still closes
  assert.equal(await p.evaluate(async () => { document.querySelector('#mdl').close(); await new Promise(res => setTimeout(res, 150)); return !document.querySelector('#mdl'); }), true);
  assert.deepEqual(errors, []);
  console.log('minimize race: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
