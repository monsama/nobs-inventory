/* Editing fields of many devices at once (views-bulk.js draws the dialog): the fields offered, each value checked as the
   device page checks it, and which devices change and how. No DOM: the tests use it too. */
import { editText, fieldNote, fieldValue } from './restore.js';

/* The built-in fields offered, in this order, with their usual names; the custom fields of the types follow. */
export const BULK_BUILTIN = { model: 'Model', supplier: 'Supplier', purchased: 'Purchased', warranty: 'Warranty ends', price: 'Price', invoice: 'Invoice no.', os: 'Operating system', notes: 'Notes' };
/* Fields every device has a value of its own in: one value for all of them would be wrong. */
export const BULK_UNIQUE = ['name', 'serial', 'ip', 'mac'];
export const UNIQUE_WHY = 'Name, serial number, IP address and MAC address are not offered: each device has its own.';
/* The longest value: notes as on the device page, other text as the server takes it. */
const MAX = { notes: 20000 }, TEXT_MAX = 500;
/* How many devices the preview lists per field. */
export const PREVIEW_ROWS = 10;
const empty = v => v === undefined || v === null || v === '';

/* The fields offered for the picked devices: { k, label, kind, types }, kind as in 17-fields.js (date, money, number,
   notes; else text). fieldsOf(type) gives a type's fields as the device page has them ([key, label, kind], custom ones
   as custom.<key>). A field is offered when one of the picked types has it; notes every device has. */
export function bulkFields(list, fieldsOf) {
  const out = new Map(), types = [...new Set(list.map(o => o.type))];
  for (const k of Object.keys(BULK_BUILTIN)) {
    const has = k === 'notes' ? types : types.filter(t => fieldsOf(t).some(f => f[0] === k));
    if (has.length) out.set(k, { k, label: BULK_BUILTIN[k], kind: k === 'notes' ? 'notes' : (fieldsOf(has[0]).find(f => f[0] === k) || [])[2] || '', types: has });
  }
  for (const t of types) for (const [k, label, kind] of fieldsOf(t)) {
    if (!k.startsWith('custom.')) continue;
    const f = out.get(k);
    if (f) f.types.push(t); else out.set(k, { k, label, kind: kind || '', types: [t] });
  }
  return [...out.values()];
}

/* A value typed for field f, checked as the device page checks it: { ok, value } or { ok: false, msg }. parseDay (ISO,
   '' or null) and num (a number or undefined) are the page's readers of a day and an amount. */
export function parseBulkValue(f, raw, { parseDay, num }) {
  const t = f.kind === 'notes' ? String(raw ?? '').replace(/\s+$/, '') : String(raw ?? '').trim();
  if (!t.trim()) return { ok: false, msg: `Type a value for ${f.label}, or choose Clear.` };
  if (f.kind === 'date') { const d = parseDay(t); return d ? { ok: true, value: d } : { ok: false, msg: `${f.label}: ${t} is not a day: write it as dd.mm.yyyy.` }; }
  if (f.kind === 'money') { const n = num(t); return n === undefined ? { ok: false, msg: `${f.label}: the price is a number up to 1 000 000 000, e.g. 1290 or 99.50.` } : { ok: true, value: n }; }
  if (f.kind === 'number') { const n = Number(t.replace(',', '.')); return isFinite(n) ? { ok: true, value: n } : { ok: false, msg: `${f.label}: ${t} is not a number.` }; }
  const max = MAX[f.k] || TEXT_MAX;
  return t.length > max ? { ok: false, msg: `${f.label}: up to ${max} characters.` } : { ok: true, value: t };
}

/* A value as the preview and the history show it: a day as 31.12.2026, notes on one short line. */
export function shownValue(f, v) {
  if (empty(v)) return '';
  if (f.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}`;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 59) + '…' : s;
}

/* What the edit does. rows: [{ k, op: 'set' or 'clear', raw, onlyEmpty }]; fields: from bulkFields; ctx: parseDay,
   num, and ownerOf(o, k), the source that writes the field of o now ('ls', 'graph', 'ad') or ''.
   Returns { errors, fields: [{ f, op, value, onlyEmpty, changes: [{ o, from, to }], same, kept, without, owned }] }:
   same already have the value, kept have one and only empty ones change, without have no such field (their type),
   owned counts the changing devices per source that wrote the field. */
export function planBulk(list, rows, fields, ctx) {
  const errors = [], out = [], seen = new Set(), ownerOf = ctx.ownerOf || (() => '');
  for (const r of rows) {
    const f = fields.find(x => x.k === r.k);
    if (!f) { errors.push('Pick a field for each row.'); continue; }
    if (seen.has(f.k)) { errors.push(`${f.label} is picked twice.`); continue; }
    seen.add(f.k);
    const op = r.op === 'clear' ? 'clear' : 'set';
    let value;
    if (op === 'set') {
      const p = parseBulkValue(f, r.raw, ctx);
      if (!p.ok) { errors.push(p.msg); continue; }
      value = p.value;
    }
    const onlyEmpty = op === 'set' && !!r.onlyEmpty;
    const res = { f, op, value, onlyEmpty, changes: [], same: 0, kept: 0, without: 0, owned: {} };
    for (const o of list) {
      if (!f.types.includes(o.type)) { res.without++; continue; }
      const from = fieldValue(o, f.k);
      if (onlyEmpty && !empty(from)) { res.kept++; continue; }
      if ((empty(from) && empty(value)) || String(from ?? '') === String(value ?? '')) { res.same++; continue; }
      res.changes.push({ o, from, to: value });
      const src = ownerOf(o, f.k);
      if (src) res.owned[src] = (res.owned[src] || 0) + 1;
    }
    out.push(res);
  }
  return { errors, fields: out };
}
/* The devices that change, each once. */
export const changedDevices = plan => [...new Set(plan.fields.flatMap(x => x.changes.map(c => c.o)))];

/* A field's history line, as the device page writes it (editText), with the values to set it back (fieldNote). */
export function historyLine(label, f, from, to) {
  return { msg: editText(label, shownValue(f, from), shownValue(f, to)), note: fieldNote(f.k, from, to) };
}

/* The preview's line for one field: how many change, and why the others do not. */
export function fieldSummary(x, total) {
  const n = x.changes.length, dev = c => `${c} ${c === 1 ? 'device' : 'devices'}`;
  const why = [x.same && `${x.same} already ${x.op === 'clear' ? 'empty' : x.same === 1 ? 'has it' : 'have it'}`,
    x.kept && `${x.kept} ${x.kept === 1 ? 'has' : 'have'} a value, left as it is`,
    x.without && `${x.without} without this field`].filter(Boolean);
  return `${x.f.label}: ${n ? `${n} of ${dev(total)} ${x.op === 'clear' ? 'cleared' : 'change'}` : `no change on the ${dev(total)}`}${why.length ? ` (${why.join('; ')})` : ''}`;
}
/* The note on fields a sync writes: setting them here keeps the value typed, as an edit on the device page does. */
export function ownedNote(x, sourceLabel) {
  const parts = Object.entries(x.owned).map(([src, n]) => `${n} ${n === 1 ? 'device takes' : 'devices take'} this from ${sourceLabel[src] || src}`);
  if (!parts.length) return '';
  return `${parts.join('; ')}: ${x.op === 'clear' ? 'clearing it here keeps it empty' : 'setting it here keeps your value'}.`;
}
