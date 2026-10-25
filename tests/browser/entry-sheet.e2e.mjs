/* Browser test of the entry sheet: made from Settings → Users with the person's devices and a new initial password,
   printed, kept to download again, and the password removed from the kept sheet once it is marked as changed. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { pdfText } from '../pdf-text.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-sheet-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const s0 = loadState(db);
saveState(db, { ...s0,
  users: [...s0.users, { id: 'u-anna', login: 'amuster', name: 'Anna Muster', dept: 'Logistik', role: 'viewer', groups: [], source: 'ldap', active: true }],
  objs: [
    { id: 'o1', code: 'INV-0001', type: 'pc', name: 'WIL-NB-001', model: 'Dell Latitude 5440', serial: 'SN-LAT-1', status: 'active', loc: '', ovr: {}, feed: null, uid: 'u-anna' },
    { id: 'o2', code: 'INV-0002', type: 'monitor', name: 'MON-001', model: 'Dell P2422H', serial: 'SN-MON-1', status: 'active', loc: '', ovr: {}, feed: null, uid: 'u-anna' },
    { id: 'o3', code: 'INV-0003', type: 'pc', name: 'OTHER-PC', status: 'active', loc: '', ovr: {}, feed: null },
  ], rels: [], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
await ctx.addInitScript(() => {
  try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ }
  window.print = () => { window.__printed = (document.getElementById('printHost') || {}).innerHTML || ''; };
});
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card');
  await page.click('#setBtn'); await page.click('#setTabs [data-st=users]');
  // the company: its name and logo go on the sheets instead of NOBS Inventory; an SVG logo is kept as a PNG
  await page.fill('#coName', 'Example AG'); await page.locator('#coName').press('Tab');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#c00"/></svg>';
  await page.setInputFiles('#coFile', { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.waitForSelector('.company-logo img');
  assert.match(await page.getAttribute('.company-logo img', 'src'), /^data:image\/png;base64,/);
  const row = page.locator('#setUsers tr', { hasText: 'Anna Muster' });
  await row.locator('[data-sheet]').click();
  await page.waitForSelector('#sheetMake');
  assert.equal(await page.inputValue('#sheetLogin'), 'amuster', 'the sign-in name is filled in from the directory');
  assert.deepEqual(await page.locator('[data-sdev]').evaluateAll(cs => cs.map(c => c.dataset.sdev)), ['o1', 'o2'], 'the person\'s devices, no others');
  assert.match(await page.textContent('#mdl'), /No sheet has been made/);

  await page.fill('#sheetNote', 'Desk 4, first floor');
  await page.click('#sheetMake');
  await page.waitForSelector('#sheetPw');
  const pw = (await page.textContent('#sheetPw')).trim();
  assert.match(pw, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
  const printed = await page.evaluate(() => window.__printed);
  for (const t of [pw, 'Anna Muster', 'Logistik', 'amuster', 'SN-LAT-1', 'MON-001', 'Desk 4, first floor', 'signature', 'Example AG', 'data:image/png;base64,']) assert.ok(printed.includes(t), 'printed sheet lacks ' + t);
  assert.ok(!printed.includes('NOBS Inventory'), 'the company replaces NOBS Inventory on the sheet');
  assert.ok(!printed.includes('OTHER-PC'));
  assert.equal(await page.locator('[data-sprint]').count(), 1, 'the sheet is kept');
  assert.match(await page.textContent('#mdl'), /On the sheet until/);
  if (shots) {
    await page.locator('#mdl .box').screenshot({ path: path.join(shots, 'sheet-modal.png') });
    const p2 = await ctx.newPage(); await p2.setContent(`<style>body{margin:24px;background:#fff}</style>${printed}`);
    await p2.screenshot({ path: path.join(shots, 'sheet-print.png'), fullPage: true }); await p2.close();
  }

  // downloaded as a PDF: the same sheet, with the password while it is kept, and the company's name
  const pdfLink = 'a.btnlink[href$="/pdf"]';
  await page.waitForSelector('.company-logo img, #sheetPw');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(pdfLink)]);
  const raw = fs.readFileSync(await dl.path());
  assert.match(dl.suggestedFilename(), /^entry-sheet-Anna-Muster-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(raw.subarray(0, 5).toString(), '%PDF-');
  const file = pdfText(raw);
  assert.ok(file.includes(pw) && file.includes('SN-MON-1') && file.includes('Example AG'), 'the PDF lacks the password, a serial or the company');

  // marked as changed: the password leaves the kept sheet, the rest stays
  await page.click('[data-schanged]');
  await page.waitForSelector('#mdl .chip.ok');
  assert.equal(await page.locator('[data-schanged]').count(), 0);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click(pdfLink)]);
  const file2 = pdfText(fs.readFileSync(await dl2.path()));
  assert.ok(!file2.includes(pw), 'the password is gone from the kept sheet');
  assert.ok(file2.includes('SN-LAT-1') && /no longer on this copy/.test(file2));

  // a sign-in name is needed
  await page.fill('#sheetLogin', ''); await page.click('#sheetMake');
  assert.match(await page.textContent('#sheetErr'), /sign-in name/);

  await page.click('[data-sdel]');
  await page.waitForFunction(() => !document.querySelector('[data-sprint]'));
  assert.deepEqual(errors, [], 'no page errors');
  console.log('entry sheet: all checks passed');
} finally { await browser.close(); server.close(); }
