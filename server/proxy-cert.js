/* The certificate the proxy in front presents for the inventory's name: read over TLS, the way a browser gets it, so it
   shows what is really served (whichever way it was installed) and the app needs no access to certificate files or
   keys. Nothing is trusted or sent: the connection is opened, the certificate read, and closed. */
import tls from 'node:tls';

/* From this many days before the end, the certificate is shown as expiring. */
export const CERT_SOON_DAYS = 30;
const cn = o => (o && (Array.isArray(o.CN) ? o.CN[0] : o.CN)) || '';
const sameName = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

/* What a certificate says, for people: its names, who issued it, until when, and whether it serves this host name.
   state: ok, soon (within CERT_SOON_DAYS), expired, or wrong (it does not carry the name the inventory is opened by). */
export function certReport(cert, hostname, now = Date.now()) {
  const names = String(cert.subjectaltname || '').split(/,\s*/).map(s => s.replace(/^(DNS|IP Address):/, '')).filter(Boolean);
  const validTo = new Date(cert.valid_to), validFrom = new Date(cert.valid_from);
  const daysLeft = Math.floor((validTo.getTime() - now) / 86400000);
  const ip = !hostname || /^[\d.]+$|:/.test(hostname);
  const matches = ip ? null : !tls.checkServerIdentity(hostname, cert);
  const state = validTo.getTime() <= now ? 'expired' : matches === false ? 'wrong' : daysLeft < CERT_SOON_DAYS ? 'soon' : 'ok';
  return {
    host: hostname || '', names: names.length ? names : [cn(cert.subject)].filter(Boolean), subject: cn(cert.subject), issuer: cn(cert.issuer) || '',
    selfSigned: sameName(cert.subject, cert.issuer), validFrom: validFrom.toISOString(), validTo: validTo.toISOString(), daysLeft, matches, state,
    thumbprint: String(cert.fingerprint || '').replace(/:/g, '').toUpperCase(),
  };
}

/* The certificate the proxy presents for a host name, or null when it cannot be reached (no proxy of ours in front). */
export const probeCert = (probe, hostname, timeout = 3000) => new Promise(resolve => {
  const ip = !hostname || /^[\d.]+$|:/.test(hostname);
  const sock = tls.connect({ host: probe.host, port: probe.port, servername: ip ? undefined : hostname, rejectUnauthorized: false }, () => {
    const c = sock.getPeerCertificate();
    sock.end();
    resolve(c && c.valid_to ? c : null);
  });
  sock.setTimeout(timeout, () => { sock.destroy(); resolve(null); });
  sock.on('error', () => resolve(null));
});
