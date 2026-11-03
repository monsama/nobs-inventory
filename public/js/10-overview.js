/* The overview: the inventory at a glance. A row of figures, what needs attention, and the devices by type and by
   site. Every line leads to the list behind it, filtered. */
import { COMPANY, SITES, QUALITY, REVIEW, SYNC, GRAPH_FILTERS, GRAPH_TYPES, JOIN_INFO, OS_ENDED, osFamily, LS_ON, scanOld, leftFilters, $, COSTS, LOCS, STATUS, TYPES, WARRANTY_SOON_DAYS, esc, objs, st, tico, toast, warrantyState } from './01-core.js';
import { NOTICE_SOON_DAYS, runningNow, yearlyCost } from './costs.js';
import { lifeOf, replacementPlan } from './lifecycle.js';
import { MAINT_SOON_DAYS, dueTasks, everyText, todayDay } from './maintenance.js';
import { dueChip, maintDoneModal } from './26-maintenance.js';
import { closeModal, modal } from './19-modal.js';
import { dateText } from './dates.js';
import { contractsDue, licencesOver, money } from './09-costs.js';
import { SERVER, queueServerSave, view } from './07-render.js';
import { openObjs, resetFilters } from './02-views.js';
import { CERT, certAttention, loadCert } from './certificate.js';
import { USERS, isAdmin, openSettings, showDevicesOf } from './04-settings.js';
/* Devices still out this many days after their person left are marked red. */
const HANDBACK_DAYS = 14;
const SERVER_ON = () => !!SERVER.on;
import { newObjModal } from './05-new-object.js';
import { reportsModal } from './21-reports.js';

