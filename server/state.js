import { HttpError } from './errors.js';
import { checkAddress } from './validate.js';
import { overlapProblem, subnetProblem } from '../public/js/net.js';
import { contractProblem, licenceProblem, listProblem } from '../public/js/costs.js';
import { contactsProblem } from '../public/js/contacts.js';
import { linksProblem } from '../public/js/links.js';
import { SVG_ATTRS, SVG_ELEMENTS } from '../public/js/svg-rules.js';
import { graphSettingsProblem } from './graph-keys.js';
import { typeRulesProblem } from '../public/js/type-rules.js';
import { scheduleProblem } from '../public/js/schedule.js';

/* The settings that live beside the lists. Their names are the keys the page uses. */
export const SETTING_KEYS = ['syncSchedule', 'typeRules', 'company', 'graph', 'graphUnmatched', 'graphAmbiguous', 'adUnmatched', 'ldapCa', 'contracts', 'licences', 'currency', 'contacts', 'graphCerts', 'lsIpLocations', 'lsNets', 'autoBackups', 'fieldLayout', 'locs', 'sites', 'vlans', 'domains', 'models', 'subnets', 'typeFields', 'racks', 'policy', 'feedOn', 'feedSync', 'ldap', 'lansweeper', 'mapPos', 'plans', 'typeMap', 'modelMap', 'skipIpOnly', 'backupKeep', 'useLansweeper', 'lsSource', 'fillGraph', 'fillAd', 'intake', 'seq', 'codeN', 'rseq'];
/* Preferences that are saved without a revision: the last save wins. */
export const LAST_WINS = ['mapPos'];
/* The settings a page may change. The counters, the connections' results and the certificates belong to the server. */
/* The syncs that bring in devices of their own: their new devices wait in To review unless Settings says otherwise. */
export const INTAKE_SOURCES = ['lansweeper', 'ad', 'graph'];
export const intakeOf = (s, src) => ((s.intake || {})[src] === 'direct' ? 'direct' : 'review');
export const PAGE_SETTINGS = ['syncSchedule', 'typeRules', 'company', 'contracts', 'licences', 'currency', 'contacts', 'autoBackups', 'fieldLayout', 'locs', 'sites', 'vlans', 'domains', 'models', 'subnets', 'typeFields', 'racks', 'policy', 'feedOn', 'feedSync', 'ldap', 'lansweeper', 'mapPos', 'plans', 'typeMap', 'modelMap', 'skipIpOnly', 'backupKeep', 'useLansweeper', 'lsSource', 'fillGraph', 'fillAd', 'intake'];
const KINDS = ['object', 'rel', 'user', 'type', 'history', 'setting'];
/* The largest inventory stored: generous (5000 devices with their software are about 11 MB), it only guards against a
   runaway import. A page save is limited to 30 MB before it gets here. */
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_CHANGES = 5000;
const DEFAULT_POLICY = { ip: true, ip6: true, mac: true, os: true, model: true, cpu: true, ram: true, fw: true, boot: true, disk: false, patch: true, av: false, domain: true, user: false, loc: false,
  software: true, links: true, dept: true, ipRoom: true,
  mask: true, gateway: true, dns: true, dhcp: true, purchased: true, warranty: true };

/* One key per stored record, used for revisions: "object|o101", "setting|locs". */
export const docKey = (kind, id) => kind + '|' + id;

/* A tag that changes with every write: revisions only ever go up (a delete bumps its record's too). Cheap to read,
   so a page that asks whether anything changed is answered without loading the inventory. */
