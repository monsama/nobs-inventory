import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateGraphCert, CERT_DAYS } from '../server/cert.js';
import { thumbprintOf } from '../server/graph.js';

test('a made certificate matches its key, has the thumbprint Entra checks, and lasts two years', () => {
  const now = new Date('2026-10-24T10:00:00Z');
  const g = generateGraphCert({ now });
  const x = new crypto.X509Certificate(g.certPem);
  const sig = crypto.sign('sha256', Buffer.from('check'), g.keyPem);
  assert.equal(crypto.verify('sha256', Buffer.from('check'), x.publicKey, sig), true, 'the key signs for the certificate');
  assert.equal(g.thumbprint, thumbprintOf(g.certPem));
  assert.equal(new Date(x.validTo).getTime() - now.getTime() > (CERT_DAYS - 1) * 86400000, true);
  assert.equal(x.subject, 'CN=NOBS Inventory');
});

test('each certificate is made new, with its own key', () => {
  const a = generateGraphCert(), b = generateGraphCert();
  assert.notEqual(a.keyPem, b.keyPem);
  assert.notEqual(a.thumbprint, b.thumbprint);
});
