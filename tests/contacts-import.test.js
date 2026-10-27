/* Contacts from a file: headings in German, English, Outlook and SharePoint; Excel's Windows encoding; vCards; what an
   import does with each row; and the export read back. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyImport, contactsCsv, decodeText, guessMapping, parseVcf, planImport, readContactFile } from '../public/js/contacts-import.js';

const SHAREPOINT = 'Firma;Phonetischer Firmenname;Vorname;Nachname;Position;Telefon (geschäftlich);Mobiltelefonnummer;E-Mail-Adresse;Notizen';

test('the columns of a SharePoint, Outlook or English list are found by their headings', () => {
  assert.deepEqual(guessMapping(SHAREPOINT.split(';')), ['company', 'area', 'first', 'last', 'role', 'phone', 'mobile', 'email', 'note']);
  assert.deepEqual(guessMapping(['First Name', 'Last Name', 'Company', 'Job Title', 'Business Phone', 'Mobile Phone', 'E-mail Address', 'Notes']),
    ['first', 'last', 'company', 'role', 'phone', 'mobile', 'email', 'note']);
  assert.deepEqual(guessMapping(['Name', 'Unknown', 'name']), ['name', '', ''], 'a field comes from one column only');
});

test('Excel\'s Windows encoding and UTF-8 with a byte-order mark are both read, with semicolons, commas or tabs', () => {
  const win = new Uint8Array([...'Firma;Nachname\nSchöllhorn AG;Flück\n'].map(ch => ch.charCodeAt(0)));   /* ö ü as single bytes */
  assert.equal(decodeText(win), 'Firma;Nachname\nSchöllhorn AG;Flück\n');
  assert.equal(decodeText(new TextEncoder().encode('﻿Firma;Nachname')), 'Firma;Nachname');
  const tab = readContactFile('Company\tName\nSage\tSupport\n', 'x.txt');
  assert.deepEqual([tab.mapping, tab.rows], [['company', 'name'], [['Sage', 'Support']]]);
});

test('vCards from Outlook or a phone become rows: name, company, title, e-mail, phone and mobile', () => {
  const v = parseVcf(['BEGIN:VCARD', 'VERSION:3.0', 'N:Fiedler;Marius;;;', 'FN:Marius Fiedler', 'ORG:LAKE Solutions AG;Netzwerk', 'TITLE:Network Engineer',
    'TEL;TYPE=WORK,VOICE:+41 58 810 79 17', 'TEL;TYPE=CELL:+41 79 000 00 00', 'EMAIL;TYPE=INTERNET:marius.fiedler@lake.ch', 'NOTE:Firewall\\, VPN', 'END:VCARD'].join('\r\n'));
  const plan = planImport([], v.rows, v.mapping);
  assert.equal(plan[0].action, 'new');
  assert.deepEqual(plan[0].contact, { kind: 'external', name: 'Marius Fiedler', company: 'LAKE Solutions AG', role: 'Network Engineer', email: 'marius.fiedler@lake.ch', note: 'Firewall, VPN', phone: '+41 58 810 79 17', mobile: '+41 79 000 00 00' });
});

test('an import adds, updates, leaves alone, and says why a row is left out', () => {
  const existing = [
    { id: 'k1', kind: 'external', name: 'René Flück', company: 'APM', email: 'r.flueck@apmconsulting.ch', phone: '+41 79 435 55 07', note: 'keep me' },
    { id: 'k2', kind: 'external', name: 'Hotline', company: 'Sage', phone: '058 944 14 11' },
  ];
  const text = [SHAREPOINT,
    'APM;InforCOM;René;Flück;Project Manager;+41 79 435 55 07;;r.flueck@apmconsulting.ch;',   // update: a role; the empty note keeps "keep me"
    'Sage;Sage200;;Hotline;;058 944 14 11;;;',                                                 // update: the area
    'Arctic Wolf Networks;IT-Sicherheit;Robert;Sahmel;;;;eu-smb-3@arcticwolf.com;',             // new
    'Arctic Wolf Networks;IT-Sicherheit;Steffen;Wacker;;;;eu-smb-3@arcticwolf.com;',            // new: a team mailbox is not one person
    'Arctic Wolf Networks;IT-Sicherheit;Robert;Sahmel;;;;eu-smb-3@arcticwolf.com;',             // twice in the file
    'Becker;Anlage;Klaus;Becker;;;;not-an-address;',                                            // error: e-mail
    'Nobody AG;;;;;;;;',                                                                        // error: no name
  ].join('\n');
  const f = readContactFile(text, 'k.csv');
  const plan = planImport(existing, f.rows, f.mapping);
  assert.deepEqual(plan.map(p => p.action), ['update', 'update', 'new', 'new', 'duplicate', 'error', 'error']);
  assert.deepEqual(plan[0].changes, ['area', 'role']);
  assert.match(plan[5].problem, /not an e-mail address/);
  assert.match(plan[6].problem, /No name/);
  assert.equal(plan[5].line, 7, 'the line in the file, the heading being line 1');
  let n = 0;
  const { list, added, updated } = applyImport(existing, plan, () => 'n' + n++, it => (it.action === 'new' || it.action === 'update') && it.line !== 5);
  assert.deepEqual([added, updated], [1, 2], 'line 5 (Wacker) was left out');
  const flueck = list.find(c => c.id === 'k1');
  assert.deepEqual([flueck.role, flueck.area, flueck.note], ['Project Manager', 'InforCOM', 'keep me']);
  // the same file again changes nothing
  assert.deepEqual(planImport(list, f.rows, f.mapping).filter(p => p.action === 'update').length, 0);
});

test('the export reads back as it is, and a cell that looks like a formula stays text', () => {
  const list = [{ id: 'a', kind: 'internal', name: 'Anna Muster', company: 'Argolite', area: 'Firewall; VPN', email: 'anna@example.ch', phone: '+41 41 000 00 01', note: 'Line 1\nLine 2' },
    { id: 'b', kind: 'external', name: '=HYPERLINK("x")', company: 'Evil AG' }];
  const csv = contactsCsv(list);
  assert.ok(csv.startsWith('﻿Name;Company;Area;'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'the formula is kept as text');
  assert.ok(csv.includes(';+41 41 000 00 01;'), 'a phone number keeps its plus');
  const back = readContactFile(decodeText(new TextEncoder().encode(csv)), 'contacts.csv');
  const plan = planImport([list[0]], back.rows, back.mapping);
  assert.deepEqual(plan[0].action, 'same');
  assert.equal(plan[0].contact.kind, 'internal');
});
