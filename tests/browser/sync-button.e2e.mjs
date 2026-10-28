/* The Sync button at the right of the tab bar: admins only, each source set up with when it last ran and what it
   brought; a sync started there that fails turns the button red, and the menu says why and leads to its settings. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-sync-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const today = new Date(); today.setHours(6, 0, 0, 0);
saveState(db, { ...loadState(db), lsSource: 'push',
  ldap: { url: 'ldaps://127.0.0.1:1', searchBase: 'OU=Users,DC=example,DC=ch', serviceDn: 'CN=svc,DC=example,DC=ch' },
  syncRuns: { lansweeper: { at: today.toISOString(), ok: true, how: 'push', counts: { created: 5, updated: 12, review: 2 } } },
  objs: [], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#syncBtn');

  // the menu: Lansweeper by push (no button), with its last push; Active Directory not run yet
  await p.click('#syncBtn');
  await p.waitForSelector('#syncMenu');
  const menu = await p.textContent('#syncMenu');
  assert.match(menu, /Lansweeper.*today 06:00 · push · 3 added · 12 updated · 2 new in To review.*by push/s);
  assert.match(menu, /Active Directory.*not run yet/s);
  assert.equal(await p.locator('#syncMenu [data-sync="lansweeper"]').count(), 0, 'a push cannot be started from here');
  assert.equal(await p.locator('#syncMenu [data-sync="all"]').count(), 0, 'one source to run: no Sync all');

  // a sync that fails: red button, the reason in the menu, a way to its settings
  await p.click('#syncMenu [data-sync="ldap"]');
  await p.waitForFunction(() => document.querySelector('#toast').classList.contains('err') && /Active Directory:/.test(document.querySelector('#toast').textContent));
  await until(p, () => document.querySelector('#syncBtn.failed'));
  assert.equal(loadState(db).syncRuns.ldap.ok, false, 'the failure is kept on the server');
  await p.waitForSelector('#syncMenu .sync-err');
  if (process.env.NI_SHOTS) await p.screenshot({ path: path.join(process.env.NI_SHOTS, 'sync-menu.png'), clip: { x: 800, y: 0, width: 600, height: 300 } });
  await p.click('#syncMenu [data-syncset="directory"]');
  await p.waitForSelector('#setLdap #lk_url');
  await p.click('#setClose');

  // Escape closes the menu
  await p.click('#syncBtn'); await p.waitForSelector('#syncMenu');
  await p.keyboard.press('Escape'); await p.waitForSelector('#syncMenu', { state: 'detached' });

  // a viewer has no Sync button
  const s = loadState(db);
  saveState(db, { ...s, users: [...s.users, { id: 'v1', login: 'view', name: 'Viewer', role: 'viewer', active: true, source: 'manual' }] });
  const { setPassword } = await import('../../server/auth.js'); setPassword(db, 'v1', 'viewerpass1234');
  const v = await (await browser.newContext()).newPage();
  await v.goto(`http://127.0.0.1:${server.address().port}/`); await v.waitForSelector('#lgUser');
  await v.fill('#lgUser', 'view'); await v.fill('#lgPw', 'viewerpass1234'); await v.click('#lgOk');
  await v.waitForSelector('#tabsbar [data-tab=cards]');
  assert.equal(await v.locator('#syncBtn').count(), 0);

  assert.deepEqual(errors, []);
  console.log('sync button: all checks passed');
} finally { await browser.close(); server.close(); }
