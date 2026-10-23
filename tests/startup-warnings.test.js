import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../server/db.js';
import { bootstrap } from '../server/index.js';

/* A weak admin password from the environment is said at first start; a good one is not. Nothing is refused. */
const firstStart = (pw) => {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ni-warn-')), 'i.db'));
  const lines = [];
  bootstrap(db, { NI_ADMIN_PASSWORD: pw }, l => lines.push(String(l)));
  db.close();
  return lines.join('\n');
};

test('a weak NI_ADMIN_PASSWORD is said at first start, and the server still starts', () => {
  assert.match(firstStart('short'), /does not meet the password rules/);
});

test('a good NI_ADMIN_PASSWORD is not reported', () => {
  assert.doesNotMatch(firstStart('correct horse battery staple'), /does not meet/);
});