const compact = n => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
/* A list of bars, longest first, each a button that opens the list behind it. One hue: the length is the message. */
const bars = (rows, attr) => {
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<div class="ov-bars">${rows.map(r => `<button class="ov-bar" ${attr}="${esc(r.key)}" title="${esc(r.label)}: ${r.n} devices${r.bad ? ` (${esc(r.bad)})` : ''}${r.hint ? `\n${esc(r.hint)}` : ''}">
    <span class="ov-lbl">${r.icon || ''}<span>${esc(r.label)}</span></span><span class="ov-track"><span ${r.bad ? 'class="bad" ' : ''}style="width:${Math.max(2, Math.round(r.n / max * 100))}%"></span></span><span class="ov-n">${compact(r.n)}</span></button>`).join('')}</div>`;
};

/* Getting started, for an admin of a new inventory: the few things to set up first, each ticked when it is done and
   with the button that does it. Gone when the first four are done, or when hidden (kept in this browser). */
const GS_HIDE = 'ni-start-hidden';
function startHtml(){
  /* Only for a new inventory: one in use for a while (many devices) does not need it. */
  if (!isAdmin() || objs.length >= 50) return '';
  try { if (localStorage.getItem(GS_HIDE)) return ''; } catch { /* no storage: shown */ }
  const steps = [
    [SITES.length > 0, 'Sites and rooms', 'Where devices are: a site per building or town, rooms in it.', 'locations', 'Add sites'],
    [USERS.length > 1 || !!(st.ldap && st.ldap.url), 'People', 'Who may sign in (admin or viewer), and the people devices are handed to. Or connect Active Directory.', 'users', 'Add people'],
    [!!COMPANY.name, 'Company name and logo', 'Shown on entry sheets, hand-back lists and reports.', 'users', 'Set the name'],
    [objs.length > 0, 'The first devices', 'Add them by hand or import a CSV, or let a source bring them.', 'new', 'New object'],
  ];
  const optional = [LS_ON() && (!!SYNC.run || objs.some(o => o.feed)) || !!(st.ldap && st.ldap.url) || !!SYNC.graph, 'Connect a source (optional)', 'Lansweeper, Active Directory or Entra & Intune fill in and keep devices up to date.', 'sources', 'Data sources'];
  if (steps.every(x => x[0])) return '';
  const row = ([done, title, note, act, label], i) => `<li class="start-step${done ? ' done' : ''}"><span class="start-n" aria-hidden="true">${done ? '✓' : i + 1}</span><span class="start-t"><b>${title}</b><span class="muted">${note}</span></span>${done ? '<span class="chip ok">Done</span>' : `<button type="button" data-start="${act}">${label}</button>`}</li>`;
  return `<div class="panelbox start"><div class="hdr">Getting started <span class="cnt">${steps.filter(x => x[0]).length} of ${steps.length} done</span><button type="button" class="link" id="startHide" style="margin-left:auto">Hide</button></div>
    <ol class="start-list">${steps.map(row).join('')}${row(optional, steps.length)}</ol></div>`;
}
/* The counts by type, site, status and so on are folded under Statistics: what needs doing comes first. Kept open once opened. */
const STATS_KEY = 'ni-ov-stats';
const statsOpen = () => { try { return localStorage.getItem(STATS_KEY) === '1'; } catch { return false; } };
export function renderOverview(){
  const live = objs.filter(o => o.status !== 'retired');
  const inUse = objs.filter(o => o.status === 'active');
  const wEnded = inUse.filter(o => warrantyState(o) === 'ended').length, wSoon = inUse.filter(o => warrantyState(o) === 'soon').length;
  const due = contractsDue(), over = licencesOver();
  /* Running only: a contract or licence that has ended, or not started yet, costs nothing now. */
  const year = COSTS.contracts.filter(c => runningNow(c)).reduce((t, c) => t + yearlyCost(c), 0) + COSTS.licences.filter(l => runningNow(l)).reduce((t, l) => t + yearlyCost(l), 0);
  const value = inUse.reduce((t, o) => t + (typeof o.price === 'number' ? o.price : 0), 0), priced = inUse.filter(o => typeof o.price === 'number').length;
  const stock = live.filter(o => o.status === 'stock').length;
  const nOld = LS_ON() ? live.filter(o => scanOld(o)).length : 0;
  /* Operating systems, by family; those no longer updated also need attention. */
  const osRows = Object.entries(live.reduce((m, o) => { const f = osFamily(o); if (f) m[f] = (m[f] || 0) + 1; return m; }, {}))
    .map(([f, n]) => ({ key: f, label: f, n })).sort((a, b) => b.n - a.n);
  /* "Other" says what it holds: the names written most often, so a system the families miss can be spotted. */
  const other = osRows.find(r => r.key === 'Other');
  if (other){
    const names = Object.entries(live.reduce((m, o) => { if (osFamily(o) === 'Other'){ const k = String(o.os).trim(); m[k] = (m[k] || 0) + 1; } return m; }, {})).sort((a, b) => b[1] - a[1]);
    other.hint = names.slice(0, 6).map(([k, n]) => `${k} (${n})`).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '');
  }
  const withOs = osRows.reduce((t, r) => t + r.n, 0);
  const osEnded = osRows.filter(r => OS_ENDED.includes(r.key)).map(r => [r.key, r.n]);
  /* How the computers and phones are joined: Entra, hybrid, AD only, registered, or not at all. Shown once Graph is set
     up or the directory sync has found computer accounts. */
  const joinable = live.filter(o => GRAPH_TYPES.includes(o.type));
  const showJoin = SYNC.graph || live.some(o => o.inAd);
  const joinKeys = ['entra', 'hybrid', 'adonly', 'registered', 'notjoined'];
  const joinRows = joinKeys.map(k => ({ key: k, label: GRAPH_FILTERS[k][0], n: live.filter(GRAPH_FILTERS[k][2]).length })).filter(r => r.n);
  const pct = n => joinable.length ? Math.round(n / joinable.length * 100) + '%' : '';
  const joinNote = Object.fromEntries(joinKeys.map(k => [k, JOIN_INFO[k === 'adonly' ? 'AD joined' : GRAPH_FILTERS[k][0]] || 'Neither in Entra nor with a computer account in AD']));
  /* Intune, in three groups: how many are managed, their compliance, and what to clean up. */
  const intuneGroups = SYNC.graph ? [
    ['Management', ['managed', 'unmanaged']],
    ['Compliance', ['compliant', 'grace', 'noncompliant', 'unencrypted', 'secureboot']],
    ['To clean up', ['stale', 'duplicates', 'missing', 'ambiguous']],
  ].map(([title, keys]) => [title, keys.map(k => ({ key: k, label: GRAPH_FILTERS[k][0], n: live.filter(GRAPH_FILTERS[k][2]).length })).filter(r => r.n)]).filter(g => g[1].length) : [];
  /* Data quality: how many devices are complete, and what the others lack. */
  const qRows = Object.entries(QUALITY).map(([k, [label, hint, test]]) => ({ key: k, label, hint, n: live.filter(test).length })).filter(r => r.n);
  const complete = live.filter(o => !Object.values(QUALITY).some(q => q[2](o))).length;
  const qPct = live.length ? Math.round(complete / live.length * 100) : 100;
  const waiting = REVIEW.filter(o => !o.review.ignored).length;
  /* People who left (deactivated) and still have devices that are not in stock or retired: the oldest first. */
  const held = new Map();
  for (const o of objs) if (o.uid && !['retired', 'stock'].includes(o.status)) held.set(o.uid, (held.get(o.uid) || 0) + 1);
  const handbacks = USERS.filter(u => u.active === false && held.get(u.id)).map(u => ({ u, n: held.get(u.id),
    days: u.leftAt && Date.parse(u.leftAt) ? Math.max(0, Math.floor((Date.now() - Date.parse(u.leftAt)) / 864e5)) : null }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || a.u.name.localeCompare(b.u.name));
  /* Problems the devices' users reported (Report a problem… on My devices): the open ones, newest first, and how many were
     done in the last 30 days. */
  const reports = objs.filter(o => o.reported && o.status !== 'retired');
  const openRep = reports.filter(o => !o.reported.done).sort((a, b) => String(b.reported.at).localeCompare(String(a.reported.at)));
  const doneRep = reports.filter(o => o.reported.done && Date.now() - Date.parse(o.reported.done.at) < 30 * 864e5).sort((a, b) => String(b.reported.done.at).localeCompare(String(a.reported.done.at)));
  const repRow = o => `<div class="ov-hb ov-rep"><button class="ov-row" data-ovopen="${esc(o.id)}"><span class="chip ${o.reported.done ? 'ok' : 'warn'}">${o.reported.done ? '✓' : '!'}</span><span><b>${esc(o.name)}</b><small>${esc(o.reported.text)}</small><small class="muted">${esc([o.reported.by, dateText(String(o.reported.at).slice(0, 10)), o.reported.done ? `done ${dateText(o.reported.done.at.slice(0, 10))}${o.reported.done.by ? ` by ${o.reported.done.by}` : ''}${o.reported.done.note ? `: ${o.reported.done.note}` : ''}` : ''].filter(Boolean).join(' · '))}</small></span></button>${!o.reported.done && isAdmin() ? `<button type="button" data-repdone="${esc(o.id)}">Done</button>` : ''}</div>`;
  /* Recurring maintenance due within 30 days (overdue first), on devices in use. */
  const mtToday = todayDay(), mtDue = dueTasks(objs, mtToday), mtLate = mtDue.filter(x => x.days < 0);
  const mtRow = x => `<div class="ov-hb ov-rep"><button class="ov-row" data-ovopen="${esc(x.o.id)}">${dueChip(x.m, mtToday)}<span><b>${esc(x.o.name)}</b><small>${esc(x.m.what)} · ${esc(everyText(x.m))}</small></span></button>${isAdmin() ? `<button type="button" data-ovmtdone="${esc(x.o.id)}|${esc(x.m.id)}">Done…</button>` : ''}</div>`;
  const attention = [
    [waiting, 'warn', 'Waiting in To review', `found by a sync, not in the inventory yet: accept or ignore ${waiting === 1 ? 'it' : 'them'}`, 'data-ovrv="1"'],
    [mtLate.length, 'bad', 'Maintenance overdue', mtLate.slice(0, 3).map(x => `${x.o.name}: ${x.m.what}`).join(', ') + (mtLate.length > 3 ? '…' : ''), 'data-ovmt="late"'],
    [wEnded, 'bad', 'Warranty ended', `${wEnded === 1 ? 'device' : 'devices'} in use`, 'data-ovw="ended"'],
    [wSoon, 'warn', 'Warranty ends soon', `within ${WARRANTY_SOON_DAYS} days`, 'data-ovw="soon"'],
    [due.length, 'warn', 'Contract notice due', `within ${NOTICE_SOON_DAYS} days: ${due.slice(0, 3).map(c => c.name).join(', ')}${due.length > 3 ? '…' : ''}`, 'data-ovtab="contracts"'],
    [over.length, 'bad', 'Licences over-used', over.slice(0, 3).map(l => l.name).join(', ') + (over.length > 3 ? '…' : ''), 'data-ovtab="sw"'],
    [nOld, 'warn', 'Check by hand', 'not scanned by Lansweeper for over 3 months', 'data-ovscan="1"'],
    ...(SYNC.graph ? ['noncompliant', 'unencrypted', 'secureboot'].map(k => [live.filter(GRAPH_FILTERS[k][2]).length, GRAPH_FILTERS[k][1], GRAPH_FILTERS[k][0], 'in Microsoft Intune', `data-ovintune="${k}"`]) : []),
    ...osEnded.map(([fam, n]) => [n, 'bad', `${fam}: no more updates`, 'the maker has ended support; upgrade or replace', `data-ovos="${esc(fam)}"`]),
    certAttention() || [0],
  ].filter(a => a[0] > 0);
  /* The certificate is read once; the overview is drawn again when it is known, if it is still shown. */
  if (CERT === null) loadCert().then(() => { if (st.tab === 'overview' && certAttention()) renderOverview(); });
  const tile = (label, value, sub, attr = '') => `<${attr ? `button ${attr}` : 'div'} class="ov-tile"><span class="ov-tl">${label}</span><span class="ov-tv">${value}</span><span class="ov-ts">${sub}</span></${attr ? 'button' : 'div'}>`;
  const byType = Object.entries(live.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {})).map(([t, n]) => ({ key: t, label: TYPES[t] ? TYPES[t].label : t, n, icon: tico(t, 'tico sm') })).sort((a, b) => b.n - a.n);
  const sites = [...new Set(LOCS.map(l => l.split(' / ')[0]))];
  const bySite = sites.map(s => ({ key: s, label: s, n: live.filter(o => String(o.loc || '').split(' / ')[0] === s).length })).filter(r => r.n).sort((a, b) => b.n - a.n);
  const noLoc = live.filter(o => !o.loc).length;
  /* The Overview counts everything: a filter picked on the left applies to the lists, which it says. */
  $('#toolbar').innerHTML = `<b>Overview</b><span class="muted">${compact(objs.length)} ${objs.length === 1 ? 'object' : 'objects'}</span>${leftFilters() || st.q.trim() ? '<span class="muted hide-n">· counts all objects; your filters apply to Cards, Table and Relationships</span>' : ''}<div class="grow"></div><button id="ovStock"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>Stocktake</button><button id="ovReports"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/></svg>Reports…</button>`;
  $('#ovReports').onclick = () => reportsModal();
  $('#ovStock').onclick = () => { st.tab = 'stocktake'; view(); };
  $('#view').innerHTML = `<div class="ov">${startHtml()}
    <div class="ov-kpis">
      ${tile('Devices in use', compact(inUse.length), `${compact(stock)} in stock`, 'data-ovs="active"')}
      ${/* Topics, not a sum: the rows count devices, contracts and licences, and one device can be in several rows. */ ''}
      ${tile('Needs attention', compact(attention.length), attention.length ? (attention.length === 1 ? '1 topic: ' : `${attention.length} topics: `) + attention.map(a => a[2]).slice(0, 2).join(', ') + (attention.length > 2 ? '…' : '') : 'Nothing right now')}
      ${/* A tile with nothing to say is left out: no contracts or licences, no device with a price. */ ''}
      ${COSTS.contracts.length || COSTS.licences.length ? tile('Contracts and licences', year ? money(year) : '—', year ? 'per year, running' : 'No costs recorded', 'data-ovtab="contracts"') : ''}
      ${priced ? tile('Value of devices in use', money(value), `price known for ${compact(priced)} of ${compact(inUse.length)}`) : ''}
    </div>
    <div class="ov-cols">
      <div class="panelbox"><div class="hdr">Needs attention <span class="cnt">${attention.length || 'none'}</span></div>
        ${attention.length ? `<div class="ov-att">${attention.map(([n, cls, label, sub, attr]) => `<button class="ov-row" ${attr}><span class="chip ${cls}">${compact(n)}</span><span><b>${esc(label)}</b><small>${esc(sub)}</small></span></button>`).join('')}</div>`
          : '<div class="chain"><span class="muted">Nothing needs attention: no ended warranties, notices due or licences over-used.</span></div>'}
      </div>
      ${handbacks.length ? `<div class="panelbox"><div class="hdr">Hand-backs open <span class="cnt">${handbacks.length} ${handbacks.length === 1 ? 'person' : 'people'}</span></div>
        <p class="note" style="padding:8px 12px 2px;margin:0">People who left and still have devices. Open one to take the devices back, with the hand-back list to tick off.</p>
        <div class="ov-att">${handbacks.map(h => `<div class="ov-hb"><button class="ov-row" data-ovhb="${esc(h.u.id)}"><span class="chip ${h.days !== null && h.days > HANDBACK_DAYS ? 'bad' : 'warn'}">${h.n}</span><span><b>${esc(h.u.name)}</b><small>${esc([h.u.dept, h.days === null ? 'left' : h.u.leftBy ? `left before ${dateText(h.u.leftAt.slice(0, 10))}` : h.days === 0 ? 'left today' : `left ${h.days} day${h.days === 1 ? '' : 's'} ago`, `${h.n} device${h.n === 1 ? '' : 's'}`].filter(Boolean).join(' · '))}</small></span></button>${SERVER_ON() ? `<a class="btnlike" href="api/reports/handback?id=${encodeURIComponent(h.u.id)}&format=pdf" download title="The devices ${esc(h.u.name)} has, as a PDF to tick off">Hand-back list</a>` : ''}</div>`).join('')}</div></div>` : ''}
      ${openRep.length || doneRep.length ? `<div class="panelbox" id="ovReported"><div class="hdr">Reported problems <span class="cnt">${openRep.length ? `${openRep.length} open` : 'none open'}</span></div>
        <div class="ov-att">${openRep.map(repRow).join('')}</div>
        ${doneRep.length ? `<details class="ov-done"><summary>Done in the last 30 days (${doneRep.length})</summary><div class="ov-att">${doneRep.map(repRow).join('')}</div></details>` : ''}</div>` : ''}
      ${mtDue.length ? `<div class="panelbox" id="ovMaint"><div class="hdr">Maintenance due <span class="cnt">${mtLate.length ? `${mtLate.length} overdue · ` : ''}${mtDue.length - mtLate.length} within ${MAINT_SOON_DAYS} days</span></div>
        <div class="ov-att">${mtDue.slice(0, 8).map(mtRow).join('')}</div>
        ${mtDue.length > 8 ? `<div class="chain"><button type="button" class="link" data-ovmt="all">Show all ${mtDue.length} in the Table</button></div>` : ''}</div>` : ''}
      ${planHtml(live)}
      <div class="panelbox"><div class="hdr">Data quality <span class="cnt">${compact(complete)} of ${compact(live.length)} complete</span></div>
        <div class="ov-q"><div class="ov-qbar" role="img" aria-label="${qPct}% of the devices are complete"><span style="width:${qPct}%"></span></div><b>${qPct}%</b></div>
        ${qRows.length ? `<div class="ov-att">${qRows.map(r => `<button class="ov-row" data-ovq="${r.key}"><span class="chip warn">${compact(r.n)}</span><span><b>${esc(r.label)}</b><small>${esc(r.hint)}</small></span></button>`).join('')}</div>`
          : `<div class="chain"><span class="muted">${live.length ? 'Every device has its location, serial number and people, and its sources agree.' : 'No devices yet.'}</span></div>`}</div>
    </div>
    <details class="ov-stats" id="ovStats" ${statsOpen() ? 'open' : ''}><summary>Statistics <span class="muted">by type, site, status, operating system${showJoin || intuneGroups.length ? ', Entra and Intune' : ''}</span></summary><div class="ov-cols">
      <div class="panelbox"><div class="hdr">Devices by type <span class="cnt">${compact(live.length)} not retired</span></div>${byType.length ? bars(byType, 'data-ovt') : '<div class="chain"><span class="muted">No devices yet.</span></div>'}</div>
      ${bySite.length ? `<div class="panelbox"><div class="hdr">Devices by site${noLoc ? ` <span class="cnt">${compact(noLoc)} without location</span>` : ''}</div>${bars(bySite, 'data-ovl')}</div>` : ''}
      ${showJoin ? `<div class="panelbox"><div class="hdr">How devices are joined <span class="cnt">${compact(joinable.length)} computers and phones</span></div>
        ${joinRows.length ? `<div class="ov-split" role="img" aria-label="${esc(joinRows.map(r => r.label + ' ' + pct(r.n)).join(', '))}">${joinRows.map(r => `<span class="j-${r.key}" style="flex:${r.n}" title="${esc(r.label)}: ${r.n} (${pct(r.n)})"></span>`).join('')}</div>
        <div class="ov-att">${joinRows.map(r => `<button class="ov-row" data-ovintune="${r.key}" title="${esc(joinNote[r.key])}"><span class="ov-key j-${r.key}"></span><span><b>${esc(r.label)}</b><small>${esc(joinNote[r.key])}</small></span><span class="ov-num">${compact(r.n)}<small>${pct(r.n)}</small></span></button>`).join('')}</div>`
        : '<div class="chain"><span class="muted">No computers or phones yet.</span></div>'}</div>` : ''}
      ${intuneGroups.length ? `<div class="panelbox ov-wide"><div class="hdr">Microsoft Intune <span class="cnt">${compact(live.filter(o => o.graph && !o.graph.gone).length)} devices in Entra or Intune</span></div>
        ${intuneGroups.map(([title, rows]) => `<div class="side-sub ov-sub">${esc(title)}</div>${bars(rows, 'data-ovintune')}`).join('')}</div>` : ''}
      ${osRows.length ? `<div class="panelbox"><div class="hdr">Operating systems <span class="cnt">${compact(withOs)} of ${compact(live.length)} known</span></div>${bars(osRows.map(r => OS_ENDED.includes(r.key) ? { ...r, bad: 'no more updates from the maker' } : r), 'data-ovos')}</div>` : ''}
      <div class="panelbox"><div class="hdr">By status</div>${objs.length ? bars(Object.entries(STATUS).map(([k, v]) => ({ key: k, label: v.label, n: objs.filter(o => o.status === k).length })).filter(r => r.n), 'data-ovs') : '<div class="chain"><span class="muted">No devices yet.</span></div>'}</div>
    </div></details></div>`;
  const ovs = $('#ovStats'); if (ovs) ovs.ontoggle = () => { try { if (ovs.open) localStorage.setItem(STATS_KEY, '1'); else localStorage.removeItem(STATS_KEY); } catch { /* not kept */ } };
  /* Each line opens the list it counts: filters are reset first, so the list shows what the line said. */
  const go = (tab, set = {}) => { resetFilters(); Object.assign(st, { scope: null, rvSrc: '', rvKnown: false, rvOld: false, bulk: new Set() }, set); st.tab = tab; view(); };
  const v = $('#view');
  /* Getting started: each step's button opens where it is done. */
  v.querySelectorAll('[data-start]').forEach(b => b.onclick = () => { if (b.dataset.start === 'new'){ newObjModal(); return; } st.setTab = b.dataset.start; openSettings(); });
  const gh = $('#startHide'); if (gh) gh.onclick = () => { try { localStorage.setItem(GS_HIDE, '1'); } catch { /* shown again next time */ } renderOverview(); };
  v.querySelectorAll('[data-ovt]').forEach(b => b.onclick = () => go('cards', { type: b.dataset.ovt, live: true }));
  v.querySelectorAll('[data-ovl]').forEach(b => b.onclick = () => go('cards', { loc: b.dataset.ovl, live: true }));
  v.querySelectorAll('[data-ovintune]').forEach(b => b.onclick = () => go('table', { intune: b.dataset.ovintune, live: true }));
  v.querySelectorAll('[data-ovos]').forEach(b => b.onclick = () => go('table', { osFam: b.dataset.ovos, live: true }));
  v.querySelectorAll('[data-ovrv]').forEach(b => b.onclick = () => go('cards', { scope: 'review' }));
  v.querySelectorAll('[data-ovplan]').forEach(b => b.onclick = () => {
    const row = replacementPlan(objs, st.lifecycle, new Date().getFullYear()).rows.find(r => r.key === b.dataset.ovplan);
    if (row) go('table', { ids: { label: row.key === 'overdue' ? 'Due for replacement: overdue' : `Due for replacement in ${row.key}`, ids: row.ids, cols: ['purchased', 'due', 'replPrice'] } });
  });
  const pl = $('#ovLife'); if (pl) pl.onclick = () => lifeModal();
  v.querySelectorAll('[data-ovmtdone]').forEach(b => b.onclick = () => { const [oid, mid] = b.dataset.ovmtdone.split('|'); const o = objs.find(x => x.id === oid); if (o) maintDoneModal(o, mid, renderOverview); });
  v.querySelectorAll('[data-ovmt]').forEach(b => b.onclick = () => {
    const late = b.dataset.ovmt === 'late', list = dueTasks(objs, todayDay()).filter(x => !late || x.days < 0);
    go('table', { ids: { label: late ? 'Maintenance overdue' : `Maintenance due within ${MAINT_SOON_DAYS} days`, ids: [...new Set(list.map(x => x.o.id))], cols: ['maint'] } });
  });
  v.querySelectorAll('[data-ovopen]').forEach(b => b.onclick = () => openObjs([b.dataset.ovopen]));
  v.querySelectorAll('[data-ovhb]').forEach(b => b.onclick = () => showDevicesOf(b.dataset.ovhb));
  v.querySelectorAll('[data-ovq]').forEach(b => b.onclick = () => go('table', { quality: b.dataset.ovq, live: true }));
  v.querySelectorAll('[data-ovscan]').forEach(b => b.onclick = () => go('table', { scanOld: true, live: true }));
  v.querySelectorAll('[data-ovs]').forEach(b => b.onclick = () => go('table', { status: b.dataset.ovs }));
  v.querySelectorAll('[data-ovw]').forEach(b => b.onclick = () => go('table', { warranty: b.dataset.ovw, status: 'active' }));
  /* Contracts and Software open without a search left from before, so every due contract or over-used licence shows. */
  v.querySelectorAll('[data-ovcert]').forEach(b => b.onclick = () => { st.setTab = 'maintenance'; openSettings(); });
  v.querySelectorAll('[data-ovtab]').forEach(b => b.onclick = () => { st.ctQ = st.swQ = ''; st.tab = b.dataset.ovtab; view(); });
}

/* Replacement planning (public/js/lifecycle.js): the devices due each year from now, with what replacing them costs. */
function planHtml(live){
  const plan = replacementPlan(live, st.lifecycle, new Date().getFullYear());
  if (!plan.planned && !plan.unknown) return '';
  const max = Math.max(1, ...plan.rows.map(r => r.ids.length));
  const tip = r => Object.entries(r.sites).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}: ${n}`).join(', ');
  return `<div class="panelbox" id="ovPlan"><div class="hdr">Replacement plan <span class="cnt">${compact(plan.planned)} planned</span>${isAdmin() ? '<button type="button" class="link" id="ovLife" style="margin-left:auto">Lifetimes and prices…</button>' : ''}</div>
    <div class="ov-bars">${plan.rows.map(r => `<button class="ov-bar" data-ovplan="${r.key}" title="${esc(r.label)}: ${r.ids.length} device${r.ids.length === 1 ? '' : 's'}${r.ids.length ? ` (${esc(tip(r))})` : ''}" ${r.ids.length ? '' : 'disabled'}>
      <span class="ov-lbl"><span>${esc(r.label)}</span></span><span class="ov-track"><span ${r.key === 'overdue' && r.ids.length ? 'class="bad" ' : ''}style="width:${r.ids.length ? Math.max(2, Math.round(r.ids.length / max * 100)) : 0}%"></span></span><span class="ov-n">${compact(r.ids.length)}${plan.priced && r.cost ? `<small class="ov-cost">${money(r.cost)}</small>` : ''}</span></button>`).join('')}</div>
    <p class="note ov-plnote">Due when a type's lifetime has passed since purchase; without a purchase date, when the warranty ends.${plan.unknown ? ` ${compact(plan.unknown)} device${plan.unknown === 1 ? ' has' : 's have'} neither date.` : ''}${plan.priced ? '' : isAdmin() ? ' Add replacement prices to see the budget per year.' : ' An admin can add replacement prices for the budget per year.'}</p></div>`;
}
/* The lifetime and the replacement price of each type, for the plan. */
function lifeModal(){
  const used = Object.keys(TYPES).filter(t => objs.some(o => o.type === t && o.status !== 'retired'));
  modal(`<div class="mh">Lifetimes and replacement prices</div><div class="mb"><p class="note">How many years a device of each type is kept, and what replacing one costs. 0 years: not planned.</p>
    <table class="grid mini ov-life"><thead><tr><th>Type</th><th>Years</th><th>Price (${esc(COSTS.currency || 'CHF')})</th></tr></thead><tbody>${used.map(t => { const l = lifeOf(st.lifecycle, t); return `<tr><td>${esc(TYPES[t].label)}</td>
      <td><input type="number" min="0" max="40" step="1" data-lfy="${esc(t)}" value="${l.years}" aria-label="Lifetime of ${esc(TYPES[t].label)} in years"></td>
      <td><input type="number" min="0" step="any" data-lfp="${esc(t)}" value="${l.price || ''}" placeholder="0" aria-label="Replacement price of ${esc(TYPES[t].label)}"></td></tr>`; }).join('')}</tbody></table></div>
    <div class="mf"><button id="lfCancel">Cancel</button><button id="lfOk" class="primary">Save</button></div>`, 'sm');
  $('#lfCancel').onclick = closeModal;
  $('#lfOk').onclick = () => {
    const next = { ...(st.lifecycle || {}) };
    for (const t of used) {
      const y = Math.round(Number($(`[data-lfy="${t}"]`).value)), p = Number($(`[data-lfp="${t}"]`).value);
      if (!Number.isInteger(y) || y < 0 || y > 40){ toast(`${TYPES[t].label}: a lifetime is 0 to 40 years.`); return; }
      if (!(p >= 0)){ toast(`${TYPES[t].label}: the price is a number.`); return; }
      next[t] = { years: y, ...(p > 0 ? { price: p } : {}) };
    }
    st.lifecycle = next; queueServerSave(); closeModal(); renderOverview(); toast('Lifetimes and prices saved');
  };
}
