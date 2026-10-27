/* The overview: the inventory at a glance. A row of figures, what needs attention, and the devices by type and by
   site. Every line leads to the list behind it, filtered. */
import { SYNC, GRAPH_FILTERS, GRAPH_TYPES, JOIN_INFO, OS_ENDED, osFamily, LS_ON, scanOld, leftFilters, $, COSTS, LOCS, STATUS, TYPES, WARRANTY_SOON_DAYS, esc, objs, st, tico, warrantyState } from './01-core.js';
import { NOTICE_SOON_DAYS, runningNow, yearlyCost } from './costs.js';
import { contractsDue, licencesOver, money } from './09-costs.js';
import { view } from './07-render-plans.js';
import { resetFilters } from './02-views.js';
import { CERT, certAttention, loadCert } from './certificate.js';
import { openSettings } from './04-settings.js';

const compact = n => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
/* A list of bars, longest first, each a button that opens the list behind it. One hue: the length is the message. */
const bars = (rows, attr) => {
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<div class="ov-bars">${rows.map(r => `<button class="ov-bar" ${attr}="${esc(r.key)}" title="${esc(r.label)}: ${r.n} devices${r.bad ? ` (${esc(r.bad)})` : ''}">
    <span class="ov-lbl">${r.icon || ''}<span>${esc(r.label)}</span></span><span class="ov-track"><span ${r.bad ? 'class="bad" ' : ''}style="width:${Math.max(2, Math.round(r.n / max * 100))}%"></span></span><span class="ov-n">${compact(r.n)}</span></button>`).join('')}</div>`;
};

export function renderOverview(){
  const live = objs.filter(o => o.status !== 'retired');
  const inUse = objs.filter(o => o.status === 'active');
  const wEnded = inUse.filter(o => warrantyState(o) === 'ended').length, wSoon = inUse.filter(o => warrantyState(o) === 'soon').length;
  const due = contractsDue(), over = licencesOver();
  /* Running only: a contract or licence that has ended, or not started yet, costs nothing now. */
  const year = COSTS.contracts.filter(c => runningNow(c)).reduce((t, c) => t + yearlyCost(c), 0) + COSTS.licences.filter(l => runningNow(l)).reduce((t, l) => t + yearlyCost(l), 0);
  const value = inUse.reduce((t, o) => t + (typeof o.price === 'number' ? o.price : 0), 0), priced = inUse.filter(o => typeof o.price === 'number').length;
  const repair = objs.filter(o => o.status === 'repair').length, stock = objs.filter(o => o.status === 'stock').length;
  const nOld = LS_ON() ? live.filter(o => scanOld(o)).length : 0;
  /* Operating systems, by family; those no longer updated also need attention. */
  const osRows = Object.entries(live.reduce((m, o) => { const f = osFamily(o); if (f) m[f] = (m[f] || 0) + 1; return m; }, {}))
    .map(([f, n]) => ({ key: f, label: f, n })).sort((a, b) => b.n - a.n);
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
    ['Compliance', ['compliant', 'grace', 'noncompliant', 'unencrypted']],
    ['To clean up', ['stale', 'duplicates', 'missing', 'ambiguous']],
  ].map(([title, keys]) => [title, keys.map(k => ({ key: k, label: GRAPH_FILTERS[k][0], n: live.filter(GRAPH_FILTERS[k][2]).length })).filter(r => r.n)]).filter(g => g[1].length) : [];
  const attention = [
    [wEnded, 'bad', 'Warranty ended', `${wEnded === 1 ? 'device' : 'devices'} in use`, 'data-ovw="ended"'],
    [wSoon, 'warn', 'Warranty ends soon', `within ${WARRANTY_SOON_DAYS} days`, 'data-ovw="soon"'],
    [due.length, 'warn', 'Contract notice due', `within ${NOTICE_SOON_DAYS} days: ${due.slice(0, 3).map(c => c.name).join(', ')}${due.length > 3 ? '…' : ''}`, 'data-ovtab="contracts"'],
    [over.length, 'bad', 'Licences over-used', over.slice(0, 3).map(l => l.name).join(', ') + (over.length > 3 ? '…' : ''), 'data-ovtab="sw"'],
    [nOld, 'warn', 'Check by hand', 'not scanned by Lansweeper for over 3 months', 'data-ovscan="1"'],
    ...(SYNC.graph ? ['noncompliant', 'unencrypted'].map(k => [live.filter(GRAPH_FILTERS[k][2]).length, GRAPH_FILTERS[k][1], GRAPH_FILTERS[k][0], 'in Microsoft Intune', `data-ovintune="${k}"`]) : []),
    ...osEnded.map(([fam, n]) => [n, 'bad', `${fam}: no more updates`, 'the maker has ended support; upgrade or replace', `data-ovos="${esc(fam)}"`]),
    [repair, 'warn', 'In repair', repair === 1 ? 'device' : 'devices', 'data-ovs="repair"'],
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
  $('#toolbar').innerHTML = `<b>Overview</b><span class="muted">${compact(objs.length)} objects</span>${leftFilters() || st.q.trim() ? '<span class="muted hide-n">· counts all objects; your filters apply to Cards, Table and Relationships</span>' : ''}<div class="grow"></div>`;
  $('#view').innerHTML = `<div class="ov">
    <div class="ov-kpis">
      ${tile('Devices in use', compact(inUse.length), `${compact(stock)} in stock · ${compact(live.length - inUse.length - stock)} other`, 'data-ovs="active"')}
      ${/* Topics, not a sum: the rows count devices, contracts and licences, and one device can be in several rows. */ ''}
      ${tile('Needs attention', compact(attention.length), attention.length ? (attention.length === 1 ? '1 topic: ' : `${attention.length} topics: `) + attention.map(a => a[2]).slice(0, 2).join(', ') + (attention.length > 2 ? '…' : '') : 'Nothing right now')}
      ${tile('Contracts and licences', year ? money(year) : '—', year ? 'per year, running' : 'No costs recorded', 'data-ovtab="contracts"')}
      ${tile('Value of devices in use', priced ? money(value) : '—', priced ? `price known for ${compact(priced)} of ${compact(inUse.length)}` : 'Add prices on the devices')}
    </div>
    <div class="ov-cols">
      <div class="panelbox"><div class="hdr">Needs attention <span class="cnt">${attention.length || 'none'}</span></div>
        ${attention.length ? `<div class="ov-att">${attention.map(([n, cls, label, sub, attr]) => `<button class="ov-row" ${attr}><span class="chip ${cls}">${compact(n)}</span><span><b>${esc(label)}</b><small>${esc(sub)}</small></span></button>`).join('')}</div>`
          : '<div class="chain"><span class="muted">Nothing needs attention: no ended warranties, notices due or licences over-used.</span></div>'}
      </div>
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
    </div></div>`;
  /* Each line opens the list it counts: filters are reset first, so the list shows what the line said. */
  const go = (tab, set = {}) => { resetFilters(); Object.assign(st, set); st.tab = tab; view(); };
  const v = $('#view');
  v.querySelectorAll('[data-ovt]').forEach(b => b.onclick = () => go('cards', { type: b.dataset.ovt, live: true }));
  v.querySelectorAll('[data-ovl]').forEach(b => b.onclick = () => go('cards', { loc: b.dataset.ovl, live: true }));
  v.querySelectorAll('[data-ovintune]').forEach(b => b.onclick = () => go('table', { intune: b.dataset.ovintune, live: true }));
  v.querySelectorAll('[data-ovos]').forEach(b => b.onclick = () => go('table', { osFam: b.dataset.ovos, live: true }));
  v.querySelectorAll('[data-ovscan]').forEach(b => b.onclick = () => go('table', { scanOld: true, live: true }));
  v.querySelectorAll('[data-ovs]').forEach(b => b.onclick = () => go('table', { status: b.dataset.ovs }));
  v.querySelectorAll('[data-ovw]').forEach(b => b.onclick = () => go('table', { warranty: b.dataset.ovw, status: 'active' }));
  /* Contracts and Software open without a search left from before, so every due contract or over-used licence shows. */
  v.querySelectorAll('[data-ovcert]').forEach(b => b.onclick = () => { st.setTab = 'maintenance'; openSettings(); });
  v.querySelectorAll('[data-ovtab]').forEach(b => b.onclick = () => { st.ctQ = st.swQ = ''; st.tab = b.dataset.ovtab; view(); });
}
