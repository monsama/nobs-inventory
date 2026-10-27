/* Contacts from a file: a CSV (Excel, Outlook, a SharePoint list) or vCards (.vcf), and back out as a CSV.
   Pure functions, shared by the page and the tests: read the bytes, find which column holds what, turn rows into
   contacts, and compare them with the contacts there are, so the page can show what an import would do before it does. */
import { parseCsv } from './csv.js';
import { CONTACT_KINDS, contactProblem } from './contacts.js';

/* Excel in Switzerland saves "CSV (Trennzeichen-getrennt)" in Windows-1252, "CSV UTF-8" with a byte-order mark: both
   are read. A file that is not valid UTF-8 is read as Windows-1252. */
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(u8); }
}

/* The fields a column can fill, with the headings that mean it in German, English, Outlook and SharePoint exports. */
export const IMPORT_FIELDS = {
  name: { label: 'Name (whole)', heads: ['name', 'full name', 'display name', 'anzeigename', 'vollständiger name', 'kontakt'] },
  first: { label: 'First name', heads: ['first name', 'given name', 'vorname'] },
  last: { label: 'Last name', heads: ['last name', 'surname', 'family name', 'nachname'] },
  company: { label: 'Company', heads: ['company', 'organization', 'organisation', 'firma', 'unternehmen', 'lieferant', 'partner'] },
  area: { label: 'Area', heads: ['area', 'topic', 'responsible for', 'bereich', 'zuständig für', 'thema', 'system', 'phonetischer firmenname'] },
  role: { label: 'Role', heads: ['role', 'job title', 'title', 'position', 'funktion', 'rolle', 'abteilung', 'department'] },
  email: { label: 'E-mail', heads: ['e-mail', 'email', 'e-mail address', 'email address', 'e-mail-adresse', 'mail', 'e-mail 1'] },
  phone: { label: 'Phone', heads: ['phone', 'business phone', 'work phone', 'telefon', 'telefon (geschäftlich)', 'telefon geschäftlich', 'geschäftlich', 'tel', 'telefonnummer'] },
  mobile: { label: 'Mobile', heads: ['mobile', 'mobile phone', 'cell', 'mobil', 'mobiltelefon', 'mobiltelefonnummer', 'handy', 'natel'] },
  note: { label: 'Note', heads: ['note', 'notes', 'notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar'] },
  kind: { label: 'Internal or external', heads: ['kind', 'type', 'art', 'typ', 'intern/extern', 'internal/external'] },
};
const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
/* Which field each column fills ('' for none): by its heading; each field at most once, the first column wins. */
export function guessMapping(headers) {
  const used = new Set();
  return headers.map(h => {
    const n = norm(h).replace(/[*:]+$/, '');
    const f = Object.keys(IMPORT_FIELDS).find(k => !used.has(k) && IMPORT_FIELDS[k].heads.includes(n));
    if (f) used.add(f);
    return f || '';
  });
}

/* vCards, as Outlook and phones write them: one contact per BEGIN:VCARD … END:VCARD. Lines folded with a leading
   space are joined, and \n \, \; in values are unescaped. Rows come out with headings, like a CSV. */
export function parseVcf(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let c = null;
  const val = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
  for (const line of lines) {
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).toUpperCase(), v = line.slice(i + 1), prop = key.split(';')[0].replace(/^ITEM\d+\./, '');
    if (prop === 'BEGIN' && /^vcard$/i.test(v.trim())) { c = {}; continue; }
    if (prop === 'END' && c) { out.push(c); c = null; continue; }
    if (!c) continue;
    if (prop === 'FN') c.name ??= val(v);
    else if (prop === 'N') { const [last = '', first = ''] = v.split(';'); c.last ??= val(last); c.first ??= val(first); }
    else if (prop === 'ORG') c.company ??= val(v.split(';')[0]);
    else if (prop === 'TITLE' || prop === 'ROLE') c.role ??= val(v);
    else if (prop === 'EMAIL') c.email ??= val(v);
    else if (prop === 'TEL') { const cell = /CELL|MOBILE/.test(key); if (cell) c.mobile ??= val(v); else c.phone ??= val(v); }
    else if (prop === 'NOTE') c.note ??= val(v);
  }
  const fields = ['name', 'first', 'last', 'company', 'role', 'email', 'phone', 'mobile', 'note'];
  return { headers: fields.map(f => IMPORT_FIELDS[f].label), mapping: fields, rows: out.map(o => fields.map(f => o[f] || '')) };
}

/* A file's rows with their headings, from its text: vCards or CSV (the first line holds the headings). */
export function readContactFile(text, fileName = '') {
  if (/\.vcf$/i.test(fileName) || /^\s*BEGIN:VCARD/i.test(text)) return parseVcf(text);
  const rows = parseCsv(text);
  const headers = (rows[0] || []).map(h => h.trim());
  return { headers, mapping: guessMapping(headers), rows: rows.slice(1) };
}

