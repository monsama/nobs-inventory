import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSecret } from '../server/secrets.js';

test('a secret is read from its _FILE when given, trimmed; an empty file means unset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-secret-'));
  const f = path.join(dir, 'token');
  fs.writeFileSync(f, 'from-file\n');
  const empty = path.join(dir, 'empty');
  fs.writeFileSync(empty, '');
  assert.equal(readSecret({ NI_LS_TOKEN_FILE: f, NI_LS_TOKEN: 'from-env' }, 'NI_LS_TOKEN'), 'from-file');
  assert.equal(readSecret({ NI_LS_TOKEN: ' from-env ' }, 'NI_LS_TOKEN'), 'from-env');
  assert.equal(readSecret({ NI_LS_TOKEN_FILE: empty }, 'NI_LS_TOKEN'), '');
  assert.equal(readSecret({}, 'NI_LS_TOKEN'), '');
  assert.throws(() => readSecret({ NI_LS_TOKEN_FILE: path.join(dir, 'missing') }, 'NI_LS_TOKEN'), /cannot be read/);
});
