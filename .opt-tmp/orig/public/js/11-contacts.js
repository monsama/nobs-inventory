/* Contacts: the company's own IT people and the people at its IT partners who look after the devices. The Contacts tab
   lists them, the company's own first, then each partner company; a device names one internal and one external
   responsible, on its page or for many devices at once in the table. */
import { CONTACTS, COMPANY, $, contactOf, esc, hist, now, objs, st, toast } from './01-core.js';
import { CONTACT_KINDS, CONTACT_MAX, contactLabel, contactProblem } from './contacts.js';
import { closeModal, modal } from './03-object-modals.js';
import { USERS, canEdit, who } from './04-settings.js';
import { queueServerSave, render } from './07-render-plans.js';
import { resetFilters } from './02-views.js';

const newId = () => 'k' + Math.random().toString(36).slice(2, 10);
export const RESP_KEYS = { internal: 'respIn', external: 'respEx' };
/* The devices a contact is responsible for, retired ones left out. */
export const devicesOf = c => objs.filter(o => o.status !== 'retired' && (o.respIn === c.id || o.respEx === c.id));
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
/* How to reach someone: each way a link that opens the mail program or dials, so it works on a phone too. */
const reach = c => [
  c.email ? `<a class="cn-way" href="mailto:${esc(c.email)}" title="Write to ${esc(c.email)}">${esc(c.email)}</a>` : '',
  c.phone ? `<a class="cn-way mono" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}" title="Call ${esc(c.phone)}">${esc(c.phone)}</a>` : '',
  c.mobile ? `<a class="cn-way mono" href="tel:${esc(c.mobile.replace(/[^\d+]/g, ''))}" title="Call the mobile ${esc(c.mobile)}">${esc(c.mobile)} <span class="muted">mobile</span></a>` : '',
].filter(Boolean).join('');
/* The companies already named, for the company field's suggestions (and the contracts' supplier). */
export const contactCompanies = () => [...new Set(CONTACTS.list.filter(c => c.kind === 'external' && c.company).map(c => c.company))].sort((a, b) => a.localeCompare(b));

function contactCard(c){
  const n = devicesOf(c).length;
  return `<div class="cn-card ${c.kind}">
    <div class="cn-head"><span class="cn-avatar" aria-hidden="true">${esc(initials(c.name))}</span>
      <div class="cn-who"><b>${esc(c.name)}</b><span class="muted">${esc([c.role, c.kind === 'external' ? '' : c.company].filter(Boolean).join(' · ') || CONTACT_KINDS[c.kind])}</span></div>
      <button class="icon ghost" data-cnedit="${esc(c.id)}" aria-label="${canEdit() ? 'Edit' : 'Show'} ${esc(c.name)}" title="${canEdit() ? 'Edit' : 'Show'}"><svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg></button></div>
    <div class="cn-ways">${reach(c) || '<span class="muted">No e-mail or phone yet</span>'}</div>
    ${c.note ? `<p class="cn-note">${esc(c.note)}</p>` : ''}
    <div class="cn-foot"><button class="link" data-cndevs="${esc(c.id)}" ${n ? '' : 'disabled'} title="Show the devices ${esc(c.name)} is responsible for">${n ? `Responsible for ${n} ${n === 1 ? 'device' : 'devices'}` : 'No devices yet'}</button></div>
  </div>`;
}

export function renderContacts(){
  const q = (st.cnQ || '').trim().toLowerCase(), kind = st.cnKind || '';
  const all = CONTACTS.list;
  const hit = c => (!kind || c.kind === kind) && (!q || [c.name, c.company, c.role, c.email, c.phone, c.mobile, c.note].some(v => String(v || '').toLowerCase().includes(q)));
  const shown = all.filter(hit);
  $('#toolbar').innerHTML = `<input id="cnQ" type="search" placeholder="Find a contact, company or number…" aria-label="Find a contact" value="${esc(st.cnQ || '')}" style="width:260px">
    <select id="cnKind" aria-label="Show"><option value="">Internal and external</option><option value="internal" ${kind === 'internal' ? 'selected' : ''}>Internal only</option><option value="external" ${kind === 'external' ? 'selected' : ''}>External only</option></select>
    <span class="muted">${shown.length === all.length ? `${all.length} ${all.length === 1 ? 'contact' : 'contacts'}` : `${shown.length} of ${all.length}`}</span><div class="grow"></div>
    ${canEdit() ? '<button id="cnNew" class="primary">New contact</button>' : ''}`;
  const nb = $('#cnNew'); if (nb) nb.onclick = () => contactModal(null);
  $('#cnKind').onchange = e => { st.cnKind = e.target.value; renderContacts(); };
  const box = $('#cnQ'); box.oninput = () => { st.cnQ = box.value; renderContacts(); const b = $('#cnQ'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); };
  if (!all.length){
    $('#view').innerHTML = `<div class="empty">No contacts yet. Add your own IT people and the people at your IT partners (service provider, supplier support), then name on each device who is responsible for it, internally and externally.</div>`;
    return;
  }
  /* The company's own people first, then each partner company in order, those without a company last. */
  const own = shown.filter(c => c.kind === 'internal');
  const byCompany = new Map();
  for (const c of shown.filter(c => c.kind === 'external')) { const k = c.company || ''; byCompany.set(k, [...(byCompany.get(k) || []), c]); }
  const companies = [...byCompany.keys()].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b));
  const byName = (a, b) => a.name.localeCompare(b.name);
  const group = (title, sub, list) => `<section class="cn-group"><div class="hdr">${esc(title)} <span class="cnt">${list.length}</span>${sub ? `<span class="cn-sub">${sub}</span>` : ''}</div><div class="cn-grid">${list.sort(byName).map(contactCard).join('')}</div></section>`;
  $('#view').innerHTML = `<div class="cn">${own.length ? group(COMPANY.name ? `Internal · ${COMPANY.name}` : 'Internal', '', own) : ''}
    ${companies.map(k => group(k || 'External, no company', 'IT partner', byCompany.get(k))).join('')}
    ${shown.length ? '' : `<div class="empty">Nothing matches “${esc(st.cnQ || '')}”.</div>`}</div>`;
  const v = $('#view');
  v.querySelectorAll('[data-cnedit]').forEach(b => b.onclick = () => contactModal(contactOf(b.dataset.cnedit)));
  v.querySelectorAll('[data-cndevs]').forEach(b => b.onclick = () => showDevicesOfContact(b.dataset.cndevs));
}
/* The devices of a contact, in the table: the filter shows in the sidebar, with a way out. */
export function showDevicesOfContact(id){ resetFilters(); st.resp = id; st.live = true; st.tab = 'table'; render(); }

