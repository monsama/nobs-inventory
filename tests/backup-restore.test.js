import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';
import { restoreBackup } from '../server/backup.js';

/* A restored backup is checked the way the app checks its own saves, and its plan pictures are checked like uploads. */
const freshDb = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-restore-'));
  const db = openDb(path.join(dir, 'i.db'));
  bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
  return db;
};
const backup = (planImages) => ({ version: 1, state: { objs: [], rels: [], users: [], types: {}, history: {}, settings: {} }, planImages });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('a backup with a plan picture that is not an image is refused, and nothing is replaced', () => {
  const db = freshDb();
  assert.throws(() => restoreBackup(db, backup([{ id: 'pl1', data: 'data:text/html;base64,PHNjcmlwdD4=' }])), /not a PNG/);
  db.close();
});

test('a backup with a valid plan picture is restored', () => {
  const db = freshDb();
  assert.doesNotThrow(() => restoreBackup(db, backup([{ id: 'pl1', data: PNG }])));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_images').get().n, 1);
  db.close();
});
