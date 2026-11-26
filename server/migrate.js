import { LOGIN_RE, typeSetByHand } from './feed.js';
import { isServerModel } from '../public/js/type-rules.js';
import { stamp } from '../public/js/dates.js';
import { markStockAuto } from './stock-auto.js';
import { svgProblem, svgWithoutComments } from './state.js';
import { liftOvr } from './fill.js';
import { normalizeVirtual } from './state.js';
/* Brings older data up to the current types. Phones and tablets are now three types: Android device, iOS device and
   Other mobile device. Racks used to be a list in the settings; now each rack is an object of type rack, with the same
   id, so the devices mounted in it keep their place. Running it again changes nothing. */
const TYPE_RENAMES = { iphone: 'ios', tablet: 'mobile', smartphone: 'mobile' };

/* Changes s in place and returns true when anything was changed. */
export const NOTES_MAX = 20000;
/* Brings a stored inventory up to date, at start and when a backup is restored: changes s in place and returns true
   when anything changed (the start then takes a backup and saves). Each step is safe to run again. */
/* 0.9.149: the built-in types' colours grouped by kind (computers blue, servers violet, network teal, phones green, the
   rest neutral). A saved type still in its old default colour takes the new one, at each start (also after restoring an
   older backup); any other colour picked stays. */
