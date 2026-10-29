/* The fields of a device page: which a type has, the control of each (lists, the model and address combos, dates),
   their menus, notes and source marks, and the parts drawn under some of them (other adapters, disks). */
import { REVIEW, $, COSTS, DOMAINS, FIELD_LABEL, LOCS, LS_ON, STATUS, SUBNETS, TYPES, WARRANTY_SOON_DAYS, byId, esc, feedLinked, graphLast, hasPorts, lagOfPort, lsLive, modelNames, objs, portLabel, rels, sourceMark, warrantyState } from './01-core.js';
import { USERS, canEdit } from './04-settings.js';
import { dateFieldHtml } from './datefield.js';
import { dateText } from './dates.js';
import { freeAddresses, ipInt, rangeKeptOut, subnetSpan } from './net.js';
import { isPlaceholderSerial } from './serials.js';

export const FIELDS = {
  base:[['name','Name','mono'],['purpose','Description'],['type','Type','type'],['model','Model'],['serial','Serial number','mono'],['loc','Location','loc'],['status','Status','status'],['user','User / owner','user'],['purchased','Purchased','date'],['warranty','Warranty ends','date'],['price','Price','money'],['supplier','Supplier'],['invoice','Invoice no.','mono']],
  net:[['ip','IP address','mono'],['subnet','Subnet','subnet'],['dhcp','Address from','dhcp'],['gateway','Gateway','mono'],['dns','DNS servers','mono'],['ip6','IPv6 address','mono'],['mac','MAC address','mono']],
  pc:[['os','Operating system'],['cpu','CPU'],['ram','Memory'],['domain','Domain','domain'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['av','Antivirus']], notebook:[['os','Operating system'],['cpu','CPU'],['ram','Memory'],['domain','Domain','domain'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['av','Antivirus']], server:[['kind','Kind','kind'],['os','Operating system'],['domain','Domain','domain'],['cpu','CPU'],['ram','Memory'],['fw','Firmware'],['boot','Last power event'],['disk','Disks'],['av','Antivirus'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  sip:[['ext','Extension','mono'],['fw','Firmware','mono']], mobile:[['os','Operating system']], android:[['os','Operating system']], ios:[['os','Operating system']], rack:[['units','Height (U)','mono']],
  switch:[['os','Firmware'],['ports','Copper ports','mono'],['sfp','SFP ports','mono'],['pfx','Port naming','mono']],
  router:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']], firewall:[['os','Firmware'],['ports','Ports','mono'],['pfx','Port naming','mono']],
  patch:[['ports','Ports','mono']], storage:[['cap','Capacity','mono'],['proto','Protocol','mono']],
  accesspoint:[['ssid','Wi-Fi networks']], bmc:[['fw','Firmware']],
  monitor:[], printer:[], other:[]
};
/* Types without a network address of their own: a monitor hangs off a PC, a rack and a patch panel are passive. */
export const NO_NET_TYPES = ['monitor', 'rack', 'patch'];
/* The built-in fields of a type: everyone's, the network ones unless the type has no address, and the type's own. */
export const typeFieldsOf = type => [...FIELDS.base.filter(f => !(f[0] === 'user' && NO_USER_TYPES.includes(type))), ...(NO_NET_TYPES.includes(type) ? [] : FIELDS.net), ...(FIELDS[type] || [])];
/* Types nobody uses as a person's device: a rack and a patch panel have no user. */
export const NO_USER_TYPES = ['rack', 'patch'];
/* Network ports can be added to a device of a type that has an address but no ports of its own (a PC, a printer). */
export const canAddPorts = type => !NO_NET_TYPES.includes(type) && !(FIELDS[type] || []).some(f => f[0] === 'ports');
/* Accessories of a PC (headset, dock, keyboard…): each has a name, a kind and an optional serial number. */
export function accessoriesHtml(o){
  const list = (o.accessories || []).map((a, i) => `<div class="entry"><div class="entry-head"><b>${esc(a.name)}</b>${a.kind ? ` <span class="chip">${esc(a.kind)}</span>` : ''}${a.serial ? ` <span class="mono muted">${esc(a.serial)}</span>` : ''}<button class="icon ghost" data-delacc="${i}" aria-label="Remove ${esc(a.name)}" title="Remove">×</button></div></div>`).join('');
  return `<div class="entries-box">${list || '<p class="note">No attachments yet.</p>'}
    <div class="addrel entry-add"><input id="accName" maxlength="120" placeholder="Name, e.g. Headset" aria-label="Name of the attachment"><input id="accKind" maxlength="60" placeholder="Kind, e.g. Dock" aria-label="Kind of the attachment"><input id="accSerial" maxlength="60" class="mono" placeholder="Serial (optional)" aria-label="Serial number of the attachment"><button id="accAdd">Add</button></div></div>`;
}
/* Notes and attachments: each entry has a title, a text and an optional link (a document on a share, a web page). */
export function entriesHtml(o){
  const list = (o.entries || []).map((e, i) => `<div class="entry"><div class="entry-head"><b>${esc(e.title)}</b>${e.link ? ` <a class="link" href="${esc(e.link)}" target="_blank" rel="noopener">Open attachment</a>` : ''}<button class="icon ghost" data-delentry="${i}" aria-label="Remove ${esc(e.title)}" title="Remove">×</button></div>${e.text ? `<div class="entry-text">${esc(e.text)}</div>` : ''}</div>`).join('');
  return `<div class="entries-box">${list || '<p class="note">No notes yet.</p>'}
    <div class="addrel entry-add"><input id="enTitle" maxlength="120" placeholder="Title, e.g. Warranty" aria-label="Title of the note"><input id="enText" maxlength="2000" placeholder="Text (optional)" aria-label="Text of the note"><input id="enLink" maxlength="500" placeholder="Link, https://…" aria-label="Attachment link"><button id="enAdd">Add</button></div></div>`;
}
export function fieldCtl(o, [k, label, kind], idp = 'f_'){
  const id = idp + o.id + '_' + k;
  let ctl;
  /* No location is a choice of its own, and a location no longer in the list is kept: saving any other field must not move the device. */
  if (kind === 'loc') ctl = `<select id="${id}" data-k="${k}"><option value="" ${o.loc ? '' : 'selected'}>No location</option>${(o.loc && !LOCS.includes(o.loc) ? [o.loc, ...LOCS] : LOCS).map(l => `<option ${l===o.loc?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if (kind === 'kind') ctl = `<select id="${id}" data-k="${k}"><option value="physical" ${o.kind!=='vm'?'selected':''}>Physical</option><option value="vm" ${o.kind==='vm'?'selected':''}>Virtual machine</option></select>`;
  else if (kind === 'user') ctl = `<select id="${id}" data-k="user"><option value="">Unassigned</option><option value="__hotdesk" ${o.hotdesk?'selected':''}>Hot desk (shared)</option>${USERS.map(u => `<option value="${esc(u.id)}" ${!o.hotdesk && u.id===o.uid?'selected':''}>${esc(u.name)}</option>`).join('')}${canEdit() ? '<option value="__new">New person…</option>' : ''}</select>`;
  else if (kind === 'type') ctl = `<select id="${id}" data-k="type">${Object.entries(TYPES).map(([t, v]) => `<option value="${t}" ${t === o.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  else if (kind === 'subnet'){
    /* A subnet is picked from those whose device types include this device. The address is then taken from its ranges. */
    const cur = o[k] || '';
    const opts = SUBNETS.filter(n => (n.types || []).includes(o.type) || n.cidr === cur);
    /* Without a subnet picked, the one the address is in applies by itself, shown as the first choice. */
    const auto = cur ? null : subnetFor(o);
    const sn = SUBNETS.find(n => n.cidr === cur) || auto;
    /* The VLAN of the subnet is shown beside it, with its gateway and DNS servers as a tooltip. */
    const vlanChip = sn && sn.vid != null ? `<span class="chip" title="Gateway ${esc(sn.gateway || '—')} · DNS ${esc((sn.dns || []).join(', ') || '—')}">VLAN ${sn.vid}</span>` : '';
    ctl = `<select id="${id}" data-k="${k}"><option value="">${auto ? `Auto: ${esc(subnetLabel(auto))} (from the address)` : 'None'}</option>${opts.map(n => `<option value="${esc(n.cidr)}" ${n.cidr === cur ? 'selected' : ''}>${esc(subnetLabel(n))}</option>`).join('')}</select>${vlanChip}`;
  }
  else if (kind === 'domain'){
    /* A domain is picked from the list in Settings. One that is on the object but not in the list still shows, so nothing is lost. */
    const cur = o[k] || '';
    const opts = [...new Set([...DOMAINS.map(d => d.name), cur].filter(Boolean))];
    ctl = `<select id="${id}" data-k="${k}"><option value="">None</option>${opts.map(d => `<option ${d === cur ? 'selected' : ''} title="${esc((DOMAINS.find(x => x.name === d) || {}).desc || '')}">${esc(d)}</option>`).join('')}</select>`;
  }
  else if (kind === 'dhcp') ctl = `<select id="${id}" data-k="${k}"><option value="" ${o.dhcp ? '' : 'selected'}>Not known</option><option value="dhcp" ${o.dhcp === 'dhcp' ? 'selected' : ''}>DHCP</option><option value="static" ${o.dhcp === 'static' ? 'selected' : ''}>Static</option></select>`;
  else if (kind === 'money') ctl = `<input id="${id}" data-k="${k}" inputmode="decimal" value="${typeof o[k] === 'number' ? o[k] : ''}" placeholder="0.00">`;
  else if (kind === 'date') ctl = dateFieldHtml(`id="${id}" data-k="${k}"`, /^\d{4}-\d{2}-\d{2}$/.test(o[k] || '') ? o[k] : '');
  else if (kind === 'status') ctl = `<select id="${id}" data-k="${k}">${Object.entries(STATUS).map(([s,v]) => `<option value="${s}" ${s===o.status?'selected':''}>${v.label}</option>`).join('')}</select>`;
  else if (k === 'av') ctl = avCtl(o, id, true);
  else {
    const val = k.startsWith('custom.') ? (o.custom || {})[k.slice(7)] : o[k];
    /* A device without its own gateway or DNS servers uses those of its subnet: shown in grey, not stored on the device. */
    const from = (k === 'gateway' || k === 'dns') && !val ? subnetFor(o) : null;
    const inherited = from ? (k === 'gateway' ? from.gateway : (from.dns || []).join(', ')) : '';
    ctl = `<input id="${id}" data-k="${k}" ${kind==='number' ? 'type="number"' : ''} class="${kind==='mono'?'mono':''}${inherited ? ' inherit' : ''}" value="${esc(val ?? '')}"${inherited ? ` placeholder="${esc(inherited)} · from ${esc(from.name)}" title="From the subnet ${esc(from.name)}. Type a value to set one for this device."` : ''}>`;
    /* A model can be typed or picked from the models already on the devices, in the app's own list (a browser's suggestion
       list cannot be styled like the other dropdowns). A new one typed here is offered to the others once saved. */
    if (k === 'model') ctl = comboHtml(ctl.replace('<input ', `<input placeholder="Type or pick a model" aria-describedby="${id}_note" `), id);
    /* The address can be typed or picked from the free ones of the device's subnet. */
    if (k === 'ip') ctl = comboHtml(ctl.replace('<input ', `<input data-combo="ip" placeholder="Type or pick a free address" aria-describedby="${id}_note" `), id);
  }
  return ctl;
}
/* Antivirus: one entry per product, as chips. A product can be added from the list of those seen on the devices and
   common ones, or typed; each chip can be removed. Kept on the device as one text, entries separated by "; ". */
export const avEntries = o => String(o.av || '').split(';').map(x => x.trim()).filter(Boolean);
export function avCtl(o, id, edit){
  const items = avEntries(o);
  /* The scan state Lansweeper adds ("scanning on, up to date") is only shown while the sync keeps it current. */
  const live = lsLive() && feedLinked(o);
  /* Laid out like Attachments: one entry per product, its scan state as chips, a field to add another underneath. */
  const STATE = { 'scanning on': ['ok', 'Scanning on'], 'scanning off': ['bad', 'Scanning off'], 'up to date': ['ok', 'Up to date'], 'out of date': ['warn', 'Out of date'] };
  const entry = (x, i) => {
    const [name, ...rest] = x.split(',').map(t => t.trim());
    const chips = live ? rest.map(t => { const s = STATE[t.toLowerCase()]; return s ? `<span class="chip ${s[0]}">${s[1]}</span>` : `<span class="chip">${esc(t)}</span>`; }).join('') : '';
    /* One line: the product, its scan state as chips of one width (chip-row), then remove. */
    return `<div class="entry avitem"${!live && rest.length ? ` title="${esc(x)}"` : ''}><div class="entry-head"><b>${esc(name)}</b>${chips ? `<span class="chip-row av-state">${chips}</span>` : ''}${edit ? `<button type="button" class="icon ghost" data-avx="${i}" aria-label="Remove ${esc(name)}" title="Remove">×</button>` : ''}</div></div>`;
  };
  return `<div class="entries-box avpick">${items.map(entry).join('') || `<p class="note">${edit ? 'No antivirus product yet.' : 'None'}</p>`}
    ${edit ? `<input type="hidden" id="${id}" data-k="av" value="${esc(o.av || '')}"><div class="addrel entry-add av-add">${comboHtml(`<input id="${id}_add" data-combo="av" placeholder="${items.length ? 'Add another product' : 'Pick or type a product'}" aria-label="Add an antivirus product">`, id + '_add')}</div>` : ''}</div>`;
}
const AV_COMMON = ['Microsoft Defender Antivirus', 'Microsoft Defender for Endpoint', 'Cortex XDR', 'CrowdStrike Falcon', 'SentinelOne', 'Sophos Intercept X',
  'ESET Endpoint Security', 'Trend Micro Apex One', 'Bitdefender GravityZone', 'Kaspersky Endpoint Security', 'Symantec Endpoint Protection', 'Trellix Endpoint Security', 'WithSecure Elements'];
/* Product names seen on the devices (without the scan state Lansweeper adds) and the common ones, sorted. */
const avNames = () => [...new Set([...objs.flatMap(x => avEntries(x).map(e => e.split(',')[0].trim())), ...AV_COMMON].filter(Boolean))].sort((a, b) => a.localeCompare(b));
/* A text field with a list to pick from: the field, an arrow that opens the list, and the list. */
export const comboHtml = (input, id) => `<div class="combo">${input.replace('<input ', `<input role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}_list" autocomplete="off" `)}<button type="button" class="combo-arrow" tabindex="-1" aria-label="Show the list"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><ul class="combo-list" id="${id}_list" role="listbox" hidden></ul></div>`;
/* One set of handlers for every combo on the page. Typing filters the list; arrows move, Enter picks, Escape closes.
   Picking fills the field; it is saved like a typed value, when the field is left. */
export const COMBO_SOURCES = { model: () => modelNames(), av: () => avNames(), ip: (input, all) => ipChoices(input, all),
  port: input => { const t = byId(($('#' + input.dataset.portOf) || {}).value); return t ? freePorts(t) : []; } };
/* The ports of a switch (1/1, 1/2 …) or patch panel (P01 …) that nothing is plugged into and that are not part of a LAG,
   to pick from when something is plugged in. Empty for a device whose ports are not numbered. */
export function freePorts(t){
  const taken = new Set(rels.filter(r => r.to === t.id && r.port != null).map(r => String(r.port)));
  if (t.type === 'patch') return Array.from({length: t.ports || 0}, (_, i) => 'P' + String(i + 1).padStart(2, '0')).filter(p => !taken.has(p));
  if (!hasPorts(t) || !(t.ports > 0)) return [];
  return Array.from({length: (t.ports || 0) + (t.sfp || 0)}, (_, i) => i + 1).filter(n => !taken.has(String(n)) && !lagOfPort(t, n))
    .map(n => ({v: String(n), label: portLabel(t, n) + (n > (t.ports || 0) ? ' (SFP)' : '')}));
}
/* Sources that read what was typed themselves; the others are filtered by it here. */
const SELF_FILTERED = ['ip'];
const comboOf = el => el && el.closest && el.closest('.combo');
/* The device an address field belongs to, and the subnet its addresses come from: the one picked, or the one the address
   is in. */
const ipOwner = input => byId(input.id.replace(/^f_/, '').replace(/_ip$/, ''));
function ipSubnet(o){
  const sel = $('#f_' + o.id + '_subnet');
  return (sel && SUBNETS.find(n => n.cidr === sel.value)) || subnetFor({...o, subnet: ''});
}
/* Who uses an address, besides this device: a device's own address or one of its other adapters. */
const ipUser = (ip, o) => objs.find(x => x !== o && x.status !== 'retired' && (x.ip === ip || (x.nics || []).some(n => n.ip === ip)));
/* What another device with the same address means, so the note says what to do:
   - the same MAC or serial number: most likely one device recorded twice (renamed, or added from two sources);
   - a DHCP address (either device is set to DHCP, or the address is in a DHCP range of its subnet): addresses move
     between devices, and the other one's is from its own last scan, which says whose is older;
   - otherwise two devices really claim one address.
   Returns { level: 'warn' or 'info', html, text, other } or null. */
export function ipClash(o, ip){
  const other = ip ? ipUser(ip, o) : null;
  if (!other) return null;
  const link = `<a class="link" data-open="${esc(other.id)}">${esc(other.name)}</a>`;
  const macOf = x => [x.mac, ...(x.nics || []).map(n => n.mac)].filter(Boolean).map(m => String(m).toLowerCase().replace(/-/g, ':'));
  /* Serial numbers a maker leaves unset are shared by many machines (serials.js). */
  const realSerial = v => !isPlaceholderSerial(v);
  const same = realSerial(o.serial) && realSerial(other.serial) && o.serial.trim().toLowerCase() === other.serial.trim().toLowerCase() ? 'serial number'
    : macOf(o).some(m => macOf(other).includes(m)) ? 'MAC address' : '';
  if (same) return { level: 'warn', other, text: `${other.name} has this address and the same ${same}: probably this device recorded twice`,
    html: `${link} has this address and the same ${same}: probably this device recorded twice (renamed, or from two sources). Retire or delete the older record.` };
  const sub = subnetFor({ ...o, ip, subnet: '' }), n = ipInt(ip);
  const inDhcpRange = !!sub && (sub.ranges || []).some(r => /^dhcp$/i.test(String(r.use || '').trim()) && n !== null && n >= ipInt(r.from) && n <= ipInt(r.to));
  const otherDhcp = other.dhcp === 'dhcp' || (other.nics || []).some(x => x.ip === ip && x.dhcp === 'dhcp');
  /* Where the subnet's DHCP ranges are known, they decide: an address in one moves between devices, one outside them is
     a real clash whichever of the two is set to DHCP, so both devices' pages say the same. Without known ranges, either
     device being on DHCP makes it a note. */
  const rangesKnown = !!sub && (sub.ranges || []).some(r => /^dhcp$/i.test(String(r.use || '').trim()));
  if (inDhcpRange || ((o.dhcp === 'dhcp' || otherDhcp) && !rangesKnown)) {
    /* Each device's own last scan (Lansweeper's scan day, else its last Intune check-in), not this app's sync run,
       which is the same for every device it receives. */
    const seen = x => Date.parse((x.feed && x.feed.scanned) || '') || Date.parse(graphLast(x)) || 0;
    const a = seen(o), b = seen(other);
    const when = !a || !b || a === b ? `${link} has it too` : b < a ? `the record of ${link} is older (last scanned ${esc(dateText(b))}), so the address has most likely moved here` : `${link} was scanned with it more recently (${esc(dateText(b))})`;
    return { level: 'info', other, text: `${ip} is a DHCP address also recorded on ${other.name}`, html: `A DHCP address, also recorded on another device: ${when}. It is put right by the next scan of either device.` };
  }
  return { level: 'warn', other, text: `${ip} is also used by ${other.name}`, html: `In use by ${link}.` };
}
function ipChoices(input, all){
  const o = ipOwner(input); if (!o) return [];
  const sub = ipSubnet(o);
  if (!sub) return [{off: true, label: 'Choose a subnet to see its free addresses'}];
  const used = new Set(objs.filter(x => x !== o && x.status !== 'retired').flatMap(x => [x.ip, ...(x.nics || []).map(n => n.ip)]).filter(Boolean).map(ipInt));
  [sub.gateway, ...(sub.dns || [])].forEach(a => used.add(ipInt(a)));
  const typed = all ? '' : input.value.trim();
  const free = freeAddresses(sub, used, 20, /^[\d.]+$/.test(typed) ? typed : '');
  if (!free.length) return [{off: true, label: (sub.ranges || []).length && sub.ranges.every(rangeKeptOut) ? `The ranges of ${subnetName(sub)} are all DHCP or reserved` : typed && !all ? 'No free address starts like that' : `No free address in the ranges of ${subnetName(sub)}`}];
  /* The device's own address is in the list too, as its current one; the first other one is the first free. */
  const first = free.find(f => f.ip !== o.ip);
  /* A device set to DHCP gets its address from the DHCP server: the list says so above the static addresses. */
  const dhcpSel = $('#f_' + o.id + '_dhcp'), dhcp = (dhcpSel ? dhcpSel.value : o.dhcp) === 'dhcp';
  const hint = dhcp ? [{off: true, label: 'This device gets its address from DHCP. Free static addresses:'}] : [];
  return [...hint, ...free.map(f => ({v: f.ip, label: f.ip, html: `<span class="mono">${esc(f.ip)}</span> <span class="muted">· ${f.ip === o.ip ? 'current' : f === first ? 'first free' : 'free'}${f.range.use ? ' (' + esc(f.range.use) + ')' : ''}</span>`}))];
}
/* Under the address: taken by another device, or the gateway of its subnet. */
function ipNote(input, note){
  const o = ipOwner(input), v = input.value.trim();
  const show = on => { note.hidden = !on; if (note.previousElementSibling) note.previousElementSibling.hidden = !on; };
  const clash = o && v ? ipClash(o, v) : null, sub = o && v ? subnetFor({...o, ip: v, subnet: ''}) : null;
  if (clash){ note.className = 'fieldnote ' + (clash.level === 'warn' ? 'warn' : 'info'); note.innerHTML = clash.html; show(true); return; }
  const t = sub && sub.gateway === v ? `This address is the gateway of ${subnetName(sub)}.` : '';
  note.className = 'fieldnote warn'; note.textContent = t; show(!!t);
}
/* A subnet by its name, or by its network when it has none of its own. */
export const subnetName = n => n.name && n.name !== n.cidr ? n.name : n.cidr;
const subnetLabel = n => n.name && n.name !== n.cidr ? `${n.name} · ${n.cidr}` : n.cidr;
function comboOpen(c, all){
  const input = c.querySelector('input'), list = c.querySelector('.combo-list');
  if (input.disabled) return;
  const q = all ? '' : input.value.trim().toLowerCase(), name = input.dataset.combo || input.dataset.k;
  const raw = (COMBO_SOURCES[name] || (() => []))(input, all).map(m => typeof m === 'string' ? {v: m, label: m} : m);
  const items = (SELF_FILTERED.includes(name) ? raw : raw.filter(m => !q || m.v.toLowerCase().includes(q))).slice(0, 100);
  if (!items.length){ comboClose(c); return; }
  /* An entry with off is a remark (no subnet, nothing free), shown but not picked. */
  list.innerHTML = items.map((m, i) => `<li role="option" id="${list.id}_${i}" ${m.off ? 'class="off" aria-disabled="true"' : `data-v="${esc(m.v)}"`} aria-selected="${!m.off && m.v === input.value ? 'true' : 'false'}">${m.html || esc(m.label)}</li>`).join('');
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
  /* Near the bottom of a dialog or the window the list opens upwards, so it is not cut off by the edge. */
  const box = input.closest('.mb, .view') || document.documentElement, r = input.getBoundingClientRect(), b = box.getBoundingClientRect();
  const below = Math.min(b.bottom, window.innerHeight) - r.bottom, above = r.top - Math.max(b.top, 0);
  const up = below < Math.min(list.scrollHeight + 8, 268) && above > below;
  c.classList.toggle('up', up);
  /* No taller than the room on that side, so it is never cut off; it scrolls instead. */
  list.style.maxHeight = Math.max(96, Math.min(260, (up ? above : below) - 8)) + 'px';
}
function comboClose(c){
  const input = c.querySelector('input'), list = c.querySelector('.combo-list');
  list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}
function comboPick(c, li){ if (li.classList.contains('off')) return; const input = c.querySelector('input'); input.value = li.dataset.v; comboClose(c); comboNote(input); input.focus(); input.dispatchEvent(new Event('combopick', {bubbles: true})); }
/* Under a model typed in: a model not in the list yet is new and is added when saved; one very like a model in the list
   is likely a typo, and the one in the list can be taken with one click. */
const squash = t => t.toLowerCase().replace(/[\s\-_.,/]+/g, '');
function editDistance(a, b){
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++){
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export function closeModel(v, names){
  const q = squash(v); if (q.length < 4) return null;
  const same = names.find(m => squash(m) === q); if (same) return same;
  let best = null, bd = 3;
  for (const m of names){ const d = editDistance(q, squash(m)); if (d < bd){ bd = d; best = m; } }
  return bd <= (q.length >= 8 ? 2 : 1) ? best : null;
}
export function comboNote(input){
  const note = document.getElementById(input.id + '_note'); if (!note) return;
  if (input.dataset.combo === 'ip') return ipNote(input, note);
  const v = input.value.trim(), names = (COMBO_SOURCES[input.dataset.k] || (() => []))();
  const show = on => { note.hidden = !on; if (note.previousElementSibling) note.previousElementSibling.hidden = !on; };   /* the note and its empty first column */
  if (!v || names.includes(v)){ show(false); note.innerHTML = ''; return; }
  const near = closeModel(v, names);
  note.className = 'fieldnote ' + (near ? 'warn' : 'muted');
  note.innerHTML = near ? `Did you mean ${esc(near)}? <button type="button" class="link combo-use" data-v="${esc(near)}">Use it</button>` : 'New model – added to the list when saved.';
  show(true);
}
document.addEventListener('input', e => { const c = comboOf(e.target); if (c && e.target.matches('input')){ comboOpen(c, false); comboNote(e.target); } });
/* "Use it": the model from the list replaces the one typed, and is saved like a pick. */
document.addEventListener('click', e => {
  const b = e.target.closest('.combo-use'); if (!b) return;
  const note = b.closest('.fieldnote'), input = document.getElementById(note.id.replace(/_note$/, ''));
  if (!input || input.disabled) return;
  input.value = b.dataset.v; comboNote(input); input.dispatchEvent(new Event('change', {bubbles: true})); input.focus();
});
document.addEventListener('mousedown', e => {
  const c = comboOf(e.target);
  document.querySelectorAll('.combo .combo-list:not([hidden])').forEach(l => { if (l.closest('.combo') !== c) comboClose(l.closest('.combo')); });
  if (!c) return;
  const li = e.target.closest('.combo-list li');
  if (li){ e.preventDefault(); comboPick(c, li); return; }
  if (e.target.closest('.combo-arrow')){ e.preventDefault(); const list = c.querySelector('.combo-list'); if (list.hidden){ comboOpen(c, true); c.querySelector('input').focus(); } else comboClose(c); }
});
document.addEventListener('keydown', e => {
  const c = comboOf(e.target); if (!c || !e.target.matches('input')) return;
  const list = c.querySelector('.combo-list'), items = [...list.querySelectorAll('li')];
  const at = items.findIndex(li => li.classList.contains('active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    if (list.hidden){ comboOpen(c, true); return; }
    const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    items.forEach(li => li.classList.toggle('active', li === next));
    if (next){ next.scrollIntoView({block: 'nearest'}); e.target.setAttribute('aria-activedescendant', next.id); }
  } else if (e.key === 'Enter' && !list.hidden && at >= 0){ e.preventDefault(); comboPick(c, items[at]); }
  else if (e.key === 'Escape' && !list.hidden){ e.preventDefault(); e.stopPropagation(); comboClose(c); }
});
document.addEventListener('focusout', e => { const c = comboOf(e.target); if (c && !c.contains(e.relatedTarget)) setTimeout(() => { if (!c.contains(document.activeElement)) comboClose(c); }, 0); });
export const fieldKind = k => { const f = Object.values(FIELDS).flat().find(x => x[0] === k); return f ? f[2] : undefined; };
/* A field's ⋯ menu closes on a click elsewhere or Escape. */
/* Enter in a field of a dialog does what its main button does (Create, Save, Restore …), as in any form. Not in a row
   that adds something of its own (it has its own button), not in a text area or a list, and not in Settings, whose
   fields save as they are left. A field that handles Enter itself says so (preventDefault) and is left alone. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
  const el = e.target, m = el.closest && el.closest('#mdl:not(.minimized)');
  if (!m || m.querySelector('#setPane') || !el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button])')) return;
  if (el.form || el.closest('.addrel, .lpanel-add, .tf-add, .mf')) return;   /* a form (sign-in) submits by itself */
  const ok = m.querySelector('.mf button.primary:not(:disabled), .mf button[id$="Ok"]:not(:disabled)');
  if (ok){ e.preventDefault(); ok.click(); }
});
/* An open menu (a field's, or More in a toolbar) closes on a click beside it. */
document.addEventListener('click', e => document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const d = document.querySelector('details.fmenu[open]'); if (d){ d.open = false; d.querySelector('summary').focus(); } });
/* Fields every object keeps on its page: they cannot be hidden or cleared. */
export const FIXED_FIELDS = ['name', 'type', 'status', 'loc'];
/* Counts and sizes: emptying them is setting a number, so they are not offered to clear. */
const NO_CLEAR = ['ports', 'sfp', 'units'];
/* The ⋯ menu of a field on the object page: hide it on this device or on every device of the type, empty it, or,
   for a field of the type's own, delete it. A hidden field shown again through "Show hidden fields" offers to show it. */
export function fieldMenu(o, f, hiddenBy = ''){
  const k = f[0], t = TYPES[o.type] ? TYPES[o.type].label : o.type;
  if (FIXED_FIELDS.includes(k)) return '<span class="fm-slot" aria-hidden="true"></span>';
  const own = k.startsWith('custom.'), val = own ? (o.custom || {})[k.slice(7)] : o[k];
  const empty = val == null || val === '' || (k === 'user' && !o.uid && !o.hotdesk);
  const b = (act, text, extra = '') => `<button type="button" data-fm="${act}" data-fk="${esc(k)}" ${extra}>${text}</button>`;
  const items = hiddenBy === 'device' ? [b('show', 'Show on this device')]
    : hiddenBy === 'type' ? [b('showtype', `Show on every ${esc(t)}`)]
    : [b('hide', 'Hide on this device'), b('hidetype', `Hide on every ${esc(t)}`),
       NO_CLEAR.includes(k) ? '' : b('clear', 'Clear value…', empty ? 'disabled title="The field is empty"' : ''),
       own ? b('delete', `Delete field from ${esc(t)}…`) : ''];
  return `<details class="menu fmenu"><summary aria-label="Options for ${esc(f[1])}" title="Field options">⋯</summary><div class="menubox">${items.join('')}</div></details>`;
}
/* When a device was last saved here, for the toolbar: the time today, else the day. */
export const savedAt = iso => { const d = new Date(iso), t = new Date(); return d.toDateString() === t.toDateString() ? d.toTimeString().slice(0, 5) : dateText(d); };
/* One row of Properties: the field, its source mark (where the value comes from, and whether it is fixed to one source;
   a click compares the sources and picks one) and its ⋯ menu. A value typed here is kept as typed. */
export function propRow(o, f, menu = ''){
  const k = f[0];
  const ctl = fieldCtl(o, f);
  /* Disks from Lansweeper show as bars under the field. */
  const bars = k === 'disk' ? diskBars(o.disk, lsLive() && feedLinked(o)) : '';
  /* An amount: the currency is in the label, so the field is as wide as the others. */
  const label = f[2] === 'money' ? `${f[1]} (${COSTS.currency || 'CHF'})` : f[1];
  const comboNoteSlot = k === 'model' || k === 'ip' ? `<span hidden></span><p class="fieldnote" id="f_${o.id}_${k}_note" aria-live="polite" hidden></p>` : '';
  /* The bars sit under the field and end where it ends: the source mark and the menu keep their columns free. */
  const barsBelow = bars ? `<span></span><div class="ctlrow below">${bars}<span class="fsrc-slot" aria-hidden="true"></span>${menu ? '<span class="fm-slot" aria-hidden="true"></span>' : ''}</div>` : '';
  const nics = k === 'mac' ? nicsHtml(o) + mergedHtml(o) : '';
  return `<label for="f_${o.id}_${k}">${esc(label)}</label><div class="ctlrow">${ctl}${sourceMark(o, k)}${menu}</div>${comboNoteSlot}${barsBelow}${fieldNote(o, k)}${nics}`;
}
/* The records merged into this device (a dock's DNS-named one, a second record of it): kept as ignored, listed here so
   the merge is seen, with Open and Unmerge (15-review.js). */
export function mergedHtml(o){
  const list = REVIEW.filter(x => x.review && x.review.merged === o.id);
  if (!list.length) return '';
  return `<label>Merged records</label><ul class="nics merged" aria-label="Records merged into this device">${list.map(x => `<li>
    <span class="nic-name">${esc(x.name)}</span>
    <span class="nic-addr mono">${esc(x.ip || '')}</span>
    <span class="nic-meta muted">${[x.mac ? `<span class="mono">${esc(x.mac)}</span>` : '', `merged ${esc(dateText(x.review.ignored) || x.review.ignored || '')}`].filter(Boolean).join(' · ')}
      <button type="button" class="link" data-open="${esc(x.id)}">Open</button>${canEdit() ? `<button type="button" class="link" data-unmerge="${esc(x.id)}" title="Take it out of this device again: it waits in To review">Unmerge</button>` : ''}</span></li>`).join('')}</ul>`;
}
/* The device's other network adapters from Lansweeper (Wi-Fi next to the cable, a second network), under the MAC address. */
export function nicsHtml(o){
  const list = Array.isArray(o.nics) ? o.nics : [];
  if (!list.length) return '';
  return `<label>Other adapters</label><ul class="nics" aria-label="Other network adapters">${list.map(n => `<li>
    <span class="nic-name">${esc(n.name || 'Network adapter')}</span>
    <span class="nic-addr mono">${esc(n.ip)}${n.mask ? '<span class="muted"> / ' + esc(n.mask) + '</span>' : ''}</span>
    <span class="nic-meta muted">${[n.mac ? `<span class="mono">${esc(n.mac)}</span>` : '', n.dhcp === 'dhcp' ? 'DHCP' : n.dhcp === 'static' ? 'Static' : '', n.gateway ? 'gateway ' + esc(n.gateway) : ''].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>`;
}
/* Disks as Lansweeper sends them ("C: 117/237 GB; D: 812/931 GB", free/size) as one bar per drive: how full it is, and
   the space left. Returns '' when the text is not in that form. */
export function diskBars(text, live = true){
  const num = v => +String(v).replace(/[^\d]/g, '');
  /* Each drive: "C: 53/237 GB" (free/size), "D: optical" (a CD/DVD drive), or a bare "D:" when Lansweeper had no size. */
  const parts = String(text || '').split(';').map(x => {
    const m = /^\s*([A-Za-z]):?\s*([\d'’.,\s]+)\/([\d'’.,\s]+)\s*GB\s*$/.exec(x);
    if (m) return {l: m[1].toUpperCase(), free: num(m[2]), size: num(m[3])};
    const e = /^\s*([A-Za-z]):?\s*(optical)?\s*$/i.exec(x);
    return e ? {l: e[1].toUpperCase(), optical: !!e[2], none: true} : null;
  }).filter(Boolean).sort((a, b) => a.l.localeCompare(b.l));
  if (!parts.length) return '';
  const noSize = p => p.optical ? 'Optical drive' : 'Optical drive or no media';
  /* Without a running sync the free space is out of date: only each drive's size is shown. */
  if (!live) return `<div class="disks sizes">${parts.map(p => `<span class="disk-size"><b>${p.l}:</b> ${p.none ? noSize(p) : p.size.toLocaleString() + ' GB'}</span>`).join('')}</div>`;
  return `<div class="disks">${parts.map(p => {
    if (p.none) return `<div class="disk none"><b>${p.l}:</b><span class="disk-t">${noSize(p)}</span></div>`;
    const used = p.size ? Math.min(100, Math.max(0, Math.round((p.size - p.free) / p.size * 100))) : 0;
    const cls = used >= 90 ? ' bad' : used >= 80 ? ' warn' : '';
    return `<div class="disk${cls}" title="${p.l}: ${used}% used, ${p.free} GB free of ${p.size} GB"><b>${p.l}:</b><span class="disk-bar" aria-hidden="true"><span style="width:${used}%"></span></span><span class="disk-t">${p.free.toLocaleString()} GB free of ${p.size.toLocaleString()} GB</span></div>`;
  }).join('')}</div>`;
}
/* A remark under a field: a gateway other than its subnet's, a warranty that has ended or ends soon. Where the value
   came from is the mark beside the field (sourceMark). */
export function fieldNote(o, k){
  let t = '', cls = 'warn';
  if (k === 'gateway' && o.gateway){
    const sn = subnetFor(o);
    if (sn && sn.gateway && sn.gateway !== o.gateway) t = `Not the gateway of ${sn.name || sn.cidr}, which is ${sn.gateway}.`;
  }
  if (k === 'warranty'){ const w = warrantyState(o); if (w === 'ended') { t = 'The warranty has ended.'; cls = 'bad'; } else if (w === 'soon') t = `The warranty ends within ${WARRANTY_SOON_DAYS} days.`; }
  return t ? `<span></span><p class="fieldnote ${cls}">${esc(t)}</p>` : '';
}
/* The subnet a device is in: the one picked on it, or else the one its address falls in. */
export function subnetFor(o){
  const picked = SUBNETS.find(n => n.cidr === o.subnet);
  if (picked) return picked;
  const ip = ipInt(o.ip);
  return ip === null ? null : SUBNETS.find(n => { const sp = subnetSpan(n); return sp && ip >= sp.first && ip <= sp.last; }) || null;
}
/* Fields the feed sets for this object that the type does not show (e.g. CPU on a PC), so nothing is hidden. */
export function extraFields(o, fields){
  if (!o.feed || !LS_ON()) return [];
  return Object.keys(FIELD_LABEL).filter(k => o[k] !== undefined && !fields.some(f => f[0] === k)).map(k => [k, FIELD_LABEL[k], fieldKind(k)]);
}
