/* Accessibility: the main screens and dialogs are checked with axe-core. Serious and critical problems fail the check. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

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
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
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
    ['cards', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].closeModal(); __mods[1].st.tab = 'cards'; __mods[2].render(); })],
    ['table', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'table'; __mods[1].render(); })],
    ['object', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js'), import('/js/02-views.js')]); __mods[0].st.tab = 'cards'; __mods[1].render(); __mods[2].openObj('o1'); })],
    ['relationships', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'map'; __mods[1].render(); })],
    ['floor plans', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'plans'; __mods[1].render(); })],
    ['switch ports', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'net'; __mods[1].render(); })],
    ['new object dialog', () => p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js'), import('/js/05-new-object.js')]); __mods[0].st.tab = 'cards'; __mods[1].render(); __mods[2].newObjModal({}); })],
    ['settings: feed', async () => { await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/01-core.js'), import('/js/04-settings.js')]); __mods[0].closeModal(); __mods[1].st.setTab = 'feed'; __mods[2].openSettings(); }); await p.waitForSelector('#setFeed'); }],
    ['settings: locations', async () => { await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/01-core.js'), import('/js/04-settings.js')]); __mods[0].closeModal(); __mods[1].st.setTab = 'locations'; __mods[2].openSettings(); }); await p.waitForSelector('#setLocs'); }],
    ['settings: users', async () => { await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/01-core.js'), import('/js/04-settings.js')]); __mods[0].closeModal(); __mods[1].st.setTab = 'users'; __mods[2].openSettings(); }); await p.waitForSelector('#setUsers'); }],
    ['settings: maintenance', async () => { await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/01-core.js'), import('/js/04-settings.js')]); __mods[0].closeModal(); __mods[1].st.setTab = 'maintenance'; __mods[2].openSettings(); }); await p.waitForSelector('#setMaint'); }],
    ['settings: log', async () => { await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/01-core.js'), import('/js/04-settings.js')]); __mods[0].closeModal(); __mods[1].st.setTab = 'log'; __mods[2].openSettings(); }); await p.waitForSelector('#setLog'); }],
    ['software, a package open', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), r = await import('/js/07-render-plans.js'); (await import('/js/03-object-modals.js')).closeModal(); c.objs[1].software = [{ name: 'Tool A', version: '1' }]; c.objs[2].software = [{ name: 'Tool A', version: '2' }]; c.st.tab = 'sw'; c.st.swOpen = ['Tool A']; r.render(); }); }],
    ['object, model list open', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), v = await import('/js/02-views.js'); (await import('/js/03-object-modals.js')).closeModal(); c.objs[1].warranty = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10); v.openObj(c.objs[1].id); }); await p.waitForSelector('.combo:has([data-k=model]) .combo-arrow'); await p.click('.combo:has([data-k=model]) .combo-arrow'); }],
    ['settings: ldap and graph', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), st = await import('/js/04-settings.js'); (await import('/js/03-object-modals.js')).closeModal(); c.st.setTab = 'directory'; st.openSettings(); }); await p.waitForSelector('#setLdap .panelbox'); await p.evaluate(() => { const d = document.querySelector('.ldap-adv'); if (d) d.open = true; }); }],
    ['settings: network', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), st = await import('/js/04-settings.js'); (await import('/js/03-object-modals.js')).closeModal(); c.st.setTab = 'vlans'; st.openSettings(); }); await p.waitForSelector('#snNew'); await p.click('#snNew'); await p.waitForSelector('.sn-edit'); }],
    ['settings: object types', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), st = await import('/js/04-settings.js'); (await import('/js/03-object-modals.js')).closeModal(); c.st.setTab = 'types'; st.openSettings(); }); await p.waitForSelector('.cardlines'); }],
    ['settings: about', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), st = await import('/js/04-settings.js'); (await import('/js/03-object-modals.js')).closeModal(); c.st.setTab = 'about'; st.openSettings(); }); await p.waitForSelector('#setAbout .brandmark'); }],
    ['overview, contracts and licences', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), r = await import('/js/07-render-plans.js'); (await import('/js/03-object-modals.js')).closeModal();
      const end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      c.COSTS.contracts = [{ id: 'ca', name: 'Support', kind: 'support', end, renew: 12, notice: 0, cost: 900, per: 'year', devices: [c.objs[0].id] }];
      c.COSTS.licences = [{ id: 'la', name: 'Tool A', seats: 1 }]; c.objs[0].price = 1200; c.st.tab = 'overview'; r.render(); }); }],
    ['contracts', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), r = await import('/js/07-render-plans.js'); c.st.tab = 'contracts'; r.render(); }); }],
    ['contract dialog', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'); (await import('/js/09-costs.js')).contractModal(c.COSTS.contracts[0]); }); }],
    ['software with licences', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'), r = await import('/js/07-render-plans.js'); c.st.tab = 'sw'; r.render(); }); }],
    ['licence dialog', async () => { await p.evaluate(async () => { const c = await import('/js/01-core.js'); (await import('/js/09-costs.js')).licenceModal(c.COSTS.licences[0]); }); }],
    ['entry sheet dialog', async () => { await p.evaluate(async () => { const s = await import('/js/04-settings.js'); (await import('/js/08-sheets.js')).sheetModal(s.me()); }); await p.waitForSelector('#sheetMake'); }],
    ['account dialog', async () => { await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js')]); __mods[0].closeModal(); }); await p.click('#whoBtn'); await p.waitForSelector('#acFirst'); }],
  ];
  for (const theme of ['light', 'dark']) {
    await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    for (const [name, go] of screens) {
      await go(); await p.waitForTimeout(250);
      problems.push(...(await audit(theme + ' ' + name)));
      await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js')]); return (__mods[0].closeModal()); });
    }
  }
  if (problems.length) console.log(problems.join('\n'));
  assert.deepEqual(problems, [], 'serious accessibility problems');
  console.log('accessibility: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
