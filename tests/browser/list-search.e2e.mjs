/* Browser test of the search fields of Software, Contracts and Contacts (word by word, accents ignored, by the devices
   too, the match marked, Esc clears, the focus kept while typing), and of Ctrl + click opening a device or a view in a
   new tab, signed in, while Ctrl + click on a List row away from its name still picks it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-lsearch-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
const dev = (id, name, more = {}) => ({ id, code: 'INV-' + id, type: 'pc', name, status: 'active', loc: '', ovr: {}, feed: null, added: '2026-01-01T08:00:00.000Z', ...more });
saveState(db, { ...s0, locs: ['Zürich / Büro 1'],
  objs: [
    dev('a', 'PC-ANNA', { user: 'Anna Müller', loc: 'Zürich / Büro 1', software: [{ name: 'Mozilla Firefox', version: '128.0' }, { name: '7-Zip', version: '24.08' }], respIn: 'k2' }),
    dev('b', 'PC-BEN', { user: 'Ben Example', software: [{ name: '7-Zip', version: '23.01' }] }),
  ],
  contracts: [
    { id: 'c1', name: 'Support Firewall', kind: 'support', supplier: 'Netz AG', ref: 'SR-4711', cost: 900, per: 'year', devices: [] },
    { id: 'c2', name: 'Lease Notebooks', kind: 'lease', supplier: 'Leasing GmbH', cost: 50, per: 'month', devices: ['a'] },
  ],
  contacts: [
    { id: 'k1', kind: 'external', name: 'Petra Netz', company: 'Netz AG', role: 'Account manager', phone: '+41 31 000 00 00' },
    { id: 'k2', kind: 'internal', name: 'Jörg Intern', role: 'Workplace' },
  ],
  rels: [], history: {} });

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
  const go = tab => p.evaluate(async t => { const c = await import('/js/01-core.js'); c.st.tab = t; c.st.q = ''; (await import('/js/07-render.js')).render(); }, tab);
  const type = async (text) => { await p.fill('#vq', ''); await p.type('#vq', text, { delay: 20 }); };

  // Software: by package, then by a person, which opens the packages of their device; the focus stays in the field
  await go('sw'); await p.waitForSelector('#vq');
  await type('zip 24');
  await until(p, () => document.querySelectorAll('#swBody tr.sw-row').length === 1);
  assert.match(await p.textContent('#swBody tr.sw-row mark'), /Zip/);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'vq', 'the focus is kept');
  await type('muller firefox');   // the user, without the accent, and the package
  await until(p, () => document.querySelectorAll('#swBody tr.sw-row').length === 1 && /Firefox/.test(document.querySelector('#swBody tr.sw-row').textContent));
  await p.press('#vq', 'Escape');
  await until(p, () => document.querySelectorAll('#swBody tr.sw-row').length === 2);

  // Contracts: by number, and by a device it covers
  await go('contracts'); await p.waitForSelector('#vq');
  await type('sr-4711');
  await until(p, () => document.querySelectorAll('table.contracts tbody [data-contract]').length >= 1 && !/Lease/.test(document.querySelector('table.contracts tbody').textContent));
  await type('pc-anna');
  await until(p, () => /Lease Notebooks/.test(document.querySelector('table.contracts tbody').textContent) && !/Support Firewall/.test(document.querySelector('table.contracts tbody').textContent));
  assert.match(await p.textContent('#toolbar'), /1 of 2/);

  // Contacts: by the device they look after, by a phone number without its spaces, accents ignored
  await go('contacts'); await p.waitForSelector('#vq');
  await type('pc-anna');
  await until(p, () => document.querySelectorAll('.cn-card').length === 1 && /Jörg/.test(document.querySelector('.cn-card').textContent));
  await type('0310000000');
  await until(p, () => document.querySelectorAll('.cn-card').length === 1 && /Petra/.test(document.querySelector('.cn-card').textContent));
  await type('jorg');
  await until(p, () => document.querySelectorAll('.cn-card').length === 1 && !!document.querySelector('.cn-card mark'));

  // Ctrl + click on a device's name opens it in a new tab, signed in
  await go('cards'); await p.waitForSelector('#cards .lrow');
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.click('#cards .lrow[data-open="a"] .card-open', { modifiers: ['Control'] })]);
  await tab.waitForSelector('#objTitle');
  assert.equal((await tab.textContent('#objTitle')).trim(), 'PC-ANNA');
  assert.equal(await p.evaluate(async () => (await import('/js/01-core.js')).st.tab), 'cards', 'this tab stays on the list');
  await tab.close();
  // a view in the tab bar, with the middle button
  const [tab2] = await Promise.all([ctx.waitForEvent('page'), p.click('#tabsbar .tab[data-tab="plans"]', { button: 'middle' })]);
  await tab2.waitForSelector('.plans');
  await tab2.close();
  // Ctrl + click on the row away from its name still picks it
  await p.click('#cards .lrow[data-open="b"] .loc, #cards .lrow[data-open="b"]', { modifiers: ['Control'], position: { x: 600, y: 10 } });
  await until(p, () => !!document.querySelector('#cards .lrow.picked[data-open="b"]'));

  assert.deepEqual(errors, [], 'page errors');
  console.log('list search and new tabs: all checks passed');
} finally { await browser.close(); server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
