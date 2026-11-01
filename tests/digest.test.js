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
