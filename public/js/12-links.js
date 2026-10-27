/* The Links panel of a device page: its web interface, shares and other addresses, each opened in a new tab or copied.
   An admin adds, edits and removes them; the rules are in links.js. */
import { $, esc, hist, now, toast } from './01-core.js';
import { LINK_MAX, isShare, linkHref, linkKind, linkProblem } from './links.js';
import { canEdit, who } from './04-settings.js';
import { queueServerSave, render } from './07-render-plans.js';

/* Quick links from the device's address: its web interface, when it has none of them yet. */
/* The link being edited in place: device id and index, or null. */
let editing = null;

const suggestions = o => !o.ip ? [] : [`https://${o.ip}`, `http://${o.ip}`].filter(u => !(o.urls || []).some(l => l.url === u));

export function deviceLinksPanel(o){
  const list = o.urls || [], edit = canEdit();
  const rows = list.map((l, i) => editing && editing.id === o.id && editing.i === i && edit ? `<div class="relrow lnkrow lnk-edit">
      <input id="lnkEdLabel" value="${esc(l.label || '')}" placeholder="Label" maxlength="60" aria-label="Label of the link" style="width:170px">
      <input id="lnkEdUrl" value="${esc(l.url)}" maxlength="500" aria-label="Address of the link" style="flex:1;min-width:160px">
      <button id="lnkEdSave" class="primary">Save</button><button id="lnkEdCancel">Cancel</button></div>` : `<div class="relrow lnkrow"><span class="k"><span class="chip kept">${esc(linkKind(l.url))}</span></span>
      <span class="t"><a class="lnk${l.label ? '' : ' lnk-addr'}" href="${esc(linkHref(l.url))}" target="_blank" rel="noopener noreferrer" title="Open ${esc(l.url)} in a new tab">${esc(l.label || l.url)}</a>${l.label ? `<span class="muted mono lnk-url">${esc(l.url)}</span>` : ''}</span>
      <button class="icon ghost" data-lnkcopy="${i}" title="Copy the address" aria-label="Copy ${esc(l.url)}"><svg class="i" viewBox="0 0 24 24"><path d="M9 9h10v10H9zM5 15V5h10"/></svg></button>
      ${edit ? `<button class="icon ghost" data-lnkedit="${i}" title="Edit the link" aria-label="Edit ${esc(l.label || l.url)}"><svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg></button>` : ''}
      ${edit ? `<button class="icon ghost" data-lnkdel="${i}" title="Remove the link" aria-label="Remove ${esc(l.label || l.url)}">×</button>` : ''}</div>`).join('');
  const quick = edit ? suggestions(o) : [];
  return `<div class="panelbox"><div class="hdr">Links <span class="cnt">${list.length || 'none'}</span></div>
    <div class="relist">${rows || '<p class="note lempty">No links yet: the web interface, a share, a remote console or documentation.</p>'}</div>
    ${edit && list.length < LINK_MAX ? `<div class="addrel lnk-add">${quick.length ? `<span class="muted">Web interface</span>${quick.map(u => `<button class="lnk-quick" data-lnkquick="${esc(u)}" title="Add ${esc(u)} as Web interface"><span aria-hidden="true">+</span>${esc(u)}</button>`).join('')}<span class="lnk-break"></span>` : ''}
      <input id="lnkLabel" placeholder="Label, e.g. Web interface" maxlength="60" aria-label="Label of the new link" style="width:170px">
      <input id="lnkUrl" placeholder="https://…, ssh://…, \\\\server\\share" maxlength="500" aria-label="Address of the new link" style="flex:1;min-width:160px">
      <button id="lnkAdd">Add</button></div>` : ''}</div>`;
}

export function bindDeviceLinks(o){
  const v = $('#view');
  const add = (label, url) => {
    const l = { url: url.trim(), ...(label.trim() ? { label: label.trim() } : {}) };
    const p = linkProblem(l);
    if (p){ toast(p); return false; }
    if ((o.urls || []).some(x => x.url === l.url)){ toast('This device has that link already.'); return false; }
    o.urls = [...(o.urls || []), l];
    hist(o, now(), `Link added: ${l.label || l.url} by ${who()}`);
    queueServerSave(); render(); return true;
  };
  const ab = $('#lnkAdd');
  if (ab){
    ab.onclick = () => add($('#lnkLabel').value, $('#lnkUrl').value);
    $('#lnkUrl').onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); ab.click(); } };
  }
  v.querySelectorAll('[data-lnkquick]').forEach(b => b.onclick = () => add('Web interface', b.dataset.lnkquick));
  v.querySelectorAll('[data-lnkedit]').forEach(b => b.onclick = () => { editing = { id: o.id, i: +b.dataset.lnkedit }; render(); $('#lnkEdUrl')?.focus(); });
  const sv = $('#lnkEdSave');
  if (sv){
    const i = editing.i, old = o.urls[i];
    const cancel = () => { editing = null; render(); };
    sv.onclick = () => {
      const label = $('#lnkEdLabel').value.trim(), l = { url: $('#lnkEdUrl').value.trim(), ...(label ? { label } : {}) };
      const p = linkProblem(l);
      if (p){ toast(p); return; }
      if (o.urls.some((x, j) => j !== i && x.url === l.url)){ toast('This device has that link already.'); return; }
      editing = null;
      if (l.url === old.url && (l.label || '') === (old.label || '')){ render(); return; }
      o.urls = o.urls.map((x, j) => j === i ? l : x);
      hist(o, now(), `Link changed: ${old.label || old.url} → ${l.label || l.url}${l.url !== old.url ? ` (${l.url})` : ''} by ${who()}`);
      queueServerSave(); render();
    };
    $('#lnkEdCancel').onclick = cancel;
    v.querySelectorAll('.lnk-edit input').forEach(inp => inp.onkeydown = e => {
      if (e.key === 'Enter'){ e.preventDefault(); sv.click(); }
      else if (e.key === 'Escape'){ e.preventDefault(); cancel(); }
    });
  }
  v.querySelectorAll('[data-lnkdel]').forEach(b => b.onclick = () => {
    const l = o.urls[+b.dataset.lnkdel];
    o.urls = o.urls.filter((_, i) => i !== +b.dataset.lnkdel);
    if (!o.urls.length) delete o.urls;
    hist(o, now(), `Link removed: ${l.label || l.url} by ${who()}`);
    queueServerSave(); render();
  });
  v.querySelectorAll('[data-lnkcopy]').forEach(b => b.onclick = async () => {
    const url = o.urls[+b.dataset.lnkcopy].url;
    try { await navigator.clipboard.writeText(url); toast(isShare(url) ? 'Copied: paste it into Explorer' : 'Address copied'); }
    catch { toast('Copying is not allowed here. The address: ' + url); }
  });
}
