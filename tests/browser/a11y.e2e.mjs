/* Accessibility: the main screens and dialogs are checked with axe-core. Serious and critical problems fail the check. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-a11y-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForFunction(() => objs.length > 0);
  /* The page's policy allows scripts from its own address only, so axe is served from there for this check. */
  await p.route(base + '/__axe-test.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(AXE, 'utf8') }));
  await p.addScriptTag({ url: base + '/__axe-test.js' });
  const audit = async name => {
    const res = await p.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, first: (v.nodes[0]?.target || []).join(' ') }));
    });
    return res.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${name}: ${v.impact} ${v.id} (${v.n}) ${v.help}; e.g. ${v.first}`);
  };
  const problems = [];
  const screens = [
    ['cards', () => p.evaluate(() => { closeModal(); st.tab = 'cards'; render(); })],
    ['table', () => p.evaluate(() => { st.tab = 'table'; render(); })],
    ['object', () => p.evaluate(() => { st.tab = 'cards'; render(); openObj('o1'); })],
    ['relationships', () => p.evaluate(() => { st.tab = 'map'; render(); })],
    ['floor plans', () => p.evaluate(() => { st.tab = 'plans'; render(); })],
    ['switch ports', () => p.evaluate(() => { st.tab = 'net'; render(); })],
    ['new object dialog', () => p.evaluate(() => { st.tab = 'cards'; render(); newObjModal({}); })],
    ['settings: feed', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'feed'; openSettings(); }); await p.waitForSelector('#setFeed'); }],
    ['settings: locations', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'locations'; openSettings(); }); await p.waitForSelector('#setLocs'); }],
    ['settings: users', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'users'; openSettings(); }); await p.waitForSelector('#setUsers'); }],
    ['settings: maintenance', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'maintenance'; openSettings(); }); await p.waitForSelector('#setMaint'); }],
    ['settings: log', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'log'; openSettings(); }); await p.waitForSelector('#setLog'); }],
    ['account dialog', async () => { await p.evaluate(() => { closeModal(); }); await p.click('#whoBtn'); await p.waitForSelector('#acFirst'); }],
  ];
  for (const theme of ['light', 'dark']) {
    await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    for (const [name, go] of screens) {
      await go(); await p.waitForTimeout(250);
      problems.push(...(await audit(theme + ' ' + name)));
      await p.evaluate(() => closeModal());
    }
  }
  if (problems.length) console.log(problems.join('\n'));
  assert.deepEqual(problems, [], 'serious accessibility problems');
  console.log('accessibility: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
