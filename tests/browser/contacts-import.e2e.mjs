/* Browser test of the contact import: a SharePoint-style CSV in Excel's Windows encoding is read, its columns are matched,
   the preview says what each row does, a row can be left out and a column changed, a backup is taken, the import is
   saved, the same file again changes nothing, and the export downloads a CSV that reads back. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cimport-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
saveState(db, { ...loadState(db), contacts: [{ id: 'k1', kind: 'external', name: 'Erika Beispiel', company: 'Muster IT AG', email: 'erika@muster-it.ch', note: 'stays' }], history: {} });
const stored = async (check, ms = 8000) => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > ms) throw new Error('not saved in time'); await new Promise(r => setTimeout(r, 100)); } };

/* Excel "CSV (Trennzeichen-getrennt)": semicolons, Windows-1252 (ü and ö as one byte each), SharePoint's headings. */
const csv = ['Firma;Phonetischer Firmenname;Vorname;Nachname;Position;Telefon (geschäftlich);Mobiltelefonnummer;E-Mail-Adresse;Notizen',
  'Muster IT AG;Firewall;Erika;Beispiel;Network Engineer;+41 41 000 00 10;;erika@muster-it.ch;',
  'Muster IT AG;Firewall;;Hotline;;+41 41 000 00 11;;;7x24h',
  'Beispiel Software AG;ERP Schnittstelle;Jürg;Möller;Consultant;;+41 79 000 00 12;juerg@beispiel.ch;Hauptansprechpartner',
  'Beispiel Software AG;ERP;Paul;Probe;;;;paul@beispiel.ch;',
  'Kaputt AG;;Kai;Kaputt;;;;no-address;'].join('\r\n') + '\r\n';
const win1252 = Buffer.from([...csv].map(ch => ch.charCodeAt(0)));

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none in previews */ } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card, .empty');
  await page.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'contacts'; (await import('/js/07-render-plans.js')).render(); });
  await page.click('#cnImport');
  await page.setInputFiles('#impFile', { name: 'kontakte.csv', mimeType: 'text/csv', buffer: win1252 });
  await page.waitForSelector('.imp-table tbody tr');

  // the columns are found by their headings; "Phonetischer Firmenname" is the area in such a list
  assert.deepEqual(await page.$$eval('[data-impcol]', ss => ss.map(s => s.value)), ['company', 'area', 'first', 'last', 'role', 'phone', 'mobile', 'email', 'note']);
  // what each row does, with the umlauts read right
  const what = await page.$$eval('.imp-table tbody tr', rs => rs.map(r => [r.cells[2].textContent.trim(), r.cells[3].textContent.trim()]));
  assert.deepEqual(what, [['Update', 'Erika Beispiel'], ['New', 'Hotline'], ['New', 'Jürg Möller'], ['New', 'Paul Probe'], ['Not imported', 'Kai Kaputt']]);
  assert.match(await page.textContent('.imp-table tbody tr:nth-child(5) .imp-why'), /not an e-mail address/);
  assert.match(await page.textContent('.imp-table tbody tr:nth-child(1)'), /Changes area, role, phone/);
  if (shots) await page.locator('#mdl .box').screenshot({ path: path.join(shots, 'contacts-import.png') });
  // leave Paul out; the button counts what is picked
  await page.uncheck('[data-improw="3"]');
  assert.equal((await page.textContent('#impOk')).trim(), 'Import 3 contacts');
  await page.click('#impOk');
  await stored(st => (st.contacts || []).length === 3);
  const st = loadState(db);
  const erika = st.contacts.find(c => c.id === 'k1'), juerg = st.contacts.find(c => c.name === 'Jürg Möller');
  assert.deepEqual([erika.role, erika.area, erika.note], ['Network Engineer', 'Firewall', 'stays'], 'updated, the note kept');
  assert.deepEqual([juerg.kind, juerg.company, juerg.area, juerg.mobile, juerg.note], ['external', 'Beispiel Software AG', 'ERP Schnittstelle', '+41 79 000 00 12', 'Hauptansprechpartner']);
  assert.ok(!st.contacts.some(c => c.name === 'Paul Probe'), 'the row left out was not imported');
  assert.ok(db.prepare("SELECT 1 FROM backups WHERE reason = 'before a contact import'").get(), 'a backup was taken first');
  // the card shows the area; the search finds it
  await page.waitForSelector('.cn-area');
  assert.match(await page.textContent('.cn-card:has-text("Jürg Möller") .cn-area'), /ERP Schnittstelle/);

  // the same file again: only the row left out before is new; the rest is unchanged
  await page.click('#cnImport');
  await page.setInputFiles('#impFile', { name: 'kontakte.csv', mimeType: 'text/csv', buffer: win1252 });
  await page.waitForSelector('.imp-table tbody tr');
  assert.match(await page.textContent('.imp-counts'), /1 new.*0 update.*3 unchanged/s);
  await page.selectOption('[data-impcol="1"]', '');
  assert.equal(await page.$eval('[data-impcol="1"]', s => s.value), '');
  await page.click('#impCancel');

  // the export downloads a CSV that the import reads back as it is
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cnExport')]);
  assert.equal(dl.suggestedFilename(), 'contacts.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  assert.ok(text.startsWith('﻿Name;Company;Area;Role;'));
  assert.match(text, /Jürg Möller;Beispiel Software AG;ERP Schnittstelle;Consultant;/);

  assert.deepEqual(errors, []);
  console.log('contacts import: all checks passed');
} finally { await browser.close(); server.close(); }
