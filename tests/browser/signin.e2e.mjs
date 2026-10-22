/* Before sign-in the page shows no inventory and the sign-in dialog cannot be dismissed. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-signin-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const app = createApp({ db });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => localStorage.setItem('ni-started', '1'));
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  assert.equal(await page.locator('.card').count(), 0, 'no devices are shown before sign-in');
  await page.mouse.click(5, 450); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  assert.ok(await page.locator('#lgUser').isVisible(), 'the sign-in dialog cannot be closed by clicking outside or Escape');
  assert.equal(errors.length, 0, errors.join('; '));
  console.log('browser sign-in gate: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
