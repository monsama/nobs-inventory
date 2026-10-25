/* Entry sheets: what a person gets on their first day. Their devices and the initial password of their Windows (AD)
   account, printed and signed. IT sets that password in AD with "User must change password at next logon"; the app
   never writes to AD. The server keeps each sheet encrypted, so it can be printed again; the password goes from the
   kept sheet once it is marked as changed, and at the latest after a set number of days. */
import { $, esc, objs, toast } from './01-core.js';
import { closeModal, modal } from './03-object-modals.js';
import { flushSave } from './07-render-plans.js';

const call = async (method, url, body) => {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'The server refused it (' + r.status + ').');
  return j;
};
const day = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); };
const fileDay = iso => String(iso || '').slice(0, 10);

/* The look of a printed sheet. Used for printing from the page and in the downloaded file, so both are the same. */
const SHEET_CSS = `.sheet{font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;background:#fff;max-width:720px;margin:0 auto;padding:8px 4px}
.sheet .top{display:flex;align-items:center;gap:12px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px}
.sheet .top svg,.sheet .top img{width:34px;height:34px}
.sheet .top .brand{font-size:13px;color:#444}
.sheet .top h1{font-size:22px;margin:0}
.sheet .top>div:nth-last-child(2){flex:1}
.sheet .top .meta{text-align:right;font-size:12px;color:#444}
.sheet h2{font-size:14px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#333}
.sheet dl{display:grid;grid-template-columns:170px 1fr;gap:4px 12px;margin:0}
.sheet dt{color:#555}.sheet dd{margin:0;font-weight:600}
.sheet table{width:100%;border-collapse:collapse;font-size:12px}
.sheet th,.sheet td{border:1px solid #999;padding:5px 7px;text-align:left;vertical-align:top}
.sheet th{background:#eee}
.sheet .pw{border:2px solid #111;border-radius:6px;padding:10px 14px;margin-top:4px}
.sheet .pw .val{font:600 22px/1.3 ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.06em;margin:4px 0 6px}
.sheet .pw p{margin:0;font-size:12px}
.sheet .gone{color:#555;font-style:italic}
.sheet .note{white-space:pre-wrap;border-left:3px solid #999;padding-left:10px}
.sheet .sign{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:34px}
.sheet .sign div{border-top:1px solid #111;padding-top:4px;font-size:12px;color:#444}
.sheet .confirm{margin-top:18px}
@page{margin:16mm}`;

let logo = '';
const loadLogo = async () => { if (!logo) logo = await fetch('logo.svg').then(r => r.ok ? r.text() : '').catch(() => ''); return logo; };

