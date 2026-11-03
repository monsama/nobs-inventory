/* The weekly e-mail: what it says, sent only with a mail server and addresses, and what is kept of the last one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, smtpConfig } from '../server/digest.js';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { createApp } from '../server/app.js';

const TODAY = new Date('2026-11-02T08:00:00');
test('the e-mail lists what needs doing, and says so when nothing does', () => {
  const s = { users: [{ id: 'u1', name: 'Dino Left', active: false, leftAt: '2026-10-01T00:00:00Z' }],
    objs: [{ id: 'a', name: 'NB-OLD', code: 'INV-1', status: 'active', warranty: '2026-10-01' }, { id: 'b', name: 'NB-SOON', status: 'active', warranty: '2026-12-01', uid: 'u1' },
      { id: 'c', name: 'WAIT', status: 'active', review: { src: 'ad' } }, { id: 'd', name: 'GONE', status: 'retired', warranty: '2020-01-01' }],
    contracts: [{ id: 'k', name: 'Firewall support', end: '2026-12-31', renew: 12, notice: 2 }] };
  const m = buildDigest(s, { link: 'https://inv.example/', backups: '2 hours ago', health: [{ area: 'Server', name: 'Free disk space', state: 'bad', value: '1 GB free' }] }, TODAY);
  assert.equal(m.count, 6, m.text);
  for (const t of ['Warranty ended on 1 device', 'NB-OLD (INV-1)', 'NB-SOON', 'Firewall support', 'Dino Left: 1 device', '1 device waiting in To review', 'Free disk space', 'https://inv.example/']) assert.ok(m.text.includes(t), t);
  assert.ok(!m.text.includes('GONE'));
  assert.ok(!/<script/i.test(buildDigest({ objs: [{ id: 'x', name: '<script>', status: 'active', warranty: '2026-10-01' }] }, {}, TODAY).html));
  assert.match(buildDigest({ objs: [] }, {}, TODAY).subject, /nothing needs attention/);
  const rep = buildDigest({ objs: [{ id: 'r', name: 'NB-ANNA', status: 'active', reported: { at: '2026-10-30T08:00:00Z', by: 'Anna', text: 'Battery swollen' } },
    { id: 's', name: 'NB-DONE', status: 'active', reported: { at: '2026-10-29T08:00:00Z', by: 'Ben', text: 'Fixed already', done: { at: '2026-10-30T09:00:00Z', by: 'IT' } } }] }, {}, TODAY);
  assert.match(rep.text, /1 problem reported by users, not done yet\s+- NB-ANNA: Battery swollen \(Anna/);
  assert.ok(!rep.text.includes('Fixed already'), 'done ones are left out');
});

test('the mail server only from the server; TLS on 465, STARTTLS otherwise', () => {
  assert.equal(smtpConfig({}), null);
  assert.equal(smtpConfig({ NI_SMTP_HOST: 'mx', NI_SMTP_PORT: '465' }).secure, true);
  const c = smtpConfig({ NI_SMTP_HOST: 'mx', NI_SMTP_USER: 'u@x.ch', NI_SMTP_PASSWORD: 'pw' });
  assert.equal(c.port, 587); assert.equal(c.requireTLS, true); assert.equal(c.from, 'u@x.ch');
});

test('set up and sent from Settings: addresses checked, sent through the server, the result kept without secrets', async () => {
  const before = { ...process.env };
  process.env.NI_SMTP_HOST = 'mail.example'; process.env.NI_SMTP_PASSWORD = 'smtp-secret';
  const sent = [];
  const srv = await startServer();
  srv.app?.locals && (srv.app.locals.mail = null);
  try {
    // the test server's transport: catch what would be sent
    const app = createApp({ db: srv.db, mailTransport: { sendMail: async m => { sent.push(m); } } });
    const s2 = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const base = `http://127.0.0.1:${s2.address().port}`;
    const a = await signIn({ ...srv, base }, 'admin', 'adminpass123');
    const call = (m, p, body) => fetch(base + p, { method: m, headers: { cookie: a.cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    assert.equal((await call('PUT', '/api/digest', { to: 'not an address' })).status, 400);
    const d = (await call('PUT', '/api/digest', { to: 'it@example.com; lead@example.com', day: 1, hour: 7, on: true, link: 'https://inv.example/' })).json;
    assert.deepEqual(d.to, ['it@example.com', 'lead@example.com']); assert.equal(d.on, true);
    saveState(srv.db, { ...loadState(srv.db), objs: [{ id: 'a', name: 'NB-OLD', code: 'INV-1', type: 'pc', status: 'active', warranty: '2020-01-01', loc: '', ovr: {}, feed: null }] });
    const r = await call('POST', '/api/digest/send');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(sent.length, 1); assert.equal(sent[0].to, 'it@example.com, lead@example.com'); assert.match(sent[0].text, /NB-OLD/);
    assert.ok(!JSON.stringify(r.json).includes('smtp-secret'));
    assert.equal(r.json.last.ok, true);
    // a problem a device's user reports: sent at once when turned on, not otherwise
    const st0 = loadState(srv.db);
    st0.users.push({ id: 'u-anna', login: 'anna', name: 'Anna Muster', role: 'viewer', own: true, source: 'manual', active: true, groups: [] });
    st0.objs[0].uid = 'u-anna'; st0.objs[0].loc = 'Bern / EG'; saveState(srv.db, st0);
    const { setPassword } = await import('../server/auth.js'); setPassword(srv.db, 'u-anna', 'annapass12345');
    const anna = await signIn({ ...srv, base }, 'anna', 'annapass12345');
    const report = text => fetch(`${base}/api/my/devices/a/report`, { method: 'POST', headers: { cookie: anna.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    assert.equal((await report('Battery swollen')).status, 200);
    await new Promise(res => setTimeout(res, 100));
    assert.equal(sent.length, 1, 'off: no mail');
    assert.equal((await call('PUT', '/api/digest', { reports: true })).json.reports, true);
    assert.equal((await report('Screen <b>flickers</b>')).status, 200);
    for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise(res => setTimeout(res, 20));
    assert.equal(sent.length, 2);
    assert.equal(sent[1].subject, 'NOBS Inventory: problem reported on NB-OLD');
    assert.match(sent[1].text, /Anna Muster reported a problem with NB-OLD \(INV-1 · Bern \/ EG\):\s+Screen <b>flickers<\/b>[\s\S]*https:\/\/inv\.example\/\?o=INV-1/);
    assert.ok(!sent[1].html.includes('<b>flickers</b>'), 'escaped in the HTML');
    s2.close();
  } finally { process.env = before; await srv.close(); }
});

test('the mail server set in Settings: its password sealed, never sent back, dropped with a new host; the server\'s wins', async () => {
  const before = { ...process.env };
  delete process.env.NI_SMTP_HOST; delete process.env.NI_SMTP_PASSWORD; delete process.env.NI_SMTP_USER;
  const sent = [];
  const srv = await startServer();
  try {
    const app = createApp({ db: srv.db, sheetKey: Buffer.alloc(32, 7), mailTransport: { sendMail: async m => { sent.push(m); } } });
    const s2 = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const base = `http://127.0.0.1:${s2.address().port}`;
    const a = await signIn({ ...srv, base }, 'admin', 'adminpass123');
    const call = (m, p, body) => fetch(base + p, { method: m, headers: { cookie: a.cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    let d = (await call('GET', '/api/digest')).json;
    assert.equal(d.smtp, false); assert.equal(d.mail.source, null);
    assert.equal((await call('PUT', '/api/digest', { to: 'it@example.com', on: true })).status, 400, 'no mail server yet');
    assert.equal((await call('PUT', '/api/smtp', { host: 'bad host', port: 587, security: 'starttls' })).status, 400);
    assert.equal((await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 70000, security: 'starttls' })).status, 400);
    d = (await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'starttls', user: 'inv@example.com', password: 'mail-secret-1', from: 'inv@example.com' })).json;
    assert.equal(d.smtp, true); assert.equal(d.mail.source, 'app'); assert.ok(d.mail.passwordSet);
    const everything = JSON.stringify([d, (await call('GET', '/api/digest')).json, (await call('GET', '/api/state')).json]);
    assert.ok(!everything.includes('mail-secret-1'), 'the password is never sent to the page');
    assert.ok(!JSON.stringify(srv.db.prepare('SELECT * FROM docs').all()).includes('mail-secret-1'), 'nor kept with the inventory');
    // a test mail goes through the transport, from the sender set
    assert.equal((await call('POST', '/api/smtp/test', { to: 'nope' })).status, 400);
    assert.equal((await call('POST', '/api/smtp/test', { to: 'me@example.com' })).status, 200);
    assert.deepEqual([sent[0].to, sent[0].from], ['me@example.com', 'inv@example.com']);
    // saved again without a password: kept; another host without one: dropped
    d = (await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'starttls', user: 'inv@example.com', from: 'other@example.com' })).json;
    assert.ok(d.mail.passwordSet, 'kept for the same server');
    // a weaker security or another user on the same server: dropped too (it could go in clear text, or to another account)
    d = (await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'starttls', user: 'inv@example.com', password: 'mail-secret-2', from: 'inv@example.com' })).json;
    d = (await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'none', user: 'inv@example.com', from: 'inv@example.com' })).json;
    assert.equal(d.mail.passwordSet, '', 'not kept when the security changes');
    d = (await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'starttls', user: 'inv@example.com', password: 'mail-secret-3', from: 'inv@example.com' })).json;
    d = (await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'starttls', user: 'other@example.com', from: 'inv@example.com' })).json;
    assert.equal(d.mail.passwordSet, '', 'not kept for another user');
    d = (await call('PUT', '/api/smtp', { host: 'evil.example.net', port: 587, security: 'starttls', user: 'inv@example.com' })).json;
    assert.equal(d.mail.passwordSet, '', 'not sent to another server');
    assert.ok(!JSON.stringify(srv.db.prepare('SELECT * FROM audit').all()).includes('mail-secret'), 'never logged');
    // removed
    d = (await call('DELETE', '/api/smtp')).json;
    assert.equal(d.smtp, false);
    // the server's own mail server wins, and cannot be changed here
    process.env.NI_SMTP_HOST = 'mail.server.example';
    d = (await call('GET', '/api/digest')).json;
    assert.deepEqual([d.mail.source, d.mail.host], ['server', 'mail.server.example']);
    assert.equal((await call('PUT', '/api/smtp', { host: 'smtp.example.com', port: 587, security: 'starttls' })).status, 409);
    s2.close();
  } finally { process.env = before; await srv.close(); }
});

test('a failed test mail says what kind of failure, never what the far end answered', async () => {
  const { mailFailure } = await import('../server/digest.js');
  assert.match(mailFailure(Object.assign(new Error('Invalid login: 535'), { code: 'EAUTH' })), /refused the sign-in/);
  assert.match(mailFailure(Object.assign(new Error('Invalid greeting. response=SSH-2.0-OpenSSH_9.6'), { code: 'EPROTOCOL' })), /could not be reached as a mail server/);
  assert.ok(!/SSH/.test(mailFailure(Object.assign(new Error('Invalid greeting. response=SSH-2.0-OpenSSH_9.6'), { code: 'EPROTOCOL' }))));
  assert.match(mailFailure(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:25'), { code: 'ESOCKET' })), /could not be reached/);
  assert.match(mailFailure(new Error('self-signed certificate')), /secure connection/);
  assert.match(mailFailure(Object.assign(new Error('Give the address to send the test to.'), { ours: true })), /Give the address/);
  assert.match(mailFailure(new Error('something odd')), /did not accept/);
});
