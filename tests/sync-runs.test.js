import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { loadState, revsOf } from '../server/state.js';
import { recordSync, runRecorded } from '../server/sync-runs.js';

const freshDb = () => {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ni-runs-')), 'i.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  return db;
};

test('each sync keeps when it last ran and how it went: numbers or a short error, nothing else', async () => {
  const db = freshDb();
  const NOW = new Date('2026-10-28T06:00:00Z');
  recordSync(db, 'ldap', { ok: true, counts: { people: 40, created: 2, review: 3, people2: { inEntra: 5 }, note: 'text' } }, NOW);
  assert.deepEqual(loadState(db).syncRuns.ldap, { at: NOW.toISOString(), ok: true, counts: { people: 40, created: 2, review: 3 } }, 'numbers only');
  const rev = revsOf(db)['setting|syncRuns'];
  recordSync(db, 'graph', { ok: false, error: 'x'.repeat(500) }, NOW);
  assert.equal(loadState(db).syncRuns.graph.error.length, 300, 'a long error is cut');
  assert.equal(loadState(db).syncRuns.ldap.ok, true, 'the other runs stay');
  assert.ok(revsOf(db)['setting|syncRuns'] > rev, 'a new revision, so the pages see it');
  recordSync(db, 'nothing', { ok: true });
  assert.equal(loadState(db).syncRuns.nothing, undefined, 'unknown sources are not kept');
  // a run that throws is recorded as failed, and the error still reaches the caller
  await assert.rejects(runRecorded(db, 'lansweeper', async () => { throw new Error('token wrong'); }, 'api'), /token wrong/);
  assert.deepEqual([loadState(db).syncRuns.lansweeper.ok, loadState(db).syncRuns.lansweeper.how, loadState(db).syncRuns.lansweeper.error], [false, 'api', 'token wrong']);
  assert.deepEqual(await runRecorded(db, 'lansweeper', async () => ({ created: 1 }), 'api'), { created: 1 });
  assert.equal(loadState(db).syncRuns.lansweeper.ok, true);
  db.close();
});
