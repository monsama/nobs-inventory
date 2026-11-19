/* Finding a setting by what it is called or what it holds: the Settings pages and the sections in them. Used by the search
   at the top (Ctrl+K) and by Find a setting in the Settings dialog. A hit opens Settings on its page and brings its
   section into view. */
import { $, st, toast } from './01-core.js';
import { SET_TABS, openSettings, renderSetPane } from './04-settings.js';

/* The pages of Settings an admin looks for by another word: Backups by restore, E-mail by SMTP or digest … */
export const SET_WORDS = { maintenance: 'system health certificate https photos inventory size disk', backups: 'backup restore copy export azure s3 snapshot clear reset', mail: 'email e-mail smtp digest notification weekly',
  log: 'audit history errors', users: 'people roles viewer admin sso duplicates', access: 'groups viewers token api', company: 'logo company name', directory: 'ldap ad active directory sync test connection', entra: 'graph intune defender autopilot azure microsoft sync test connection',
  feed: 'lansweeper sync push token', sources: 'fields policy order sources', vlans: 'network vlan', subnets: 'ip range dhcp', types: 'object types models card fields icon colour', locations: 'sites rooms store room', about: 'version licence' };
export const SET_PATH = { users: 'Users → People', access: 'Users → Access', company: 'Users → Company', maintenance: 'System → Health', backups: 'System → Backups', mail: 'System → E-mail', log: 'System → Log', feed: 'Data sources → Lansweeper', directory: 'Data sources → Active Directory', entra: 'Data sources → Entra & Intune', sources: 'Data sources → All fields', vlans: 'Network → VLANs', subnets: 'Network → Subnets', domains: 'Network → Domains' };
/* Sections inside the pages: [name, page, the title of its section, other words]. */
const SECTIONS = [
  ['Push token', 'feed', 'Lansweeper push', 'push script powershell token scheduled task'],
  ['Lansweeper type names', 'feed', 'Lansweeper type names', 'type mapping asset type'],
  ['Type rules', 'feed', 'Type rules', 'type rules classify'],
  ['Import a Lansweeper CSV report', 'feed', 'Advanced: import a CSV report', 'csv report file import'],
  ['Defender for Endpoint', 'entra', 'Defender for Endpoint', 'defender antivirus security'],
  ['Fields from Intune', 'entra', 'Fields from Intune', 'intune fields imei phone'],
  ['Store rooms', 'locations', 'Store rooms', 'stock take back store'],
  ['Location texts from the sources', 'locations', 'Location texts from the sources', 'room mapping ad office building'],
  ['List detail', 'types', 'Look and list', 'list detail column card lines preview'],
  ['Models', 'types', 'Models', 'model names lansweeper names'],
  ['API access', 'access', 'API access', 'api token rest'],
  ['Viewers from groups', 'access', 'Viewers from groups', 'group rules roles from groups'],
  ['Clear inventory', 'backups', 'Clear inventory', 'delete all devices start again'],
  ['Factory reset', 'backups', 'Factory reset', 'start over wipe everything'],
  ['Move to a new server', 'backups', 'Move to a new server', 'migrate restore rebuild new server move'],
  ['Weekly e-mail', 'mail', 'Weekly e-mail', 'digest smtp mail server'],
  ['Health', 'maintenance', 'Health', 'status checks disk certificate inventory size'],
  ['Device fields and their sources', 'sources', 'Device fields', 'which source fills which field policy'],
  ['Where a device\'s location comes from', 'locations', 'Location texts from the sources', 'location source order priority ad lansweeper entra office switch off'],
  ['Order of a field\'s sources', 'sources', 'Device fields', 'priority order updates only if empty change switch off source'],
  ['Preview this week\'s e-mail', 'mail', 'Weekly e-mail', 'preview digest without mail server test'],
  ['Where are they? (not seen, not scanned)', 'sources', 'Gone devices', 'where are they not seen not scanned months'],
];
const has = (q, ...vals) => vals.some(v => v && String(v).toLowerCase().includes(q));

/* Settings hits for text q (lower case): the sections first, then the pages. Each is { label, path, go }. */
export function settingHits(q){
  const secs = SECTIONS.filter(([l, , h, w]) => has(q, l, h, w)).map(([l, k, h]) => ({ label: l, path: 'Settings → ' + (SET_PATH[k] || pageName(k)), go: () => openSetting(k, h) }));
  const pages = SET_TABS.filter(([k, l]) => has(q, l, SET_PATH[k], SET_WORDS[k]) && !secs.some(s => s.label === l)).map(([k, l]) => ({ label: l, path: 'Settings → ' + (SET_PATH[k] || l), go: () => openSetting(k) }));
  return [...secs, ...pages];
}
const pageName = k => (SET_TABS.find(([x]) => x === k) || [k, k])[1];

/* Opens Settings (or turns its page) on page k, and brings the section titled title into view, marked a moment. */
export function openSetting(k, title = ''){
  st.setTab = k;
  if (k === 'types') st.typeSel = title === 'Models' ? '__models' : (st.typeSel === '__models' ? null : st.typeSel);
  if (k === 'feed' && /type|CSV/.test(title)) { const adv = /** @type {HTMLDetailsElement | null} */ (document.getElementById('lsTypeAdv')); if (adv) adv.open = true; }
  if ($('#mdl #setPane')) renderSetPane(); else openSettings();
  if (!title) return;
  requestAnimationFrame(() => {
    const adv = /** @type {HTMLDetailsElement | null} */ (document.getElementById('lsTypeAdv')); if (adv && /type|CSV/.test(title)) adv.open = true;
    const h = [...document.querySelectorAll('#setPane .panelbox > .hdr, #setPane summary')].find(x => x.textContent.trim().startsWith(title));
    /* A section that shows only once it applies (Store rooms with a site, Lansweeper push with Lansweeper on): said. */
    if (!h){ toast(`${title} is not on this page yet: it shows once it applies.`); return; }
    const box = /** @type {HTMLElement} */ (h.closest('.panelbox') || h);
    /* A folded section (details) is opened. */
    if (h.tagName === 'SUMMARY' && h.parentElement instanceof HTMLDetailsElement) h.parentElement.open = true;
    if (box.classList.contains('collapsed')) /** @type {HTMLElement} */ (h).click();
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    box.classList.add('set-flash'); setTimeout(() => box.classList.remove('set-flash'), 1600);
  });
}
