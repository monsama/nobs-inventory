/* The printers set up on a computer, as Lansweeper scans them: which are real printers (by USB, on the network, shared
   by a print server) and which are not (Print to PDF, XPS, OneNote, Fax, a printer redirected by Remote Desktop).
   Shared by the server (which keeps only the real ones) and the page (which matches them to printer devices). No
   browser code here. */

/* Printers that only make files or send elsewhere, by name or by port. */
const VIRTUAL_NAME = /print to pdf|microsoft xps|xps document|onenote|\bfax\b|send to|adobe pdf|pdfcreator|cutepdf|pdf24|bullzip|foxit (reader )?pdf|nitro pdf|snagit|webex document|redirected\b/i;
const VIRTUAL_PORT = /^(portprompt:|nul:?|file:|xpsport:|shrfax:|ts\d+|tsclient|ne\d+:|pdf|onenote|.*\.pdf$|.*\.xps$)/i;
const IPV4 = /(?:^|[^\d])((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?![\d])/;

/* What a printer on a computer is: { kind, ip, host, share } or null when it is no real printer.
   kind: 'usb' (by cable on this computer), 'ip' (on the network, by its address), 'share' (through a print server,
   \\server\name), 'net' (on the network by a name or WSD, no address known). */
export function printerKind(name, port){
  const n = String(name || '').trim(), p = String(port || '').trim();
  if (!n || VIRTUAL_NAME.test(n) || VIRTUAL_PORT.test(p)) return null;
  const unc = /^\\\\([^\\\s]+)\\(.+)$/.exec(n) || /^\\\\([^\\\s]+)\\(.+)$/.exec(p);
  if (unc) return { kind: 'share', host: unc[1].toLowerCase(), share: unc[2] };
  if (/^(usb|dot4)/i.test(p)) return { kind: 'usb' };
  const ip = IPV4.exec(p);
  if (ip) return { kind: 'ip', ip: ip[1] };
  if (/^(lpt|com)\d+:?$/i.test(p)) return { kind: 'usb' };   /* a printer by cable on an old port: local all the same */
  if (/^wsd/i.test(p)) return { kind: 'net' };
  /* A standard TCP/IP port named by its host (printer-2og.corp.example, or a name with the address left out). */
  if (p) return { kind: 'net', host: p.replace(/_\d+$/, '').toLowerCase() };
  return null;
}

/* The real printers of a list as Lansweeper sends them ({ name, port, driver, location, shared }), each with its kind,
   at most 50, no two the same. */
export function realPrinters(list){
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x !== 'object') continue;
    const name = String(x.name ?? '').trim().slice(0, 200), port = String(x.port ?? '').trim().slice(0, 200);
    const k = printerKind(name, port);
    if (!k) continue;
    const key = (name + '|' + port).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, port, ...k, ...(x.driver ? { driver: String(x.driver).trim().slice(0, 200) } : {}), ...(x.location ? { location: String(x.location).trim().slice(0, 200) } : {}) });
    if (out.length >= 50) break;
  }
  return out;
}

/* A name as compared: lower case, without what Windows adds ("(WSD)", "(Copy 1)", "(redirected 2)") and without
   separators, so "Floor 2 Colour" is "floor2colour" wherever it is written. */
export const printerKey = s => String(s || '').trim().replace(/\s*\((wsd|copy \d+|redirected[^)]*|\d+)\)\s*$/i, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/* How a printer on a computer stands for a printer device of the inventory: { d, by, stale, via }.
   d: the printer device, or null. by: what found it ('address', 'share', 'host', 'name', 'model', 'cable').
   stale: { port, now } when the computer's port names an address the printer no longer has (it was found by its name).
   via: the print server a shared printer goes through, when it is a device of the inventory. */