const OLD_TYPE_COLORS = {'pc': '#1565c0', 'notebook': '#2563eb', 'server': '#6a3fb5', 'vm': '#7c3aed', 'accesspoint': '#0891b2', 'sip': '#15803d', 'pbx': '#0f766e', 'monitor': '#64748b', 'switch': '#c2410c', 'printer': '#a16207', 'patch': '#0f766e', 'router': '#1e3a8a', 'firewall': '#b91c1c', 'modem': '#78716c', 'storage': '#0891b2', 'android': '#4d7c0f', 'ios': '#a21caf', 'mobile': '#0d9488', 'plc': '#be185d', 'camera': '#9333ea', 'bmc': '#4f46e5', 'rack': '#475569', 'other': '#5a6b7d'};
const NEW_TYPE_COLORS = {'pc': '#2563eb', 'notebook': '#1d4ed8', 'server': '#6d28d9', 'vm': '#7c3aed', 'accesspoint': '#0891b2', 'sip': '#16a34a', 'pbx': '#15803d', 'monitor': '#64748b', 'switch': '#0d9488', 'printer': '#78716c', 'patch': '#0f766e', 'router': '#0e7490', 'firewall': '#155e75', 'modem': '#57534e', 'storage': '#5b21b6', 'android': '#65a30d', 'ios': '#059669', 'mobile': '#047857', 'plc': '#86198f', 'camera': '#52525b', 'bmc': '#4f46e5', 'rack': '#475569', 'other': '#5a6b7d'};
export function migrateState(s) {
  let changed = false;
  if (normalizeVirtual(s, { rules: true })) changed = true;
  /* The type vm is no list type any more: its stored look goes; as a type rule's target it reads Server (virtual). What
     was kept for it moves to Server: its own fields (those Server has not), and subnets offered for it. */
  if (s.types && s.types.vm) { delete s.types.vm; changed = true; }
  if (s.typeFields && Array.isArray(s.typeFields.vm)) {
    const srv = Array.isArray(s.typeFields.server) ? s.typeFields.server : [];
    s.typeFields.server = [...srv, ...s.typeFields.vm.filter(f => f && !srv.some(x => x && x.key === f.key))];
    delete s.typeFields.vm; changed = true;
  }
  if (s.fieldLayout && s.fieldLayout.vm) { delete s.fieldLayout.vm; changed = true; }
  for (const n of Array.isArray(s.subnets) ? s.subnets : []) if (n && Array.isArray(n.types) && n.types.includes('vm')) { n.types = [...new Set(n.types.map(t => t === 'vm' ? 'server' : t))]; changed = true; }
  /* Only a colour changed counts as an upgrade (with a backup first). */
  for (const [k, c] of Object.entries(OLD_TYPE_COLORS)) if (c !== NEW_TYPE_COLORS[k] && s.types && s.types[k] && String(s.types[k].color || '').toLowerCase() === c) { s.types[k] = { ...s.types[k], color: NEW_TYPE_COLORS[k] }; changed = true; }
  for (const o of s.objs) if (TYPE_RENAMES[o.type]) { o.type = TYPE_RENAMES[o.type]; changed = true; }
  /* A device's own choices of who fills a field (o.ovr, before the source picker) are picks now (fill.js). */
  for (const o of s.objs) if (liftOvr(o, s.policy || {})) changed = true;
  for (const [name, type] of Object.entries(s.typeMap || {})) if (TYPE_RENAMES[type]) { s.typeMap[name] = TYPE_RENAMES[type]; changed = true; }
  for (const old of Object.keys(TYPE_RENAMES)) if (s.types && s.types[old]) { delete s.types[old]; changed = true; }
  if (s.types && s.types.android && s.types.android.label === 'Android phone') { delete s.types.android; changed = true; }
  /* PC and notebook are types of their own since 0.9.13: the built-in PC keeps its name unless it was renamed. */
  if (s.types && s.types.pc && s.types.pc.label === 'PC / Notebook') { s.types.pc = { ...s.types.pc, label: 'PC' }; changed = true; }
  for (const r of Array.isArray(s.racks) ? s.racks : []) {
    if (s.objs.some(o => o.id === r.id)) continue;
    s.codeN = (s.codeN || 0) + 1;
    s.objs.push({ id: r.id, code: 'INV-' + String(s.codeN).padStart(4, '0'), type: 'rack', name: r.name, status: 'active', loc: r.loc || '', units: r.units || 42 });
    changed = true;
  }
  if (Array.isArray(s.racks) && s.racks.length) { s.racks = []; changed = true; }
  /* Relation kinds: an old patched (a connection to a patch panel, with no panel port of its own) is connected, docked is
     attached, and a downlink is the uplink seen from its other end, so it is stored as that uplink. A downlink whose
     uplink is already there is dropped. Its port is not kept. A patch cord of today (patched, with fromPort) stays. */
  if (Array.isArray(s.rels)) {
    const kinds = { patched: 'connected', docked: 'attached' };
    for (const r of s.rels) if (kinds[r.kind] && !(r.kind === 'patched' && r.fromPort != null)) { r.kind = kinds[r.kind]; changed = true; }
    const uplinks = new Set(s.rels.filter(r => r.kind === 'uplink').map(r => r.from + '|' + r.to));
    s.rels = s.rels.flatMap(r => {
      if (r.kind !== 'downlink') return [r];
      changed = true;
      if (uplinks.has(r.to + '|' + r.from)) return [];
      uplinks.add(r.to + '|' + r.from);
      return [{ ...r, from: r.to, to: r.from, kind: 'uplink', port: null }];
    });
  }
  /* Notes are one text box again (0.9.72): the entries of before (a title, a text and a link each) become its lines. */
  for (const o of s.objs) if (o.entries !== undefined) {
    const lines = (Array.isArray(o.entries) ? o.entries : []).map(e => [e && e.title, e && e.text, e && e.link].map(v => String(v || '').trim()).filter(Boolean).join(' - ')).filter(Boolean);
    const all = [typeof o.notes === 'string' ? o.notes.trim() : '', ...lines].filter(Boolean).join('\n');
    /* The box takes 20000 characters; more than that (old entries could hold far more) is said in the server's log, and
       the start takes a backup before saving a migration (server/index.js), where the whole text stays. */
    if (all.length > NOTES_MAX) console.warn(`upgrade: the notes of ${o.name || o.id} were longer than ${NOTES_MAX} characters and are cut there; the backup taken before the upgrade has all of them.`);
    const text = all.slice(0, NOTES_MAX);
    if (text) o.notes = text; else delete o.notes;
    delete o.entries; changed = true;
  }
  /* A record's history is a list of { t, msg } (checked on every save since 0.9.73): anything else in an older inventory
     is made into that, so the first save after the upgrade is not refused. */
  if (s.history && typeof s.history === 'object') for (const [k, h] of Object.entries(s.history)) {
    const fixed = (Array.isArray(h) ? h : []).filter(e => e && typeof e === 'object' && !Array.isArray(e) && e.msg != null)
      .map(e => ({ ...e, msg: String(e.msg).slice(0, 5000), ...(e.t !== undefined ? { t: String(e.t) } : {}) }));
    if (!Array.isArray(h) || fixed.length !== h.length || fixed.some((e, i) => e.msg !== h[i].msg || e.t !== h[i].t)) { s.history[k] = fixed; changed = true; }
  }
  /* An inventory check needs a name (checked since 0.9.73). */
  for (const t of Array.isArray(s.stocktakes) ? s.stocktakes : []) if (t && typeof t.name === 'string' && !t.name.trim()) { t.name = 'Inventory check'; changed = true; }
  /* The attachments of a PC were one text; each line (or comma) is now an accessory. */
  for (const o of s.objs) if (typeof o.attach === 'string') {
    const names = o.attach.split(/[\n,]/).map(x => x.trim().slice(0, 120)).filter(Boolean);
    if (names.length) o.accessories = [...names.map(name => ({ name })), ...(Array.isArray(o.accessories) ? o.accessories : [])];
    delete o.attach; changed = true;
  }
  /* A connection's VLAN id saved as text ("8") becomes a number. A value that is not a VLAN id (a whole number from 1 to 4094)
     is cleared, so an old bad value cannot stop the server from starting. */
  for (const r of Array.isArray(s.rels) ? s.rels : []) if (r.vlan != null) {
    const id = typeof r.vlan === 'string' && /^\s*\d+\s*$/.test(r.vlan) ? Number(r.vlan) : r.vlan;
    const valid = Number.isInteger(id) && id >= 1 && id <= 4094;
    if (id !== r.vlan || !valid) { r.vlan = valid ? id : null; changed = true; }
  }
  /* A connection can name a VLAN the list does not have yet (entered before the list existed): it is added to the list. */
  for (const r of Array.isArray(s.rels) ? s.rels : []) if (Number.isInteger(r.vlan) && !(s.vlans || []).some(v => v.vid === r.vlan)) {
    s.vlans = [...(s.vlans || []), { vid: r.vlan, name: 'VLAN ' + r.vlan }]; changed = true;
  }
  /* Lansweeper's update text (a KB number) was stored in the field that is now the commissioning date. It is cleared on synced devices. */
  for (const o of s.objs) if (o.feed && typeof o.patch === 'string' && /^KB\d+/i.test(o.patch.trim())) { delete o.patch; changed = true; }
  /* A type's name and short name are plain text of up to 60 characters since 0.9.25: angle brackets are taken out. */
  for (const t of Object.values(s.types || {})) for (const f of ['label', 'short']) {
    if (t && typeof t[f] === 'string' && (/[<>]/.test(t[f]) || t[f].length > 60)) { t[f] = t[f].replace(/[<>]/g, '').slice(0, 60); changed = true; }
  }
  /* Before 0.9.28 the server took a type's icon and colour as the page sent them. One it would now refuse would block
     every save, so it is put back to the usual one: comments are taken out, an icon with anything besides shapes goes
     back to the built-in icon, a viewBox that is not four numbers to the usual box, a colour that is not hex to grey. */
  for (const t of Object.values(s.types || {})) {
    if (!t || typeof t !== 'object') continue;
    if (typeof t.svgInner === 'string' && t.svgInner !== svgWithoutComments(t.svgInner)) { t.svgInner = svgWithoutComments(t.svgInner); changed = true; }
    if (t.svgInner !== undefined && (typeof t.svgInner !== 'string' || t.svgInner.length > 20000 || svgProblem(t.svgInner))) { delete t.svgInner; delete t.svgView; if (t.icon === 'custom') t.icon = 'other'; changed = true; }
    if (t.svgView !== undefined && (typeof t.svgView !== 'string' || !/^-?[\d.]+([\s,]+-?[\d.]+){3}$/.test(t.svgView))) { t.svgView = '0 0 24 24'; changed = true; }
    if (t.color !== undefined && (typeof t.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(t.color))) { t.color = '#5a6b7d'; changed = true; }
  }
  /* Before 0.9.28 a new object without a model was saved with a long dash (U+2014) as its model, which then showed up in the model list. */
  for (const o of s.objs || []) if (o && o.model === '\u2014') { o.model = ''; changed = true; }
  if (Array.isArray(s.models) && s.models.includes('\u2014')) { s.models = s.models.filter(m => m !== '\u2014'); changed = true; }
  /* Before 0.9.28 a person from Lansweeper had its login (Lansweeper's Username) as the name and no login. The login
     goes where it belongs; the name stays until Lansweeper or the directory gives the full one. */
  const logins = new Set((s.users || []).map(u => String(u.login || '').toLowerCase()).filter(Boolean));
  for (const u of s.users || []) {
    const v = String(u.name || '').trim();
    if (u.source !== 'lansweeper' || u.login || !LOGIN_RE.test(v) || logins.has(v.toLowerCase())) continue;
    u.login = v; logins.add(v.toLowerCase()); changed = true;
  }
  /* People deactivated before 0.9.79 have no date they left: they get today, marked as at the latest then (leftBy), so
     the Overview says "left before" and the hand-back is due from now on, not from an unknown day. */
  /* Before 0.9.88 a device added from Active Directory or Graph had no source noted for its name, so it read as typed
     by hand (or unknown): its first history entry says where it came from. */
  for (const o of s.objs || []) {
    if (!o || !o.name || (o.src && o.src.name)) continue;
    const first = ((s.history || {})[o.id] || []).slice(-1)[0], msg = first ? String(first.msg || '') : '';
    const src = /^(Added from Active Directory|Found in Active Directory)/.test(msg) ? 'ad' : /^(Added from Microsoft Graph|Found in Microsoft Entra or Intune)/.test(msg) ? 'graph' : '';
    if (src) { o.src = { ...(o.src || {}), name: src }; changed = true; }
  }
  /* Before 0.9.88 a device could also be Not in use or In repair: both are In stock now (in use, in stock or retired). */
  for (const o of [...(s.objs || []), ...(s.review || [])]) if (o && ['unused', 'repair'].includes(o.status)) { o.status = 'stock'; changed = true; }
  /* Before 0.9.178 a server model (ProLiant, PowerEdge) or a Windows Server could be typed PC: it is a server now, unless
     a person chose its type. */
  const TYPE_LABEL = { pc: 'PC', notebook: 'Notebook', other: 'Other' };
  for (const o of s.objs || []) {
    if (!o || !TYPE_LABEL[o.type] || typeSetByHand(s, o)) continue;
    /* Only devices a source brought: one a person added by hand, copied or imported got the type they chose, also once a
       sync matched it later (marked so since 0.9.188; before, by its history). */
    if (!o.feed && !o.graph && !o.ad) continue;
    if (((s.history || {})[o.id] || []).some(h => /^(Created manually|Duplicated from|Imported from CSV)\b/.test(String(h && h.msg || '')))) continue;
    /* Not over a type mapping of Settings for its Lansweeper type, nor once anything (a person, the rules, a mapping)
       moved it away from Server: so this never fights a choice, at any start. */
    const lsType = String((o.feed && o.feed.assetType) || '').toLowerCase();
    if (lsType && Object.keys(s.typeMap || {}).some(k => k.toLowerCase() === lsType)) continue;
    if (((s.history || {})[o.id] || []).some(h => /^Type changed from Server to /i.test(String(h && h.msg || '')))) continue;
    const why = isServerModel(o.model) ? `its model is a server's (${o.model})` : /windows server/i.test(String(o.os || '')) ? `its system is ${o.os}` : '';
    if (!why) continue;
    ((s.history ??= {})[o.id] ??= []).unshift({ t: stamp(new Date()), msg: `Type changed from ${TYPE_LABEL[o.type]} to Server by the type rules: ${why}` });
    o.type = 'server'; changed = true;
  }
  /* Before 0.9.177: devices in stock by themselves get their mark (stock-auto.js). */
  if (markStockAuto(s)) changed = true;
  for (const u of s.users || []) if (u && u.active === false && !u.leftAt) { u.leftAt = new Date().toISOString(); u.leftBy = true; changed = true; }
  return changed;
}
