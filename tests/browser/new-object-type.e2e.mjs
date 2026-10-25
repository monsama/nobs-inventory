/* The New object form follows the type: its examples, how it is connected (a monitor is attached to a computer, a VM
   runs on a server, a rack is not plugged in), and a rack's height. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-newtype-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const open = async () => { await p.evaluate(async () => (await import('/js/05-new-object.js')).newObjModal()); await p.waitForSelector('#nType'); };
  const typeOf = id => p.evaluate(async id => (await import('/js/01-core.js')).byId(id).type, id);
  const offered = () => p.$$eval('#nUp option', os => os.map(o => o.value).filter(Boolean));
  await open();
  // a rack: its examples and height, nothing to plug into
  await p.selectOption('#nType', 'rack');
  assert.equal(await p.getAttribute('#nName', 'placeholder'), 'e.g. ZH-RACK-01');
  assert.equal(await p.getAttribute('#nModel', 'placeholder'), 'e.g. APC NetShelter SX 42U');
  assert.equal(await p.isVisible('#nUnits'), true); assert.equal(await p.isVisible('#nUp'), false); assert.equal(await p.isVisible('#nPort'), false);
  // a monitor is attached to a computer: only computers are offered, no port
  await p.selectOption('#nType', 'monitor');
  assert.equal(await p.textContent('label[for="nUp"]'), 'Attached to');
  for (const id of await offered()) assert.ok(['pc', 'notebook', 'server'].includes(await typeOf(id)), 'a monitor is attached to a computer, not ' + await typeOf(id));
  assert.equal(await p.isVisible('#nPort'), false);
  // a VM runs on a server
  await p.selectOption('#nType', 'vm');
  assert.equal(await p.textContent('label[for="nUp"]'), 'Runs on');
  for (const id of await offered()) assert.equal(await typeOf(id), 'server');
  // a PC is plugged into a switch or the like, with a port
  await p.selectOption('#nType', 'pc');
  assert.equal(await p.textContent('label[for="nUp"]'), 'Plug into');
  assert.equal(await p.isVisible('#nPort'), true); assert.equal(await p.isVisible('#nUnits'), false);
  // create a VM on a server: the relation is "runs on"
  await p.selectOption('#nType', 'vm'); await p.fill('#nName', 'VM-TEST');
  const srv = (await offered())[0]; await p.selectOption('#nUp', srv); await p.click('#nOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(o => o.name === 'VM-TEST'));
  const rel = await p.evaluate(async () => { const c = await import('/js/01-core.js'); const o = c.objs.find(x => x.name === 'VM-TEST'); return c.rels.find(r => r.from === o.id); });
  assert.deepEqual([rel.to, rel.kind, rel.port], [srv, 'hosted', null]);
  // a rack keeps the height given
  await open(); await p.selectOption('#nType', 'rack'); await p.fill('#nName', 'RACK-TEST'); await p.fill('#nUnits', '24'); await p.click('#nOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(o => o.name === 'RACK-TEST' && o.units === 24));
  assert.deepEqual(errors, [], 'page errors');
  console.log('new object follows its type: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
