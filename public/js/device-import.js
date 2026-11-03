/* Devices from a CSV file: which column fills which field, what each row would do (add a device, or a duplicate of one
   already here) and what is wrong with it. Pure functions, shared by the page (the CSV import wizard) and the tests. */
import { checkAddress } from './addr.js';

/* The fields a column can fill, with the headings that mean it (compared without case, spaces or punctuation). */
export const DEVICE_FIELDS = {
  name: { label: 'Name', heads: ['name', 'hostname', 'host', 'devicename', 'computername', 'computer', 'assetname', 'asset', 'device'] },
  type: { label: 'Type', heads: ['type', 'devicetype', 'assettype', 'objecttype', 'category', 'kind'] },
  model: { label: 'Model', heads: ['model', 'modelname', 'product', 'productname'] },
  serial: { label: 'Serial number', heads: ['serial', 'serialnumber', 'serialno', 'sn', 'servicetag'] },
  ip: { label: 'IP address', heads: ['ip', 'ipaddress', 'ipv4', 'ipv4address', 'ipaddr'] },
  mac: { label: 'MAC address', heads: ['mac', 'macaddress', 'macaddr', 'physicaladdress'] },
  loc: { label: 'Location', heads: ['location', 'loc', 'room', 'place', 'office'] },
  user: { label: 'User', heads: ['user', 'username', 'owner', 'assignedto', 'assigneduser', 'employee'] },
  status: { label: 'Status', heads: ['status', 'state'] },
  purchased: { label: 'Purchased', heads: ['purchased', 'purchasedate', 'purchasedon', 'dateofpurchase', 'bought'] },
  warranty: { label: 'Warranty ends', heads: ['warranty', 'warrantyends', 'warrantyend', 'warrantyexpires', 'warrantyexpiry', 'warrantyuntil', 'warrantydate'] },
  price: { label: 'Price', heads: ['price', 'cost', 'purchaseprice', 'amount'] },
  supplier: { label: 'Supplier', heads: ['supplier', 'vendor', 'seller', 'reseller'] },
  invoice: { label: 'Invoice', heads: ['invoice', 'invoiceno', 'invoicenumber', 'invoicenr'] },
  notes: { label: 'Notes', heads: ['notes', 'note', 'comment', 'comments', 'remarks'] },
};
/* The fields "update empty fields only" may fill on a device already here (name and type it always has). */
export const FILLABLE = ['model', 'serial', 'ip', 'mac', 'loc', 'user', 'purchased', 'warranty', 'price', 'supplier', 'invoice', 'notes'];
export const DELIMITER_NAME = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

