/* Browser test of the device page's Timeline: the device's life newest first, in the app's colours, short with Show all;
   a field edited on the page joins it at once; a viewer sees it too, without Restore in the history. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { setPassword } from '../../server/auth.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { storedBy, until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-timeline-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db), y = new Date().getFullYear();
saveState(db, { ...s0, locs: ['Bern / EG', 'Bern / 1'], sites: ['Bern'],
  users: [...s0.users, { id: 'u-v', login: 'vera', name: 'Vera Viewer', role: 'viewer', source: 'manual', active: true, groups: [] }],
  contracts: [{ id: 'c1', name: 'Lease 7', kind: 'lease', start: `${y - 2}-03-01`, end: `${y + 1}-02-28`, devices: ['n1'] }],
  objs: [{ id: 'n1', code: 'INV-n1', type: 'notebook', name: 'NB-1', status: 'active', loc: 'Bern / EG', ovr: {}, feed: null, purchased: `${y - 2}-03-01`, warranty: `${y + 1}-03-01`,
    maint: [{ id: 'm1', what: 'Battery check', every: 1, unit: 'y', due: `${y + 1}-01-10`, last: `${y - 1}-01-10`, log: [{ at: `${y - 1}-01-10`, by: 'Admin' }] }] }],
  history: { n1: [
    { t: `01.02.${y - 1} 09:00`, msg: 'Handed out to Anna Muster by Admin' },
    { t: `02.03.${y - 2} 10:00`, msg: 'Created manually by Admin' }] } });
setPassword(db, 'u-v', 'verapass12345');
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const open = async (user, pw) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-start-hidden', '1'); localStorage.setItem('ni-started', '1'); localStorage.setItem('ni-all-fields', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', user); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await until(p, async () => !!(await import('/js/01-core.js')).st.meId);
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('n1'));
  await p.waitForSelector('#tlPanel');
  return p;
};
const events = p => p.$$eval('#tlPanel .tl-ev', l => l.map(e => [e.dataset.tl, e.className.replace(/\btl-ev\b\s*/, '').trim(), e.querySelector('.tl-text').textContent.trim()]));
try {
  const p = await open('admin', 'adminpass123');
  // newest first, things to come on top; six shown, Show all lists the rest
  const first = await events(p);
  assert.equal(first.length, 6);
  assert.deepEqual(first.slice(0, 3).map(e => e[0]), ['replace', 'warranty', 'contract'], JSON.stringify(first));
  assert.match(first[1][1], /tl-ok tl-future/);
  assert.match(first[0][2], /Replacement planned, by its lifetime · to come/);
  assert.match(await p.textContent('#tlPanel summary'), /Timeline\s*8/);
  await p.click('#tlMore');
  const all = await events(p);
  assert.deepEqual(all.map(e => e[0]), ['replace', 'warranty', 'contract', 'user', 'maint', 'added', 'buy', 'contract']);
  assert.deepEqual(all.find(e => e[0] === 'user'), ['user', 'tl-ok', 'Handed out to Anna Muster']);
  assert.equal(await p.getAttribute('#tlMore', 'aria-expanded'), 'true');
  // a field edited here joins it at once: the location, now the newest past event
  await p.selectOption('#f_n1_loc', 'Bern / 1').catch(async () => { await p.fill('#f_n1_loc', 'Bern / 1'); });
  await p.keyboard.press('Tab');
  await until(p, () => [...document.querySelectorAll('#tlPanel .tl-ev')].some(e => e.dataset.tl === 'move' && /Moved to Bern \/ 1/.test(e.textContent)));
  assert.equal((await events(p))[3][0], 'move');
  assert.ok(await p.locator('#histPanel [data-hrestore]').count() > 0, 'an admin can restore the location');

  // a viewer sees the timeline, and no Restore (once the move is on the server)
  await storedBy(() => loadState(db), st => st.objs.find(o => o.id === 'n1').loc === 'Bern / 1' && (st.history.n1 || []).some(h => /Bern \/ 1/.test(h.msg || '')));
  const v = await open('vera', 'verapass12345');
  assert.ok((await events(v)).some(e => e[0] === 'move'));
  assert.equal(await v.locator('#histPanel [data-hrestore]').count(), 0);
  assert.equal(await v.isDisabled('#tlMore'), false, 'Show all works for a viewer too');
  assert.deepEqual(errors, []);
  console.log('timeline: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
