/* The overview: the inventory at a glance. A row of figures, what needs attention, and the devices by type and by
   site. Every line leads to the list behind it, filtered. */
import { $, COSTS, LOCS, STATUS, TYPES, WARRANTY_SOON_DAYS, esc, objs, st, tico, warrantyState } from './01-core.js';
import { NOTICE_SOON_DAYS, contractStatus, yearlyCost } from './costs.js';
import { contractsDue, licencesOver, money } from './09-costs.js';
import { render } from './07-render-plans.js';

const compact = n => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
/* A list of bars, longest first, each a button that opens the list behind it. One hue: the length is the message. */
const bars = (rows, attr) => {
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<div class="ov-bars">${rows.map(r => `<button class="ov-bar" ${attr}="${esc(r.key)}" title="${esc(r.label)}: ${r.n} devices">
    <span class="ov-lbl">${r.icon || ''}<span>${esc(r.label)}</span></span><span class="ov-track"><span style="width:${Math.max(2, Math.round(r.n / max * 100))}%"></span></span><span class="ov-n">${compact(r.n)}</span></button>`).join('')}</div>`;
};

export function renderOverview(){
  const live = objs.filter(o => o.status !== 'retired');
  const inUse = objs.filter(o => o.status === 'active');
  const wEnded = inUse.filter(o => warrantyState(o) === 'ended').length, wSoon = inUse.filter(o => warrantyState(o) === 'soon').length;
  const due = contractsDue(), over = licencesOver();
  const running = COSTS.contracts.filter(c => contractStatus(c).state !== 'ended');
  const year = running.reduce((t, c) => t + yearlyCost(c), 0) + COSTS.licences.reduce((t, l) => t + yearlyCost(l), 0);
  const value = inUse.reduce((t, o) => t + (typeof o.price === 'number' ? o.price : 0), 0), priced = inUse.filter(o => typeof o.price === 'number').length;
  const repair = objs.filter(o => o.status === 'repair').length, stock = objs.filter(o => o.status === 'stock').length;
  const attention = [
    [wEnded, 'bad', 'Warranty ended', `${wEnded === 1 ? 'device' : 'devices'} in use`, 'data-ovw="ended"'],
    [wSoon, 'warn', 'Warranty ends soon', `within ${WARRANTY_SOON_DAYS} days`, 'data-ovw="soon"'],
    [due.length, 'warn', 'Contract notice due', `within ${NOTICE_SOON_DAYS} days: ${due.slice(0, 3).map(c => c.name).join(', ')}${due.length > 3 ? '…' : ''}`, 'data-ovtab="contracts"'],
    [over.length, 'bad', 'Licences over-used', over.slice(0, 3).map(l => l.name).join(', ') + (over.length > 3 ? '…' : ''), 'data-ovtab="sw"'],
    [repair, 'warn', 'In repair', repair === 1 ? 'device' : 'devices', 'data-ovs="repair"'],
  ].filter(a => a[0] > 0);
  const tile = (label, value, sub, attr = '') => `<${attr ? `button ${attr}` : 'div'} class="ov-tile"><span class="ov-tl">${label}</span><span class="ov-tv">${value}</span><span class="ov-ts">${sub}</span></${attr ? 'button' : 'div'}>`;
  const byType = Object.entries(live.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {})).map(([t, n]) => ({ key: t, label: TYPES[t] ? TYPES[t].label : t, n, icon: tico(t, 'tico sm') })).sort((a, b) => b.n - a.n);
  const sites = [...new Set(LOCS.map(l => l.split(' / ')[0]))];
  const bySite = sites.map(s => ({ key: s, label: s, n: live.filter(o => String(o.loc || '').split(' / ')[0] === s).length })).filter(r => r.n).sort((a, b) => b.n - a.n);
  const noLoc = live.filter(o => !o.loc).length;
  $('#toolbar').innerHTML = `<b>Overview</b><span class="muted">${compact(objs.length)} objects</span><div class="grow"></div>`;
  $('#view').innerHTML = `<div class="ov">
    <div class="ov-kpis">
      ${tile('Devices in use', compact(inUse.length), `${compact(stock)} in stock · ${compact(live.length - inUse.length - stock)} other`, 'data-ovs="active"')}
      ${tile('Needs attention', compact(attention.reduce((t, a) => t + a[0], 0)), attention.length ? attention.map(a => a[2]).slice(0, 2).join(', ') : 'Nothing right now')}
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
      <div class="panelbox"><div class="hdr">By status</div>${objs.length ? bars(Object.entries(STATUS).map(([k, v]) => ({ key: k, label: v.label, n: objs.filter(o => o.status === k).length })).filter(r => r.n), 'data-ovs') : '<div class="chain"><span class="muted">No devices yet.</span></div>'}</div>
    </div></div>`;
  /* Each line opens the list it counts: filters are reset first, so the list shows what the line said. */
  const go = (tab, set = {}) => { Object.assign(st, { type: null, loc: null, status: null, warranty: null, q: '' }, set); const s = $('#search'); if (s) s.value = ''; st.tab = tab; render(); };
  const v = $('#view');
  v.querySelectorAll('[data-ovt]').forEach(b => b.onclick = () => go('cards', { type: b.dataset.ovt }));
  v.querySelectorAll('[data-ovl]').forEach(b => b.onclick = () => go('cards', { loc: b.dataset.ovl }));
  v.querySelectorAll('[data-ovs]').forEach(b => b.onclick = () => go('table', { status: b.dataset.ovs }));
  v.querySelectorAll('[data-ovw]').forEach(b => b.onclick = () => go('table', { warranty: b.dataset.ovw, status: 'active' }));
  v.querySelectorAll('[data-ovtab]').forEach(b => b.onclick = () => { st.tab = b.dataset.ovtab; render(); });
}
