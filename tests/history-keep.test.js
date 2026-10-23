import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { loadState, saveState, HISTORY_KEEP } from '../server/state.js';

test('the history of an object keeps its newest entries when the state is saved', () => {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ni-hist-')), 'i.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  const s = loadState(db);
  s.objs.push({ id: 'h1', code: 'INV-7001', type: 'pc', name: 'PC-H', status: 'active', ovr: {}, feed: null });
  s.history = { h1: Array.from({ length: HISTORY_KEEP + 25 }, (_, i) => ({ t: 'x', msg: 'entry ' + i })) };
  saveState(db, s);
  const kept = loadState(db).history.h1;
  assert.equal(kept.length, HISTORY_KEEP);
  assert.equal(kept[0].msg, 'entry 0', 'the newest entry is kept');
  db.close();
});
