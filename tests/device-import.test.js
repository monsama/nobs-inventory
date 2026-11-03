/* Devices from a CSV file: headings matched by name and synonyms (and as mapped last time), the problems of a row, and
   duplicates found by serial number, then name, then MAC address, with the empty fields a row can fill. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessDeviceMapping, rememberMapping, matchDevice, planDeviceImport, normHead } from '../public/js/device-import.js';
import { csvDelimiter } from '../public/js/csv.js';

test('headings are matched without case or spaces, with synonyms; a field comes from one column', () => {
  assert.equal(normHead('﻿ Serial Number '), 'serialnumber');
  assert.deepEqual(guessDeviceMapping(['Hostname', 'SERIAL NUMBER', 'room', 'IP-Address', 'Owner', 'Warranty Ends', 'Name', 'Whatever']),
    ['name', 'serial', 'loc', 'ip', 'user', 'warranty', '', '']);
  /* What was mapped last time wins over the guess, an ignored column included. */
  const kept = rememberMapping(['Kit', 'Hostname'], ['model', ''], {});
  assert.deepEqual(kept, { kit: 'model', hostname: '' });
  assert.deepEqual(guessDeviceMapping(['Hostname', 'Kit', 'Name'], kept), ['', 'model', 'name']);
  assert.equal(csvDelimiter('a;b;c\n1;2;3'), ';'); assert.equal(csvDelimiter('a\tb\n'), '\t'); assert.equal(csvDelimiter('a,b'), ',');
});

test('a device here is found by serial number, else name (not a retired one), else MAC address', () => {
  const objs = [{ name: 'PC-1', serial: 'S1', status: 'active' }, { name: 'PC-2', mac: '70:b3:17:4a:00:01', status: 'active' }, { name: 'OLD', status: 'retired' }];
  assert.equal(matchDevice({ serial: 's1', name: 'PC-2' }, objs).by, 'serial');
  assert.equal(matchDevice({ name: 'pc-2' }, objs).o, objs[1]);
  assert.equal(matchDevice({ name: 'X', mac: '70-B3-17-4A-00-01' }, objs).by, 'mac');
  assert.equal(matchDevice({ name: 'old' }, objs), null);
});

test('each row says what it does and what is wrong with it', () => {
  const ctx = {
    objs: [{ name: 'PC-1', serial: 'S1', status: 'active', model: 'M', ip: '' }],
    types: { pc: { label: 'PC' }, notebook: { label: 'Notebook' } }, statuses: { active: { label: 'In use' }, stock: { label: 'In stock' } },
    locs: ['HQ / Room 1', 'HQ / Room 2'],
    parseDay: t => !t ? '' : /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null, num: t => isFinite(+t) ? +t : undefined,
  };
  const mapping = ['name', 'type', 'serial', 'loc', 'ip', 'purchased', 'model', 'status', 'price'];
  const plan = planDeviceImport([
    ['NB-1', 'laptop', 'S9', 'room 1', '10.0.0.1', '2026-01-02', 'X1', 'in stock', '1200'],
    ['NEW', 'toaster', '', 'Nowhere', '1.2.3', '31.12.', '', 'lost', 'abc'],
    ['Other', '', 'S1', '', '10.0.0.9', '', 'M2', '', ''],
    ['NB-1b', 'pc', 'S9', '', '', '', '', '', ''],
    ['', 'pc', '', '', '', '', '', '', ''],
    ['NO-TYPE', '', '', '', '', '', '', '', ''],
  ], mapping, ctx);
  assert.deepEqual(plan.map(p => p.action), ['new', 'error', 'dup', 'error', 'error', 'error']);
  assert.deepEqual(plan[0].v, { name: 'NB-1', type: 'notebook', serial: 'S9', loc: 'HQ / Room 1', ip: '10.0.0.1', purchased: '2026-01-02', model: 'X1', status: 'stock', price: 1200 });
  assert.deepEqual(plan[1].errs, ['unknown type "toaster"', 'unknown status "lost"', 'unknown location "Nowhere"', 'bad IP address "1.2.3"', 'bad date "31.12."', 'bad price "abc"']);
  assert.equal(plan[2].match, ctx.objs[0]); assert.equal(plan[2].by, 'serial');
  assert.deepEqual(plan[2].fill, ['ip'], 'only the fields empty on the device here');
  assert.deepEqual(plan[3].errs, ['same device as line 2']);
  assert.deepEqual(plan[4].errs, ['no name']);
  assert.deepEqual(plan[5].errs, ['no type']);
});
