/* The device page's sources: what Lansweeper, Microsoft Entra and Intune (with Defender) and Active Directory say of a
   device, one tab each in the Sources panel. */
import { GRAPH_STALE_DAYS, GRAPH_TYPES, HISTORY, JOIN_INFO, LS_ON, SYNC, byId, complianceChip, dayText, defenderState, esc, feedOwns, graphAmbiguousOf, graphLast, graphStale, joinOf, neverScanned, scanChip, scanOld, st, syncChip, syncOf } from './01-core.js';
import { dateTimeText } from './dates.js';
import { isIntune, otherManager } from './intune.js';

/* The days of a device in Lansweeper and here, each saying whose it is: Lansweeper's last scan that worked, the last one it
   tried and when it found the device; this app's last receipt of it from Lansweeper, and when the device came here. */
function lsDates(o){
  const f = o.feed, row = (k, v, tip = '') => `<dt>${k}</dt><dd style="font-family:inherit"${tip ? ` title="${esc(tip)}"` : ''}>${v}</dd>`;
  const first = (HISTORY[o.id] || []).at(-1), added = f.created || (first && /^(Created|Added)\b/.test(first.msg) ? first.t : '');
  const never = neverScanned(o);
  return [
    row('Last scanned', f.scanned ? esc(dayText(f.scanned)) + (scanOld(o) ? `<p class="fieldnote warn">Lansweeper has not scanned it for over three months: it may be gone, or Lansweeper cannot log on to it. Check it by hand, then retire it or fix the scan in Lansweeper.</p>` : '')
      : f.tried ? `<span class="muted">never</span>${never ? `<p class="fieldnote warn">Lansweeper tries to scan it but never has: its details are only what Active Directory knows. Check it by hand, or why Lansweeper cannot reach or log on to it (its Scan issues tab).</p>` : ''}` : '<span class="muted">not sent by this push script</span>',
      'When a Lansweeper scan of this device last worked'),
    f.tried && f.tried !== f.scanned ? row('Last scan attempt', esc(dayText(f.tried)), 'When Lansweeper last tried to scan it, whether or not that worked') : '',
    f.firstSeen ? row('In Lansweeper since', esc(dayText(f.firstSeen)), 'When Lansweeper first found it') : '',
    row('Received', esc(f.seen || 'not yet'), 'When this app last received it from Lansweeper (the push script or an import). It says nothing about a scan.'),
    added ? row('Added here', esc(added), 'When this device was added to NOBS Inventory') : '',
    f.linked ? row('Linked', esc(f.linked), 'When this device was first matched to its Lansweeper asset') : '',
  ].join('');
}
/* Source of the object: its sync status, when Lansweeper last saw it, and what is taken from it. Attach and Detach live here. */
export function feedPanel(o){
  if (!LS_ON()) return '';
  const s = syncOf(o);
  const head = `<div class="hdr">Lansweeper${o.feed ? ` <span class="cnt">${esc(o.feed.sys)}${o.feed.ref ? ' · ' + esc(o.feed.ref) : ''}</span>` : ''}</div>`;
  const dl = (extra = '') => `<dl class="lsbox"><dt>Status</dt><dd>${scanOld(o) ? scanChip(o) : syncChip(o)}</dd>
    ${o.feed ? lsDates(o) : ''}
    <dt>Matched by</dt><dd style="font-family:inherit">Serial number, or a name that only one object has</dd>${extra}</dl>`;
  if (!o.feed){
    const note = o.detached ? 'Detached: the sync leaves this object alone and its fields are yours. Attach it to let the sync fill it in again.'
      : 'Entered by hand. The next sync links it when its serial number or unique name matches a Lansweeper record.';
    return `<div class="panelbox">${head}${dl()}<div class="addrel"><span class="note" style="flex:1">${note}</span>${o.detached ? '<button id="attachFeed" class="primary">Attach</button>' : ''}</div></div>`;
  }
  const note = o.excluded ? 'Excluded from the sync, so Lansweeper does not change this object. Include it again from the More menu.'
    : 'Where a value comes from shows beside each field; click the mark to compare the sources or fix one. Name and serial number are never overwritten.';
  /* Software and Links sit in the same list as the rest, so their boxes line up with the values above. */
  const takenBox = (k, text) => `<label class="pchk lsbox-check"><input type="checkbox" data-lslist="${k}" ${feedOwns(o, k) ? 'checked' : ''}> ${text}</label>`;
  return `<div class="panelbox">${head}${dl(o.excluded || o.detached ? '' : `<dt>Software</dt><dd class="plain">${takenBox('software', 'From Lansweeper')}</dd><dt>Links</dt><dd class="plain">${takenBox('links', 'From Lansweeper (monitors)')}</dd>`)}
    <div class="addrel"><span class="note" style="flex:1">${note}</span>${s.k === 'excluded' ? '' : '<button id="detachFeed">Detach</button>'}</div></div>`;
}
/* What Microsoft Entra and Intune report about the device, read-only: how it is joined and managed, its compliance and
   encryption, its primary user and when it was last heard of. A device of a type expected there that was not found
   says so. */
