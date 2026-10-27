/* The proxy's certificate: what the app reads from it and says about it (names, issuer, end, expiring soon, the wrong
   name), the API that shows it, and scripts/install-cert.sh, which puts a site's own certificate in place. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateGraphCert } from '../server/cert.js';
import { CERT_SOON_DAYS, certReport } from '../server/proxy-cert.js';
import { startServer, signIn } from './helpers.js';

const DAY = 86400000;
const fake = (validTo, extra = {}) => ({ subject: { CN: 'inventory.argolite.ch' }, issuer: { CN: 'argo-ARGODC02-CA-1' }, subjectaltname: 'DNS:inventory.argolite.ch, DNS:inventory',
  valid_from: 'Jan  1 00:00:00 2026 GMT', valid_to: new Date(validTo).toUTCString(), fingerprint: 'AB:CD', ...extra });

test('a certificate is read for people: its names and issuer, and whether it ends soon, has ended or is for another name', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const ok = certReport(fake(now + 400 * DAY), 'inventory.argolite.ch', now);
  assert.deepEqual([ok.state, ok.names, ok.issuer, ok.selfSigned, ok.matches, ok.daysLeft], ['ok', ['inventory.argolite.ch', 'inventory'], 'argo-ARGODC02-CA-1', false, true, 400]);
  assert.equal(certReport(fake(now + 400 * DAY), 'inventory', now).matches, true, 'the short name is in it too');
  assert.equal(certReport(fake(now + (CERT_SOON_DAYS - 1) * DAY), 'inventory.argolite.ch', now).state, 'soon');
  assert.equal(certReport(fake(now + CERT_SOON_DAYS * DAY + 1000), 'inventory.argolite.ch', now).state, 'ok');
  assert.equal(certReport(fake(now - DAY), 'inventory.argolite.ch', now).state, 'expired');
  assert.equal(certReport(fake(now + 400 * DAY), 'wiki.argolite.ch', now).state, 'wrong');
  assert.equal(certReport(fake(now + 400 * DAY), '10.0.0.5', now).matches, null, 'an address is not checked against the names');
  assert.equal(certReport(fake(now + 400 * DAY, { issuer: { CN: 'inventory.argolite.ch' } }), 'inventory', now).selfSigned, true);
});

const rawGet = (srv, host, cookie, p) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: srv.base.split(':').pop(), path: p, headers: { Host: host, Cookie: cookie } }, res => {
    let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(body) }));
  });
  req.on('error', reject); req.end();
});

test('the API shows the certificate the proxy presents for the name the page was opened by, to anyone signed in', async () => {
  const made = generateGraphCert({ commonName: 'inventory.example.ch' });
  const proxy = tls.createServer({ key: made.keyPem, cert: made.certPem }, s => s.end());
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const srv = await startServer({ certProbe: { host: '127.0.0.1', port: proxy.address().port } });
  try {
    assert.equal((await srv.call('GET', '/api/certificate')).status, 401);
    const admin = await signIn(srv, 'admin', 'adminpass123');
    const r = await rawGet(srv, 'inventory.example.ch', admin.cookie, '/api/certificate');
    assert.equal(r.status, 200);
    const c = r.json.certificate;
    assert.deepEqual([c.host, c.names, c.selfSigned, c.matches], ['inventory.example.ch', ['inventory.example.ch'], true, true]);
    assert.ok(!('keyPem' in c) && !JSON.stringify(r.json).includes('PRIVATE'), 'nothing but public facts');
    assert.equal((await rawGet(srv, 'wiki.example.ch', admin.cookie, '/api/certificate')).json.certificate.state, 'wrong');
  } finally { await srv.close(); proxy.close(); }
  // without our proxy in front, it says so instead of failing
  const alone = await startServer({ certProbe: { host: '127.0.0.1', port: 1 } });
  try {
    const admin = await signIn(alone, 'admin', 'adminpass123');
    const r = await rawGet(alone, 'inventory.example.ch', admin.cookie, '/api/certificate');
    assert.equal(r.json.certificate, null);
    assert.match(r.json.reason, /could not be asked/);
  } finally { await alone.close(); }
});

/* install-cert.sh, on a copy of the proxy folder: a bundle as an AD CS script writes it (key, certificate and CA in one
   file, Windows line ends) is split, checked and put in place for one site, which is pointed at it. */
