/* Your own account: the name at the top opens the account dialog, Sign out is its own button, and a password change
   needs the current password. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-account-'));
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
  assert.equal(await p.isVisible('#signOutBtn'), true, 'there is no Sign out button of its own');
  await p.click('#whoBtn');
  await p.waitForSelector('#acFirst');
  await p.fill('#acFirst', 'Viktor'); await p.fill('#acLast', 'Ljuca'); await p.fill('#acDept', 'IT');
  await p.click('#acSave');
  await p.waitForFunction(() => /Viktor Ljuca/.test(document.querySelector('#whoBtn').textContent), null, { timeout: 5000 });
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/04-settings.js')]); return (__mods[0].USERS.find(u => u.login === 'admin').dept); }), 'IT', 'the department was not saved');
  // Password: a wrong current password is refused and nothing changes.
  await p.click('#whoBtn'); await p.waitForSelector('#acPw');
  await p.fill('#acCur', 'wrong-pass'); await p.fill('#acNew', 'newpass12345'); await p.fill('#acNew2', 'newpass12345');
  await p.click('#acPw');
  await p.waitForFunction(() => /not right/.test(document.querySelector('#acErr').textContent), null, { timeout: 5000 });
  await p.fill('#acCur', 'adminpass123'); await p.fill('#acNew2', 'different1');
  await p.click('#acPw');
  await p.waitForFunction(() => /not the same/.test(document.querySelector('#acErr').textContent), null, { timeout: 5000 });
  await p.fill('#acNew2', 'newpass12345'); await p.click('#acPw');
  await p.waitForFunction(() => document.querySelector('#acPw') === null, null, { timeout: 5000 });
  const signIn = await p.evaluate(async () => (await fetch('api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({login:'admin', password:'newpass12345'})})).status);
  assert.equal(signIn, 200, 'the new password does not sign in');
  await p.click('#signOutBtn');
  await p.waitForSelector('#lgUser', { timeout: 10000 });
  assert.deepEqual(errors, [], 'page errors');
  console.log('account: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
