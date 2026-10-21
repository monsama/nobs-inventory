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
