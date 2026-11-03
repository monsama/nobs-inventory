/* Saved views by mail: when one is due, what is stored and refused, the devices the page's own filter picks, and the
   send through a fake mail server, by hand (admins only) and on the schedule, logged and kept for the view. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { createApp } from '../server/app.js';
import { startScheduler } from '../server/index.js';
import { mailDue, mailList, mailText, nextMail, savedViewsProblem, setViewMail, upsertView, viewMailProblem } from '../public/js/saved-views.js';
import { buildViewMail, viewDevices } from '../server/view-mail.js';
import { st } from '../public/js/01-core.js';

const at = (d, h, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
test('when a view is sent: daily, weekly on a day, monthly on a day, at the full hour', () => {
  const daily = { every: 'daily', hour: 7, to: ['a@example.com'] }, weekly = { every: 'weekly', day: 1, hour: 7, to: [] }, monthly = { every: 'monthly', day: 28, hour: 18, to: [] };
  assert.equal(mailDue(daily, at('2026-11-03', 7)), true);
  assert.equal(mailDue(daily, at('2026-11-03', 7, 1)), false);
  assert.equal(mailDue(daily, at('2026-11-03', 8)), false);
  assert.equal(mailDue(weekly, at('2026-11-02', 7)), true, '2 November 2026 is a Monday');
  assert.equal(mailDue(weekly, at('2026-11-03', 7)), false);
  assert.equal(mailDue(monthly, at('2027-02-28', 18)), true, 'the 28th is in every month');
  assert.equal(mailDue({ every: 'none', hour: 7, to: [] }, at('2026-11-03', 7)), false);
  assert.equal(mailDue(null, at('2026-11-03', 7)), false);
  assert.deepEqual(nextMail(daily, at('2026-11-03', 7)), at('2026-11-04', 7), 'just sent: tomorrow');
  assert.deepEqual(nextMail(daily, at('2026-11-03', 6, 59)), at('2026-11-03', 7));
  assert.deepEqual(nextMail(weekly, at('2026-11-03', 9)), at('2026-11-09', 7));
  assert.deepEqual(nextMail(monthly, at('2026-12-28', 18, 30)), at('2027-01-28', 18), 'over the turn of the year');
  assert.equal(nextMail({ every: 'none', hour: 7, to: [] }), null);
  assert.deepEqual([mailText(daily), mailText(weekly), mailText(monthly), mailText({ every: 'monthly', day: 2, hour: 0 }), mailText(undefined)],
    ['daily at 07:00', 'every Monday at 07:00', 'on the 28th of each month at 18:00', 'on the 2nd of each month at 00:00', 'not sent by mail']);
  assert.deepEqual(mailList(' a@example.com; b@example.com,a@example.com\nc@example.com '), ['a@example.com', 'b@example.com', 'c@example.com']);
});

test('a mail schedule is checked before it is stored, and kept when a view is saved again', () => {
  const v = { id: 'v1', name: 'Old PCs', tab: 'table', filters: { type: 'pc' } };
  assert.equal(savedViewsProblem([{ ...v, mail: { every: 'weekly', day: 1, hour: 7, to: ['it@example.com'] } }]), null);
  assert.equal(savedViewsProblem([{ ...v, mail: { every: 'none', hour: 7, to: [] } }]), null);
  for (const [mail, why] of [
    [{ every: 'hourly', hour: 7, to: ['a@example.com'] }, /daily, weekly, monthly/],
    [{ every: 'daily', hour: 24, to: ['a@example.com'] }, /hour is 0 to 23/],
    [{ every: 'weekly', day: 7, hour: 7, to: ['a@example.com'] }, /day of the week/],
    [{ every: 'monthly', day: 31, hour: 7, to: ['a@example.com'] }, /1 to 28/],
    [{ every: 'daily', hour: 7, to: ['not an address'] }, /not an e-mail address/],
    [{ every: 'daily', hour: 7, to: ['a@example.com', 'A@example.com'] }, /twice/],
    [{ every: 'daily', hour: 7, to: [] }, /give the addresses/],
    [{ every: 'daily', hour: 7, to: Array.from({ length: 21 }, (_, i) => `p${i}@example.com`) }, /at most 20/],
    [{ every: 'daily', hour: 7, to: ['a@example.com'], cc: 'x' }, /mail schedule has/],
  ]) assert.match(viewMailProblem(mail, 'Old PCs') || '', why, JSON.stringify(mail));
  const list = setViewMail([v], 'v1', { every: 'daily', hour: 6, to: ['it@example.com'] });
  assert.deepEqual(list[0].mail, { every: 'daily', hour: 6, to: ['it@example.com'] });
  assert.deepEqual(upsertView(list, { tab: 'cards', filters: {} }, 'old pcs', 'v2')[0].mail, list[0].mail, 'replaced under its name: the schedule stays');
  assert.equal('mail' in setViewMail(list, 'v1', { every: 'none', hour: 7, to: [] })[0], false, 'taken off');
});

const STATE = () => ({
  objs: [
    { id: 'a', name: 'ZH-PC-1', code: 'INV-1', type: 'pc', status: 'active', loc: 'Zurich / 1', model: 'OptiPlex' },
    { id: 'b', name: 'ZH-PC-2', code: 'INV-2', type: 'pc', status: 'retired', loc: 'Zurich / 1' },
    { id: 'c', name: 'BE-NB-1', code: 'INV-3', type: 'notebook', status: 'active', loc: 'Bern / 2' },
    { id: 'd', name: 'ZH-PC-3', code: 'INV-4', type: 'pc', status: 'active', loc: 'Zurich / 2', review: { src: 'ad' } },
  ], users: [], contacts: [], types: {},
});
test('the devices a view lists are picked by the page\'s own filter, and go out as an Excel file', () => {
  const before = JSON.stringify(st);
  assert.deepEqual(viewDevices(STATE(), { filters: { type: 'pc' } }).map(o => o.id), ['a', 'b'], 'retired too, as the page lists them; not those in To review');
  assert.deepEqual(viewDevices(STATE(), { filters: { type: 'pc', live: true } }).map(o => o.id), ['a']);
  assert.deepEqual(viewDevices(STATE(), { q: 'be-nb' }).map(o => o.id), ['c']);
  assert.deepEqual(viewDevices(STATE(), { filters: { loc: 'Zurich' } }).map(o => o.id), ['a', 'b']);
  assert.equal(JSON.stringify(st), before, 'the page state is put back as it was');
  const s = STATE(), list = viewDevices(s, { filters: { type: 'pc' } });
  const m = buildViewMail(s, { name: 'All <PCs>' }, list, { link: 'https://inv.example/', today: new Date('2026-11-03T07:00:00') });
  assert.equal(m.subject, 'NOBS Inventory: All <PCs> (2 devices)');
  assert.match(m.text, /lists 2 devices today \(03\.11\.2026\)[\s\S]*https:\/\/inv\.example\//);
  assert.ok(!m.html.includes('<PCs>'), 'escaped in the HTML');
  assert.equal(m.attachment.filename, 'All-PCs-2026-11-03.xlsx');
  const xlsx = m.attachment.content.toString('latin1');
  assert.ok(xlsx.startsWith('PK'), 'a zip');
  assert.ok(xlsx.includes('ZH-PC-1') && xlsx.includes('ZH-PC-2') && !xlsx.includes('BE-NB-1'));
});

test('sent by hand by an admin and on its schedule, through the mail server, logged and kept for the view', async () => {
  const before = { ...process.env };
  process.env.NI_SMTP_HOST = 'mail.example'; process.env.NI_SMTP_PASSWORD = 'smtp-secret';
  const sent = [];
  let fail = false;
  const srv = await startServer();
  try {
    const app = createApp({ db: srv.db, mailTransport: { sendMail: async m => { if (fail) throw Object.assign(new Error('535 nope'), { code: 'EAUTH' }); sent.push(m); } } });
    const s2 = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const base = `http://127.0.0.1:${s2.address().port}`;
    const a = await signIn({ ...srv, base }, 'admin', 'adminpass123');
    const call = (m, p, body, cookie = a.cookie) => fetch(base + p, { method: m, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    const cur = loadState(srv.db);
    cur.users.push({ id: 'u-vera', login: 'vera', name: 'Vera Viewer', role: 'viewer', active: true, source: 'manual', groups: [] });
    saveState(srv.db, { ...cur, objs: STATE().objs.map(o => ({ ...o, ovr: {}, feed: null })),
      savedViews: [{ id: 'v1', name: 'Zurich PCs', tab: 'table', filters: { type: 'pc', loc: 'Zurich' }, mail: { every: 'daily', hour: 7, to: ['it@example.com', 'lead@example.com'] } },
        { id: 'v2', name: 'Unsent', tab: 'cards', filters: {} }] });
    const { setPassword } = await import('../server/auth.js'); setPassword(srv.db, 'u-vera', 'blue-river-1234');
    const vera = await signIn({ ...srv, base }, 'vera', 'blue-river-1234');

    assert.deepEqual((await call('GET', '/api/view-mail')).json, { smtp: true, runs: {} });
    assert.equal((await call('POST', '/api/views/v1/send', null, vera.cookie)).status, 403, 'admins only');
    assert.ok(!JSON.stringify((await call('GET', '/api/state', null, vera.cookie)).json).includes('it@example.com'), 'a viewer does not get the addresses');
    assert.equal((await call('POST', '/api/views/v2/send')).status, 400, 'no addresses');
    assert.equal((await call('POST', '/api/views/nope/send')).status, 404);
    const r = await call('POST', '/api/views/v1/send');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.last.ok, r.json.last.n, r.json.last.to], [true, 2, 2]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'it@example.com, lead@example.com');
    assert.equal(sent[0].attachments[0].filename.endsWith('.xlsx'), true);
    assert.ok(!JSON.stringify(sent[0]).includes('smtp-secret'));
    assert.equal(loadState(srv.db).viewMailRuns.v1.ok, true, 'kept for the view');
    assert.ok((await call('GET', '/api/state')).json.viewMailRuns.v1, 'the admin\'s page gets the last send');
    assert.equal((await call('GET', '/api/state', null, vera.cookie)).json.viewMailRuns, undefined);
    /* A save of the views that tries to set a bad schedule is refused. */
    assert.match(savedViewsProblem([{ id: 'v1', name: 'x', mail: { every: 'daily', hour: 7, to: ['nope'] } }]), /not an e-mail address/);
    /* The mail server refuses: said in a few words, kept and logged. */
    fail = true;
    const bad = await call('POST', '/api/views/v1/send');
    assert.equal(bad.status, 400); assert.match(bad.json.error, /refused the sign-in/);
    assert.equal(loadState(srv.db).viewMailRuns.v1.ok, false);
    fail = false;
    const log = srv.db.prepare('SELECT action FROM audit ORDER BY id').all().map(x => x.action);
    assert.ok(log.some(l => /saved view “Zurich PCs” sent by mail to 2 addresses \(2 devices\)/.test(l)), log.join('\n'));
    assert.ok(log.some(l => /saved view “Zurich PCs” by mail failed/.test(l)));
    assert.ok(!log.join().includes('smtp-secret'));

    /* The schedule: due at 07:00 today, sent once however often the scheduler looks in that minute. */
    const seven = new Date(); seven.setHours(7, 0, 0, 0);
    const timer = startScheduler(srv.db, {}, { viewMail: (id, now) => app.locals.sendViewMail(id, now), smtpOn: () => true }, () => {});
    clearInterval(timer);
    assert.ok(timer, 'the scheduler runs for the views alone');
    const { viewsDue } = await import('../server/view-mail.js');
    const done = {}; const once = (k, t) => { const key = `${t.toDateString()} ${t.getHours()}:${t.getMinutes()}`; if (done[k] === key) return false; done[k] = key; return true; };
    assert.deepEqual(viewsDue(srv.db, [seven], once).map(v => v.id), ['v1']);
    assert.deepEqual(viewsDue(srv.db, [seven], once).map(v => v.id), [], 'once a minute');
    await app.locals.sendViewMail('v1', seven);
    assert.equal(sent.length, 2);
    assert.ok(srv.db.prepare('SELECT user_id FROM audit ORDER BY id DESC LIMIT 1').get().user_id === null, 'the schedule sends as the server');
    s2.close();
  } finally { process.env = before; await srv.close(); }
});