export function sheetHtml(sh, logoSvg = ''){
  const devices = sh.devices.length ? `<table><thead><tr><th>Inventory no.</th><th>Type</th><th>Name</th><th>Model</th><th>Serial number</th></tr></thead><tbody>${
    sh.devices.map(d => `<tr><td>${esc(d.code)}</td><td>${esc(d.type)}</td><td>${esc(d.name)}</td><td>${esc(d.model)}</td><td>${esc(d.serial)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="gone">No devices are handed out with this sheet.</p>';
  const pw = sh.password
    ? `<div class="pw"><p>Initial password of your Windows account</p><div class="val">${esc(sh.password)}</div>
      <p>Windows asks you to choose your own password when you first sign in. Keep this sheet private and do not write your new password on it.</p></div>`
    : `<p class="gone">The initial password is no longer on this copy of the sheet. It has been changed, or ${esc(String(sh.passwordDays || 14))} days have passed. IT can set a new one.</p>`;
  return `<div class="sheet">
    <div class="top">${logoSvg}<div><div class="brand">NOBS Inventory</div><h1>Entry sheet</h1></div><div class="meta">Issued ${esc(day(sh.issued))}<br>by ${esc(sh.by)}</div></div>
    <h2>Person</h2>
    <dl><dt>Name</dt><dd>${esc(sh.person.name)}</dd><dt>Department</dt><dd>${esc(sh.person.dept || '—')}</dd><dt>Windows sign-in name</dt><dd>${esc(sh.login)}</dd></dl>
    <h2>Sign-in</h2>${pw}
    <h2>Devices handed out</h2>${devices}
    ${sh.note ? `<h2>Note</h2><div class="note">${esc(sh.note)}</div>` : ''}
    <p class="confirm">I have received the devices listed above in working order. I will look after them and give them back when I leave or when IT asks.</p>
    <div class="sign"><div>Date, signature of ${esc(sh.person.name)}</div><div>Date, signature of IT</div></div>
  </div>`;
}

/* Printing from the page: the sheet is put in the page on its own, everything else is hidden while printing. */
async function printSheet(sh){
  const svg = await loadLogo();
  document.getElementById('printHost')?.remove();
  const host = Object.assign(document.createElement('div'), { id: 'printHost' });
  host.innerHTML = `<style>${SHEET_CSS}
    @media screen{#printHost{display:none}}
    @media print{body>:not(#printHost){display:none!important}body{background:#fff!important}}</style>${sheetHtml(sh, svg)}`;
  document.body.appendChild(host);
  const done = () => { host.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
/* A file to keep or mail: one HTML page with the look built in. It holds the password while the sheet does. */
async function downloadSheet(sh){
  const svg = await loadLogo();
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entry sheet ${esc(sh.person.name)}</title><style>body{margin:0;background:#fff}${SHEET_CSS}</style></head><body>${sheetHtml(sh, svg)}</body></html>`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([page], { type: 'text/html' })),
    download: `entry-sheet-${sh.person.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}-${fileDay(sh.issued)}.html` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stateText = (s, days) => s.password === 'kept'
  ? `<span class="chip warn" title="The password is on the kept sheet until it is marked as changed">On the sheet until ${esc(day(new Date(new Date(s.created).getTime() + days * 86400000).toISOString()))}</span>`
  : s.password === 'changed' ? '<span class="chip ok">Changed</span>' : `<span class="chip kept" title="Removed after ${days} days">Removed</span>`;

/* The window in Settings → Users: a new sheet for the person, and the sheets kept for them. */
export async function sheetModal(u, fresh = null){
  await flushSave();
  let list;
  try { list = await call('GET', 'api/sheets?user=' + encodeURIComponent(u.id)); }
  catch (e) { toast(e.message); return; }
  const days = list.passwordDays;
  const mine = objs.filter(o => String(o.uid) === String(u.id));
  const devs = mine.length ? mine.map(o => `<label class="pchk"><input type="checkbox" data-sdev="${esc(o.id)}" checked> ${esc(o.name)} <span class="note">${esc([o.code, o.model, o.serial].filter(Boolean).join(' · '))}</span></label>`).join('')
    : `<p class="note">${esc(u.name)} has no devices in the inventory. Give them their devices first, or make a sheet without devices.</p>`;
  const kept = list.sheets.length ? `<table class="grid mini" style="min-width:0"><thead><tr><th>Issued</th><th>By</th><th>Password</th><th></th></tr></thead><tbody>${
    list.sheets.map(s => `<tr><td>${esc(day(s.created))}</td><td>${esc(s.by)}</td><td>${stateText(s, days)}</td>
      <td class="act"><button data-sprint="${s.id}">Print</button> <button data-sdown="${s.id}">Download</button>${s.password === 'kept' ? ` <button data-schanged="${s.id}" title="The person has signed in and chosen their own password: remove it from the kept sheet">Password changed</button>` : ''} <button class="icon ghost" data-sdel="${s.id}" aria-label="Delete this sheet">×</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="note">No sheet has been made for this person yet.</p>';
  const made = fresh ? `<div class="panelbox sheet-new"><div class="hdr">New initial password</div><div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px">
      <div class="addrel" style="padding:0"><code class="mono" id="sheetPw" style="font-size:18px;letter-spacing:.06em">${esc(fresh.sheet.password)}</code><button id="sheetCopy">Copy</button></div>
      <p class="note">Set it on the AD account <b class="mono">${esc(fresh.sheet.login)}</b> with "User must change password at next logon". It is printed on the sheet.</p></div></div>` : '';
  modal(`<div class="mh">Entry sheet for ${esc(u.name)}</div>
    <div class="mb">${made}
      <div class="panelbox"><div class="hdr">New sheet</div>
        <p class="note">The sheet lists the devices handed out and a new initial password for the person's Windows account. Set that password in Active Directory with "User must change password at next logon". The app does not change anything in AD.</p>
        <div class="form" style="padding:10px 12px">
          <label for="sheetLogin">Windows sign-in name</label><input id="sheetLogin" class="mono" autocomplete="off" value="${esc(u.login || '')}">
          <label>Devices</label><div class="sheet-devs">${devs}</div>
          <label for="sheetNote">Note</label><textarea id="sheetNote" rows="2" maxlength="500" placeholder="First day, desk, anything else to write on the sheet"></textarea>
        </div>
        <div class="addrel" style="padding:10px 12px"><button id="sheetMake" class="primary">Make sheet and print</button><span class="note" id="sheetErr"></span></div></div>
      <div class="panelbox"><div class="hdr">Kept sheets <span class="cnt">${list.sheets.length}</span></div>
        <p class="note">Kept encrypted on the server, to print again. The password stays on a kept sheet until it is marked as changed, at most ${days} days.</p>
        <div style="overflow-x:auto;padding:10px 12px">${kept}</div></div>
    </div>
    <div class="mf"><button id="sheetClose">Close</button></div>`, 'wide');
  $('#sheetClose').onclick = closeModal;
  if (fresh) $('#sheetCopy').onclick = () => navigator.clipboard.writeText(fresh.sheet.password).then(() => toast('Password copied'), () => toast('Copy it by hand: the browser does not allow it.'));
  $('#sheetMake').onclick = async () => {
    const login = $('#sheetLogin').value.trim();
    if (!login){ $('#sheetErr').textContent = 'Give the Windows sign-in name.'; $('#sheetLogin').focus(); return; }
    const deviceIds = [...document.querySelectorAll('[data-sdev]:checked')].map(c => c.dataset.sdev);
    try {
      const r = await call('POST', 'api/sheets', { userId: u.id, deviceIds, login, note: $('#sheetNote').value });
      await sheetModal(u, r);
      printSheet(r.sheet);
    } catch (e) { $('#sheetErr').textContent = e.message; }
  };
  const open = async id => (await call('GET', 'api/sheets/' + encodeURIComponent(id))).sheet;
  document.querySelectorAll('[data-sprint]').forEach(b => b.onclick = async () => { try { printSheet(await open(b.dataset.sprint)); } catch (e) { toast(e.message); } });
  document.querySelectorAll('[data-sdown]').forEach(b => b.onclick = async () => { try { await downloadSheet(await open(b.dataset.sdown)); } catch (e) { toast(e.message); } });
  document.querySelectorAll('[data-schanged]').forEach(b => b.onclick = async () => {
    try { await call('POST', `api/sheets/${encodeURIComponent(b.dataset.schanged)}/changed`); toast('The password is removed from the kept sheet'); sheetModal(u); } catch (e) { toast(e.message); }
  });
  document.querySelectorAll('[data-sdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this sheet? It cannot be printed again.')) return;
    try { await call('DELETE', 'api/sheets/' + encodeURIComponent(b.dataset.sdel)); toast('Sheet deleted'); sheetModal(u); } catch (e) { toast(e.message); }
  });
}
