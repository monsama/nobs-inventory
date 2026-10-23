/* Two people on the same inventory, in two windows: separate edits both survive; an edit to a record that the
   other person changed first is refused and the window shows the newer version; a deletion reaches the other
   window; a stale copy does not bring a deleted object back; two new objects get different codes. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState } from '../../server/state.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-conc-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const person = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  return p;
};
const person2 = async (ctx, login, password) => {
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', login); await p.fill('#lgPw', password); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  return p;
};
const serverObj = name => loadState(db).objs.find(o => o.name === name);
const waitServer = async (fn, what) => {
  for (let i = 0; i < 60; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail('the server did not get: ' + what);
};
const editModel = async (p, name, model) => {
  await p.click('#tabsbar [data-tab=table]');
  await p.locator('table.grid td', { hasText: new RegExp(`^${name}$`) }).first().click();
  const id = await p.evaluate(async n => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName(n).id); }, name);
  await p.fill(`#f_${id}_model`, model); await p.click('#saveBtn');
};

try {
  const a = await person(), b = await person();

  // 1. Separate records: both saves survive.
  await editModel(a, 'ZH-PC-0142', 'A MODEL');
  await editModel(b, 'MON-0433', 'B MODEL');
  await waitServer(() => serverObj('ZH-PC-0142')?.model === 'A MODEL' && serverObj('MON-0433')?.model === 'B MODEL', 'both separate edits');

  // 2. The same record: A saves first; B, who did not see it, is refused and sees A's version.
  await editModel(a, 'SRV-ZH-HV01', 'A SERVER');
  await waitServer(() => serverObj('SRV-ZH-HV01')?.model === 'A SERVER', 'A server edit');
  await editModel(b, 'SRV-ZH-HV01', 'B SERVER');
  await b.waitForFunction(() => /changed by someone else/.test(document.querySelector('#toast').textContent));
  await b.waitForSelector('#rfKeep');
  assert.ok((await b.textContent('#mdl')).includes('B SERVER'), 'the refused edit is not listed');
  await b.click('#rfKeep');
  await until(b, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('SRV-ZH-HV01').model === 'A SERVER'); }, null, { timeout: 5000 });
  assert.equal(serverObj('SRV-ZH-HV01').model, 'A SERVER', 'the refused edit reached the server');

  // 2b. A refused edit can be applied again: B gets A's version, then applies B's own change.
  await editModel(a, 'ZH-PC-0142', 'A FIRST');
  await waitServer(() => serverObj('ZH-PC-0142')?.model === 'A FIRST', 'A edit');
  await editModel(b, 'ZH-PC-0142', 'B SECOND');
  await b.waitForSelector('#rfApply');
  await b.click('#rfApply');
  await waitServer(() => serverObj('ZH-PC-0142')?.model === 'B SECOND', 'the refused edit, applied again');

  // 3. A deletion reaches the other window when it looks for changes. A first looks for changes too, as it does every 15 seconds.
  await a.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render-plans.js')]); return (__mods[0].checkForChanges()); });
  await a.click('#tabsbar [data-tab=table]');
  await a.locator('table.grid td', { hasText: /^MON-0433$/ }).first().click();
  await a.click('details.menu > summary'); await a.click('#purgeBtn'); await a.click('#pgOk');
  await waitServer(() => !serverObj('MON-0433'), 'the deletion');
  await b.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render-plans.js')]); return (__mods[0].checkForChanges()); });
  await until(b, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].byName('MON-0433') === undefined); }, null, { timeout: 5000 });

  // 4. A stale window saves an edit to another record: the deleted object does not come back.
  await editModel(b, 'ZH-NB-0201', 'B LAPTOP');
  await waitServer(() => serverObj('ZH-NB-0201')?.model === 'B LAPTOP', 'B edit after the deletion');
  assert.equal(serverObj('MON-0433'), undefined, 'the deleted object came back');

  // 5. Two new objects at the same time: different codes.
  for (const [p, name] of [[a, 'NEW-A'], [b, 'NEW-B']]) {
    await p.click('#newBtn'); await p.waitForSelector('#nName');
    await p.fill('#nName', name); await p.click('#nOk');
  }
  await waitServer(() => serverObj('NEW-A') && serverObj('NEW-B'), 'both new objects');
  assert.notEqual(serverObj('NEW-A').code, serverObj('NEW-B').code, 'two objects share a code');
  assert.ok(serverObj('NEW-A').code && serverObj('NEW-B').code, 'a new object has no code');

  // A viewer does not get Clear inventory.
  const { setPassword } = await import('../../server/auth.js');
  const { loadState: load2, saveState: save2 } = await import('../../server/state.js');
  const st0 = load2(db);
  st0.users.push({ id: 'u-viewer', login: 'viewer', name: 'Viewer', dept: '', groups: [], source: 'manual', active: true, role: 'viewer' });
  save2(db, st0); setPassword(db, 'u-viewer', 'viewerpass123');
  const vctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const v = await person2(vctx, 'viewer', 'viewerpass123');
  await v.click('#setBtn');
  assert.equal(await v.locator('#setReset').count(), 0, 'a viewer can see Clear inventory');
  await vctx.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser two users: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
