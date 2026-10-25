/* Type rules: how a device from Lansweeper gets its type. Shared by the server (which applies them) and the page (which
   shows and edits them). No browser code here.

   A rule looks at one thing Lansweeper reports and names a type: "if the model contains SINAMICS, it is a PLC". The rules
   are tried in order; the first that matches decides. The list ships with these rules and can be changed in
   Settings → Feed; the names in the table of Lansweeper type names come first, and Windows' own word (workstation,
   server, domain controller) last. */
export const RULE_FIELDS = { any: 'Type, model or name', model: 'Model', type: 'Lansweeper type', name: 'Name', chassis: 'Chassis' };

const r = (field, words, to) => ({ field, words, to, on: true });
export const DEFAULT_TYPE_RULES = [
  /* What the model or name says beats Lansweeper's type: it files industrial and video devices it reaches over the
     network as switches, network devices or web servers. */
  r('any', 'simatic, s7-300, s7-400, s7-1200, s7-1500, logo!, modicon, controllogix, compactlogix, guardlogix, micrologix, melsec, plc, programmable controller, saia, pcd, hms industrial, anybus, ewon, wago', 'plc'),
  r('any', 'sinamics, sinumerik, simotion, motion control, powerflex, kinetix, altivar, lexium, movidrive, frequency converter, frequency inverter, servo drive', 'plc'),
  r('any', 'hikvision, ds-2cd, ds-2de, ds-2df, ds-2cv, ds-76, ds-77, ds-86, ds-96, ip camera, network camera, network video recorder, nvr, dvr, axis communications, dahua, cctv', 'camera'),
  r('any', 'omnipcx, oxo connect, oxo0, smartnode, patton electronics, mx-one', 'pbx'),
  r('any', 'gs105, gs108, gs110, gs116, gs305, gs308, gs316, gs324, gs724, gs728, gs752, procurve, catalyst, scalance x, unifi switch, usw-, aruba cx, 8320-, 8325-, 8360-, 6100-, 6200f, 6300f, 6300m, 6400-, 2530-, 2540-, 2930f, 2930m, 5406r, 5412r', 'switch'),
  r('chassis', 'portable, laptop, notebook, sub notebook, convertible, detachable', 'notebook'),
  r('model', 'latitude, thinkpad, elitebook, probook, zbook, macbook, surface laptop, surface book, surface pro, ideapad, vivobook, zenbook, travelmate, toughbook, lifebook, notebook, laptop', 'notebook'),
  /* Lansweeper's type names. */
  r('type', 'virtual machine, vm', 'vm'),
  r('type', 'access point, accesspoint, wireless, wi-fi, wifi, wlan', 'accesspoint'),
  r('type', 'webserver, web', 'other'),
  r('type', 'ipad, iphone, ios', 'ios'),
  r('type', 'android', 'android'),
  r('type', 'tablet, smartphone, mobile', 'mobile'),
  r('type', 'pbx, phone system, pabx, telefonanlage', 'pbx'),
  r('type', 'phone, voip, sip, dect, telefon, gigaset, handset', 'sip'),
  r('type', 'camera, nvr, dvr', 'camera'),
  r('type', 'monitor', 'monitor'),
  r('type', 'switch', 'switch'),
  r('type', 'printer', 'printer'),
  r('type', 'firewall', 'firewall'),
  r('type', 'modem', 'modem'),
  r('type', 'router', 'router'),
  r('type', 'server, linux, vmware, virtual', 'server'),
  r('type', 'laptop, notebook', 'notebook'),
  r('type', 'windows, mac, computer, workstation, pc', 'pc'),
];

/* The words of a rule, lower case. A word of three letters or less matches as a whole word only (pc, vm, ios, nvr), so
   "pc" does not match "pcd" or "spcs"; longer words match anywhere. */
const wordsOf = text => String(text || '').toLowerCase().split(',').map(w => w.trim()).filter(Boolean);
const hits = (hay, w) => w.length > 3 ? hay.includes(w) : new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
export function ruleMatches(rule, dev) {
  const text = rule.field === 'any' ? [dev.type, dev.model, dev.name].join(' ') : dev[rule.field];
  const hay = String(text || '').toLowerCase();
  return !!hay && wordsOf(rule.words).some(w => hits(hay, w));
}
/* The type the rules give a device ({type, model, name, chassis}), and the rule that gave it (null: none matched). */
export function typeByRules(rules, dev) {
  const list = Array.isArray(rules) ? rules : DEFAULT_TYPE_RULES;
  const i = list.findIndex(x => x.on !== false && ruleMatches(x, dev));
  return i < 0 ? { type: 'other', rule: null } : { type: list[i].to, rule: i };
}

/* Returns the first problem with a list of rules, or null. */
export function typeRulesProblem(list, types) {
  if (!Array.isArray(list) || list.length > 300) return 'The type rules are a list of up to 300 rules.';
  for (const [i, x] of list.entries()) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return `Type rule ${i + 1} is not a rule.`;
    if (!RULE_FIELDS[x.field]) return `Type rule ${i + 1} looks at ${x.field}, which is not one of ${Object.keys(RULE_FIELDS).join(', ')}.`;
    if (typeof x.words !== 'string' || !wordsOf(x.words).length || x.words.length > 1000) return `Type rule ${i + 1} needs words to look for (up to 1000 characters).`;
    if (typeof x.to !== 'string' || (types && !types.has(x.to))) return `Type rule ${i + 1} names a type that does not exist: ${x.to}.`;
    if (x.on !== undefined && typeof x.on !== 'boolean') return `Type rule ${i + 1}: on is yes or no.`;
  }
  return null;
}