const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'scripts', 'install-cert.sh');
const hasOpenssl = spawnSync('openssl', ['version']).status === 0;
test('install-cert.sh puts a site\'s own certificate in place, refuses a wrong one and goes back to the default', { skip: !hasOpenssl && 'no openssl' }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cert-'));
  const base = path.join(d, 'base'), pki = path.join(d, 'pki');
  fs.mkdirSync(path.join(base, 'proxy', 'sites'), { recursive: true }); fs.mkdirSync(path.join(base, 'proxy', 'certificates')); fs.mkdirSync(pki);
  fs.copyFileSync(path.join(here, '..', 'proxy', 'Caddyfile'), path.join(base, 'proxy', 'Caddyfile'));
  const ssl = (...a) => execFileSync('openssl', a, { cwd: pki, stdio: ['ignore', 'pipe', 'ignore'] });
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '3650', '-subj', '/CN=Example Root CA');
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'inv.key', '-out', 'inv.csr', '-subj', '/CN=inventory.example.ch');
  fs.writeFileSync(path.join(pki, 'ext'), 'subjectAltName=DNS:inventory.example.ch,DNS:inventory\nextendedKeyUsage=serverAuth\n');
  ssl('x509', '-req', '-in', 'inv.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'inv.crt', '-days', '400', '-extfile', 'ext');
  const bundle = ['inv.key', 'inv.crt', 'ca.crt'].map(f => fs.readFileSync(path.join(pki, f), 'utf8')).join('').replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(pki, 'inventory.pem'), bundle);
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(base, 'proxy/certificates/nobs.key'), '-out', path.join(base, 'proxy/certificates/nobs.crt'), '-days', '800', '-subj', '/CN=self');
  const site = n => path.join(base, 'proxy', 'sites', n + '.caddy');
  fs.writeFileSync(site('inventory'), 'https://inventory.example.ch, https://inventory {\n\timport tls_and_headers\n\treverse_proxy nobs-inventory:8080\n}\n');
  fs.writeFileSync(site('dokuwiki'), 'https://wiki.example.ch, https://wiki {\n\timport tls_and_headers\n\treverse_proxy dokuwiki:8080\n}\n');
  const run = (args, input = '') => spawnSync('bash', [script, ...args], { env: { ...process.env, NI_BASE: base, NI_PROXY_CONTAINER: 'ni-test-no-such-proxy' }, input, encoding: 'utf8' });
  try {
    const ok = run(['inventory', path.join(pki, 'inventory.pem'), '--yes']);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /carries every name of the site/);
    const crt = fs.readFileSync(path.join(base, 'proxy/certificates/sites/inventory.crt'), 'utf8');
    assert.equal((crt.match(/BEGIN CERTIFICATE/g) || []).length, 1, 'the root CA is left out');
    assert.ok(!crt.includes('\r'), 'no Windows line ends');
    assert.equal(fs.statSync(path.join(base, 'proxy/certificates/sites/inventory.key')).mode & 0o777, 0o600);
    assert.match(fs.readFileSync(site('inventory'), 'utf8'), /\ttls \/certs\/sites\/inventory\.crt \/certs\/sites\/inventory\.key\n\timport headers\n/);
    assert.match(fs.readFileSync(site('dokuwiki'), 'utf8'), /import tls_and_headers/, 'the other site is left alone');
    // the inventory's certificate offered for the wiki (by its name): it warns about each name and waits for a yes
    const wrong = run(['wiki.example.ch', path.join(pki, 'inventory.pem')], 'no\n');
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stdout, /wiki\.example\.ch is not in this certificate/);
    assert.ok(!fs.existsSync(path.join(base, 'proxy/certificates/sites/dokuwiki.crt')));
    // a key that belongs to no certificate given is refused
    const other = run(['inventory', path.join(pki, 'inv.crt'), path.join(pki, 'ca.key'), '--yes']);
    assert.notEqual(other.status, 0); assert.match(other.stderr, /does not match any certificate/);
    // --info lists the sites with their certificates
    assert.match(run(['--info']).stdout, /inventory: inventory inventory\.example\.ch\n\s+Own certificate[\s\S]*Issued by: Example Root CA/);
    // back to the default
    assert.equal(run(['--remove', 'inventory']).status, 0);
    assert.match(fs.readFileSync(site('inventory'), 'utf8'), /^\timport tls_and_headers$/m);
    assert.ok(!fs.existsSync(path.join(base, 'proxy/certificates/sites/inventory.crt')));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
