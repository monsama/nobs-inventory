/* Software: a device's software panel, and the Software view of all packages (split out of 03-object-modals.js, which re-exports it). */
import './srcpick.js';
import { bindLicences, licenceMark, licencesFor, licencesPanel } from './09-costs.js';
import { $, TYPES, hist, now, objs, st, tico, toast } from './01-core.js';
import { render } from './07-render.js';
import { isAdmin } from './04-settings.js';
import { html, rawHtml } from './html.js';




export const SW_TYPES = ['pc','notebook','server'];
export function softwarePanel(o){
  const list = o.software || [], edit = isAdmin();
  return String(html`<div class="panelbox"><div class="hdr">Software <span class="cnt">${list.length ? list.length + ' installed' : 'none'}</span></div>
    ${list.length ? html`<div style="overflow-x:auto"><table class="grid mini" style="min-width:0"><thead><tr><th>Name</th><th>Version</th>${edit ? html`<th class="rm-cell"></th>` : ''}</tr></thead><tbody>
    ${list.map((p, i) => html`<tr><td><button type="button" class="link sw-go" data-swgo="${p.name}" title="Show every device ${p.name} is installed on">${p.name}</button></td><td class="mono">${p.version || ''}</td>${edit ? html`<td class="rm-cell"><button class="icon ghost" data-swdel="${i}" aria-label="Remove ${p.name}">×</button></td>` : ''}</tr>`)}
    </tbody></table></div>` : html`<p class="note lempty">No software recorded yet: Lansweeper sends it, or add it below.</p>`}
    <div class="addrel"><input id="swName" placeholder="Name, e.g. Web browser" style="flex:1;min-width:140px" aria-label="Software name"><input id="swVer" placeholder="Version" style="width:110px" aria-label="Version"><button id="swAdd">Add</button></div></div>`);
}
/* Wires the Software panel of a device page: × removes a package, Add adds one by name and version. Each gets a
   history line. */
export function bindSoftware(o){
  /* A package's name opens Software with that package unfolded: every device it is installed on, with its version. */
  $('#view').querySelectorAll('[data-swgo]').forEach(b => b.onclick = () => {
    const name = /** @type {HTMLElement} */ (b).dataset.swgo;
    st.swOpen = [...new Set([...(st.swOpen || []), name])]; st.swFocus = name; st.tab = 'sw'; render(false);
  });
  $('#view').querySelectorAll('[data-swdel]').forEach(b => b.onclick = () => {
    const p = o.software.splice(+b.dataset.swdel, 1)[0]; hist(o, now(), 'Software removed: ' + p.name); render();
  });
  const add = $('#swAdd'); if (!add) return;
  add.onclick = () => {
    const name = $('#swName').value.trim();
    if (!name){ toast('Give the software a name.'); return; }
    o.software = [...(o.software || []), {name, version: $('#swVer').value.trim()}];
    hist(o, now(), 'Software added: ' + name); render();
  };
}
/* Every package across the PCs and servers. A package opens in place to list the devices it is installed on,
   with the version on each; a version other than the most common one is marked, as it is usually the one to update. */
