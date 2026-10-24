/* Relationships: "Relations of" shows one object and the objects linked to it directly, and "All objects" shows the map again. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-focus-'));
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
  // o2 and o3 are connected to the switch o1; o4 is attached to o5, which has nothing to do with the switch.
  await p.evaluate(async () => {
    const core = await import('/js/01-core.js');
    core.rels.push({ id: 'f1', from: 'o2', to: 'o1', kind: 'connected', port: 3, vlan: null });
    core.rels.push({ id: 'f2', from: 'o3', to: 'o1', kind: 'connected', port: 4, vlan: null });
    core.rels.push({ id: 'f3', from: 'o4', to: 'o5', kind: 'attached', port: null, vlan: null });
    const views = await import('/js/02-views.js');
    core.st.tab = 'map'; views.renderMap();
  });
  await p.waitForSelector('#mapFocus');
  const count = () => p.textContent('#mapCount');
  /* Attached devices are left out of the map until they are asked for. */
  assert.match(await count(), /^3 objects · 2 relations/, 'the default map should show only the network: ' + await count());
  await p.check('#mapAttached');
  await p.waitForFunction(() => /^5 objects · 3 relations/.test(document.querySelector('#mapCount').textContent), null, { timeout: 5000 });
  await p.uncheck('#mapAttached');
  assert.match(await count(), /^3 objects · 2 relations/, 'the map should hide attached devices again: ' + await count());
  await p.selectOption('#mapFocus', 'o1');
  await p.waitForFunction(() => /^3 objects · 2 relations/.test(document.querySelector('#mapCount').textContent), null, { timeout: 5000 });
  assert.equal(await p.locator('#mapSvg .mnode').count(), 3, 'more than the switch and its direct links are drawn');
  const shown = await p.$$eval('#mapSvg .mnode', ns => ns.map(n => n.dataset.id).sort());
  assert.deepEqual(shown, ['o1', 'o2', 'o3'], 'the wrong objects are drawn: ' + shown.join(','));
  await p.selectOption('#mapFocus', '');
  await p.waitForFunction(() => /^3 objects · 2 relations/.test(document.querySelector('#mapCount').textContent), null, { timeout: 5000 });
  assert.deepEqual(errors, [], 'page errors');
  console.log('relationships of one object: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