const graphTime = dateTimeText;
export function graphPanel(o){
  if (!SYNC.graph) return '';
  const g = o.graph;
  const amb = graphAmbiguousOf(o);
  const ambNote = amb ? `<p class="note" style="padding:10px 12px 0"><span class="chip warn">Not matched</span> Graph has a device ${amb.by === 'serial' ? `with the serial number ${esc(amb.serial)}` : `named ${esc(amb.name)}`}, and so do ${amb.devices.length - 1 === 1 ? 'another device' : (amb.devices.length - 1) + ' other devices'} here: ${amb.devices.filter(id => id !== o.id).map(id => { const x = byId(id); return x ? esc(x.code + ' ' + x.name) : ''; }).filter(Boolean).join(', ')}. It was put on none of them. Give them distinct ${amb.by === 'serial' ? 'serial numbers' : 'names'}.</p>` : '';
  const adOnly = o.inAd ? ' It has a computer account in the on-premises Active Directory: joined to AD only.' : '';
  /* A server is in Defender, not in Entra or Intune: Defender alone, in a panel of its own. */
  if (!g && !GRAPH_TYPES.includes(o.type) && !amb && o.defender) return `<div class="panelbox"><div class="hdr">Defender for Endpoint</div><dl class="lsbox"><dt>Defender</dt><dd style="font-family:inherit">${defenderRow(o)}</dd></dl></div>`;
  const row = (k, v) => v ? `<dt>${k}</dt><dd style="font-family:inherit">${v}</dd>` : '';
  /* Registered in Windows Autopilot but not set up yet: no record in Entra or Intune, only Autopilot's. */
  if (!g && o.autopilot) return `<div class="panelbox"><div class="hdr">Entra &amp; Intune</div><p class="note" style="padding:10px 12px 0">Registered in Windows Autopilot, not set up yet: Intune names it once it is.</p><dl class="lsbox">${row('Autopilot', autopilotText(o.autopilot))}</dl></div>`;
  if (!g) return (GRAPH_TYPES.includes(o.type) || amb) && o.status !== 'retired'
    ? `<div class="panelbox"><div class="hdr">Entra &amp; Intune</div>${ambNote}${amb ? '<div style="height:10px"></div>' : `<p class="note" style="padding:10px 12px">Not found in Microsoft Entra or Intune at the last sync, by serial number or name.${adOnly}</p>`}</div>` : '';
  const last = graphLast(o);
  const enc = g.encrypted === 'yes' ? '<span class="chip ok">Encrypted</span>' : g.encrypted === 'no' ? '<span class="chip warn">Not encrypted</span>' : '';
  const others = g.gone ? [] : g.others || [];
  /* Records disabled in Entra are kept there on purpose before they are deleted: listed, but not a duplicate to fix. */
  const live = others.filter(x => !x.disabled), off = others.length - live.length;
  const otherRows = others.map(x => `<li>${x.disabled ? '<b>Disabled</b> · ' : ''}${esc(x.join || 'Unknown join')}${x.managed ? ' · ' + esc(x.managed) : ''}${x.last ? ' · last heard of ' + esc(graphTime(x.last).slice(0, 10)) : ' · never signed in'}${x.serial && x.serial !== o.serial ? ' · serial ' + esc(x.serial) : ''}</li>`).join('');
  return `<div class="panelbox"><div class="hdr">Entra &amp; Intune${g.added ? ' <span class="cnt">added from Graph</span>' : ''}</div>${ambNote}
    ${g.gone ? `<p class="note" style="padding:10px 12px 0"><span class="chip warn">Gone</span> Not in Entra or Intune any more since the sync of ${esc(g.gone)}: deleted there, or renamed. Below is what Graph last said about it.${adOnly}</p>` : ''}
    ${live.length ? `<div class="note" style="padding:10px 12px 0"><span class="chip warn">${live.length + 1} records in Entra</span> This device is listed more than once.${off ? ` ${off} more ${off === 1 ? 'is' : 'are'} disabled.` : ''} The current record is shown below; the other${others.length === 1 ? ' is' : 's are'}:<ul style="margin:4px 0 0 18px;padding:0">${otherRows}</ul>Delete old records in the Entra admin center (Devices → All devices) so sign-in and policies use the right one.</div>` : ''}
    ${!live.length && off ? `<div class="note" style="padding:10px 12px 0"><span class="chip kept">${off} disabled ${off === 1 ? 'record' : 'records'} in Entra</span> Older records of this device, switched off in Entra. Delete them there when they are no longer needed:<ul style="margin:4px 0 0 18px;padding:0">${otherRows}</ul></div>` : ''}
    ${g.disabled ? '<p class="note" style="padding:10px 12px 0"><span class="chip warn">Disabled in Entra</span> This device\'s record is switched off in Entra: it cannot sign in there.</p>' : ''}
    <dl class="lsbox">
      ${row(g.gone ? 'Was' : 'Joined', g.gone ? esc(g.join || '') : `<span title="${esc(JOIN_INFO[joinOf(o)] || '')}">${esc(joinOf(o) || 'Not joined')}</span>${JOIN_INFO[joinOf(o)] ? `<span class="muted"> · ${esc(JOIN_INFO[joinOf(o)])}</span>` : ''}`)}
      ${row('Intune', isIntune(g.managed) ? `Managed${g.enrolled ? ' since ' + esc(graphTime(g.enrolled).slice(0, 10)) : ''}` : `Not managed${otherManager(g.managed) ? ` <span class="muted">· ${esc(otherManager(g.managed))}</span>` : ''}`)}
      ${isIntune(g.managed) ? row('Compliance', complianceChip(g.compliance)) : ''}
      ${row('Encryption', enc)}
      ${g.jailbroken === 'yes' ? row('Jailbroken', '<span class="chip warn">Yes</span> <span class="muted">· Intune reports the phone as jailbroken or rooted</span>') : ''}
      ${row('Supervised', g.supervised === 'yes' ? 'Yes <span class="muted">· an Apple device under full management</span>' : '')}
      ${row('Category', esc(g.category || ''))}
      ${row('Autopilot', o.autopilot ? autopilotText(o.autopilot) : g.autopilot === 'yes' ? 'Set up with Autopilot' : '')}
      ${row('Primary user', esc([g.ownerName, g.owner && g.owner !== g.ownerName ? g.owner : ''].filter(Boolean).join(' · ')))}
      ${row('Operating system', esc(g.os || ''))}
      ${o.defender ? row('Defender', defenderRow(o)) : ''}
      ${row('Device ID', g.aadId ? `<span class="mono" title="Entra's device ID, as dsregcmd /status shows it on the device">${esc(g.aadId)}</span>` : '')}
      ${row('Object ID', g.entraId ? `<span class="mono" title="The ID of the device's record in Entra (Devices → All devices)">${esc(g.entraId)}</span>` : '')}
      ${row('Intune ID', g.intuneId ? `<span class="mono" title="The device's ID in Intune">${esc(g.intuneId)}</span>` : '')}
      ${row('Phone number', esc(g.phone || ''))}
      ${row('IMEI', g.imei ? `<span class="mono">${esc(g.imei)}</span>` : '')}
      ${row('Owned by', esc(g.ownership || ''))}
      ${row('Free storage', esc(g.free || ''))}
      ${row(g.lastCheckIn ? 'Last check-in' : 'Last sign-in', last ? esc(graphTime(last)) + (graphStale(o) ? ` <span class="chip warn">over ${GRAPH_STALE_DAYS} days ago</span>` : '') : '')}
      ${row('Read', esc(g.seen || ''))}
    </dl>
    <p class="note" style="padding:6px 12px 10px">From Microsoft Graph at the last sync. ${g.added ? 'Graph keeps this device up to date.' : `It fills in fields this device does not have yet${st.fillGraph === false ? ' (turned off in Settings)' : ''}; it changes nothing in Entra or Intune.`}</p></div>`;
}
/* Defender for Endpoint on the device page: health, risk, exposure, antivirus and when it last saw the device. */
function defenderRow(o){
  const d = o.defender, s = defenderState(o);
  const bits = [d.risk && d.risk !== 'None' && !/risk/i.test(s.state) ? `risk ${d.risk.toLowerCase()}` : '', d.exposure && d.exposure !== 'None' ? `exposure ${d.exposure.toLowerCase()}` : '',
    d.av ? `antivirus ${d.av.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}` : '', d.lastSeen ? `last seen ${graphTime(d.lastSeen).slice(0, 10)}` : ''].filter(Boolean);
  return `<span class="chip ${s.cls}">${esc(s.state[0].toUpperCase() + s.state.slice(1))}</span>${bits.length ? ` <span class="muted">· ${esc(bits.join(' · '))}</span>` : ''}`;
}
/* What Windows Autopilot says of a device: its group tag, order number and enrolment state. */
const AP_STATE = { enrolled: 'enrolled', notContacted: 'not set up yet', failed: 'enrolment failed', pendingReset: 'waiting for a reset', blocked: 'blocked' };
function autopilotText(a){
  return [a.groupTag ? `Group tag ${esc(a.groupTag)}` : 'No group tag', a.order ? `order ${esc(a.order)}` : '', a.state ? esc(AP_STATE[a.state] || a.state) : '',
    a.lastContact ? `last contact ${esc(graphTime(a.lastContact).slice(0, 10))}` : ''].filter(Boolean).join(' <span class="muted">·</span> ');
}
/* What Active Directory says of the device's computer account: its last logon and creation, who manages it, where it is,
   what it runs, and its groups (each opens the devices in that group). */