/* A heading as compared: no case, spaces, punctuation or byte-order mark ("Serial Number" and "serial_number" are one). */
export const normHead = h => String(h ?? '').replace(/^﻿/, '').toLowerCase().replace(/[\s_\-./\\#:()]+/g, '');

/* Which field each column fills ('' for none). A heading met before keeps the field chosen for it then (remembered:
   normalized heading → field, '' meaning ignored); else it is matched by its name. Each field comes from one column. */
export function guessDeviceMapping(headers, remembered = {}) {
  const used = new Set();
  const pick = f => f && DEVICE_FIELDS[f] && !used.has(f) ? (used.add(f), f) : '';
  const out = headers.map(() => null);
  /* Remembered choices first, so a field remembered for a later column is not taken by an earlier name match. */
  headers.forEach((h, i) => { const n = normHead(h); if (n && Object.hasOwn(remembered, n)) out[i] = pick(remembered[n]); });
  headers.forEach((h, i) => {
    if (out[i] !== null) return;
    const n = normHead(h);
    out[i] = pick(Object.keys(DEVICE_FIELDS).find(k => !used.has(k) && DEVICE_FIELDS[k].heads.includes(n)));
  });
  return out;
}
/* The mapping kept for next time: what the user chose for each heading, added to what was kept before. */
export const rememberMapping = (headers, mapping, remembered = {}) => {
  const out = { ...remembered };
  headers.forEach((h, i) => { const n = normHead(h); if (n) out[n] = mapping[i] || ''; });
  /* A few hundred headings at most, the newest kept. */
  return Object.fromEntries(Object.entries(out).slice(-300));
};

const low = v => String(v ?? '').trim().toLowerCase();
const macKey = v => low(v).replace(/[^0-9a-f]/g, '');
/* The device already here a row describes: by serial number, else by name (not a retired one), else by MAC address. */
export function matchDevice(v, objs) {
  const by = (k, f) => { const o = f && objs.find(f); return o ? { o, by: k } : null; };
  return (v.serial && by('serial', o => low(o.serial) === low(v.serial)))
    || (v.name && by('name', o => o.status !== 'retired' && low(o.name) === low(v.name)))
    || (macKey(v.mac).length === 12 && by('mac', o => macKey(o.mac) === macKey(v.mac)))
    || null;
}

/* Words for types that are not the type's own name or label. */
const TYPE_WORDS = { laptop: 'notebook', desktop: 'pc', workstation: 'pc', computer: 'pc', ap: 'accesspoint', smartphone: 'mobile', iphone: 'ios', nas: 'storage' };
const typeOf = (t, types) => {
  const n = low(t); if (!n) return '';
  return Object.keys(types).find(k => k === n || low(types[k].label) === n) || (types[TYPE_WORDS[n]] ? TYPE_WORDS[n] : null);
};
const statusOf = (s, statuses) => { const n = low(s); return !n ? '' : Object.keys(statuses).find(k => k === n || low(statuses[k].label) === n) || null; };
/* A location as written, or only its room when one location has that room. */
const locOf = (l, locs) => {
  const n = low(l); if (!n) return '';
  const hit = locs.find(x => low(x) === n); if (hit) return hit;
  const rooms = locs.filter(x => low(x.split(' / ').slice(1).join(' / ')) === n);
  return rooms.length === 1 ? rooms[0] : null;
};

/* What each row would do. ctx: objs (the inventory), types, statuses, locs, and the page's readers of a day
   (parseDay: ISO, '' or null) and an amount (num: a number or undefined). A row is 'error' (errs say why), 'new', or
   'dup' (match: the device here, by: how it was found, fill: the empty fields of it the row has values for). */
export function planDeviceImport(rows, mapping, ctx) {
  const { objs, types, statuses, locs, parseDay, num } = ctx;
  const seen = [];
  return rows.map((r, i) => {
    const raw = {};
    mapping.forEach((f, c) => { if (f) raw[f] = String(r[c] ?? '').trim(); });
    const v = {}, errs = [];
    if (raw.name) v.name = raw.name; else errs.push('no name');
    for (const k of ['model', 'serial', 'user', 'supplier', 'invoice', 'notes']) if (raw[k]) v[k] = raw[k];
    /* As long as the server takes them. */
    for (const k of ['name', 'model', 'serial', 'user', 'supplier', 'invoice']) if ((raw[k] || '').length > 500) errs.push(`${DEVICE_FIELDS[k].label.toLowerCase()} longer than 500 characters`);
    if ((raw.notes || '').length > 20000) errs.push('notes longer than 20000 characters');
    const t = typeOf(raw.type, types);
    if (t === null) errs.push(`unknown type "${raw.type}"`); else if (t) v.type = t;
    const s = statusOf(raw.status, statuses);
    if (s === null) errs.push(`unknown status "${raw.status}"`); else if (s) v.status = s;
    const l = locOf(raw.loc, locs);
    if (l === null) errs.push(`unknown location "${raw.loc}"`); else if (l) v.loc = l;
    for (const k of ['ip', 'mac']) {
      const a = checkAddress(k, raw[k]);
      if (!a.ok) errs.push(`bad ${k === 'ip' ? 'IP' : 'MAC'} address "${raw[k]}"`); else if (a.value) v[k] = a.value;
    }
    for (const k of ['purchased', 'warranty']) {
      const d = parseDay(raw[k]);
      if (d === null) errs.push(`bad date "${raw[k]}"`); else if (d) v[k] = d;
    }
    if (raw.price) { const p = num(raw.price); if (p === undefined) errs.push(`bad price "${raw.price}"`); else v.price = p; }
    const row = { line: i + 2, v, errs, action: 'error' };
    const m = matchDevice(v, objs);
    /* The same device twice in the file: the second row would add it again. */
    const twice = !m && matchDevice(v, seen.map(x => x.v));
    if (twice) errs.push(`same device as line ${seen.find(x => x.v === twice.o).line}`);
    if (!m && !v.type && !errs.some(e => e.startsWith('unknown type'))) errs.push('no type');
    if (errs.length) return row;
    seen.push(row);
    if (!m) return { ...row, action: 'new' };
    const empty = k => k === 'price' ? typeof m.o.price !== 'number' : String(m.o[k] ?? '').trim() === '';
    return { ...row, action: 'dup', match: m.o, by: m.by, fill: FILLABLE.filter(k => k in v && empty(k)) };
  });
}
