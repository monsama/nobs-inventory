/* Structured cabling: a panel with outlets named from a pattern, a range patched to a switch, a PC plugged into an
   outlet by its name, its path to the network, the switch port showing "via", Undo, and a viewer who only reads. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { setPassword } from '../../server/auth.js';
import { seedBasics } from '../helpers.js';
import { loadState, saveState } from '../../server/state.js';
import { storedBy, until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cabling-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
{ const s = loadState(db); s.users.push({ id: 'u-viewer', login: 'viewer', name: 'Viewer', dept: '', groups: [], source: 'manual', active: true, role: 'viewer' }); saveState(db, s); setPassword(db, 'u-viewer', 'viewerpass123'); }
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async (login, pw) => {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', login); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  return p;
};
const open = (p, name) => p.evaluate(async n => { const core = await import('/js/01-core.js'); (await import('/js/02-views.js')).openObj(core.byName(n).id); }, name);
const cords = p => p.evaluate(async () => (await import('/js/01-core.js')).rels.filter(r => r.kind === 'patched').map(r => `${r.fromPort}>${r.port}`).sort());
try {
  const p = await signIn('admin', 'adminpass123');
  // A patch panel with 4 ports.
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  await p.selectOption('#nType', 'patch'); await p.fill('#nName', 'PP-T1'); await p.click('#nOk');
  await p.waitForSelector('#ppBox');
  await p.fill('#view [data-k="ports"]', '4'); await p.press('#view [data-k="ports"]', 'Tab');
  await until(p, () => document.querySelectorAll('#ppBox tr.pp-row').length === 4);
  assert.equal(await p.locator('#ppBox tr[data-state=off]').count(), 4, 'four unused ports, each with a grey ring');

  // Name the outlets from a pattern, with a preview.
  await p.click('#ppName'); await p.fill('#ppPattern', '2.OG-R12-{n}');
  await until(p, () => document.querySelectorAll('#ppPrev tbody tr').length === 4);
  assert.match(await p.textContent('#ppPrev'), /2\.OG-R12-04/);
  await p.selectOption('#ppRoom', 'Zürich HQ / Büro 2.OG');
  await p.click('#ppGo');
  await until(p, () => /2\.OG-R12-03/.test(document.querySelector('#ppBox').textContent));

  // Patch P01-P04 to the switch's ports 5-8; Undo takes it back, then again.
  const patch = async () => {
    await p.click('#ppPatch'); await p.selectOption('#ppSw', { label: 'SW-ZH-2OG-01 · Switch' }); await p.fill('#ppSwFrom', '5');
    await until(p, () => document.querySelectorAll('#ppPrev tbody tr').length === 4);
    assert.equal(await p.textContent('#ppGo'), 'Patch 4 ports');
    await p.click('#ppGo');
  };
  await patch();
  assert.deepEqual(await cords(p), ['P01>5', 'P02>6', 'P03>7', 'P04>8']);
  await p.click('#toast .t-undo');
  await until(p, async () => !(await import('/js/01-core.js')).rels.some(r => r.kind === 'patched'));
  await patch();
  assert.deepEqual(await cords(p), ['P01>5', 'P02>6', 'P03>7', 'P04>8']);
  assert.match(await p.textContent('#ppBox tr[data-ppport=P02]'), /SW-ZH-2OG-01\s*1\/6/);
  await storedBy(() => loadState(db), s => s.rels.filter(r => r.kind === 'patched' && r.fromPort).length === 4 && s.objs.find(o => o.name === 'PP-T1').outlets.P02.name === '2.OG-R12-02');

  // A new PC plugged into outlet ...-02 by its name.
  await p.click('#newBtn'); await p.waitForSelector('#nName');
  await p.selectOption('#nType', 'pc'); await p.fill('#nName', 'PC-OUT-1');
  await p.evaluate(() => { document.querySelector('#nMore').open = true; });
  await p.fill('#nOutlet', 'R12-02');
  await p.click('#nOutlet_list li[data-v="2.OG-R12-02"]');
  assert.match(await p.textContent('#nOutletNote'), /Outlet 2\.OG-R12-02 \(PP-T1 P02\)/);
  assert.equal(await p.inputValue('#nPort'), 'P02');
  await p.click('#nOk');
  await until(p, async () => { const c = await import('/js/01-core.js'); const pc = c.byName('PC-OUT-1'); return !!pc && c.rels.some(r => r.from === pc.id && r.port === 'P02'); });
  // Its path: outlet, then the panel on P02, then the switch on port 6.
  await p.waitForSelector('.netpath .ps-outlet');
  const path1 = (await p.textContent('.netpath')).replace(/\s+/g, ' ');
  const at = s => path1.indexOf(s);
  assert.ok(at('Outlet 2.OG-R12-02') > 0 && at('Outlet 2.OG-R12-02') < at('PP-T1') && at('P02') < at('SW-ZH-2OG-01') && at('PP-T1') < at('1/6'), 'outlet → PP-T1 P02 → switch port 6: ' + path1);
  assert.match(path1, /Büro 2\.OG/, 'the outlet shows its room');
  await open(p, 'PP-T1');
  await p.waitForSelector('#ppBox tr[data-ppport=P02][data-state=ok]');
  assert.equal(await p.locator('#ppBox tr[data-state=warn]').count(), 0);

  // The switch's Ports view: port 6 is reached via the panel and the outlet.
  await open(p, 'SW-ZH-2OG-01');
  await p.click('#tabsbar [data-tab=net]');
  await p.waitForSelector('#view .port.used[data-port="6"]');
  assert.match(await p.getAttribute('#view .port[data-port="6"]', 'title'), /via PP-T1 P02 → 2\.OG-R12-02 → PC-OUT-1/);
  assert.match((await p.textContent('#view table.grid')).replace(/\s+/g, ' '), /via PP-T1 P02 → 2\.OG-R12-02 → PC-OUT-1/);
  assert.match((await p.textContent('#view table.grid')).replace(/\s+/g, ' '), /via PP-T1 P01 → 2\.OG-R12-01 \(free\)/);
  // The search finds the panel and the PC by the outlet name.
  assert.deepEqual(await p.evaluate(async () => { const c = await import('/js/01-core.js'); return c.objs.filter(o => c.matchesQ(o, '2.og-r12-02')).map(o => o.name).sort(); }), ['PC-OUT-1', 'PP-T1']);

  // Edit one port: the outlet of P04 removed; P04 then has a cord to no outlet (amber); Undo puts it back.
  await open(p, 'PP-T1');
  await p.click('[data-ppedit=P04]'); await p.fill('#ppOutName', ''); await p.selectOption('#ppOutLoc', ''); await p.click('#ppOk');
  await p.waitForSelector('#ppBox tr[data-ppport=P04][data-state=warn]');
  await p.click('#toast .t-undo');
  await p.waitForSelector('#ppBox tr[data-ppport=P04][data-state=off]');
  assert.match(await p.textContent('#ppBox tr[data-ppport=P04]'), /2\.OG-R12-04/);
  await storedBy(() => loadState(db), s => s.rels.some(r => r.port === 'P02' && r.kind === 'connected') && s.objs.find(o => o.name === 'PP-T1').outlets.P04);

  // A patch list import: a row with a problem is left out, the good one is set; one Undo takes it back.
  await p.click('#ppImport');
  await p.fill('#piText', 'Panel;Port;Outlet;Room;Switch;Switch port\nPP-T1;3;2.OG-R12-03b;;SW-ZH-2OG-01;7\nPP-T1;4;2.OG-R12-02;;;\nPP-NONE;1;X;;;');
  await p.click('#piNext'); await p.click('#piNext');
  assert.match(await p.textContent('#piCounts'), /1 to import.*2 with problems/s);
  assert.match(await p.textContent('#piPrev'), /already on PP-T1 P02/);
  assert.match(await p.textContent('#piPrev'), /Unknown panel PP-NONE/);
  await p.click('#piGo');
  await until(p, () => /2\.OG-R12-03b/.test(document.querySelector('#ppBox').textContent));
  await p.click('#toast .t-undo');
  await until(p, () => !/2\.OG-R12-03b/.test(document.querySelector('#ppBox').textContent));

  // The Ports tab lists the panel and shows its ports; its cords offer the panel's own site first.
  const swSite = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const sw = c.objs.find(o => o.type === 'switch' && o.loc); const pp = c.byName('PP-T1'); pp.loc = 'Elsewhere / Room 1'; c.st.portsDevice = pp.id; c.st.tab = 'net'; (await import('/js/07-render.js')).view(); return sw ? sw.loc.split(' / ')[0] : ''; });
  await p.waitForSelector('#portsDevice'); await p.waitForSelector('#view #ppBox');
  assert.ok(await p.locator('#portsDevice option', { hasText: 'PP-T1' }).count(), 'the panel is not in the Ports device list');
  await p.click('#ppPatch'); await p.waitForSelector('#ppSw');
  if (swSite) assert.match(await p.evaluate(() => [...document.querySelectorAll('#ppSw optgroup option')].map(o => o.textContent).join('|')), new RegExp(swSite), 'switches of other sites are not set apart');
  await p.keyboard.press('Escape');
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.byName('PP-T1').loc = ''; });

  // A viewer sees it all, and nothing to change.
  const v = await signIn('viewer', 'viewerpass123');
  await open(v, 'PP-T1');
  await v.waitForSelector('#ppBox tr[data-ppport=P02][data-state=ok]');
  assert.match(await v.textContent('#ppBox'), /2\.OG-R12-02[\s\S]*PC-OUT-1/);
  assert.equal(await v.locator('#ppName, #ppPatch, #ppImport, [data-ppedit]').count(), 0, 'no editing for a viewer');
  await open(v, 'PC-OUT-1');
  await v.waitForSelector('.netpath .ps-outlet');
  assert.equal(await v.locator('#arOutlet').count(), 0);

  assert.deepEqual(errors, [], 'page errors');
  console.log('browser cabling: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
