/* The HTTPS certificate people get when they open the inventory, as the proxy in front presents it: shown in Settings →
   Maintenance, and on the Overview from 30 days before it ends. The server reads it; nothing here can change it (that
   is done on the server: sudo ./scripts/install-cert.sh). */
import { esc } from './01-core.js';
import { dateText } from './dates.js';

/* null until asked; then { certificate, reason }. */
export let CERT = null;
let asking = null;
export function loadCert(fresh = false){
  if (asking && !fresh) return asking;
  asking = fetch('api/certificate' + (fresh ? '?fresh=1' : ''), {credentials: 'same-origin'})
    .then(r => r.ok ? r.json() : { certificate: null, reason: 'The certificate could not be read.' })
    .catch(() => ({ certificate: null, reason: 'The certificate could not be read.' }))
    .then(j => { CERT = j; return j; });
  return asking;
}

const left = d => d < 0 ? `ended ${-d} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'ends today' : `${d} day${d === 1 ? '' : 's'} left`;
/* The Overview's line when the certificate needs a look, or null: [count, chip class, label, detail, attribute]. */
export function certAttention(){
  const c = CERT && CERT.certificate;
  if (!c || c.state === 'ok') return null;
  const until = dateText(c.validTo);
  if (c.state === 'expired') return [1, 'bad', 'HTTPS certificate expired', `${c.host}: ended on ${until}; browsers refuse the page`, 'data-ovcert="1"'];
  if (c.state === 'wrong') return [1, 'bad', 'HTTPS certificate for another name', `${c.host} is not in it (it is for ${c.names.slice(0, 3).join(', ')})`, 'data-ovcert="1"'];
  return [1, 'warn', 'HTTPS certificate ends soon', `${c.host}: on ${until}, ${left(c.daysLeft)}`, 'data-ovcert="1"'];
}

const STATE = { ok: ['kept', 'Valid'], soon: ['warn', 'Ends soon'], expired: ['bad', 'Expired'], wrong: ['bad', 'Another name'] };
/* Settings → Maintenance: what the certificate is for, who issued it, until when, and how to replace it. */
export function certPanel(){
  const c = CERT && CERT.certificate;
  const how = '<p class="note" style="padding:0 12px 10px">To replace it, on the server in the inventory\'s folder: <code>sudo ./scripts/install-cert.sh inventory &lt;bundle.pem&gt;</code> (key, certificate and CA in one file). <code>--info</code> lists the certificate of every site on the proxy.</p>';
  if (!CERT) return '<div class="panelbox" id="certPanel"><div class="hdr">HTTPS certificate</div><p class="note" style="padding:12px">Reading…</p></div>';
  if (!c) return `<div class="panelbox" id="certPanel"><div class="hdr">HTTPS certificate</div><p class="note" style="padding:12px">${esc(CERT.reason || 'Not known.')}</p></div>`;
  const [cls, word] = STATE[c.state] || STATE.ok;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `<div class="panelbox" id="certPanel"><div class="hdr">HTTPS certificate <span class="chip ${cls}">${word}</span></div>
    <dl class="kv cert-kv">
      ${row('Opened as', esc(c.host || '—') + (c.matches === false ? ' <span class="chip bad">not in the certificate</span>' : ''))}
      ${row('For', c.names.map(n => `<span class="mono">${esc(n)}</span>`).join(', ') || '—')}
      ${row('Issued by', esc(c.issuer || '—') + (c.selfSigned ? ' <span class="chip warn">self-signed</span>' : ''))}
      ${row('Valid', `${esc(dateText(c.validFrom))} to <b>${esc(dateText(c.validTo))}</b> <span class="muted">(${esc(left(c.daysLeft))})</span>`)}
    </dl>
    ${c.selfSigned ? '<p class="note" style="padding:0 12px 10px">Self-signed, as made at the install: browsers warn until the company certificate is installed.</p>' : ''}
    ${how}<div class="addrel" style="padding:10px 12px"><button id="certRefresh">Check again</button></div></div>`;
}
export function wireCertPanel(rerender){
  const b = document.getElementById('certRefresh');
  if (b) b.onclick = async () => { b.disabled = true; await loadCert(true); rerender(); };
}
