/* Every dialog has minimize, maximize and close in its top right corner, as in NOBS SQL Editor. A minimized dialog keeps
   what was typed in it and waits as a chip at the bottom right; Escape does not close it while it is minimized. The
   sign-in dialog has none. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-wctl-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  assert.equal(await p.locator('#mdl .wctl').count(), 0, 'no window controls on the sign-in');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => !document.querySelector('#lgUser'));

  await p.click('#newBtn'); await p.waitForSelector('#nName');
  assert.equal(await p.locator('#mdl .mh .wctl button').count(), 3, 'minimize, maximize and close in the header');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nName', 'the first field has the focus, not a window button');
  await p.fill('#nName', 'ZH-PC-0999');

  // maximize and back
  const w0 = await p.$eval('#mdl .box', b => b.getBoundingClientRect().width);
  await p.click('.wc-max');
  assert.ok(await p.$eval('#mdl .box', b => b.getBoundingClientRect().width) > w0 + 200, 'maximized it fills the window');
  assert.equal(await p.getAttribute('.wc-max', 'title'), 'Restore');
  await p.click('.wc-max');
  assert.equal(Math.round(await p.$eval('#mdl .box', b => b.getBoundingClientRect().width)), Math.round(w0));

  // minimize: hidden, a chip in the corner; Escape leaves it; restore keeps what was typed
  await p.click('.wc-min');
  assert.equal(await p.isVisible('#mdl'), false);
  assert.equal(await p.textContent('#mdlTray .tray-open'), 'New object');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#mdl').count(), 1, 'Escape does not close a minimized dialog');
  await p.click('#mdlTray .tray-open');
  assert.equal(await p.isVisible('#mdl'), true);
  assert.equal(await p.inputValue('#nName'), 'ZH-PC-0999', 'what was typed is kept');
  assert.equal(await p.locator('#mdlTray').count(), 0, 'the chip is gone once restored');

  // the × of the chip closes it; the × of the dialog too
  await p.click('.wc-min'); await p.click('#mdlTray .tray-x');
  assert.equal(await p.locator('#mdl').count(), 0);
  await p.click('#setBtn'); await p.waitForSelector('#setPane');
  await p.click('.wc-close');
  assert.equal(await p.locator('#mdl').count(), 0, 'Settings closes from the corner');

  // opening another dialog while one is minimized takes its place
  await p.click('#newBtn'); await p.waitForSelector('#nName'); await p.click('.wc-min');
  await p.click('#setBtn'); await p.waitForSelector('#setPane');
  assert.equal(await p.locator('#mdlTray').count(), 0);
  assert.deepEqual(errors, []);
  console.log('window controls: ok');
} finally { await browser.close(); server.close(); }