/* One setting, read from its own row: for a job that needs one value, not the whole inventory. */
export const settingOf = (db, id) => { const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = ?").get(id); return r ? JSON.parse(r.data) : undefined; };
export const stateTag = db => { const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(rev), 0) AS s FROM revs').get(); return `${r.n}.${r.s}`; };
export function revsOf(db) {
  const m = {};
  for (const r of db.prepare('SELECT kind, id, rev FROM revs').all()) m[docKey(r.kind, r.id)] = r.rev;
  return m;
}

/* What a new server starts with; a setting that is not stored has this value. */
export const blankState = () => ({ objs: [], rels: [], users: [], types: {}, history: {}, locs: [], sites: [], vlans: [], domains: [], typeFields: {}, racks: [], policy: null, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 100, codeN: 0, rseq: 0 });
export function loadState(db) {
  const rows = db.prepare('SELECT kind, id, data FROM docs').all();
  const s = blankState();
  for (const r of rows) {
    const v = JSON.parse(r.data);
    if (r.kind === 'object') s.objs.push(v);
    else if (r.kind === 'rel') s.rels.push(v);
    else if (r.kind === 'user') s.users.push(v);
    else if (r.kind === 'type') s.types[r.id] = v;
    else if (r.kind === 'history') s.history[r.id] = v;
    else if (r.kind === 'setting' && SETTING_KEYS.includes(r.id)) s[r.id] = v;
  }
  s.empty = rows.length === 0;
  /* A new server starts with the same feed policy as the page, so nothing is missing on either side. */
  /* A saved policy gets the fields added since it was saved, with their defaults; what it says stays. */
  s.policy = { ...DEFAULT_POLICY, ...(s.policy || {}) };
  s.revs = revsOf(db);
  return s;
}

/* A record's revision goes up by one with every write, so a page that saves from an older one is told of the conflict. */
const bumpRev = (db, kind, id) => db.prepare('INSERT INTO revs (kind, id, rev) VALUES (?, ?, 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1').run(kind, String(id));
/* Tables made only once their feature is first used. */
const hasTable = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
/* The connections to other systems, as the app keeps them: the directory and Microsoft Graph settings, Graph's
   certificates with their sealed private keys, the Lansweeper API settings and push token. What the server's
   environment sets (NI_LDAP_*, NI_GRAPH_*, the service passwords) is outside the app and stays. */
export const CONNECTION_SETTINGS = ['ldap', 'ldapCa', 'graph', 'graphCerts', 'graphUnmatched', 'graphAmbiguous', 'adUnmatched', 'lansweeper'];
export function clearConnections(db) {
  db.exec('BEGIN');
  try {
    for (const id of CONNECTION_SETTINGS) {
      /* The revision goes up, never back to 0, so a page still holding the old one cannot save it back. */
      if (db.prepare("DELETE FROM docs WHERE kind = 'setting' AND id = ?").run(id).changes) bumpRev(db, 'setting', id);
    }
    db.exec('DELETE FROM feed_token');
    if (hasTable(db, 'graph_keys')) db.exec('DELETE FROM graph_keys');
    if (hasTable(db, 'app_secrets')) db.exec('DELETE FROM app_secrets');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
/* Factory reset: everything goes but the account asking and its sessions: the inventory, the users, the connections
   with Graph's keys, the entry sheets, and the backups when asked. The audit log is kept and records it. The next load
   starts as a new server does. */
export function factoryReset(db, keepUserId, { backups = false } = {}) {
  const me = loadState(db).users.find(u => String(u.id) === String(keepUserId));
  db.exec('BEGIN');
  try {
    /* Every record goes; its revision goes up instead of away, so a page still open from before cannot save into the new start. */
    for (const r of db.prepare('SELECT kind, id FROM docs').all()) bumpRev(db, r.kind, r.id);
    db.exec('DELETE FROM docs; DELETE FROM plan_images; DELETE FROM feed_token;');
    if (hasTable(db, 'graph_keys')) db.exec('DELETE FROM graph_keys');
    if (hasTable(db, 'sheets')) db.exec('DELETE FROM sheets');
    if (hasTable(db, 'app_secrets')) db.exec('DELETE FROM app_secrets');
    if (backups) db.exec('DELETE FROM backups');
    db.prepare('DELETE FROM credentials WHERE user_id != ?').run(keepUserId);
    db.prepare('DELETE FROM sessions WHERE user_id != ?').run(keepUserId);
    if (me) db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?)').run('user', String(me.id), JSON.stringify(me));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* What a custom icon may hold: the elements and attributes of public/js/svg-rules.js (the page cleans an upload down to
   the same), and no script, entity or markup declaration. */
const SVG_BAD = /javascript:|<!|<\?|&#|\\/i;
/* Comments (an icon set's licence line) carry nothing drawn: they are taken out, not refused. */
export const svgWithoutComments = text => text.replace(/<!--[\s\S]*?-->/g, '');
/* Every element is a shape and every attribute one the page keeps (names checked with the quoted values taken out, so
   "<svg/onload=…>" is caught as well as " onload="). */
export const svgProblem = text => SVG_BAD.test(text) || [...text.matchAll(/<\s*(\/?)\s*([^\s/>]+)([^>]*)>?/g)].some(([, , name, attrs]) =>
  !SVG_ELEMENTS.includes(name.toLowerCase())
  || [...attrs.replace(/"[^"]*"|'[^']*'/g, '""').matchAll(/([^\s=/"'>]+)\s*(=|(?=[\s/>]|$))/g)].some(m => !SVG_ATTRS.includes(m[1].toLowerCase())));

/* The types the page knows out of the box, and the statuses. Keep in step with TYPES and STATUS in public/js/01-core.js. */
export const KNOWN_TYPES = ['pc', 'notebook', 'camera', 'bmc', 'server', 'vm', 'accesspoint', 'sip', 'mobile', 'monitor', 'switch', 'printer', 'patch', 'router', 'firewall', 'modem', 'storage', 'android', 'ios', 'rack', 'other', 'pbx', 'plc'];
const STATUSES = ['active', 'stock', 'unused', 'repair', 'retired'];
const REL_KINDS = ['attached', 'hosted', 'connected', 'uplink'];
/* A user id that is free: the directory's ids come from the login, and a login can change after the id was made. */
export const freeUserId = (users, id) => { let n = 1, out = id; while (users.some(u => String(u.id) === out)) out = id + '-' + (++n); return out; };

/* The rules a whole inventory must follow before it is stored. Something not in the expected form (a null where a
   record belongs) is refused like any other wrong value, not answered with a server error. */
/* size: false skips measuring the whole inventory (a page save measures what it adds instead, see applyChanges). */
export function checkState(s, { size = true } = {}) {
  try { checkStateRules(s, size); }
  catch (e) { if (e instanceof TypeError) throw new HttpError(400, 'Part of the inventory is not in the expected form.'); throw e; }
}
function checkStateRules(s, size = true) {
  const bad = msg => { throw new HttpError(400, msg); };
  /* Every list holds records, so a null or a list inside one is refused, not thrown on. */
  for (const [name, list] of [['objects', s.objs], ['relations', s.rels], ['users', s.users]]) if (Array.isArray(list) && !list.every(x => x && typeof x === 'object' && !Array.isArray(x))) bad(`The ${name} must be a list of records.`);
  /* The VLAN list: one entry per VLAN ID (1 to 4094), with a name. */
  if (s.vlans !== undefined) {
    if (!Array.isArray(s.vlans)) bad('The VLAN list must be a list.');
    else {
      const seen = new Set();
      for (const v of s.vlans) {
        if (v.desc !== undefined && (typeof v.desc !== 'string' || v.desc.length > 120)) bad(`VLAN ${v.vid}: the description is text of up to 120 characters.`);
        if (!Number.isInteger(v.vid) || v.vid < 1 || v.vid > 4094) bad(`VLAN ID ${v.vid} is not a number from 1 to 4094.`);
        if (seen.has(v.vid)) bad(`VLAN ${v.vid} is listed twice.`);
        seen.add(v.vid);
        if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 60) bad(`VLAN ${v.vid} needs a name of up to 60 characters.`);
      }
    }
  }
  if (s.fieldLayout !== undefined) {
    const ok = s.fieldLayout && typeof s.fieldLayout === 'object' && !Array.isArray(s.fieldLayout) && Object.values(s.fieldLayout).every(l => l && typeof l === 'object'
      && (l.order === undefined || (Array.isArray(l.order) && l.order.every(k => typeof k === 'string' && k.length <= 60)))
      && (l.hidden === undefined || (Array.isArray(l.hidden) && l.hidden.every(k => typeof k === 'string' && k.length <= 60)))
      && (l.labels === undefined || (l.labels && typeof l.labels === 'object' && Object.values(l.labels).every(v => typeof v === 'string' && v.length <= 40)))
      && (l.card === undefined || (Array.isArray(l.card) && l.card.length <= 4 && l.card.every(k => typeof k === 'string' && k.length <= 60))));
    if (!ok) bad('The field layout of a type is a list of names, hidden names, new labels and up to four card lines.');
  }
  if (s.subnets !== undefined) {
    if (!Array.isArray(s.subnets)) bad('The subnets must be a list.');
    for (const n of s.subnets) { const problem = subnetProblem(n); if (problem) bad(problem); }
    const overlap = overlapProblem(s.subnets); if (overlap) bad(overlap);
  }
  /* The company the inventory belongs to: its name and logo on entry sheets. The logo is a PNG or JPEG, at most about 400 KB. */
  if (s.company !== undefined) {
    const c = s.company;
    if (!c || typeof c !== 'object' || Array.isArray(c)) bad('The company is a record.');
    if (c.name !== undefined && (typeof c.name !== 'string' || c.name.length > 80)) bad('The company name is text of up to 80 characters.');
    if (c.logo !== undefined && c.logo !== '' && (typeof c.logo !== 'string' || c.logo.length > 560000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(c.logo))) bad('The company logo is a PNG or JPEG of up to about 400 KB.');
  }
  if (s.graph !== undefined) { const p = graphSettingsProblem(s.graph); if (p) bad(p); }
  for (const k of ['fillGraph', 'fillAd']) if (s[k] !== undefined && typeof s[k] !== 'boolean') bad(`${k} is on or off.`);
  /* Where each source's new devices go: To review (the default) or straight into the inventory. */
  if (s.intake !== undefined && s.intake !== null && (typeof s.intake !== 'object' || Array.isArray(s.intake)
    || Object.entries(s.intake).some(([k, v]) => !INTAKE_SOURCES.includes(k) || !['review', 'direct'].includes(v)))) bad('New devices go to review or straight in, for Lansweeper, AD and Graph.');
  { const p = scheduleProblem(s.syncSchedule); if (p) bad(p); }
  /* The type rules: null for the ones shipped, or the list edited in Settings → Feed. */
  if (s.typeRules !== undefined && s.typeRules !== null) { const p = typeRulesProblem(s.typeRules, new Set([...KNOWN_TYPES, ...Object.keys(s.types || {})])); if (p) bad(p); }
  /* The contacts who look after devices (internal staff and IT partners). */
  if (s.contacts !== undefined) { const p = contactsProblem(s.contacts); if (p) bad(p); }
  /* Contracts and licences, and the currency their costs are in. */
  if (s.contracts !== undefined) { const p = listProblem(s.contracts, contractProblem, 'contracts'); if (p) bad(p); }
  if (s.licences !== undefined) { const p = listProblem(s.licences, licenceProblem, 'licences'); if (p) bad(p); }
  if (s.currency !== undefined && (typeof s.currency !== 'string' || !/^[A-Za-z€$£¥]{1,5}$/.test(s.currency))) bad('The currency is a short code such as CHF or EUR.');
  if (s.models !== undefined && (!Array.isArray(s.models) || !s.models.every(m => typeof m === 'string' && m.trim() && m.length <= 120))) bad('A model name is up to 120 characters.');
  if (s.modelMap !== undefined) {
    const pairs = s.modelMap && typeof s.modelMap === 'object' && !Array.isArray(s.modelMap) ? Object.entries(s.modelMap) : null;
    if (!pairs || !pairs.every(([from, to]) => from.trim() && from.length <= 120 && typeof to === 'string' && to.trim() && to.length <= 120)) bad('A model name is up to 120 characters.');
  }
  if (s.autoBackups !== undefined && typeof s.autoBackups !== 'boolean') bad('Automatic backups is yes or no.');
  if (s.domains !== undefined) {
    const names = Array.isArray(s.domains) ? s.domains.map(d => d && d.name) : null;
    if (!names || !s.domains.every(d => d && typeof d === 'object' && typeof d.name === 'string' && d.name.trim() && d.name.length <= 60 && (d.desc === undefined || (typeof d.desc === 'string' && d.desc.length <= 120))) || new Set(names).size !== names.length)
      bad('Domains must be a list of different names of up to 60 characters, each with an optional description.');
  }
  /* The fields a type has beyond the built-in ones: a key, a label, and text or number. */
  if (s.typeFields !== undefined) {
    if (!s.typeFields || typeof s.typeFields !== 'object' || Array.isArray(s.typeFields)) bad('The fields per type must be an object.');
    else for (const [t, list] of Object.entries(s.typeFields)) {
      if (!Array.isArray(list)) bad(`The fields of ${t} must be a list.`);
      const keys = new Set();
      for (const f of list) {
        if (!f || !/^[a-z][a-z0-9_]{0,30}$/.test(f.key)) bad(`A field of ${t} needs a key of lowercase letters, digits and underscores.`);
        if (keys.has(f.key)) bad(`The field ${f.key} of ${t} is listed twice.`);
        keys.add(f.key);
        if (typeof f.label !== 'string' || !f.label.trim() || f.label.length > 40) bad(`A field of ${t} needs a label of up to 40 characters.`);
        if (!['text', 'number'].includes(f.kind)) bad(`The field ${f.label} of ${t} is text or number.`);
      }
    }
  }
  if (!Array.isArray(s.objs) || !Array.isArray(s.rels) || !Array.isArray(s.users) || !Array.isArray(s.locs)) bad('The inventory must list objects, relations, users and locations.');
  /* Locations and sites are names the page splits and shows: an entry that is not one would leave it blank for everyone. */
  for (const [list, what] of [[s.locs, 'location'], [s.sites, 'site']]) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) bad(`The ${what}s must be a list.`);
    for (const v of list) if (typeof v !== 'string' || !v.trim() || v.length > 200) bad(`Every ${what} is a name of up to 200 characters.`);
  }
  if (s.typeMap !== undefined && s.typeMap !== null && (typeof s.typeMap !== 'object' || Array.isArray(s.typeMap) || Object.values(s.typeMap).some(v => typeof v !== 'string'))) bad('The Lansweeper type mappings are names of types.');
  if (s.racks !== undefined && !Array.isArray(s.racks)) bad('Racks must be a list.');
  if (!s.types || typeof s.types !== 'object' || !s.history || typeof s.history !== 'object') bad('Types and history must be objects.');
  /* A type's name is shown as text everywhere; angle brackets have no place in it. */
  for (const [k, t] of Object.entries(s.types)) for (const f of ['label', 'short']) {
    if (t && t[f] !== undefined && (typeof t[f] !== 'string' || t[f].length > 60 || /[<>]/.test(t[f]))) bad(`The ${f === 'label' ? 'name' : 'short name'} of the type ${k} is text of up to 60 characters, without < or >.`);
  }
  /* A type's colour and icon are drawn into every page: the page cleans an uploaded icon, and the server takes only what
     that cleaning leaves (shapes, no scripts, handlers, styles or links), so a save sent around the page cannot add any. */
  for (const [k, t] of Object.entries(s.types)) {
    if (!t || typeof t !== 'object') bad(`The type ${k} must be a record.`);
    if (typeof t.svgInner === 'string') t.svgInner = svgWithoutComments(t.svgInner);
    if (t.color !== undefined && (typeof t.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(t.color))) bad(`The colour of the type ${k} must be a hex colour such as #3a7bd5.`);
    if (t.svgView !== undefined && (typeof t.svgView !== 'string' || !/^-?[\d.]+([\s,]+-?[\d.]+){3}$/.test(t.svgView))) bad(`The icon of the type ${k} has a viewBox that is not four numbers.`);
    if (t.svgInner !== undefined && (typeof t.svgInner !== 'string' || t.svgInner.length > 20000 || svgProblem(t.svgInner))) bad(`The icon of the type ${k} has something besides shapes. Upload it again.`);
  }
  for (const u of s.users) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string' || !u.id) bad('Every user needs an id.');
    /* A person added as a device's user (from Lansweeper, or typed on a device) has no sign-in, so no role was given: they are a viewer. */
    if (u.role === undefined) u.role = 'viewer';
    /* none: known to the inventory (it names their devices) but no access to it, until an admin gives a role. */
    if (!['admin', 'viewer', 'none'].includes(u.role)) bad('A user\'s role must be admin, viewer or none.');
    if (u.active !== undefined && typeof u.active !== 'boolean') bad('Active must be yes or no.');
    if (u.login !== undefined && (typeof u.login !== 'string' || u.login.length > 200)) bad('A login must be short text.');
  }
  /* A login names one account: sign-in picks the first match, so a second one would lock its owner out. */
  const logins = new Map();
  for (const u of s.users) {
    if (!u.login) continue;
    const key = u.login.toLowerCase();
    if (logins.has(key) && logins.get(key) !== u.id) bad(`The login ${u.login} is already used by another user.`);
    logins.set(key, u.id);
  }
  const ids = s.objs.map(o => o.id);
  if (new Set(ids).size !== ids.length) bad('Two objects have the same id.');
  if (ids.some(id => typeof id !== 'string' || !id)) bad('Every object needs an id.');
  /* The page cannot show an object with an unknown type or status, or a relation to an object that is not there. */
  const types = new Set([...KNOWN_TYPES, ...Object.keys(s.types)]);
  for (const o of s.objs) {
    if (o.status === undefined) o.status = 'active';   /* a hand-written object is in use until it says otherwise */
    if (!types.has(o.type)) bad(`${o.name || o.id} has an unknown type: ${o.type}.`);
    if (!STATUSES.includes(o.status)) bad(`${o.name || o.id} has an unknown status: ${o.status}.`);
    if (typeof o.name !== 'string' || !o.name.trim()) bad('Every object needs a name.');
    /* Its links (web interface, shares): only addresses that cannot run anything in the page (public/js/links.js). */
    if (o.urls !== undefined) { const p = linksProblem(o.urls); if (p) bad(`${o.name}: ${p}`); }
    /* Its responsibles name a contact by id. One deleted since is cleared by the page; a dangling id only shows as none. */
    for (const k of ['respIn', 'respEx']) if (o[k] !== undefined && o[k] !== null && (typeof o[k] !== 'string' || o[k].length > 40)) bad(`${o.name}: the ${k === 'respIn' ? 'internal' : 'external'} responsible is not a contact.`);
    /* Addresses are checked and written in their stored form, however the object arrived. */
    for (const k of ['ip', 'ip6', 'mac']) { if (o[k] === undefined) continue; const r = checkAddress(k, o[k]); if (!r.ok) bad(`${o.name}: ${r.msg}`); o[k] = r.value; }
    if (o.price !== undefined && (typeof o.price !== 'number' || !Number.isFinite(o.price) || o.price < 0 || o.price > 1e9)) bad(`${o.name}: the price is a number of 0 or more.`);
    for (const k of ['name', 'purpose', 'model', 'serial', 'user', 'loc', 'os', 'cpu', 'ram', 'fw', 'domain', 'subnet', 'supplier', 'invoice']) if (o[k] !== undefined && (typeof o[k] !== 'string' || o[k].length > 500)) bad(`${o.name}: ${k} is too long or not text.`);
    if (o.custom !== undefined) {
      if (!o.custom || typeof o.custom !== 'object' || Array.isArray(o.custom)) bad(`${o.name}: its own fields must be an object.`);
      else for (const [k, v] of Object.entries(o.custom)) if (v !== null && !(typeof v === 'string' && v.length <= 500) && !(typeof v === 'number' && Number.isFinite(v))) bad(`${o.name}: the value of ${k} is text of up to 500 characters or a number.`);
    }
    if (o.ports !== undefined && (!Number.isInteger(o.ports) || o.ports < 0 || o.ports > 1000)) bad(`${o.name}: the port count must be a whole number from 0 to 1000.`);
    /* A port group names a range of the ports (copper and SFP together), with an optional kind. Groups do not overlap. */
    if (o.portGroups !== undefined) {
      if (!Array.isArray(o.portGroups)) bad(`${o.name}: port groups must be a list.`);
      else {
        const total = (o.ports || 0) + (o.sfp || 0);
        o.portGroups.forEach((g, i) => {
          if (!g || typeof g.name !== 'string' || !g.name.trim() || g.name.length > 60) bad(`${o.name}: a port group needs a name of up to 60 characters.`);
          if (!Number.isInteger(g.from) || !Number.isInteger(g.to) || g.from < 1 || g.to < g.from || g.to > total) bad(`${o.name}: port group ${g && g.name} is not a range of its ports.`);
          if (g.kind !== undefined && (typeof g.kind !== 'string' || g.kind.length > 20)) bad(`${o.name}: the kind of a port group is text of up to 20 characters.`);
          if (g.lag !== undefined && typeof g.lag !== 'boolean') bad(`${o.name}: a port group is marked as a link aggregate or not.`);
          if (o.portGroups.slice(0, i).some(p => g.from <= p.to && g.to >= p.from)) bad(`${o.name}: port groups ${g.name} and another overlap.`);
          /* A LAG link names the LAG, so two LAGs of one device cannot share a name. */
          if (g.lag && o.portGroups.slice(0, i).some(p => p.lag && String(p.name).toLowerCase() === String(g.name).toLowerCase())) bad(`${o.name}: two LAGs are named ${g.name}.`);
        });
      }
    }
    if (o.graph !== undefined && (!o.graph || typeof o.graph !== 'object' || Array.isArray(o.graph))) bad(`${o.name}: the Microsoft Graph data is an object.`);
    /* Which fields a directory filled in (fill.js), and what AD says of the computer account. */
    if (o.src !== undefined && (!o.src || typeof o.src !== 'object' || Array.isArray(o.src) || Object.values(o.src).some(v => v !== 'graph' && v !== 'ad'))) bad(`${o.name}: the sources of its fields are Intune or AD.`);
    if (o.defender !== undefined && (!o.defender || typeof o.defender !== 'object' || Array.isArray(o.defender) || Object.values(o.defender).some(v => typeof v !== 'string' || v.length > 60))) bad(`${o.name}: what Defender says is an object of short texts.`);
    /* A device found by a sync and waiting in To review: which source found it, when, and when it was ignored. */
    if (o.review !== undefined && (!o.review || typeof o.review !== 'object' || Array.isArray(o.review) || !INTAKE_SOURCES.includes(o.review.src)
      || Object.entries(o.review).some(([k, v]) => !['src', 'at', 'ignored'].includes(k) || typeof v !== 'string' || v.length > 40))) bad(`${o.name}: the review mark names its source and when.`);
    if (o.ad !== undefined && (!o.ad || typeof o.ad !== 'object' || Array.isArray(o.ad) || Object.values(o.ad).some(v => typeof v !== 'string' || v.length > 40))) bad(`${o.name}: the Active Directory data is an object of short texts.`);
    if (o.accessories !== undefined) {
      if (!Array.isArray(o.accessories) || o.accessories.length > 100) bad(`${o.name}: attachments must be a list of up to 100 items.`);
      else for (const a of o.accessories) {
        if (!a || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 120) bad(`${o.name}: an attachment needs a name of up to 120 characters.`);
        if (a.kind !== undefined && (typeof a.kind !== 'string' || a.kind.length > 60)) bad(`${o.name}: the kind of an attachment is text of up to 60 characters.`);
        if (a.serial !== undefined && (typeof a.serial !== 'string' || a.serial.length > 60)) bad(`${o.name}: the serial of an attachment is text of up to 60 characters.`);
      }
    }
    if (o.entries !== undefined) {
      if (!Array.isArray(o.entries) || o.entries.length > 200) bad(`${o.name}: notes must be a list of up to 200 entries.`);
      else for (const e of o.entries) {
        if (!e || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 120) bad(`${o.name}: an entry needs a title of up to 120 characters.`);
        if (e.text !== undefined && (typeof e.text !== 'string' || e.text.length > 2000)) bad(`${o.name}: an entry's text is up to 2000 characters.`);
        if (e.link !== undefined && (typeof e.link !== 'string' || e.link.length > 500 || !/^https?:\/\//i.test(e.link))) bad(`${o.name}: an attachment link must start with http:// or https://.`);
      }
    }
    if (o.pfx !== undefined && (typeof o.pfx !== 'string' || o.pfx.length > 20)) bad(`${o.name}: the port naming is text of up to 20 characters.`);
    if (o.portNotes !== undefined) {
      if (!o.portNotes || typeof o.portNotes !== 'object' || Array.isArray(o.portNotes)) bad(`${o.name}: port descriptions must be an object.`);
      else for (const [k, v] of Object.entries(o.portNotes)) if (!/^\d+$/.test(k) || typeof v !== 'string' || v.length > 120) bad(`${o.name}: a port description is text of up to 120 characters for a port number.`);
    }
    if (o.sfp !== undefined && (!Number.isInteger(o.sfp) || o.sfp < 0 || o.sfp > 1000)) bad(`${o.name}: the SFP port count must be a whole number from 0 to 1000.`);
    if (o.h !== undefined && (!Number.isInteger(o.h) || o.h < 1 || o.h > 200)) bad(`${o.name}: the height in U must be a whole number from 1 to 200.`);
    if (o.u != null && (!Number.isInteger(o.u) || o.u < 1 || o.u > 200)) bad(`${o.name}: the rack position must be a U from 1 to 200.`);
  }
  const codes = s.objs.map(o => o.code).filter(Boolean);
  if (new Set(codes).size !== codes.length) bad('Two objects have the same code.');
  if (new Set(s.users.map(u => String(u.id))).size !== s.users.length) bad('Two users have the same id.');
  if (new Set(s.rels.map(r => String(r.id))).size !== s.rels.length) bad('Two relations have the same id.');
  const idSet = new Set(ids);
  const byId = new Map(s.objs.map(o => [o.id, o]));
  for (const r of s.rels) {
    if (!idSet.has(r.from) || !idSet.has(r.to)) bad('A relation points at an object that is not in the inventory.');
    if (r.id === undefined || r.id === null || r.id === '') bad('Every relation needs an id.');
    if (!REL_KINDS.includes(r.kind)) bad(`A relation has an unknown kind: ${r.kind}.`);
    if (r.vlan != null && !(s.vlans || []).some(v => v.vid === r.vlan)) bad(`A connection uses VLAN ${r.vlan}, which is not in the VLAN list.`);
    /* A LAG link joins a LAG on each device: the LAGs have the same members, and no single port is used. A LAG links one other LAG. */
    if (r.lag != null || r.fromLag != null) {
      const to = byId.get(r.to), fr = byId.get(r.from);
      const lagOf = (d, name) => (d && d.portGroups || []).find(g => g.lag && g.name === name);
      const tl = lagOf(to, r.lag), fl = lagOf(fr, r.fromLag);
      if (!tl || !fl) bad(`A LAG link needs a LAG on both devices.`);
      else if (r.port != null) bad(`A LAG link uses no single port.`);
      else if (tl.to - tl.from !== fl.to - fl.from) bad(`The LAGs of ${fr.name} and ${to.name} have different numbers of ports.`);
    } else if (typeof r.port === 'number') {
      const t = byId.get(r.to);
      if (t && t.type !== 'patch' && t.ports > 0 && (r.port < 1 || r.port > t.ports + (t.sfp || 0))) bad(`Port ${r.port} is not a port of ${t.name}.`);
      const inLag = (t && t.portGroups || []).find(g => g.lag && r.port >= g.from && r.port <= g.to);
      if (inLag) bad(`Port ${r.port} on ${t.name} is part of the LAG ${inLag.name}. Connect the LAG instead.`);
    }
    if (r.from === r.to) bad('An object cannot be related to itself.');
  }
  /* One device per port of a switch or patch panel. */
  const taken = new Set();
  for (const r of s.rels) {
    if (r.port == null) continue;
    const t = byId.get(r.to);
    if (t.type !== 'patch' && !(t.ports > 0)) continue;
    const key = r.to + '|' + String(r.port);
    if (taken.has(key)) bad(`Port ${r.port} on ${t.name} is used twice.`);
    taken.add(key);
  }
  /* A LAG links one other LAG: each LAG on a device is used by at most one link. */
  const lagUsed = new Set();
  for (const r of s.rels) {
    if (r.lag != null) { const k = r.to + '|' + r.lag; if (lagUsed.has(k)) bad(`The LAG ${r.lag} is linked twice.`); lagUsed.add(k); }
    if (r.fromLag != null) { const k = r.from + '|' + r.fromLag; if (lagUsed.has(k)) bad(`The LAG ${r.fromLag} is linked twice.`); lagUsed.add(k); }
  }
  /* A device sits in one rack place: the rack exists, the U positions do not overlap, and a device on top of another is in the same rack. */
  const racks = new Set(s.objs.filter(o => o.type === 'rack').map(o => o.id));
  const used = {};
  for (const o of s.objs) {
    if (o.rack == null) continue;
    if (!racks.has(o.rack)) bad(`${o.name}: its rack does not exist.`);
    if (o.ontop != null) {
      const below = byId.get(o.ontop);
      if (!below || below.rack !== o.rack) bad(`${o.name}: the device it sits on is not in the same rack.`);
      continue;
    }
    if (o.u == null) continue;
    const h = o.h || 1;
    const rk = byId.get(o.rack);
    if (rk && rk.units && o.u + h - 1 > rk.units) bad(`${o.name} is above the top of its rack.`);
    for (let u = o.u; u < o.u + h; u++) {
      const key = o.rack + '|' + u;
      if (used[key]) bad(`${o.name} and ${used[key]} both take U${u} in the same rack.`);
      used[key] = o.name;
    }
  }
  /* Measured as stored: the revisions and the empty flag that loadState adds are not part of it. */
  const { revs: _revs, empty: _empty, ...stored } = s;   // eslint-disable-line no-unused-vars
  if (size && JSON.stringify(stored).length > MAX_BYTES) throw new HttpError(413, 'The inventory is too large.');
}

function rowsOf(s) {
  const rows = [];
  for (const o of s.objs) rows.push(['object', o.id, o]);
  for (const r of s.rels) rows.push(['rel', String(r.id), r]);
  for (const u of s.users) rows.push(['user', String(u.id), u]);
  for (const [k, t] of Object.entries(s.types)) rows.push(['type', k, t]);
  for (const [k, h] of Object.entries(s.history)) rows.push(['history', k, h]);
  for (const k of SETTING_KEYS) if (s[k] !== undefined) rows.push(['setting', k, s[k]]);
  return rows;
}

/* Writes the records that changed, deletes the ones that are gone, and gives each of them a new revision.
   Only changed records are written, so a small edit to a large inventory is a small write. */
/* Writes what changed and gives each written record a new revision. only: the records a page save touched (their keys);
   then only those are compared and written, not every record of the inventory. */
function writeDocs(db, s, only = null) {
  let rows = rowsOf(s), current;
  if (only) {
    rows = rows.filter(([kind, id]) => only.has(docKey(kind, id)));
    const get = db.prepare('SELECT data FROM docs WHERE kind = ? AND id = ?');
    current = new Map();
    for (const key of only) { const i = key.indexOf('|'), r = get.get(key.slice(0, i), key.slice(i + 1)); if (r) current.set(key, r.data); }
  } else current = new Map(db.prepare('SELECT kind, id, data FROM docs').all().map(r => [docKey(r.kind, r.id), r.data]));
  const wanted = new Set();
  const bumped = [];
  const bump = (kind, id) => { db.prepare('INSERT INTO revs (kind, id, rev) VALUES (?, ?, 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1').run(kind, id); bumped.push(docKey(kind, id)); };
  db.exec('BEGIN');
  try {
    const put = db.prepare('INSERT INTO docs (kind, id, data) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data');
    const del = db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?');
    for (const [kind, id, value] of rows) {
      const key = docKey(kind, id);
      wanted.add(key);
      const json = JSON.stringify(value);
      if (current.get(key) !== json) { put.run(kind, id, json); bump(kind, id); }
    }
    for (const key of current.keys()) {
      if (!wanted.has(key)) {
        const i = key.indexOf('|'); const kind = key.slice(0, i), id = key.slice(i + 1); del.run(kind, id); bump(kind, id);
        /* A user deleted takes their password and sign-ins along, so a backup cannot bring the account back with them. */
        if (kind === 'user') { db.prepare('DELETE FROM credentials WHERE user_id = ?').run(id); db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); }
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return bumped;
}

/* The history of an object keeps its newest entries; older ones are dropped, so the inventory and its backups stay a
   sane size. Both saveState and the page's saves (applyChanges) trim it. */
export const HISTORY_KEEP = 500;
/* Replaces the stored inventory with the one sent. Used by the admin's full save and by the server's own jobs
   (feed, directory). Logins and sessions are not touched. */
export function saveState(db, s) {
  checkState(s);
  /* The counters only go up, so a save that leaves one out cannot make a new code or id repeat an old one. */
  for (const k of ['codeN', 'seq', 'rseq']) s[k] = Math.max(Number(s[k]) || 0, Number(settingOf(db, k)) || 0);
  for (const id of Object.keys(s.history || {})) if (Array.isArray(s.history[id]) && s.history[id].length > HISTORY_KEEP) s.history[id] = s.history[id].slice(0, HISTORY_KEEP);
  writeDocs(db, s);
}

/* A line for the log saying what a save from the page changed: the objects added, changed and removed by name, and how
   many relations, users, types and which settings. The history lines that go with an object change are not counted. */
const SETTING_NAMES = { typeRules: 'type rules', contracts: 'contracts', licences: 'licences', contacts: 'contacts', company: 'company', locs: 'locations', sites: 'sites',
  vlans: 'VLANs', domains: 'domains', models: 'models', subnets: 'subnets', typeFields: 'type fields', fieldLayout: 'field layout', racks: 'racks',
  policy: 'feed fields', ldap: 'LDAP', plans: 'floor plans', mapPos: 'map layout', typeMap: 'Lansweeper type names', modelMap: 'model renames' };
export function describeChanges(body, before) {
  const puts = (body && body.puts) || [], dels = (body && body.dels) || [];
  const names = list => list.length <= 5 ? list.join(', ') : `${list.slice(0, 5).join(', ')} and ${list.length - 5} more`;
  const nameOf = (kind, id) => {
    const p = puts.find(c => c.kind === kind && c.id === id);
    if (p && p.value && typeof p.value === 'object') return p.value.name || p.value.login || id;
    const list = kind === 'object' ? before?.objs : before?.users;
    const o = (list || []).find(x => String(x.id) === id);
    return (o && (o.name || o.login)) || id;
  };
  const parts = [];
  const objs = puts.filter(c => c.kind === 'object');
  const added = objs.filter(c => !c.base).map(c => nameOf('object', c.id)), changed = objs.filter(c => c.base).map(c => nameOf('object', c.id));
  const removed = dels.filter(c => c.kind === 'object').map(c => nameOf('object', c.id));
  if (added.length) parts.push('added ' + names(added));
  if (changed.length) parts.push('changed ' + names(changed));
  if (removed.length) parts.push('removed ' + names(removed));
  const rels = [puts.filter(c => c.kind === 'rel' && !c.base).length, puts.filter(c => c.kind === 'rel' && c.base).length, dels.filter(c => c.kind === 'rel').length];
  const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
  if (rels[0]) parts.push(n(rels[0], 'relation') + ' added');
  if (rels[1]) parts.push(n(rels[1], 'relation') + ' changed');
  if (rels[2]) parts.push(n(rels[2], 'relation') + ' removed');
  const users = [...puts, ...dels].filter(c => c.kind === 'user').map(c => nameOf('user', c.id));
  if (users.length) parts.push('users ' + names(users));
  const types = [...puts, ...dels].filter(c => c.kind === 'type').map(c => c.id);
  if (types.length) parts.push('object types ' + names(types));
  const settings = [...new Set([...puts, ...dels].filter(c => c.kind === 'setting').map(c => SETTING_NAMES[c.id] || c.id))];
  if (settings.length) parts.push('settings: ' + settings.join(', '));
  return parts.length ? 'saved: ' + parts.join('; ') : 'saved history notes';
}

/* The page's saves. Each change says which kind of record it is, its new value (or none, for a delete) and the
   revision it was based on. A change based on an old revision is not applied: someone else changed that record
   first. The other changes are applied. New objects get their code here, so codes stay unique. */
export function applyChanges(db, body, guard = () => {}) {
  const bad = msg => { throw new HttpError(400, msg); };
  const puts = body && body.puts, dels = body && body.dels;
  if (!Array.isArray(puts) || !Array.isArray(dels)) bad('Changes must list puts and dels.');
  if (puts.length + dels.length > MAX_CHANGES) bad('Too many changes at once. Save in smaller parts.');
  for (const c of [...puts, ...dels]) {
    if (!c || !KINDS.includes(c.kind) || typeof c.id !== 'string' || !c.id) bad('Every change needs a kind and an id.');
    if (c.kind === 'setting' && !PAGE_SETTINGS.includes(c.id)) bad(`${c.id} is not a setting the page can change.`);
  }
  for (const c of puts) if (c.value === undefined || c.value === null || (c.kind !== 'setting' && typeof c.value !== 'object')) bad('Every saved record needs a value.');

  const revs = revsOf(db);
  const conflicts = [];
  const usable = c => {
    if (c.base === null || c.base === undefined){ if (c.kind === 'setting' && LAST_WINS.includes(c.id)) return true; bad('A change needs the revision it was based on.'); }   /* a preference: the last save wins */
    if (!Number.isInteger(c.base)) bad('A change needs the revision it was based on.');
    const key = docKey(c.kind, c.id);
    if ((revs[key] ?? 0) !== c.base) { conflicts.push(key); return false; }
    return true;
  };
  const okPuts = puts.filter(usable), okDels = dels.filter(usable);

  const s = loadState(db);
  delete s.revs; delete s.empty;
  for (const c of okDels) {
    if (c.kind === 'object') s.objs = s.objs.filter(o => o.id !== c.id);
    else if (c.kind === 'rel') s.rels = s.rels.filter(r => String(r.id) !== c.id);
    else if (c.kind === 'user') s.users = s.users.filter(u => String(u.id) !== c.id);
    else if (c.kind === 'type') delete s.types[c.id];
    else if (c.kind === 'history') delete s.history[c.id];
    else if (c.kind === 'setting') delete s[c.id];
  }
  const codes = {};
  for (const c of okPuts) {
    const v = c.value;
    if (c.kind === 'object') {
      if (v.id !== c.id) bad('A saved object must have the id it is saved under.');
      for (const k of ['ip', 'ip6', 'mac']) { const r = checkAddress(k, v[k]); if (!r.ok) bad(r.msg); if (v[k] !== undefined) v[k] = r.value; }
      if (!v.code) { s.codeN = (s.codeN || 0) + 1; v.code = 'INV-' + String(s.codeN).padStart(4, '0'); codes[c.id] = v.code; }
      const i = s.objs.findIndex(o => o.id === c.id);
      if (i >= 0) s.objs[i] = v; else s.objs.push(v);
    } else if (c.kind === 'rel') {
      const rid = String(c.id); const v2 = { ...v, id: rid };
      const i = s.rels.findIndex(r => String(r.id) === rid);
      if (i >= 0) s.rels[i] = v2; else s.rels.push(v2);
    } else if (c.kind === 'user') {
      const v2 = { ...v, id: c.id };
      const i = s.users.findIndex(u => String(u.id) === c.id);
      if (i >= 0) s.users[i] = v2; else s.users.push(v2);
    } else if (c.kind === 'type') s.types[c.id] = v;
    else if (c.kind === 'history') s.history[c.id] = Array.isArray(v) ? v.slice(0, HISTORY_KEEP) : v;   /* kept short, as in saveState */
    else if (c.kind === 'setting') s[c.id] = v;
  }
  /* A change refused as stale can be one the rest of the save needs (a connection to an object deleted in the same save).
     Then nothing is saved and every change is answered as a conflict, so the page reloads and offers its edits again,
     instead of a refusal it would send again and again. Without a stale change the save itself is wrong: that is
     refused with the reason, since sending it again would not help. */
  /* The size is what is stored plus what this save sends, read from the database: turning the whole inventory into
     text only to measure it took longer than the rest of the save. */
  /* Each record a save replaces counts once, at its new size; refused (stale) changes do not count. */
  const storedBytes = db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM docs').get().n;
  const sizeOf = db.prepare('SELECT LENGTH(data) AS n FROM docs WHERE kind = ? AND id = ?');
  const delta = okPuts.reduce((t, c) => t + JSON.stringify(c.value).length - ((sizeOf.get(c.kind, c.id) || {}).n || 0), 0);
  if (storedBytes + delta > MAX_BYTES) throw new HttpError(413, 'The inventory is too large.');
  try { checkState(s, { size: false }); }
  catch (e) {
    if (!conflicts.length) throw e;
    return { revs: {}, codes: {}, conflicts: [...puts, ...dels].map(c => docKey(c.kind, c.id)) };
  }
  guard(s);
  /* Only the records the page sent are written, and the code counter when a new object got its code. */
  const touched = new Set([...okPuts, ...okDels].map(c => docKey(c.kind, c.id)));
  if (Object.keys(codes).length) touched.add(docKey('setting', 'codeN'));
  writeDocs(db, s, touched);
  const after = revsOf(db);
  const applied = {};
  for (const c of [...okPuts, ...okDels]) { const key = docKey(c.kind, c.id); applied[key] = after[key] ?? 0; }
  return { revs: applied, codes, conflicts };
}