function adPanel(o){
  const groups = o.adGroups || [];
  if (!o.ad && !groups.length) return '';
  const more = o.ad ? adMoreHtml(o.ad) : '';
  return `<div class="panelbox"><div class="hdr">Active Directory</div><dl class="lsbox">
    ${o.ad ? `<dt>Account</dt><dd style="font-family:inherit"><span class="ad-acct">${adAccountHtml(o.ad)}${more ? `<span class="admore">${more}</span>` : ''}</span></dd>` : ''}
    ${groups.length ? `<dt>Groups</dt><dd style="font-family:inherit"><div class="adgroups">${groups.map(g => `<button type="button" class="chip adg" data-adg="${esc(g)}" title="Show the devices in ${esc(g)}">${esc(g)}</button>`).join('')}</div></dd>` : ''}
  </dl></div>`;
}
/* Lansweeper, Entra & Intune and Active Directory in one panel, a tab each, instead of a box each down the page. The tab
   picked stays while the page is open (st.srcTab); a device with one source shows it as before. Each source's panel is
   drawn as it always was and taken apart here: its title becomes the tab, its note in the header goes to the right. */
export function sourcesPanel(o){
  const parts = [['ls', feedPanel(o)], ['graph', graphPanel(o)], ['ad', adPanel(o)]].filter(([, h]) => h);
  if (parts.length < 2) return parts.map(([, h]) => h).join('');
  const t = document.createElement('template');
  const tabs = parts.map(([k, h]) => {
    t.innerHTML = h;
    const box = t.content.firstElementChild, hdr = box.querySelector(':scope > .hdr'), cnt = hdr.querySelector('.cnt');
    const title = [...hdr.childNodes].filter(n => n !== cnt).map(n => n.textContent).join('').trim();
    return { k, title, meta: cnt ? cnt.outerHTML : '', body: [...box.children].filter(x => x !== hdr).map(x => x.outerHTML).join('') };
  });
  const cur = tabs.find(x => x.k === st.srcTab) || tabs[0];
  /* Every source is drawn, the others hidden: a tab shows its own at once, and their buttons are bound like any other. */
  return `<div class="panelbox srcpanel"><div class="hdr srctabs" data-key="Sources"><span class="srctab-list" role="tablist" aria-label="Sources">${tabs.map(x => `<button type="button" role="tab" id="srctab-${x.k}" class="srctab${x === cur ? ' sel' : ''}" aria-selected="${x === cur}" aria-controls="srcbody-${x.k}" data-srctab="${x.k}">${esc(x.title)}</button>`).join('')}</span><span class="grow"></span>${tabs.map(x => `<span class="srcmeta" data-srcmeta="${x.k}" ${x === cur ? '' : 'hidden'}>${x.meta}</span>`).join('')}</div>${tabs.map(x => `<div role="tabpanel" id="srcbody-${x.k}" aria-labelledby="srctab-${x.k}" ${x === cur ? '' : 'hidden'}>${x.body}</div>`).join('')}</div>`;
}
/* The computer account in AD: when it last signed in to the domain (AD updates that only every week or two) and when it was made. */
export const AD_STALE_DAYS = 90;
function adAccountHtml(ad){
  const days = ad.logon ? Math.floor((Date.now() - Date.parse(ad.logon)) / 864e5) : null;
  const logon = ad.logon ? `Last logon ${esc(dayText(ad.logon))}${days > AD_STALE_DAYS ? ` <span class="chip warn" title="AD updates the last logon only every one to two weeks">over ${AD_STALE_DAYS} days ago</span>` : ''}` : 'Never logged on';
  /* One line, the stale mark beside the day as on Entra's Last sign-in: a bare chip in the column would stretch to its width. */
  return `<span class="ad-line">${logon}${ad.created ? ` <span class="muted">· created ${esc(dayText(ad.created))}</span>` : ''}</span>`;
}
/* Who manages the account, where AD says it is and what it runs (from its service principal names). */
function adMoreHtml(ad){
  return [ad.managedBy ? `<span title="managedBy on the computer account">Managed by ${esc(ad.managedBy)}</span>` : '', ad.location ? `<span class="muted" title="location on the computer account">AD location: ${esc(ad.location)}</span>` : '',
    (ad.services || []).length ? `<span class="adsvc">${ad.services.map(x => `<span class="chip" title="From its service principal names in AD">${esc(x)}</span>`).join('')}</span>` : ''].filter(Boolean).join(' ');
}
