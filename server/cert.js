/* Makes the certificate and key the Microsoft Graph sign-in uses. The key is returned once and is not kept:
   the administrator puts it in the server's secrets. The certificate is uploaded to the Entra app.
   Built on Node's own crypto, so no certificate library is needed. */
import crypto from 'node:crypto';
import { thumbprintOf } from './graph.js';

export const CERT_DAYS = 730;

/* DER encoding: the bytes an X.509 certificate is made of. */
const len = n => {
  if (n < 128) return Buffer.from([n]);
  const bytes = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) bytes.unshift(x % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...parts) => tlv(0x30, Buffer.concat(parts));
const set = (...parts) => tlv(0x31, Buffer.concat(parts));
const explicit = (n, body) => tlv(0xa0 | n, body);
const utf8 = s => tlv(0x0c, Buffer.from(s, 'utf8'));
const nullValue = Buffer.from([0x05, 0x00]);
const oid = s => {
  const arcs = s.split('.').map(Number);
  const out = [40 * arcs[0] + arcs[1]];
  for (const a of arcs.slice(2)) {
    const part = [a % 128];
    for (let x = Math.floor(a / 128); x > 0; x = Math.floor(x / 128)) part.unshift((x % 128) | 0x80);
    out.push(...part);
  }
  return tlv(0x06, Buffer.from(out));
};
const bitString = (bytes, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), bytes]));
/* Dates before 2050 are written as UTCTime: YYMMDDHHMMSSZ. */
const utcTime = d => tlv(0x17, Buffer.from(d.toISOString().slice(2, 19).replace(/[-:T]/g, '') + 'Z', 'ascii'));
const SHA256_RSA = seq(oid('1.2.840.113549.1.1.11'), nullValue);

const pem = (label, der) => `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;

export function generateGraphCert({ commonName = 'NOBS Inventory', days = CERT_DAYS, now = new Date() } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f;
  const name = seq(set(seq(oid('2.5.4.3'), utf8(commonName))));
  const notBefore = new Date(now.getTime() - 60 * 60 * 1000), notAfter = new Date(now.getTime() + days * 86400000);
  const basicConstraints = seq(oid('2.5.29.19'), Buffer.from([0x01, 0x01, 0xff]), tlv(0x04, seq()));
  const keyUsage = seq(oid('2.5.29.15'), Buffer.from([0x01, 0x01, 0xff]), tlv(0x04, bitString(Buffer.from([0xc0]), 6)));
  const tbs = seq(
    explicit(0, Buffer.from([0x02, 0x01, 0x02])),
    tlv(0x02, serial),
    SHA256_RSA,
    name,
    seq(utcTime(notBefore), utcTime(notAfter)),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    explicit(3, seq(basicConstraints, keyUsage)),
  );
  const signature = crypto.sign('sha256', tbs, privateKey);
  const der = seq(tbs, SHA256_RSA, bitString(signature));
  const certPem = pem('CERTIFICATE', der);
  return { certPem, keyPem, thumbprint: thumbprintOf(certPem), expires: notAfter.toISOString() };
}
