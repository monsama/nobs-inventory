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

/* The printer device of the inventory a printer on a computer stands for: by its address, by the print server's share
   (a printer device named like the share, or like the host the port names), or for a USB printer the printer attached
   to that computer under the same name. null when none is found. */
export function printerDevice(p, pc, objs, rels){
  const live = objs.filter(o => o.type === 'printer' && o.status !== 'retired');
  const low = s => String(s || '').trim().toLowerCase();
  if (p.kind === 'ip') return live.find(o => o.ip === p.ip || (o.nics || []).some(n => n.ip === p.ip)) || null;
  if (p.kind === 'share') return live.find(o => low(o.name) === low(p.share) || low(o.name) === low(p.name)) || null;
  if (p.kind === 'net' && p.host) { const h = p.host.split('.')[0]; return live.find(o => low(o.name) === p.host || low(o.name) === h || low(o.name).split('.')[0] === h) || null; }
  if (p.kind === 'usb' && pc) {
    const attached = new Set(rels.filter(r => r.to === pc.id && r.kind === 'attached').map(r => r.from));
    return live.find(o => attached.has(o.id) && (low(o.name) === low(p.name) || low(o.model) === low(p.driver) || low(o.model) === low(p.name))) || null;
  }
  return null;
}