export function printerMatch(p, pc, objs, rels){
  const live = objs.filter(o => o.type === 'printer' && o.status !== 'retired');
  const low = s => String(s || '').trim().toLowerCase();
  const one = list => list.length === 1 ? list[0] : null;
  /* By its name (or the share's), only when one printer has it; then by its driver as the model, only when one has it. */
  const byName = (...names) => { for (const n of names.map(printerKey).filter(Boolean)) { const d = one(live.filter(o => printerKey(o.name) === n)); if (d) return d; } return null; };
  const byModel = () => p.driver ? one(live.filter(o => o.model && low(o.model) === low(p.driver))) : null;
  const out = (d, by, more = {}) => ({ d, by: d ? by : '', stale: null, via: null, ...more, ...(d ? {} : { d: null }) });
  if (p.kind === 'ip') {
    const d = live.find(o => o.ip === p.ip || (o.nics || []).some(n => n.ip === p.ip));
    if (d) return out(d, 'address');
    /* Not at that address: the printer may have moved. Found by its name, the port is stale. */
    const n = byName(p.name);
    return n ? out(n, 'name', { stale: n.ip && n.ip !== p.ip ? { port: p.ip, now: n.ip } : null }) : out(null, '');
  }
  if (p.kind === 'share') {
    const host = String(p.host || '').trim(), short = host.split('.')[0];
    const via = host ? objs.find(o => o.type !== 'printer' && o.status !== 'retired' && o.name && (low(o.name) === low(host) || low(o.name).split('.')[0] === low(short))) || null : null;
    const d = byName(p.share, p.name);
    return out(d, 'share', { via });
  }
  if (p.kind === 'net') {
    if (p.host) { const h = p.host.split('.')[0]; const d = live.find(o => low(o.name) === p.host || low(o.name) === h || low(o.name).split('.')[0] === h); if (d) return out(d, 'host'); }
    /* A WSD port names no host: the printer by its name, else by its driver as the model. */
    const n = byName(p.name); if (n) return out(n, 'name');
    return out(byModel(), 'model');
  }
  if (p.kind === 'usb' && pc) {
    const attached = new Set(rels.filter(r => r.to === pc.id && r.kind === 'attached').map(r => r.from));
    return out(live.find(o => attached.has(o.id) && (low(o.name) === low(p.name) || low(o.model) === low(p.driver) || low(o.model) === low(p.name))) || null, 'cable');
  }
  return out(null, '');
}
/* The printer device a printer on a computer stands for, or null (printerMatch without the details). */
export const printerDevice = (p, pc, objs, rels) => printerMatch(p, pc, objs, rels).d;

/* Every printer the computers use, once each: the printer device it stands for, or the printer itself where none was
   found (by its address, share, host or name), with the computers that use it and how. Printers of the inventory that
   no computer uses are listed too (users: []) once any computer has sent its printers. */
export function printerRows(objs, rels){
  const rows = new Map(), computers = objs.filter(o => o.status !== 'retired' && Array.isArray(o.lsPrinters) && o.lsPrinters.length);
  for (const pc of computers) for (const p of pc.lsPrinters) {
    const m = printerMatch(p, pc, objs, rels);
    const key = m.d ? 'd:' + m.d.id : p.kind === 'ip' ? 'ip:' + p.ip : p.kind === 'share' ? 's:' + String(p.host || '').toLowerCase() + '\\' + printerKey(p.share) : p.kind === 'usb' ? 'u:' + pc.id + ':' + printerKey(p.name) : 'n:' + (p.host || printerKey(p.name));
    if (!rows.has(key)) rows.set(key, { key, d: m.d, p, via: m.via, users: [], kinds: new Set(), stale: [] });
    const r = rows.get(key);
    /* A computer that reaches it two ways (by WSD and through the print server) counts once. */
    if (!r.users.some(u => u.pc === pc)) r.users.push({ pc, p });
    r.kinds.add(p.kind);
    if (m.stale) r.stale.push({ pc, ...m.stale });
    if (!r.via && m.via) r.via = m.via;
  }
  if (computers.length) for (const d of objs) if (d.type === 'printer' && d.status !== 'retired' && !rows.has('d:' + d.id)) rows.set('d:' + d.id, { key: 'd:' + d.id, d, p: null, via: null, users: [], kinds: new Set(), stale: [] });
  return [...rows.values()];
}
