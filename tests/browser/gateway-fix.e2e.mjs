import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import { until } from './until.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
/* Overview → Data quality → Gateway not its subnet's: one click gives every such device its subnet's gateway; Undo puts
   them back. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-gwfix-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {}); seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  await p.evaluate(async () => { const c = await import('/js/01-core.js');
    c.SUBNETS.push({ name: 'Office', cidr: '10.10.0.0/24', gateway: '10.10.0.1', dns: [], ranges: [], types: [] });
    const [a, b, d] = c.objs.filter(x => x.type === 'pc' || x.type === 'server');
    Object.assign(a, { ip: '10.10.0.40', gateway: '192.168.1.1' }); Object.assign(b, { ip: '10.10.0.41', gateway: '10.10.0.254' });
    if (d) Object.assign(d, { ip: '10.10.0.42', gateway: '10.10.0.1' });   /* its subnet's already: not counted */
    c.st.tab = 'overview'; (await import('/js/07-render.js')).render(); });
  await p.waitForSelector('[data-ovq="gateway"]');
  assert.match(await p.textContent('[data-ovq="gateway"] .chip'), /^2$/);
  await p.click('#ovGwFix');
  const gws = () => p.evaluate(async () => (await import('/js/01-core.js')).objs.filter(x => x.ip && x.ip.startsWith('10.10.0.4')).map(x => x.gateway || ''));
  await until(p, async () => !(await import('/js/01-core.js')).objs.some(x => x.gateway === '192.168.1.1'));
  assert.ok((await gws()).every(g => g === '' || g === '10.10.0.1'), 'a gateway that is not the subnet\'s is left');
  assert.equal(await p.locator('[data-ovq="gateway"]').count(), 0, 'the line is gone once all are fixed');
  await p.click('#toast .t-undo');
  await until(p, async () => (await import('/js/01-core.js')).objs.some(x => x.gateway === '192.168.1.1'));
  assert.deepEqual(errs, [], 'page errors');
  console.log('gateway fix: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