/* Making or changing a contact. assignTo: a device that gets the new contact as its responsible of that kind. */
export function contactModal(c, { kind = 'internal', assignTo = null } = {}){
  const isNew = !c, edit = canEdit();
  const cur = c || { id: newId(), kind, name: '' };
  const companies = contactCompanies();
  const users = USERS.filter(u => u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const ro = edit ? '' : 'disabled';
  const field = (k, label, extra = '') => `<label for="cn_${k}">${label}</label><input id="cn_${k}" maxlength="${CONTACT_MAX[k]}" value="${esc(cur[k] || '')}" ${extra} ${ro}>`;
  modal(`<div class="mh">${isNew ? 'New contact' : esc(cur.name)}</div>
    <div class="mb"><div class="form" style="padding:0">
      <label>Kind</label><div class="ctlrow cn-kinds" role="radiogroup" aria-label="Kind">${Object.entries(CONTACT_KINDS).map(([k, l]) => `<label class="pchk"><input type="radio" name="cnKindPick" value="${k}" ${cur.kind === k ? 'checked' : ''} ${ro}> ${l}${k === 'internal' ? ' <span class="muted">(your own staff)</span>' : ' <span class="muted">(an IT partner)</span>'}</label>`).join('')}</div>
      <label for="cn_user" class="cn-in">Is the user</label><div class="cn-in"><select id="cn_user" ${ro}><option value="">— nobody in Users —</option>${users.map(u => `<option value="${esc(u.id)}" ${cur.userId === u.id ? 'selected' : ''}>${esc(u.name)}${u.dept ? ' · ' + esc(u.dept) : ''}</option>`).join('')}</select></div>
      ${field('name', 'Name', 'placeholder="First and last name, or a team (Service desk)"')}
      ${field('company', 'Company', 'list="cnCompanies" placeholder="e.g. Muster IT AG"')}<datalist id="cnCompanies">${companies.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      ${field('role', 'Role', 'placeholder="e.g. Network, Field service, Account manager"')}
      ${field('email', 'E-mail', 'type="email" autocomplete="off"')}
      ${field('phone', 'Phone', 'inputmode="tel" autocomplete="off"')}
      ${field('mobile', 'Mobile', 'inputmode="tel" autocomplete="off"')}
      <label for="cn_note">Note</label><textarea id="cn_note" rows="2" maxlength="${CONTACT_MAX.note}" placeholder="Support hours, contract number, how to open a ticket…" ${ro}>${esc(cur.note || '')}</textarea>
    </div>${isNew ? '' : `<p class="note">Responsible for ${devicesOf(cur).length} ${devicesOf(cur).length === 1 ? 'device' : 'devices'}.</p>`}<p class="note" id="cnErr" role="status"></p></div>
    <div class="mf">${isNew || !edit ? '' : '<button id="cnDel" class="danger-text">Delete</button>'}<div class="grow"></div><button id="cnCancel">${edit ? 'Cancel' : 'Close'}</button>${edit ? '<button id="cnOk" class="primary">Save</button>' : ''}</div>`, 'sm');
  /* Only an internal contact can be one of the users; picking one fills in the name the first time. */
  const kindNow = () => (document.querySelector('[name=cnKindPick]:checked') || {}).value || 'internal';
  const fit = () => document.querySelectorAll('.cn-in').forEach(el => { el.hidden = kindNow() !== 'internal'; });
  fit(); document.querySelectorAll('[name=cnKindPick]').forEach(r => r.onchange = fit);
  $('#cn_user').onchange = e => { const u = USERS.find(x => x.id === e.target.value); if (u && !$('#cn_name').value.trim()) $('#cn_name').value = u.name; };
  $('#cnCancel').onclick = closeModal;
  if (!edit) return;
  if (!isNew) $('#cnDel').onclick = () => {
    const devs = objs.filter(o => o.respIn === cur.id || o.respEx === cur.id);
    if (!confirm(`Delete the contact ${cur.name}?${devs.length ? ` ${devs.length} ${devs.length === 1 ? 'device loses' : 'devices lose'} this responsible.` : ''}`)) return;
    for (const o of devs){ for (const k of ['respIn', 'respEx']) if (o[k] === cur.id) delete o[k]; hist(o, now(), `Responsible ${cur.name} removed (contact deleted) by ${who()}`); }
    CONTACTS.list = CONTACTS.list.filter(x => x.id !== cur.id);
    if (st.resp === cur.id) st.resp = null;
    queueServerSave(); closeModal(); toast('Contact deleted'); render();
  };
  $('#cnOk').onclick = () => {
    const k = kindNow(), val = id => $('#cn_' + id).value.trim();
    const next = { id: cur.id, kind: k, name: val('name').replace(/\s+/g, ' ') };
    for (const f of ['company', 'role', 'email', 'phone', 'mobile']) if (val(f)) next[f] = val(f);
    const note = $('#cn_note').value.trim(); if (note) next.note = note;
    if (k === 'internal' && $('#cn_user').value) next.userId = $('#cn_user').value;
    const p = contactProblem(next);
    if (p){ $('#cnErr').textContent = p; return; }
    /* A contact that changes kind leaves the devices where it was responsible as the other kind. */
    if (!isNew && cur.kind !== k) for (const o of objs) if (o[RESP_KEYS[cur.kind]] === cur.id){ delete o[RESP_KEYS[cur.kind]]; hist(o, now(), `Responsible ${cur.name} removed (now ${CONTACT_KINDS[k].toLowerCase()}) by ${who()}`); }
    CONTACTS.list = isNew ? [...CONTACTS.list, next] : CONTACTS.list.map(x => x.id === cur.id ? next : x);
    if (assignTo) setResponsible(assignTo, k, next.id);
    queueServerSave(); closeModal(); toast(isNew ? 'Contact added' : 'Contact saved'); render();
  };
  $('#cn_name').focus();
}

/* Sets (or clears, with '') a device's responsible of a kind, with a line in its history. */
export function setResponsible(o, kind, id){
  const k = RESP_KEYS[kind], was = contactOf(o[k]), next = contactOf(id);
  if ((o[k] || '') === (id || '')) return false;
  if (next) o[k] = next.id; else delete o[k];
  hist(o, now(), next ? `${CONTACT_KINDS[kind]} responsible set to ${next.name}${was ? ` (was ${was.name})` : ''} by ${who()}` : `${CONTACT_KINDS[kind]} responsible ${was ? was.name + ' ' : ''}removed by ${who()}`);
  return true;
}

/* On a device page: who is responsible for it, internally and externally, with how to reach them. */
export function deviceRespPanel(o){
  const edit = canEdit();
  const row = kind => {
    const c = contactOf(o[RESP_KEYS[kind]]), list = CONTACTS.list.filter(x => x.kind === kind).sort((a, b) => contactLabel(a).localeCompare(contactLabel(b)));
    return `<div class="resp-row"><span class="k">${CONTACT_KINDS[kind]}</span>
      <div class="resp-pick">${edit ? `<select data-resp="${kind}" aria-label="${CONTACT_KINDS[kind]} responsible for ${esc(o.name)}"><option value="">— nobody —</option>${list.map(x => `<option value="${esc(x.id)}" ${c && c.id === x.id ? 'selected' : ''}>${esc(contactLabel(x))}</option>`).join('')}<option value="+">New ${kind} contact…</option></select>`
        : `<b>${c ? esc(contactLabel(c)) : '<span class="muted">nobody</span>'}</b>`}
      ${c ? `<div class="cn-ways">${c.role ? `<span class="muted">${esc(c.role)}</span>` : ''}${reach(c)}</div>` : ''}</div></div>`;
  };
  return `<div class="panelbox"><div class="hdr">Responsible <span class="cnt">${['respIn', 'respEx'].filter(k => contactOf(o[k])).length || 'none'}</span></div>
    <div class="resp">${row('internal')}${row('external')}</div></div>`;
}
export function bindDeviceResp(o){
  $('#view').querySelectorAll('[data-resp]').forEach(sel => sel.onchange = () => {
    const kind = sel.dataset.resp;
    if (sel.value === '+'){ sel.value = o[RESP_KEYS[kind]] || ''; contactModal(null, { kind, assignTo: o }); return; }
    if (setResponsible(o, kind, sel.value)){ queueServerSave(); toast(sel.value ? 'Responsible set' : 'Responsible removed'); render(); }
  });
}
/* The table's column: the two names, internal first. */
export const respText = o => [contactOf(o.respIn), contactOf(o.respEx)].filter(Boolean).map(c => c.name).join(' · ');
