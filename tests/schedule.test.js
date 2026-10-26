import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, tempDataDir } from './helpers.js';
import { runFeedFile } from '../server/index.js';
import { loadState, saveState } from '../server/state.js';

test('the nightly import reads the report file and merges it; it does nothing when the feed is off', async () => {
  const dir = tempDataDir();
  const srv = await startServer({ dir });
  try {
    saveState(srv.db, {
      objs: [{ id: 'o7', code: 'INV-0007', type: 'monitor', name: 'MON-7', serial: 'MON7', ovr: {}, feed: null, loc: 'Zürich HQ / Büro 2.OG' }],
      rels: [], users: [{ id: 'u-admin', login: 'admin', name: 'A', role: 'admin', active: true }], types: {}, history: {}, locs: ['Zürich HQ / Büro 2.OG'],
      policy: { model: true }, feedOn: true, feedSync: true, ldap: null, mapPos: {}, seq: 107, codeN: 7, rseq: 0
    });
    const file = path.join(dir, 'report.csv');
    fs.writeFileSync(file, 'AssetName,Serial,Model\nMON-7,MON7,"Dell P2422H 24"""\n');
    const counts = runFeedFile(srv.db, file, new Date(2026, 9, 21, 6, 0));
    assert.equal(counts.linked, 1);
    assert.equal(loadState(srv.db).objs[0].model, 'Dell P2422H 24"');

    saveState(srv.db, { ...loadState(srv.db), feedSync: false });
    fs.writeFileSync(file, 'AssetName,Serial,Model\nMON-7,MON7,Changed\n');
    assert.deepEqual(runFeedFile(srv.db, file), { skipped: true });
    assert.equal(loadState(srv.db).objs[0].model, 'Dell P2422H 24"');
  } finally { await srv.close(); }
});

test('a nightly run that throws (a secret file that can no longer be read) is logged and does not bring the server down', async t => {
  const { startScheduler } = await import('../server/index.js');
  const dir = tempDataDir();
  const srv = await startServer({ dir });
  const escaped = [];
  const onRejection = e => escaped.push(e);
  process.on('unhandledRejection', onRejection);
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date(2026, 9, 21, 5, 59, 50) });
  const logged = [];
  const timer = startScheduler(srv.db, {}, { ldapConfig: () => { throw new Error('cannot read NI_LDAP_SERVICE_PASSWORD_FILE'); } }, (...a) => logged.push(a.join(' ')));
  try {
    t.mock.timers.tick(30_000);   /* 06:00:20: the nightly run starts */
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    assert.deepEqual(escaped, [], 'the error escaped the scheduler');
    assert.ok(logged.some(l => l.includes('scheduled sync failed') && l.includes('NI_LDAP_SERVICE_PASSWORD_FILE')), 'the failure is logged: ' + logged.join(' | '));
  } finally {
    clearInterval(timer); t.mock.timers.reset(); process.off('unhandledRejection', onRejection); await srv.close();
  }
});

test('each sync runs on its own schedule: Graph every 4 hours by default, the others daily at 06:00, changeable or off', async () => {
  const { isDue, nextRun, scheduleOf, scheduleProblem, scheduleText } = await import('../public/js/schedule.js');
  const at = (h, m = 0) => new Date(2026, 9, 26, h, m);
  const plan = scheduleOf({});
  assert.deepEqual([2, 6, 10, 14, 18, 22].map(h => isDue(plan.graph, at(h))), [true, true, true, true, true, true], 'Graph every 4 hours from 06:00');
  assert.equal(isDue(plan.graph, at(7)), false);
  assert.equal(isDue(plan.ldap, at(6)), true); assert.equal(isDue(plan.ldap, at(10)), false, 'LDAP daily');
  assert.equal(nextRun(plan.graph, at(7, 30)), '10:00');
  assert.equal(scheduleText(plan.graph), 'every 4 hours from 06:00');
  const own = scheduleOf({ syncSchedule: { ldap: { every: 0, at: '06:00' }, lansweeper: { every: 12, at: '05:30' } } });
  assert.equal(isDue(own.ldap, at(6)), false, 'off');
  assert.equal(scheduleText(own.ldap), 'off, only Sync now');
  assert.equal(isDue(own.lansweeper, at(17, 30)), true);
  assert.equal(own.graph.every, 4, 'a source not set keeps its default');
  assert.match(scheduleProblem({ graph: { every: 5, at: '06:00' } }), /interval/);
  assert.match(scheduleProblem({ graph: { every: 4, at: '6 Uhr' } }), /HH:MM/);
  assert.match(scheduleProblem({ backup: { every: 4, at: '06:00' } }), /not a sync/);
  assert.equal(scheduleProblem({ graph: { every: 2, at: '00:15' } }), null);
});

test('the scheduler runs Graph at 10:00 on the default schedule, and not a source that is off', async t => {
  const { startScheduler } = await import('../server/index.js');
  const dir = tempDataDir();
  const srv = await startServer({ dir });
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date(2026, 9, 26, 9, 59, 50) });
  const runs = [];
  saveState(srv.db, { ...loadState(srv.db), syncSchedule: { ldap: { every: 0, at: '06:00' } } });
  const timer = startScheduler(srv.db, {}, { ldapConfig: () => { runs.push('ldap'); return null; }, graphConfig: () => { runs.push('graph'); return null; } }, () => {});
  try {
    t.mock.timers.tick(30_000); await new Promise(r => setImmediate(r));
    t.mock.timers.tick(30_000); await new Promise(r => setImmediate(r));
    assert.deepEqual(runs, ['graph'], 'Graph once at 10:00, LDAP not (off, and not due)');
  } finally { clearInterval(timer); t.mock.timers.reset(); await srv.close(); }
});
