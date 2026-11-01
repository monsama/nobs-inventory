/* Browser test of "my devices": a viewer who sees only their own devices confirms one and reports a problem; an admin
   sees the report on the device and in Data quality, and marks it done. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { setPassword } from '../../server/auth.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { eventually } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-mine-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, uid) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: 'Bern / EG', uid, ovr: {}, feed: null });
saveState(db, { ...s0, history: {}, locs: ['Bern / EG'],
  users: [...s0.users, { id: 'u-own', login: 'anna', name: 'Anna Muster', role: 'viewer', own: true, source: 'manual', active: true, groups: [] }],
  objs: [dev('a1', 'u-own'), dev('x9', null)] });
setPassword(db, 'u-own', 'annapass12345');
const until = (check, ms = 8000) => eventually(check, ms);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async (p, user, pw) => {
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', user); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await until(() => p.evaluate(async () => !!(await import('/js/01-core.js')).st.meId));
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await signIn(p, 'anna', 'annapass12345');
  assert.deepEqual(await p.evaluate(async () => (await import('/js/01-core.js')).objs.map(o => o.id)), ['a1'], 'only her own device');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObjs(['a1']));
  await p.waitForSelector('[data-mine]');
  await p.click('[data-mine]');
  await until(() => p.evaluate(async () => !!(await import('/js/01-core.js')).objs[0].verified));
  await p.click('[data-myreport]'); await p.fill('#myRep', 'The battery is swollen'); await p.click('#myRepOk');
  await until(() => p.evaluate(async () => (await import('/js/01-core.js')).objs[0].reported?.text === 'The battery is swollen'));

  const ctx2 = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); } catch { /* none */ } });
  const q = await ctx2.newPage(); q.on('pageerror', e => errors.push(e.message));
  await signIn(q, 'admin', 'adminpass123');
  await q.click('#tabsbar [data-tab=overview]');
  await q.waitForSelector('[data-ovq="reported"]');
  // the list of reported problems on the Overview: open, done there (with Undo), then under Done
  assert.match(await q.textContent('#ovReported'), /Reported problems\s*1 open[\s\S]*battery is swollen[\s\S]*Anna/);
  await q.click('#ovReported [data-repdone="a1"]');
  const stored = () => loadState(db).objs.find(o => o.id === 'a1').reported;
  await until(() => stored()?.done?.by === 'Admin' || !!stored()?.done);
  await q.waitForSelector('#ovReported .ov-done');
  assert.match(await q.textContent('#ovReported'), /none open[\s\S]*Done in the last 30 days \(1\)/);
  assert.equal(await q.locator('[data-ovq="reported"]').count(), 0, 'done: not a data quality problem any more');
  await q.click('#toast .t-undo');
  await until(() => stored() && !stored().done);
  // and on the device page
  await q.evaluate(async () => (await import('/js/02-views.js')).openObjs(['a1']));
  await q.waitForSelector('.stk-note [data-repdone]');
  assert.match(await q.textContent('.stk-note.warn'), /battery is swollen/);
  await q.click('.stk-note [data-repdone]');
  await until(() => !!stored()?.done);
  assert.equal(await q.locator('.stk-note [data-repdone]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('my devices: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
