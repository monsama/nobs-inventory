/* Layout on the main screens, desktop and phone: no button text is cut off, no control runs out of its box, the fields in
   a form share one left edge and one height, and the buttons in one bar are the same height. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-layout-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const sizes = [
    { name: 'desktop', opts: { viewport: { width: 1300, height: 900 } } },
    { name: 'phone', opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ];
  for (const size of sizes) {
    const p = await (await browser.newContext(size.opts)).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/'); await p.waitForSelector('#lgUser');
    await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
    await p.waitForFunction(() => objs.length > 0);
    // Checks what is on the screen now. Returns a list of problems, empty when all is well.
    const check = () => p.evaluate(() => {
      const problems = [];
      const shown = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const label = el => (el.id ? '#' + el.id : '') + ' "' + (el.textContent || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 28) + '"';
      // 1. A button's text is not cut off.
      document.querySelectorAll('button').forEach(b => { if (!shown(b)) return; if (b.scrollWidth > b.clientWidth + 1) problems.push('button text cut off: ' + label(b)); });
      // 2. Buttons that sit in one row line up: the same height.
      const rows = new Map();
      document.querySelectorAll('button').forEach(b => { if (!shown(b) || b.closest('.tbchunk,.mf')) return; const top = Math.round(b.getBoundingClientRect().top); (rows.get(top) || rows.set(top, []).get(top)).push(b); });
      rows.forEach(list => { if (list.length < 2) return; const hs = list.map(b => Math.round(b.getBoundingClientRect().height)); if (Math.max(...hs) - Math.min(...hs) > 4) problems.push('buttons in one row differ in height: ' + list.map(label).join(' | ')); });
      // 3. Fields in a form share one left edge and one height.
      document.querySelectorAll('.form').forEach(f => {
        const fields = [...f.querySelectorAll(':scope > input, :scope > select, :scope > div > input, :scope > div > select, :scope > .ctlrow > input, :scope > .ctlrow > select, :scope > .ctlrow > textarea')].filter(shown);
        if (fields.length < 2) return;
        const left = fields.map(x => Math.round(x.getBoundingClientRect().left));
        if (Math.max(...left) - Math.min(...left) > 2) problems.push('form fields do not line up: ' + fields.slice(0, 3).map(label).join(' | '));
        const inputs = fields.filter(x => x.tagName === 'INPUT' && x.type !== 'checkbox' && x.type !== 'hidden');
        const heights = inputs.map(x => Math.round(x.getBoundingClientRect().height));
        if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 2) problems.push('form fields differ in height: ' + inputs.slice(0, 3).map(label).join(' | '));
      });
      // 3b. A checkbox in a form is its own size, not stretched across the field column.
      document.querySelectorAll('.form input[type=checkbox]').forEach(c => { if (shown(c) && c.getBoundingClientRect().width > 40) problems.push('a checkbox is stretched across its field: ' + label(c)); });
      // 4. Nothing runs past its panel or the screen sideways.
      document.querySelectorAll('.panelbox').forEach(pb => { if (!shown(pb)) return; const r = pb.getBoundingClientRect(); if (pb.scrollWidth > pb.clientWidth + 2 && getComputedStyle(pb).overflowX === 'visible'){ const pr = pb.getBoundingClientRect(); let worst = null; pb.querySelectorAll('*').forEach(e => { const er = e.getBoundingClientRect(); if (er.width && (er.right > pr.right + 1 || er.left < pr.left - 1) && (!worst || er.width > worst.w)) worst = { w: er.width, t: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' ' + (e.textContent || '').trim().slice(0, 20) }; }); problems.push('panel content runs past its edge: ' + (pb.querySelector('.hdr')?.textContent || '').trim().slice(0, 30) + (worst ? ' (' + worst.t + ')' : '')); } });
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) problems.push('the page scrolls sideways');
      return problems;
    });
    const screens = [
      ['cards', () => p.evaluate(() => { st.tab = 'cards'; render(); })],
      ['table', () => p.evaluate(() => { st.tab = 'table'; render(); })],
      ['object', () => p.evaluate(() => { st.tab = 'cards'; render(); openObj('o1'); })],
      ['new object dialog', () => p.evaluate(() => { st.tab = 'cards'; render(); newObjModal({}); })],
      ['relationships', () => p.evaluate(() => { st.tab = 'map'; render(); })],
      ['floor plans', () => p.evaluate(() => { st.tab = 'plans'; render(); })],
      ['settings: feed', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'feed'; openSettings(); }); await p.waitForSelector('#setFeed'); }],
      ['settings: users', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'users'; openSettings(); }); await p.waitForSelector('#setUsers'); }],
      ['settings: maintenance', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'maintenance'; openSettings(); }); await p.waitForSelector('#setMaint'); }],
      ['settings: log', async () => { await p.evaluate(() => { closeModal(); st.setTab = 'log'; openSettings(); }); await p.waitForSelector('#setLog'); }],
    ];
    for (const [name, go] of screens) {
      await p.evaluate(() => { if (document.querySelector('#mdl') && !document.querySelector('#setBtn')) closeModal(); });
      await go(); await p.waitForTimeout(200);
      const problems = await check();
      for (const pr of problems) errors.push(`${size.name} ${name}: ${pr}`);
      await p.evaluate(() => { closeModal(); });
    }
    await p.context().close();
  }
  if (errors.length) console.log(errors.join('\n'));
  assert.deepEqual(errors, [], 'layout problems');
  console.log('layout: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
