/* Browser test of Settings → Users: search and filters, and a possible duplicate merged (the devices go along) or kept apart. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-udup-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const P = (id, name, extra = {}) => ({ id, name, role: 'none', groups: [], active: true, source: 'manual', ...extra });
saveState(db, { ...s0, history: {},
  users: [...s0.users, P('u-ldap', 'Anna Muster', { source: 'ldap', login: 'amuster', dept: 'Sales' }), P('u-ls', 'amuster', { source: 'lansweeper', login: 'CORP\\amuster' }),
    P('u-e1', 'Eva Roth'), P('u-e2', 'Roth, Eva', { source: 'lansweeper' }), P('u-x', 'Xaver Solo', { active: false })],
  objs: [{ id: 'o1', code: 'INV-1', type: 'notebook', name: 'NB-ANNA', status: 'active', loc: '', uid: 'u-ls', ovr: {}, feed: null }] });
const until = (check, ms = 8000) => eventually(check, ms);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.setTab = 'users'; (await import('/js/04-settings.js')).openSettings(); });
  await p.waitForSelector('#uQ');
  const names = () => p.$$eval('#setUsers table.grid tbody tr', trs => trs.map(t => (t.querySelector('td input[data-uname]') || {}).value || t.querySelector('td').textContent.trim()));

  // search keeps the focus as one types; filters narrow
  await p.type('#uQ', 'roth');
  assert.deepEqual((await names()).sort(), ['Eva Roth', 'Roth, Eva']);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'uQ');
  await p.click('#uClear');
  // people without a sign-in are listed apart from the accounts; a search looked through everybody
  assert.match(await p.textContent('[data-ukind].active'), /Accounts/);
  assert.equal((await names()).includes('Eva Roth'), false);
  await p.click('[data-ukind="all"]');
  await p.selectOption('#uStatus', 'inactive');
  assert.deepEqual(await names(), ['Xaver Solo']);
  await p.click('#uClear');
  await p.check('#uDevs');
  assert.deepEqual(await names(), ['amuster']);
  await p.click('#uClear');

  // two groups: Anna by login (LDAP kept), Eva by name
  assert.equal(await p.locator('.udupe').count(), 2);
  const anna = p.locator('.udupe', { hasText: 'Anna Muster' });
  assert.match(await anna.textContent(), /Same login/);
  assert.equal(await anna.locator('input[value="u-ldap"]').isChecked(), true);
  await anna.locator('[data-dmerge]').click();
  await until(() => p.evaluate(async () => { const c = await import('/js/01-core.js'); return c.objs[0].uid === 'u-ldap'; }));
  await until(() => p.locator('.udupe').count().then(n => n === 1));
  // Eva: not the same, stays apart
  await p.locator('.udupe [data-dnot]').click();
  await until(() => p.locator('.udupes').count().then(n => n === 0));
  await until(() => p.evaluate(async () => { const r = await fetch('/api/state'); const j = await r.json(); return (j.state || j).peopleNotSame?.length === 1 || JSON.stringify(j).includes('u-e1|u-e2'); }));
  assert.deepEqual(errors, []);
  console.log('users duplicates: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
