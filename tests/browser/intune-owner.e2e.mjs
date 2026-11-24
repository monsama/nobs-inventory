/* Browser test: a device given to someone here whose primary user in Intune is someone else says so under User / owner,
   with a button that gives it to that person; a primary user who is nobody here is said without a button. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-own-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db), person = (id, name, more) => ({ id, login: '', name, dept: '', role: 'viewer', groups: [], source: 'manual', active: true, ...more });
const dev = (id, more) => ({ id, code: 'INV-' + id, type: 'notebook', name: 'NB-' + id, status: 'active', loc: '', ovr: {}, ...more });
saveState(db, { ...s0, users: [...s0.users, person('ua', 'Anna'), person('ub', 'Beat', { entra: { upn: 'beat@corp.example' } })], history: {}, rels: [], objs: [
  dev('n1', { uid: 'ua', user: 'Anna', graph: { join: 'AzureAd', owner: 'beat@corp.example', ownerName: 'Beat B.' } }),
  dev('n2', { uid: 'ua', user: 'Anna', graph: { join: 'AzureAd', owner: 'zoe@corp.example', ownerName: 'Zoe' } }),
  dev('n3', { uid: 'ub', user: 'Beat', graph: { join: 'AzureAd', owner: 'beat@corp.example', ownerName: 'Beat B.' } }),
] });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForSelector('#cards .lrow');
  const open = async id => { await p.evaluate(async id => (await import('/js/02-views.js')).openObj(id), id); await p.waitForSelector('select[data-k="user"]'); };

  // Intune's primary user is nobody here: said, nothing to click
  await open('n2');
  assert.match(await p.textContent('.fieldnote.user-intune'), /Intune: Zoe is the primary user, nobody here/);
  assert.equal(await p.locator('[data-useruse]').count(), 0);

  // the device's own user is Intune's: no note
  await open('n3');
  assert.equal(await p.locator('.fieldnote.user-intune').count(), 0);

  // Intune names Beat: one click gives it to Beat, and the note goes
  await open('n1');
  assert.match(await p.textContent('.fieldnote.user-intune'), /Intune: Beat B\. is the primary user · Give it to Beat/);
  if (process.env.SHOT) await p.locator('.fieldnote.user-intune').locator('xpath=..').screenshot({ path: process.env.SHOT });
  await p.click('[data-useruse]');
  await storedBy(() => loadState(db), s => s.objs.find(o => o.id === 'n1').uid === 'ub');
  await until(p, () => !document.querySelector('.fieldnote.user-intune'));
  assert.deepEqual(errors, []);
  console.log('intune owner: ok');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
