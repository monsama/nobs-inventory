/* Text contrast in dark theme on the main screens: body text at least 4.5:1, and the large or bold text, buttons and
   chips at least 3:1 (WCAG AA). */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-contrast-'));
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
  await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  // Measures the text colour of each element against the colour behind it.
  const measure = () => p.evaluate(() => {
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const behind = el => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const out = [];
    const sel = [['body text', '#view .obj .form label'], ['muted text', '.muted'], ['table cell', '#view table.grid td'], ['table header', '#view table.grid th'],
      ['button', '#view button:not(.primary)'], ['primary button', 'button.primary'], ['sidebar item', '#side .item'], ['tab', '#tabsbar button'], ['hint', '.maphint'], ['note', '.note']];
    for (const [name, s] of sel) {
      const el = document.querySelector(s); if (!el || !el.textContent.trim()) continue;
      const fg = parse(getComputedStyle(el).color), bg = behind(el);
      const big = parseFloat(getComputedStyle(el).fontSize) >= 18.66 || (parseFloat(getComputedStyle(el).fontSize) >= 14 && Number(getComputedStyle(el).fontWeight) >= 700);
      out.push({ name, ratio: Math.round(ratio(fg, bg) * 100) / 100, need: big ? 3 : 4.5, text: el.textContent.trim().slice(0, 30) });
    }
    return out;
  });
  const screens = [
    ['cards', async () => p.evaluate(() => { st.tab = 'cards'; render(); })],
    ['table', async () => p.evaluate(() => { st.tab = 'table'; render(); })],
    ['object', async () => p.evaluate(() => { st.tab = 'cards'; render(); openObj('o1'); })],
    ['settings', async () => { await p.evaluate(() => { document.querySelector('#setBtn').click(); }); await p.waitForSelector('#setTabs'); }],
  ];
  const failures = [];
  for (const [screen, go] of screens) {
    await go(); await p.waitForTimeout(150);
    for (const r of await measure()) if (r.ratio < r.need) failures.push(`${screen}: ${r.name} "${r.text}" ${r.ratio}:1, needs ${r.need}:1`);
  }
  if (failures.length) console.log(failures.join('\n'));
  assert.deepEqual(failures, [], 'text that is too faint in dark theme');
  console.log('contrast in dark theme: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
