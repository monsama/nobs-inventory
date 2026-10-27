/* The Links panel of a device page: its web interface, shares and other addresses, each opened in a new tab or copied.
   An admin adds and removes them; the rules are in links.js. */
import { $, esc, hist, now, toast } from './01-core.js';
import { LINK_MAX, isShare, linkHref, linkKind, linkProblem } from './links.js';
import { canEdit, who } from './04-settings.js';
import { queueServerSave, render } from './07-render-plans.js';

/* Quick links from the device's address: its web interface, when it has none of them yet. */
const suggestions = o => !o.ip ? [] : [`https://${o.ip}`, `http://${o.ip}`].filter(u => !(o.urls || []).some(l => l.url === u));

export function deviceLinksPanel(o){
  const list = o.urls || [], edit = canEdit();
  const rows = list.map((l, i) => `<div class="relrow lnkrow"><span class="k"><span class="chip kept">${esc(linkKind(l.url))}</span></span>
      <span class="t"><a class="lnk" href="${esc(linkHref(l.url))}" target="_blank" rel="noopener noreferrer" title="Open ${esc(l.url)} in a new tab">${esc(l.label || l.url)}</a>${l.label ? `<span class="muted mono lnk-url">${esc(l.url)}</span>` : ''}</span>
      <button class="icon ghost" data-lnkcopy="${i}" title="Copy the address" aria-label="Copy ${esc(l.url)}"><svg class="i" viewBox="0 0 24 24"><path d="M9 9h10v10H9zM5 15V5h10"/></svg></button>
      ${edit ? `<button class="icon ghost" data-lnkdel="${i}" title="Remove the link" aria-label="Remove ${esc(l.label || l.url)}">×</button>` : ''}</div>`).join('');
  const quick = edit ? suggestions(o) : [];
  return `<div class="panelbox"><div class="hdr">Links <span class="cnt">${list.length || 'none'}</span></div>
    <div class="relist">${rows || '<p class="note lempty">No links yet: the web interface, a share, a remote console or documentation.</p>'}</div>
    ${edit && list.length < LINK_MAX ? `<div class="addrel lnk-add">${quick.length ? `<span class="muted">Add</span>${quick.map(u => `<button data-lnkquick="${esc(u)}" title="Add ${esc(u)} as Web interface">${esc(u.replace(/:\/\/.*/, ''))}://IP</button>`).join('')}<span class="tbsep"></span>` : ''}
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
