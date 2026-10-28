/* Defender for Endpoint as a fourth mark on the cards and a row on the device; "Seen … · source" on the cards from
   whichever of Lansweeper, AD, Intune, Entra and Defender saw the device last; Entra's device and object IDs on the
   device; a device Defender alone manages is not shown as Intune-managed; disabled Entra records are no duplicates. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-def-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const pc = (id, name, extra) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: 'HQ', ovr: {}, feed: null, ...extra });
saveState(db, { ...loadState(db), locs: ['HQ'], sites: ['HQ'],
  graph: { tenant: '1b2c3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d', clientId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', defender: 'on' },
  objs: [
    pc('a', 'PC-SAFE', { inAd: true, ad: { logon: day(9).slice(0, 10) },
      graph: { aadId: '11111111-2222-3333-4444-555555555555', entraId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', intuneId: 'iiiiiiii-0000-0000-0000-000000000000', join: 'Hybrid joined', managed: 'Intune', compliance: 'compliant', lastCheckIn: day(2), seen: '27.10.2026 06:00',
        others: [{ id: 'x', join: 'Entra registered', disabled: true, last: day(200) }] },
      defender: { health: 'Active', onboarding: 'Onboarded', risk: 'Low', exposure: 'Medium', av: 'Updated', lastSeen: day(0) } }),
    pc('b', 'PC-RISK', { graph: { join: 'Entra joined', managed: 'Defender for Endpoint only', compliance: 'unknown', lastSignIn: day(40), seen: '27.10.2026 06:00' },
      defender: { health: 'Inactive', risk: 'High', lastSeen: day(45) } }),
    pc('c', 'PC-NOTHING'),
  ], rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.evaluate(async () => { (await import('/js/01-core.js')).SYNC.graph = true; (await import('/js/07-render-plans.js')).render(); });
  await p.waitForSelector('.card[data-open=a] .jbar4');
  if (process.env.NI_SHOTS) await p.locator('#cards').screenshot({ path: path.join(process.env.NI_SHOTS, 'defender-cards.png') });

  // the cards: four marks, Defender's state, and when each was seen last, by whom
  const card = id => p.textContent(`.card[data-open=${id}]`);
  assert.equal(await p.locator(".card[data-open=a] .jb").count(), 4);
  assert.equal(await p.getAttribute('.card[data-open=a] .jb:nth-child(4)', 'class'), 'jb on ok');
  assert.match(await card('a'), /Seen today · Defender/, 'Defender saw it last');
  assert.equal(await p.getAttribute('.card[data-open=b] .jb:nth-child(4)', 'class'), 'jb on bad', 'high risk is red');
  assert.match(await p.getAttribute('.card[data-open=b] .jb:nth-child(3)', 'class'), /\bno\b/, 'Defender alone is not Intune');
  assert.match(await card('b'), /Seen \d{2}\.\d{2}\.\d{4} · Entra/);
  assert.match(await p.getAttribute('.card[data-open=b] .lsst', 'class'), /warn/, 'over 30 days: amber');
  assert.match(await p.getAttribute('.card[data-open=c] .jb:nth-child(4)', 'class'), /\bno\b/, 'not onboarded');
  assert.ok(!/Seen/.test(await card('c')), 'a device no source has seen says nothing');

  // the table: Last seen sorts by its date
  await p.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'table'; (await import('/js/07-render-plans.js')).render(); });
  await p.waitForSelector('th:has-text("Last seen")');
  assert.match(await p.textContent('tr:has(a[data-open=a])'), /\d{2}\.\d{2}\.\d{4} · Defender/);

  // the device: Defender's row, the IDs, a disabled record apart from duplicates; searchable by its device ID
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.waitForSelector('text=Object ID');
  if (process.env.NI_SHOTS) await p.locator('.panelbox:has(.hdr:text("Entra & Intune"))').screenshot({ path: path.join(process.env.NI_SHOTS, 'defender-panel.png') });
  const panel = await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))');
  for (const t of ['Active', 'risk low', 'exposure medium', 'antivirus updated', '11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'iiiiiiii-0000', '1 disabled record in Entra']) assert.ok(panel.includes(t), 'panel: ' + t);
  assert.ok(!/records in Entra/.test(panel), 'no duplicate warning for a disabled record');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('b'));
  await p.waitForSelector('text=Defender for Endpoint only');
  assert.ok(!(await p.textContent('.panelbox:has(.hdr:text("Entra & Intune"))')).includes('Compliance'), 'no Intune compliance for a device Intune does not manage');
  const found = await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.q = 'aaaaaaaa-bbbb'; return c.filtered().map(o => o.id); });
  assert.deepEqual(found, ['a']);

  assert.deepEqual(errors, []);
  console.log('defender and last seen: all checks passed');
} finally { await browser.close(); server.close(); }