const swPackages = () => {
  const map = {};
  objs.forEach(o => (o.software || []).forEach(p => {
    const r = (map[p.name] ??= {name: p.name, counts: {}, devices: []});
    const v = p.version || '-';
    r.counts[v] = (r.counts[v] || 0) + 1;
    if (!r.devices.includes(o)) r.devices.push(o);
  }));
  return Object.values(map).map(r => ({...r, versions: Object.entries(r.counts).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0], undefined, {numeric: true}))}));
};
const versionOf = (d, name) => ((d.software || []).find(x => x.name === name) || {}).version || '-';
const swChevron = rawHtml('<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
function swDetailHtml(r){
  const common = r.versions[0][0], mixed = r.versions.length > 1;
  const devs = [...r.devices].sort((x, y) => versionOf(y, r.name).localeCompare(versionOf(x, r.name), undefined, {numeric: true}) || x.name.localeCompare(y.name));
  return html`<tr class="sw-detail" data-swd="${r.name}"><td colspan="4"><div class="sw-devs">
    <table class="sw-sub"><thead><tr><th>Device</th><th class="sw-opt">Type</th><th>Location</th><th class="sw-opt">User</th><th>Version</th></tr></thead><tbody>
    ${devs.map(d => { const v = versionOf(d, r.name), odd = mixed && v !== common; return html`<tr>
      <td><span class="sw-dev">${rawHtml(tico(d.type, 'tico sm'))}<a class="link mono" data-open="${d.id}">${d.name}</a></span></td>
      <td class="sw-opt">${TYPES[d.type] ? TYPES[d.type].short : d.type}</td><td>${(d.loc || '').replace(' / ', ' · ')}</td><td class="sw-opt">${d.user || ''}</td>
      <td><span class="vchip${odd ? ' odd' : ''}" ${odd ? html`title="Most devices have ${common}"` : ''}>${v}</span></td></tr>`; })}
    </tbody></table></div></td></tr>`;
}
/* The Software tab: the Licences box, then every package with its versions and how many devices have it, sorted by
   name or count and filtered by the search. A row opens in place to list its devices. */
export function renderSoftware(){
  const all = swPackages();
  st.swOpen = (st.swOpen || []).filter(n => all.some(r => r.name === n));
  st.swSort ??= 'name';
  const devCount = objs.filter(o => (o.software || []).length).length;
  $('#toolbar').innerHTML = html`<span class="muted" id="swCount"></span><div class="grow"></div>
    <button id="swCollapse" ${st.swOpen.length ? '' : 'hidden'}>Collapse all</button><span class="muted hide-n">Add software on a PC or server</span>`;
  if (!all.length){ $('#view').innerHTML = html`<div class="sw-page">${rawHtml(licencesPanel())}<div class="empty">No software recorded yet. Add it on a PC or server.</div></div>`; bindLicences(); return; }
  /* data-tb: the generic column tools (filter row, drag, resize) stay off; this table has its own search and sort. */
  $('#view').innerHTML = html`<div class="sw-page">${rawHtml(licencesPanel())}<div class="gridwrap" style="height:auto"><table class="grid sw" data-tb="own"><thead><tr>
    <th class="sw-tgcol" aria-label="Open"></th><th data-swsort="name" class="sw-name" ${st.swSort === 'name' ? html`data-sort="asc"` : ''}>Package</th><th class="sw-ver">Versions</th><th data-swsort="devices" class="n sw-cnt" ${st.swSort === 'devices' ? html`data-sort="desc"` : ''}>Devices</th></tr></thead><tbody id="swBody"></tbody></table></div></div>`;
  bindLicences();
  const max = Math.max(...all.map(r => r.devices.length));
  const body = () => {
    const q = (st.q || '').trim().toLowerCase();
    /* A search for a device opens the packages it has, so the match is in sight. */
    const hits = r => !q ? 'none' : r.name.toLowerCase().includes(q) || r.versions.some(([v]) => v.toLowerCase().includes(q)) ? 'package' : r.devices.some(d => d.name.toLowerCase().includes(q)) ? 'device' : '';
    const rows = all.filter(r => hits(r)).sort(st.swSort === 'devices' ? (a, b) => b.devices.length - a.devices.length || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name));
    const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    $('#swCount').textContent = q ? `${rows.length} of ${n(all.length, 'package')}` : `${n(all.length, 'package')} · ${n(devCount, 'device')}`;
    $('#swBody').innerHTML = rows.length ? html`${rows.map(r => {
      const open = st.swOpen.includes(r.name) || hits(r) === 'device';
      const shown = r.versions.slice(0, 4);
      return html`<tr class="sw-row${open ? ' open' : ''}" data-sw="${r.name}">
        <td class="sw-tgcol"><button class="sw-tg icon ghost" aria-expanded="${String(open)}" aria-label="${open ? 'Hide' : 'Show'} the devices with ${r.name}">${swChevron}</button></td>
        <td><b>${r.name}</b>${licencesFor(r.name).map(l => html` ${rawHtml(licenceMark(l))}`)}</td>
        <td class="sw-ver"><span class="vchips">${shown.map(([v, n]) => html`<span class="vchip">${v}${r.versions.length > 1 ? html`<i>${n}</i>` : ''}</span>`)}${r.versions.length > 4 ? html`<span class="muted">+${r.versions.length - 4} more</span>` : ''}</span></td>
        <td class="n"><span class="sw-bar"><span style="width:${Math.max(4, Math.round(r.devices.length / max * 100))}%"></span></span>${r.devices.length}</td></tr>${open ? swDetailHtml(r) : ''}`;
    })}` : html`<tr><td colspan="4" class="muted" style="padding:14px">Nothing matches “${st.q}”.</td></tr>`;
    $('#swCollapse').hidden = !st.swOpen.length;
    /* Opened from a device's package: that package in sight, marked a moment. */
    if (st.swFocus){
      const row = /** @type {HTMLElement|null} */ ($('#swBody').querySelector(`[data-sw="${CSS.escape(st.swFocus)}"]`)); delete st.swFocus;
      if (row){ row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1600); }
    }
  };
  body();
  /* Opening and closing changes only that package's rows, so the list keeps its scroll position. */
  const toggle = tr => {
    const name = tr.dataset.sw, open = !tr.classList.contains('open');
    st.swOpen = open ? [...st.swOpen, name] : st.swOpen.filter(n => n !== name);
    tr.classList.toggle('open', open);
    const btn = tr.querySelector('.sw-tg'); btn.setAttribute('aria-expanded', open); btn.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} the devices with ${name}`);
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('sw-detail')) next.remove();
    if (open) tr.insertAdjacentHTML('afterend', swDetailHtml(all.find(r => r.name === name)));
    $('#swCollapse').hidden = !st.swOpen.length;
  };
  $('#swBody').addEventListener('click', e => {
    if (e.target.closest('[data-open]')) return;   /* a device link opens the device */
    const tr = e.target.closest('tr.sw-row'); if (tr) toggle(tr);
  });
  $('#swCollapse').onclick = () => { st.swOpen = []; body(); };
  $('#view').querySelectorAll('[data-swsort]').forEach(th => th.onclick = () => { st.swSort = th.dataset.swsort; renderSoftware(); });
}
/* A patch panel's ports, with the device on each one and the trunk into the switch. */
