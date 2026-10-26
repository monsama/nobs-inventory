/* Browser test of user management against a running server. Needs Playwright and a Chromium.
   Run: npm run test:browser   (set PLAYWRIGHT_CHROMIUM if Chromium is not in the default place) */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { setPassword } from '../../server/auth.js';
import { saveState } from '../../server/state.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-e2e-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, {
  objs: [], rels: [], types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG'], policy: {}, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0,
  users: [
    { id: 'u-admin', login: 'admin', name: 'Administrator', role: 'admin', active: true, source: 'manual' },
    { id: 'u-anna', login: 'anna', name: 'Anna', role: 'viewer', active: true, source: 'manual' },
    { id: 'u-dora', login: 'dora', name: 'Dora', role: 'viewer', active: false, source: 'manual' }
  ]
});
setPassword(db, 'u-anna', 'blue-river-1234');
const app = createApp({ db });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => localStorage.setItem('ni-started', '1'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForFunction(() => /Admin/.test(document.querySelector('#whoBtn').textContent));

  await page.click('#setBtn'); await page.click('#setTabs [data-st=users]');
  const rows = await page.locator('#setUsers tbody tr').count();
  assert.equal(rows, 3, 'three users are listed');
  await page.locator('[data-role="1"]').selectOption('admin');
  await page.waitForFunction(() => document.querySelector('[data-role="1"]').value === 'admin');
  // read through the page's own session (a second sign-in would end it, one session per user), until the save has landed
  let role = null;
  for (let i = 0; i < 50 && role !== 'admin'; i++) {
    await page.waitForTimeout(100);
    role = await page.evaluate(async () => (await (await fetch('api/state', { credentials: 'same-origin' })).json()).users.find(u => u.login === 'anna')?.role);
  }
  assert.equal(role, 'admin', 'the promotion is saved on the server');

  await page.locator('[data-pw="1"]').click();
  await page.fill('#pwNew', 'short');
  await page.click('#pwOk'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#toast'), /8|least|Password/i, 'a short password is refused');
  await page.fill('#pwNew', 'a-new-password-99'); await page.click('#pwOk'); await page.waitForTimeout(300);

  await page.click('#setClose');   // the password dialog went back to Settings
  await page.click('#signOutBtn'); // sign out
  await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'dora'); await page.fill('#lgPw', 'anything-here'); await page.click('#lgOk');
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#lgErr'), /not right/i, 'a deactivated user cannot sign in');

  await page.fill('#lgUser', 'anna'); await page.fill('#lgPw', 'a-new-password-99'); await page.click('#lgOk');
  await page.waitForFunction(() => /Anna/.test(document.querySelector('#whoBtn').textContent));
  assert.equal(await page.isDisabled('#newBtn'), false, 'Anna, now admin, can add objects');
  assert.equal(errors.length, 0, 'no page errors: ' + errors.join('; '));
  console.log('browser user management: all checks passed');
} finally {
  await browser.close();
  await new Promise(r => server.close(r)); db.close();
}
