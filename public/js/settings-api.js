/* Settings → Users → API access: read-only tokens for other tools (server/api-tokens.js). A new token is shown once,
   with how to use it. Admins only. */
import { $, esc, toast } from './01-core.js';
import { isAdmin } from './04-settings.js';
import { pushDate } from './settings-feed.js';

let TOKENS = null, NEW_TOKEN = null;
function tokensPanel(){
  const list = TOKENS || [];
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return `<div class="panelbox"><div class="hdr">API access <span class="cnt">${list.length}</span></div>
    <p class="note" style="padding:10px 12px">Tokens for other tools (monitoring, helpdesk, Excel Power Query) to read the device list: <span class="mono">GET ${esc(base)}api/v1/devices</span> (JSON, or <span class="mono">?format=csv</span>), one device with <span class="mono">api/v1/devices/INV-0001</span>; also <span class="mono">api/v1/contracts</span>, <span class="mono">api/v1/licences</span> and, for a token made with people, <span class="mono">api/v1/people</span>. Read only; people's names only for a token made with them. Each is shown once: copy it into the tool.
      <a class="link" id="tkSpec" href="api/openapi.json" target="_blank" rel="noopener">API description (OpenAPI)</a></p>
    ${NEW_TOKEN ? `<div class="sheet-pw" style="margin:0 12px 10px"><code class="mono" id="tkNew">${esc(NEW_TOKEN)}</code><button id="tkCopy">Copy</button></div>
      <p class="note" style="padding:0 12px 10px">Example: <span class="mono">curl -H "Authorization: Bearer ${esc(NEW_TOKEN.slice(0, 9))}…" ${esc(base)}api/v1/devices?format=csv</span></p>` : ''}
    ${list.length ? `<div style="overflow-x:auto"><table class="grid mini stack" style="min-width:0"><thead><tr><th>Name</th><th>People</th><th>Made</th><th>Last used</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${t.people ? 'With names' : 'No names'}</td><td>${esc(pushDate(t.created))} · ${esc(t.by)}</td><td>${t.used ? esc(pushDate(t.used)) : '<span class="muted">Never</span>'}</td><td class="act"><button data-tkdel="${esc(t.id)}" class="danger-text">Revoke</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="addrel" style="padding:10px 12px"><input id="tkName" placeholder="What uses it, e.g. Monitoring" maxlength="80" aria-label="Name of the token" style="min-width:220px"><label class="pchk" style="width:auto"><input type="checkbox" id="tkPeople"> With people's names</label><button id="tkMake">Make a token</button></div></div>`;
}
function wireTokens(){
  const mk = $('#tkMake'); if (!mk) return;
  mk.onclick = async () => {
    const r = await fetch('api/tokens', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#tkName').value, people: $('#tkPeople').checked }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok){ toast(j.error || 'The token was not made.'); return; }
    NEW_TOKEN = j.token; TOKENS = null; renderSetApi();
  };
  const cp = $('#tkCopy'); if (cp) cp.onclick = () => navigator.clipboard.writeText(NEW_TOKEN).then(() => toast('Token copied'), () => toast('Copy it by hand: the browser does not allow it.'));
  document.querySelectorAll('[data-tkdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Revoke this token? The tool using it can no longer read the inventory.')) return;
    const r = await fetch('api/tokens/' + encodeURIComponent(b.dataset.tkdel), { method: 'DELETE', credentials: 'same-origin' });
    if (r.ok){ TOKENS = (await r.json()).tokens; NEW_TOKEN = null; renderSetApi(); toast('Token revoked'); }
  });
}

export function renderSetApi(){
  const box = $('#setApi'); if (!box) return;
  if (!isAdmin()){ box.innerHTML = ''; return; }
  if (TOKENS === null){ TOKENS = undefined; fetch('api/tokens', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { tokens: [] }).then(j => { TOKENS = j.tokens; renderSetApi(); }, () => { TOKENS = []; }); }
  box.innerHTML = tokensPanel();
  wireTokens();
}