const KIND_WORDS = { internal: ['internal', 'intern', 'interne', 'interner', 'eigene', 'own', 'staff'], external: ['external', 'extern', 'externe', 'externer', 'partner', 'it partner', 'supplier', 'lieferant'] };
const kindOf = v => Object.keys(KIND_WORDS).find(k => KIND_WORDS[k].includes(norm(v))) || '';
const clean = v => String(v ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
/* A phone number as people write it, kept as written apart from spaces and the dashes Word makes ("–"). */
const cleanPhone = v => clean(v).replace(/[‐-―]/g, '-');

/* The contact a row describes, or why it cannot be one. The name is the whole name, or first and last name together;
   a row with only a last name ("Hotline", "Support") is named so, with its company shown beside it. */
export function rowToContact(row, mapping, defaultKind = 'external') {
  const get = f => { const i = mapping.indexOf(f); return i < 0 ? '' : clean(row[i]); };
  const name = get('name') || [get('first'), get('last')].filter(Boolean).join(' ');
  const c = { kind: kindOf(get('kind')) || defaultKind, name };
  for (const f of ['company', 'area', 'role', 'email', 'note']) { const v = f === 'note' ? String(row[mapping.indexOf(f)] ?? '').trim() : get(f); if (v) c[f] = v; }
  for (const f of ['phone', 'mobile']) { const v = cleanPhone(get(f)); if (v) c[f] = v; }
  if (get('kind') && !kindOf(get('kind'))) return { contact: c, problem: `“${get('kind')}” is not internal or external.` };
  if (!c.name) return { contact: c, problem: 'No name: give a name, or a first or last name.' };
  const p = contactProblem({ id: 'check', ...c });
  return { contact: c, problem: p ? p.replace(/^[^:]*: /, '') : '' };
}

/* The fields an import compares and fills. */
export const CONTACT_FIELDS = ['name', 'company', 'area', 'role', 'email', 'phone', 'mobile', 'note', 'kind'];
const keyOf = c => norm(c.name) + '|' + norm(c.company);
const mailKey = c => c.email ? norm(c.email) + '|' + norm(c.name) : '';

/* What an import of these rows would do, row by row:
   new — no such contact yet;
   update — the same person (same name and company, or same e-mail and name) with something new; empty cells keep
     what the contact has, so a file with fewer columns never wipes anything;
   same — nothing new;
   duplicate — an earlier row of the file is the same person;
   error — the row cannot be a contact (the problem says why).
   The same e-mail on two people (a team mailbox) does not make them one. */
export function planImport(existing, rows, mapping, defaultKind = 'external') {
  const byKey = new Map(), byMail = new Map();
  for (const c of existing) { byKey.set(keyOf(c), c); if (mailKey(c)) byMail.set(mailKey(c), c); }
  const seen = new Set();
  return rows.map((row, i) => {
    const { contact, problem } = rowToContact(row, mapping, defaultKind);
    const line = i + 2;   /* the heading is line 1 */
    if (problem) return { line, action: 'error', contact, problem };
    const k = keyOf(contact);
    if (seen.has(k)) return { line, action: 'duplicate', contact, problem: 'The same person is on an earlier line.' };
    seen.add(k);
    const was = byKey.get(k) || (mailKey(contact) && byMail.get(mailKey(contact)));
    if (!was) return { line, action: 'new', contact };
    const changes = CONTACT_FIELDS.filter(f => contact[f] !== undefined && contact[f] !== '' && String(contact[f]) !== String(was[f] ?? ''));
    return { line, action: changes.length ? 'update' : 'same', contact, id: was.id, changes };
  });
}

/* The contacts after an import of the planned rows picked (all new and updated ones unless told otherwise). */
export function applyImport(existing, plan, newId, pick = it => it.action === 'new' || it.action === 'update') {
  const list = existing.map(c => ({ ...c }));
  let added = 0, updated = 0;
  for (const it of plan) {
    if (!pick(it)) continue;
    if (it.action === 'new') { list.push({ id: newId(), ...it.contact }); added++; }
    else if (it.action === 'update') {
      const c = list.find(x => x.id === it.id); if (!c) continue;
      for (const f of it.changes) c[f] = it.contact[f];
      /* A contact that becomes external is no longer one of the users. */
      if (c.kind === 'external') delete c.userId;
      updated++;
    }
  }
  return { list, added, updated };
}

/* The contacts as a CSV Excel opens as it is: semicolons, a byte-order mark for the umlauts, and a cell that starts
   like a formula (= + - @) kept as text. Read back by the import as it is. */
export function contactsCsv(list) {
  const head = ['Name', 'Company', 'Area', 'Role', 'E-mail', 'Phone', 'Mobile', 'Note', 'Kind'];
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d\s()./-]+$/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = list.map(c => [c.name, c.company, c.area, c.role, c.email, c.phone, c.mobile, c.note, CONTACT_KINDS[c.kind] || c.kind].map(cell).join(';'));
  return '﻿' + [head.join(';'), ...rows].join('\r\n') + '\r\n';
}
