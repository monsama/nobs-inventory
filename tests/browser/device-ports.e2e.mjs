/* Ports: a router, firewall or physical server has a port view like a switch, and from its card Ports shows that device. Software: a package lists its devices in a table. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-ports-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  // A router with 8 ports and a PC on its port 2.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    core.objs.push({ id: 'rt1', code: 'INV-9001', type: 'router', name: 'RTR-EDGE', status: 'active', loc: core.objs[0].loc, ports: 8, pfx: 'Gi0/', ovr: {}, feed: null });
    core.rels.push({ id: 'rt-link', from: 'o2', to: 'rt1', kind: 'connected', port: 2, vlan: null });
  });
  // From the router's card, Ports opens the router's own port view.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.waitForSelector('#tabsbar [data-tab=net]');
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'rt1');
  assert.equal(await p.inputValue('#portsDevice'), 'rt1', 'the router is shown, not the first switch');
  assert.equal(await p.locator('#view .port').count(), 8, 'the router has its 8 ports');
  assert.ok(await p.locator('#view .port.used[data-port="2"]').count() === 1, 'port 2 is shown as used');
  assert.match(await p.textContent('#view'), /Gi0\/2|Gi0\/ ?2/, 'the port is named with the router naming');
  // A switch card still shows that switch.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('o1'); });
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'o1');
  assert.equal(await p.inputValue('#portsDevice'), 'o1', 'a switch card shows its own switch');
  // Software: clicking a package lists the devices that have it, in a table with the version on each.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    core.objs.find(o => o.id === 'o2').software = [{ name: 'Tool X', version: '1.2' }];
    core.objs.find(o => o.id === 'rt1').software = [{ name: 'Tool X', version: '9.9' }];
  });
  await p.click('#tabsbar [data-tab=sw]');
  await p.click('tr[data-sw="Tool X"]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'Tool X');
  const rows = await p.$$eval('#view .panelbox table tbody tr', trs => trs.map(tr => tr.textContent));
  assert.equal(rows.length, 2, 'both devices with the package are listed in a table: ' + rows.join(' | '));
  assert.ok(rows.some(t => t.includes('RTR-EDGE') && t.includes('9.9')), 'the router row has its version');
  assert.ok(rows.some(t => t.includes('1.2')), 'the PC row has its version');
  // Port groups: a named range of the router's ports, with a kind; an overlapping range is refused.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.click('#tabsbar [data-tab=net]');
  await until(p, async () => (await import('/js/01-core.js')).st.portsDevice === 'rt1');
  await p.fill('#pgName', 'Uplinks'); await p.fill('#pgFrom', '7'); await p.fill('#pgTo', '8'); await p.fill('#pgKind', 'SFP+');
  await p.click('#pgAdd');
  await until(p, async () => ((await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').portGroups || []).length === 1);
  assert.match(await p.textContent('#view .panelbox:has(#pgAdd)'), /Uplinks[\s\S]*Ports Gi0\/7–Gi0\/8 · SFP\+/, 'the group is listed with its ports and kind');
  await p.fill('#pgName', 'Clash'); await p.fill('#pgFrom', '8'); await p.fill('#pgTo', '8');
  await p.click('#pgAdd');
  await until(p, async () => /already in a group/.test(document.querySelector('#toast').textContent));
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').portGroups.length), 1, 'the overlapping group is not added');
  // With a type selected, the locations count only objects of that type.
  const rtSite = await p.evaluate(async () => (await import('/js/01-core.js')).objs.find(o => o.id === 'rt1').loc.split(' / ')[0]);
  await p.click('#typeList [data-type=router]');
  assert.equal(await p.textContent(`#locList [data-loc="${rtSite}"] .cnt`), '1', 'the site of the router counts the one router');
  await p.click('#clearF');
  // The relation dropdown explains the kind it has chosen, and each option has its explanation as a tooltip.
  await p.evaluate(async () => { const views = await import('/js/02-views.js'); views.openObj('rt1'); });
  await p.waitForSelector('#arKind');
  await p.selectOption('#arKind', 'connected');
  assert.match(await p.getAttribute('#arKind', 'title'), /port of a switch, router, firewall or patch panel/, 'the connected tooltip');
  await p.selectOption('#arKind', 'uplink');
  assert.match(await p.getAttribute('#arKind', 'title'), /upstream device/, 'the uplink tooltip follows the choice');
  assert.ok(await p.$eval('#arKind option[value=hosted]', o => o.title.length > 0), 'every kind has its tooltip');
  // Linking an existing object hides the detail fields, and they come back for a new object.
  await p.click('#newBtn'); await p.waitForSelector('#nExist');
  const pick = await p.$eval('#nExist', sel => [...sel.options].find(o => o.value)?.value);
  assert.ok(pick, 'there is an existing object to link');
  await p.selectOption('#nExist', pick);
  assert.equal(await p.isVisible('#nName'), false, 'the name is hidden when linking');
  assert.equal(await p.isVisible('#nUp'), true, 'the plug is still shown when linking');
  await p.selectOption('#nExist', '');
  assert.equal(await p.isVisible('#nName'), true, 'the name is shown again for a new object');
  await p.click('#nCancel');
  assert.deepEqual(errors, [], 'page errors');
  console.log('device ports: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
