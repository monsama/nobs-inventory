/* Settings → Data sources: what each source brings into the inventory, who wins when several know a field, and how each
   is set up here right now. Drawn from sync-map.js (the lists the syncs themselves use) and from the current settings,
   so it changes with them and is never out of date. */
import { $, LS_ON, SYNC, esc, st } from './01-core.js';
import { AD_FILL, GRAPH_FILL, LS_FIELDS, NEVER, PEOPLE_SOURCES, PRECEDENCE, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL } from './sync-map.js';
import { SERVER } from './07-render.js';
import { runOf, summary, when } from './16-sync.js';

/* What a source does with one field, as a cell: writes it, fills it while empty, only shows its value beside the field
   (to pick from on the device), or nothing. */
const CELL = {
  writes: ['ds-w', 'Writes', 'Sets the field at every sync'],
  fills: ['ds-f', 'Fills empty', 'Fills the field while it is empty, or where a weaker source filled it'],
  shown: ['ds-s', 'Shown only', 'Its value is shown beside the field, to pick on the device; the field is not written'],
  off: ['ds-o', 'Off', 'This source is not set up or turned off'],
  none: ['ds-n', '—', 'This source does not know this field'],
};
const cell = k => { const [cls, text, tip] = CELL[k]; return `<td class="${cls}" title="${esc(tip)}">${esc(text)}</td>`; };

export function renderSetSources(){
  const root = $('#setSources'); if (!root) return;
  const policy = st.policy || {};
  const on = { ls: LS_ON(), ad: !!(SERVER.ldap || (st.ldap && st.ldap.url)), graph: !!(SERVER.graph || SYNC.graph), defender: false };
  /* Defender is read by the Entra & Intune sync, when turned on there. */
  on.defender = on.graph && !!SYNC.defender;
  on.autopilot = on.graph;
  const intake = src => (st.intake || {})[src] === 'direct' ? 'go straight into the inventory' : 'wait in To review';

  /* One card per source: set up or not, its last run, where its new devices go and whether it fills fields. */
  const card = (src, runKey, lines) => {
    const r = runKey ? runOf(runKey) : null;
    const run = !runKey ? '' : !r ? 'Not run yet' : r.ok ? `Last run ${when(r.at)}${r.how === 'push' ? ' (push)' : ''}: ${summary(runKey, r.counts)}` : `Last run ${when(r.at)} failed: ${r.error || ''}`;
    return `<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${esc(SOURCE_LABEL[src])}</b><span class="chip ${on[src] ? 'ok' : ''}">${on[src] ? 'On' : 'Not set up'}</span></div>
      ${run ? `<div class="muted ds-run${r && !r.ok ? ' err' : ''}">${esc(run)}</div>` : ''}<ul>${lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  };
  const cards = [
    card('ls', 'lansweeper', [`New devices ${intake('lansweeper')}`, st.mergeTwins ? 'Docking-station records are merged into their device' : '', st.skipIpOnly ? 'Devices named only by an IP address wait in To review' : '']),
    card('ad', 'ldap', [`New devices ${intake('ad')}`, st.fillAd === false ? 'Fills no fields (only shown beside them)' : 'Fills empty fields']),
    card('graph', 'graph', [`New devices ${intake('graph')}`, st.fillGraph === false ? 'Fills no fields (only shown beside them)' : 'Fills empty fields']),
    card('defender', '', ['Read with the Entra & Intune sync, when turned on there']),
  ].join('');

  /* Every field a sync knows, with what each source does with it under the current settings. */
  const keys = Object.keys(SYNC_FIELD_LABEL).filter(k => LS_FIELDS.includes(k) || GRAPH_FILL[k] || AD_FILL[k]);
  const lsCell = k => !LS_FIELDS.includes(k) ? 'none' : !on.ls ? 'off' : policy[k] ? 'writes' : 'shown';
  const dirCell = (map, src, fill) => k => !map[k] ? 'none' : !on[src] ? 'off' : fill === false ? 'shown' : 'fills';
  const graphCell = dirCell(GRAPH_FILL, 'graph', st.fillGraph), adCell = dirCell(AD_FILL, 'ad', st.fillAd);
  const matrix = `<table class="grid mini ds-matrix"><thead><tr><th>Field</th><th>${esc(SOURCE_LABEL.ls)}</th><th>Intune</th><th>${esc(SOURCE_LABEL.ad)}</th></tr></thead><tbody>
    ${keys.map(k => `<tr><th scope="row">${esc(SYNC_FIELD_LABEL[k])}</th>${cell(lsCell(k))}${cell(graphCell(k))}${cell(adCell(k))}</tr>`).join('')}</tbody></table>`;
  const legend = `<div class="ds-legend">${['writes', 'fills', 'shown', 'off'].map(k => `<span class="${CELL[k][0]}"><b>${CELL[k][1]}</b> ${esc(CELL[k][2].toLowerCase())}</span>`).join('')}</div>`;

  const extras = Object.entries(SOURCE_EXTRAS).map(([src, list]) => `<div class="ds-card${on[src] ? '' : ' off'}"><div class="ds-head"><b>${esc(SOURCE_LABEL[src])}</b></div>
    <dl class="ds-dl">${list.map(([what, how]) => `<dt>${esc(what)}</dt><dd>${esc(how)}</dd>`).join('')}</dl></div>`).join('');

  root.innerHTML = `<div class="panelbox"><div class="hdr">Sources</div><p class="note ds-intro">What each source brings into the inventory and how it is set up here now. This page is drawn from the same lists the syncs use, so it always shows what they do.</p><div class="ds-cards">${cards}</div></div>
    <div class="panelbox"><div class="hdr">Who wins</div><ol class="ds-order">${PRECEDENCE.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <p class="note ds-intro">Every source's value stays visible beside the field on the device page, where another can be picked for that device.</p></div>
    <div class="panelbox"><div class="hdr">Device fields</div><div class="ds-scroll">${matrix}</div>${legend}</div>
    <div class="panelbox"><div class="hdr">Beyond the fields</div><div class="ds-cards ds-wide">${extras}</div></div>
    <div class="panelbox"><div class="hdr">People</div><dl class="ds-dl ds-pad">${PEOPLE_SOURCES.map(([what, how]) => `<dt>${esc(what)}</dt><dd>${esc(how)}</dd>`).join('')}</dl></div>
    <div class="panelbox"><div class="hdr">Never</div><ul class="ds-never">${NEVER.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
}
